"use client";
import { useEffect, useState } from "react";
import { Bell, CalendarCheck, Trophy, Vote } from "lucide-react";
import { Button } from "@/components/ui";
import { enablePushOnThisDevice, pushContext } from "./push-toggle";
import { getFlag, setFlag, subscribeOnboarding } from "@/components/onboarding/store";

const KEY = "rl-push-ask";

/**
 * Petición de permiso de avisos al entrar con cuenta. Sólo aparece si el
 * dispositivo puede recibirlos (en iPhone, dentro de la app instalada),
 * si aún no se ha decidido y si no se pospuso en los últimos 3 días.
 * El permiso se pide con un toque del usuario, como exigen iOS y Chrome.
 */
export function PushPrompt({ vapidKey, enabled, afterTour }: { vapidKey: string; enabled: boolean; afterTour: boolean }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || !vapidKey) return;
    let t: ReturnType<typeof setTimeout> | undefined;
    const check = () => { clearTimeout(t); t = setTimeout(async () => {
      try {
        const { isIOS, standalone, supported } = pushContext();
        if (!supported || (isIOS && !standalone) || Notification.permission !== "default") return;
        const snooze = Number(getFlag(KEY) ?? 0);
        if (snooze && Date.now() - snooze < 3 * 864e5) return;
        if (afterTour && getFlag("rl-tour-v1") !== "done") return; // primero el recorrido guiado
        const reg = await navigator.serviceWorker.getRegistration();
        if (await reg?.pushManager.getSubscription()) return;
        setOpen(true);
      } catch { /* sin soporte: no se muestra */ }
    }, 1200); };
    check();
    const unsub = subscribeOnboarding(check); // al terminar el recorrido
    return () => { clearTimeout(t); unsub(); };
  }, [enabled, vapidKey, afterTour]);

  if (!open) return null;
  const later = () => { setFlag(KEY, String(Date.now())); setOpen(false); };
  const accept = async () => {
    setBusy(true);
    try {
      const r = await enablePushOnThisDevice(vapidKey);
      if (r.ok) { setOpen(false); return; }
      setMsg(r.text);
      if (r.denied) setTimeout(() => setOpen(false), 2500);
    } catch { setMsg("No se pudieron activar. Inténtalo desde Perfil."); }
    finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-[65]" role="dialog" aria-modal="true" aria-labelledby="push-title">
      <div className="animate-fade absolute inset-0 bg-black/60" aria-hidden />
      <div className="animate-rise absolute inset-x-0 bottom-0 mx-auto max-w-md rounded-t-3xl border-t border-line bg-elev px-5 pt-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-card sm:bottom-6 sm:rounded-3xl sm:border">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-pitch-soft text-pitch"><Bell size={28} aria-hidden /></span>
        <h2 id="push-title" className="mt-3 text-center font-display text-2xl font-bold uppercase">¿Te avisamos?</h2>
        <p className="mt-1 text-center text-sm text-ink-2">Activa los avisos para no perderte nada del grupo:</p>
        <ul className="mt-4 space-y-2.5 text-sm">
          <li className="flex items-center gap-3"><CalendarCheck size={18} className="shrink-0 text-pitch" aria-hidden />Cuando te convoquen y antes de cada partido</li>
          <li className="flex items-center gap-3"><Vote size={18} className="shrink-0 text-pitch" aria-hidden />Cuando se abra la votación</li>
          <li className="flex items-center gap-3"><Trophy size={18} className="shrink-0 text-pitch" aria-hidden />Quién se ha llevado el MVP</li>
        </ul>
        {msg && <p role="status" className="mt-3 text-center text-sm text-danger">{msg}</p>}
        <Button className="mt-5 w-full" onClick={accept} disabled={busy}>{busy ? "Activando…" : "Activar avisos"}</Button>
        <button type="button" onClick={later} className="mt-2 min-h-11 w-full rounded-xl text-sm font-semibold text-ink-3 hover:text-ink">Ahora no</button>
        <p className="text-center text-xs text-ink-3">Podrás cambiarlo cuando quieras en Perfil.</p>
      </div>
    </div>
  );
}
