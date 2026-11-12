"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Check, Minus, Plus } from "lucide-react";
import { PlayerStage, type StageFocus } from "@/components/player/player-stage";
import { cx } from "@/components/ui";
import { saveKit } from "@/app/actions/profile";
import { KIT_COLORS, KIT_COLOR_KEYS, kitPaint, type Kit, type KitColor, type KitPaint } from "@/lib/kit";

type Tab = "boots" | "socks" | "back" | "kit";
const TABS: { id: Tab; label: string; focus: StageFocus }[] = [
  { id: "boots", label: "Botas", focus: "boots" },
  { id: "socks", label: "Medias", focus: "boots" },
  { id: "back", label: "Dorsal", focus: "back" },
  { id: "kit", label: "Equipación", focus: "full" },
];

function Swatches({ value, onChange, label }: { value: KitColor; onChange: (c: KitColor) => void; label: string }) {
  return (
    <div>
      <div className="mb-3 flex items-baseline justify-between">
        <span className="text-[17px] font-semibold">{label}</span>
        <span className="text-[13px] text-ink-3">{KIT_COLORS[value].label}</span>
      </div>
      <div role="radiogroup" aria-label={label} className="grid grid-cols-5 justify-items-center gap-3">
        {KIT_COLOR_KEYS.map((c) => (
          <button key={c} type="button" role="radio" aria-checked={value === c} aria-label={KIT_COLORS[c].label} onClick={() => onChange(c)}
            className="press relative h-11 w-11 rounded-full transition-shadow"
            style={{ background: KIT_COLORS[c].hex, boxShadow: value === c ? "0 0 0 3px var(--surface), 0 0 0 5px var(--ink)" : "inset 0 0 0 1px rgb(0 0 0 / 0.1)" }}>
            {value === c && <Check size={16} strokeWidth={3} className="absolute inset-0 m-auto" style={{ color: c === "blanco" || c === "amarillo" ? "#1a1d23" : "#fff" }} aria-hidden />}
          </button>
        ))}
      </div>
    </div>
  );
}

