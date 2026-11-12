"use client";
import { useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { Mic, Square, Sparkles, RotateCcw } from "lucide-react";
import { draftMatchFromVoice } from "@/app/actions/voice";
import { MatchForm, type MatchFormInitial } from "@/components/forms/match-form";
import { Notice, cx } from "@/components/ui";
import type { Formation, Player, Team, Venue } from "@/lib/types";

interface SR extends EventTarget {
  lang: string; continuous: boolean; interimResults: boolean;
  start(): void; stop(): void; abort(): void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
}
type SRCtor = new () => SR;
const getSR = (): SRCtor | null => {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: SRCtor; webkitSpeechRecognition?: SRCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};

const EXAMPLE = "El martes que viene a las nueve en Calasancio. Monecillo de local contra Caravelle. Por Monecillo juegan Sito, Ángel, Raúl… y por Caravelle… Formación 2-3-1. Dicen que va a llover.";

export function VoiceMatch(props: { teams: Team[]; players: Player[]; venues: Venue[]; formations: Formation[]; isAdmin: boolean; perSide: number }) {
  const [text, setText] = useState("");
  const [interim, setInterim] = useState("");
  const [rec, setRec] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const canSR = useSyncExternalStore(() => () => {}, () => Boolean(getSR()), () => true);
  const supported = canSR && !blocked;
  const [err, setErr] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ initial: MatchFormInitial; notes: string[]; n: number } | null>(null);
  const [pending, start] = useTransition();
  const sr = useRef<SR | null>(null);
  const keepGoing = useRef(false);
  const textRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => () => { keepGoing.current = false; sr.current?.abort(); }, []);

  const startRec = () => {
    const C = getSR();
    if (!C) { setBlocked(true); return; }
    setErr(null);
    const r = new C();
    r.lang = "es-ES"; r.continuous = true; r.interimResults = true;
    r.onresult = (e) => {
      let fin = "", tmp = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) fin += res[0].transcript; else tmp += res[0].transcript;
      }
      if (fin) setText((t) => (t ? t.replace(/\s*$/, " ") : "") + fin.trim());
      setInterim(tmp);
    };
    r.onerror = (e) => {
      if (e.error === "service-not-allowed") {
        // iPhone con la app instalada: iOS no deja usar su dictado dentro de apps web
        keepGoing.current = false; setBlocked(true);
        setErr("En la app instalada, el iPhone no permite el dictado directo. Toca el cuadro de texto y usa el micrófono del teclado: funciona igual.");
        setTimeout(() => textRef.current?.focus(), 50);
      } else if (e.error === "not-allowed") {
        keepGoing.current = false;
        setErr("El micrófono está bloqueado. Actívalo en Ajustes › Safari (o Chrome) › Micrófono y vuelve a intentarlo, o dicta con el micrófono del teclado.");
      }
      else if (e.error === "no-speech") { /* silencio: seguimos */ }
      else setErr("Se cortó el dictado. Vuelve a pulsar grabar o escribe el texto.");
    };
    // iOS corta el reconocimiento tras unos segundos de silencio: se reanuda mientras se esté grabando
    r.onend = () => { setInterim(""); if (keepGoing.current) { try { r.start(); } catch { setRec(false); } } else setRec(false); };
    sr.current = r; keepGoing.current = true;
    try { r.start(); setRec(true); } catch { setErr("No se pudo iniciar el micrófono."); }
  };
  const stopRec = () => { keepGoing.current = false; sr.current?.stop(); setRec(false); };

  const think = () => {
    if (rec) stopRec();
    setErr(null);
    start(async () => {
      const r = await draftMatchFromVoice(`${text} ${interim}`.trim());
      if (r.ok) setDraft((d) => ({ initial: r.initial, notes: r.notes, n: (d?.n ?? 0) + 1 }));
      else setErr(r.error);
    });
  };

  if (draft) {
    return (
      <div className="space-y-4">
        <Notice tone="ok">
          <p className="font-semibold">He preparado el partido con tu nota de voz. Revísalo y pulsa «Crear partido».</p>
          {draft.notes.length > 0 && <ul className="mt-2 list-disc space-y-0.5 pl-5">{draft.notes.map((n) => <li key={n}>{n}</li>)}</ul>}
        </Notice>
        <button type="button" onClick={() => setDraft(null)} className="press inline-flex items-center gap-1.5 text-sm font-semibold text-info"><RotateCcw size={15} /> Volver a dictar</button>
        <MatchForm key={draft.n} {...props} initial={draft.initial} />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col items-center gap-3 rounded-3xl bg-surface px-5 py-7 text-center shadow-card">
        <button type="button" onClick={rec ? stopRec : startRec} disabled={!supported || pending}
          aria-label={rec ? "Parar grabación" : "Grabar nota de voz"}
          className={cx("press relative flex h-24 w-24 items-center justify-center rounded-full text-white disabled:opacity-40", rec ? "bg-[#e5383b] shadow-[0_10px_30px_-8px_rgb(229_56_59/0.6)]" : "bg-pitch shadow-[0_10px_30px_-10px_rgb(22_122_64/0.55)]")}>
          {rec && <span aria-hidden className="absolute inset-0 animate-ping rounded-full bg-[#e5383b]/40" />}
          {rec ? <Square size={30} fill="currentColor" /> : <Mic size={38} />}
        </button>
        <p className="text-[15px] font-semibold">{rec ? "Escuchando… pulsa para parar" : supported ? "Pulsa y cuéntame el partido" : "Tu navegador no transcribe aquí"}</p>
        <p className="max-w-sm text-xs text-ink-3">{supported ? "Fecha, hora, estadio, quién es local, quién juega en cada equipo, formación y el tiempo." : "Toca el cuadro de abajo y pulsa el micrófono del teclado para dictar."}</p>
        {!supported && <button type="button" onClick={() => textRef.current?.focus()} className="press rounded-full bg-surface-2 px-4 py-2 text-sm font-semibold">Dictar con el teclado</button>}
      </div>

      <div>
        <label htmlFor="dictado" className="mb-1.5 block text-sm font-semibold">Transcripción</label>
        <textarea ref={textRef} id="dictado" rows={7} value={text + (interim ? (text ? " " : "") + interim : "")} onChange={(e) => { setText(e.target.value); setInterim(""); }}
          placeholder={EXAMPLE}
          className="w-full rounded-2xl border border-transparent bg-surface px-4 py-3 text-[16px] leading-relaxed shadow-card placeholder:text-ink-3 focus:border-pitch focus:outline-none" />
        <p className="mt-1 text-xs text-ink-3">Puedes corregir el texto antes de continuar.</p>
      </div>

      {err && <Notice tone="danger">{err}</Notice>}
      <button type="button" onClick={think} disabled={pending || (text + interim).trim().length < 8}
        className="press flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-pitch text-[16px] font-semibold text-pitch-ink disabled:opacity-40">
        <Sparkles size={18} /> {pending ? "Pensando el partido…" : "Preparar partido"}
      </button>
      <p className="text-center text-xs text-ink-3">No se crea nada hasta que revises el formulario y lo confirmes.</p>
    </div>
  );
}
