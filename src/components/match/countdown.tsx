"use client";
import { useSyncExternalStore } from "react";

/** Reloj compartido que avisa cada 30 s (una sola suscripción por pestaña) */
let now = Date.now();
const subs = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;
function subscribe(cb: () => void) {
  subs.add(cb);
  if (!timer) timer = setInterval(() => { now = Date.now(); subs.forEach((f) => f()); }, 30_000);
  return () => { subs.delete(cb); if (!subs.size && timer) { clearInterval(timer); timer = null; } };
}

function parts(ms: number) {
  const m = Math.max(0, Math.floor(ms / 60_000));
  return { d: Math.floor(m / 1440), h: Math.floor((m % 1440) / 60), min: m % 60 };
}

/** Cuenta atrás hasta el inicio. `serverNow` evita desajustes al hidratar. */
export function Countdown({ to, serverNow, className }: { to: string; serverNow: number; className?: string }) {
  const t = useSyncExternalStore(subscribe, () => now, () => serverNow);
  const diff = new Date(to).getTime() - t;
  if (diff <= 0) return <span className={className}>{diff > -2 * 3600_000 ? "¡En juego!" : "Pendiente de resultado"}</span>;
  const { d, h, min } = parts(diff);
  const cells = d > 0 ? [[d, "d"], [h, "h"], [min, "min"]] : [[h, "h"], [min, "min"]];
  return (
    <span className={className} aria-label={`Faltan ${d ? `${d} días, ` : ""}${h} horas y ${min} minutos`}>
      {cells.map(([v, u]) => (
        <span key={u} className="inline-flex items-baseline gap-0.5"><span className="font-display tabular text-xl font-bold leading-none">{v}</span><span className="text-xs text-ink-3">{u}</span></span>
      ))}
    </span>
  );
}