export function KitEditor({ player, teamColor, takenNumbers }: {
  player: { name: string; src: string; poster: string | null; mapUrl: string; kit: Kit | null; number: number | null };
  teamColor: string;
  takenNumbers: Record<number, string>;
}) {
  const router = useRouter();
  const [paint, setPaint] = useState<KitPaint>(() => kitPaint(player.kit, player.number));
  const [tab, setTab] = useState<Tab>("boots");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const initial = useMemo(() => JSON.stringify(kitPaint(player.kit, player.number)), [player.kit, player.number]);
  const dirty = JSON.stringify(paint) !== initial;
  const set = (p: Partial<KitPaint>) => { setPaint((x) => ({ ...x, ...p })); setMsg(null); };
  const focus = TABS.find((t) => t.id === tab)!.focus;
  const clash = paint.number != null ? takenNumbers[paint.number] : undefined;

  const save = () => start(async () => {
    const r = await saveKit(paint);
    if (r.ok) { setMsg({ ok: true, text: r.message ?? "Guardado" }); router.push("/perfil"); router.refresh(); }
    else setMsg({ ok: false, text: r.error });
  });

  return (
    <div className="-mx-4 -mt-5 lg:mx-0 lg:mt-0">
      <div className="glass sticky top-[calc(3.5rem+env(safe-area-inset-top))] z-20 grid grid-cols-3 items-center px-4 py-2 !shadow-none lg:top-0 lg:rounded-2xl">
        <Link href="/perfil" className="text-[16px] text-info">Cancelar</Link>
        <span className="text-center text-[16px] font-semibold">Mi jugador</span>
        <button type="button" onClick={save} disabled={pending || !dirty}
          className="press justify-self-end rounded-full bg-pitch px-4 py-1.5 text-[15px] font-semibold text-pitch-ink disabled:opacity-40">
          {pending ? "Guardando…" : "Guardar"}
        </button>
      </div>

      <PlayerStage src={player.src} poster={player.poster} name={player.name} color={teamColor}
        mapUrl={player.mapUrl} paint={paint} focus={focus} editing className="h-[46vh] min-h-[20rem]" />

      <div className="relative -mt-6 rounded-t-[1.75rem] bg-surface px-4 pt-2.5 pb-6 shadow-[0_-8px_32px_-12px_rgb(16_24_40/0.18)] lg:rounded-b-3xl">
        <span aria-hidden className="mx-auto mb-3 block h-[5px] w-9 rounded-full bg-line-strong" />
        <div role="tablist" aria-label="Qué personalizar" className="mb-5 grid grid-cols-4 gap-1 rounded-[0.875rem] bg-surface-3/70 p-1">
          {TABS.map((t) => (
            <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}
              className={cx("min-h-9 rounded-[0.625rem] text-[13px] font-semibold transition-all", tab === t.id ? "bg-surface text-ink shadow-[0_1px_3px_rgb(16_24_40/0.12)]" : "text-ink-2")}>
              {t.label}
            </button>
          ))}
        </div>

        {tab === "boots" && <Swatches label="Color de las botas" value={paint.boots} onChange={(boots) => set({ boots })} />}
        {tab === "socks" && <Swatches label="Color de las medias" value={paint.socks} onChange={(socks) => set({ socks })} />}
        {tab === "back" && (
          <div className="space-y-5">
            <div>
              <label htmlFor="back-name" className="mb-1.5 block text-[13px] font-semibold text-ink-2">Nombre en la espalda</label>
              <div className="flex h-12 items-center rounded-xl bg-surface-2 px-3.5 focus-within:ring-2 focus-within:ring-pitch">
                <input id="back-name" value={paint.name} maxLength={12} autoComplete="off" autoCapitalize="characters" placeholder="Tu nombre o apodo"
                  onChange={(e) => set({ name: e.target.value.toUpperCase().replace(/[^A-ZÁÉÍÓÚÜÑ .'-]/g, "") })}
                  className="min-w-0 flex-1 bg-transparent text-[17px] font-semibold tracking-wide outline-none placeholder:font-normal placeholder:tracking-normal placeholder:text-ink-3" />
                <span className="text-xs text-ink-3">{paint.name.length}/12</span>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-semibold text-ink-2">Dorsal</span>
              <div className="flex items-center gap-1.5 rounded-full bg-surface-2 p-1">
                <button type="button" aria-label="Bajar dorsal" onClick={() => set({ number: paint.number == null ? 1 : Math.max(0, paint.number - 1) })}
                  className="press flex h-11 w-11 items-center justify-center rounded-full bg-surface shadow-[0_1px_3px_rgb(16_24_40/0.12)]"><Minus size={18} /></button>
                <input aria-label="Número del dorsal" inputMode="numeric" value={paint.number ?? ""} placeholder="–"
                  onChange={(e) => { const d = e.target.value.replace(/\D/g, "").slice(0, 2); set({ number: d === "" ? null : Number(d) }); }}
                  className="w-16 bg-transparent text-center font-display tabular text-[34px] font-bold leading-none outline-none" />
                <button type="button" aria-label="Subir dorsal" onClick={() => set({ number: paint.number == null ? 1 : Math.min(99, paint.number + 1) })}
                  className="press flex h-11 w-11 items-center justify-center rounded-full bg-surface shadow-[0_1px_3px_rgb(16_24_40/0.12)]"><Plus size={18} /></button>
              </div>
            </div>
            <p className={cx("text-xs", clash ? "font-semibold text-gold" : "text-ink-3")}>
              {clash ? `Ojo: el ${paint.number} ya lo lleva ${clash} en tu equipo.` : "Se imprime con la tipografía dorada de la equipación."}
            </p>
          </div>
        )}
        {tab === "kit" && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div aria-current="true" className="rounded-2xl bg-surface p-3 shadow-[0_0_0_2px_var(--pitch)]">
                <div className="flex h-20 items-center justify-center rounded-xl bg-white shadow-[inset_0_0_0_1px_var(--line)]">
                  <span className="flex h-12 w-10 justify-center rounded-t-lg rounded-b bg-white shadow-[inset_0_0_0_2px_#c99a2e]"><span className="h-full w-1.5 bg-gradient-to-b from-[#c99a2e] to-[#1a1d23]" /></span>
                </div>
                <p className="mt-2 text-[15px] font-semibold">Primera</p>
                <p className="text-xs text-ink-3">La de tu modelo</p>
              </div>
              <div className="rounded-2xl bg-surface-2 p-3 opacity-70" aria-disabled="true">
                <div className="flex h-20 items-center justify-center rounded-xl bg-surface-3">
                  <span className="flex h-12 w-10 justify-center rounded-t-lg rounded-b bg-[#15201a] shadow-[inset_0_0_0_2px_#fff]"><span className="h-full w-1.5 bg-gradient-to-b from-[#c99a2e] to-white" /></span>
                </div>
                <p className="mt-2 text-[15px] font-semibold">Segunda</p>
                <p className="text-xs text-ink-3">Próximamente</p>
              </div>
            </div>
            <p className="text-xs text-ink-3">Tus botas, medias y dorsal se mantienen con cualquier equipación.</p>
          </div>
        )}
        {msg && <p role="status" className={cx("mt-4 rounded-2xl px-4 py-3 text-sm", msg.ok ? "bg-pitch-soft" : "bg-danger-soft")}>{msg.text}</p>}
      </div>
    </div>
  );
}
