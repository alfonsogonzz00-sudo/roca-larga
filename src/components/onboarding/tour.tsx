"use client";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { usePathname, useRouter } from "next/navigation";
import { getFlag, setFlag, subscribeOnboarding } from "./store";

const KEY = "rl-tour-v1";

interface Step { target?: string; href?: string; title: string; body: string }
const STEPS: Step[] = [
  { title: "Bienvenido a Roca Larga", body: "Todo lo de Caravelle y Monecillo en un sitio: partidos, estadísticas, votaciones y piques. Te enseño lo básico en 30 segundos." },
  { target: "/", href: "/", title: "Partidos", body: "Aquí verás el próximo partido, si estás convocado (confirma con «Voy») y el pronóstico. También el último resultado." },
  { target: "/clasificacion", title: "Clasificación", body: "Estadísticas, rankings e histórico. Toca cualquier jugador para ver su ficha. Dentro también están El Despacho (simulaciones) y los estadios." },
  { target: "/votacion", title: "Votación", body: "Al empezar cada partido se abre la votación: eliges al mejor de tu equipo y al mejor del partido. Es secreta y cierra sola a las 24 horas." },
  { target: "/actividad", title: "Actividad", body: "Lo último que ha pasado: convocatorias, resultados, quién ha votado y los MVP." },
  { target: "/perfil", title: "Perfil", body: "Tu foto, tu apodo, tus estadísticas y los avisos al móvil. Desde aquí puedes repetir este recorrido cuando quieras." },
];

function visibleTarget(sel: string): HTMLElement | null {
  const els = document.querySelectorAll<HTMLElement>(`[data-tour="${sel}"]`);
  for (const el of els) { const r = el.getBoundingClientRect(); if (r.width > 0 && r.height > 0) return el; }
  return null;
}

/** Recorrido guiado: breve, saltable y repetible desde Perfil */
export function Tour({ enabled, initialStep = 0 }: { enabled: boolean; initialStep?: number }) {
  const done = useSyncExternalStore(subscribeOnboarding, () => getFlag(KEY) === "done", () => true);
  const [i, setI] = useState(initialStep);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const path = usePathname();
  const router = useRouter();
  const open = enabled && !done;
  const step = STEPS[i];

  useEffect(() => {
    if (!open) return;
    let raf = 0;
    const measure = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => setRect(step.target ? visibleTarget(step.target)?.getBoundingClientRect() ?? null : null)); };
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    nextRef.current?.focus();
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", measure); window.removeEventListener("scroll", measure, true); };
  }, [open, step, path]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") finish(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!open) return null;
  function finish() { setFlag(KEY, "done"); setI(0); }
  const next = () => {
    if (i === STEPS.length - 1) return finish();
    const n = STEPS[i + 1];
    if (n.href && n.href !== path) router.push(n.href);
    setI(i + 1);
  };

  // Tarjeta: sobre la barra inferior en móvil; a la derecha del menú lateral en escritorio
  const vw = typeof window !== "undefined" ? window.innerWidth : 400;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  const side = rect && rect.left < 300 && rect.top < vh - 120;
  const cardStyle: React.CSSProperties = !rect
    ? { left: Math.max(16, (vw - 384) / 2), right: Math.max(16, (vw - 384) / 2), top: "50%", transform: "translateY(-50%)" }
    : side
      ? { left: rect.right + 16, top: Math.max(16, Math.min(rect.top - 20, vh - 260)), width: 320 }
      : { left: 16, right: 16, bottom: vh - rect.top + 14 };

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="tour-title" className="fixed inset-0 z-[60]">
      {rect ? (
        <div aria-hidden className="pointer-events-none absolute rounded-2xl ring-2 ring-pitch transition-all duration-300 motion-reduce:transition-none"
          style={{ left: rect.left - 6, top: rect.top - 6, width: rect.width + 12, height: rect.height + 12, boxShadow: "0 0 0 9999px rgb(0 0 0 / 0.78)" }} />
      ) : <div aria-hidden className="absolute inset-0 bg-black/75" />}
      <div className="animate-rise absolute rounded-2xl glass p-4 shadow-card" style={cardStyle}>
        <p className="text-xs font-semibold text-ink-3">{i + 1} de {STEPS.length}</p>
        <h2 id="tour-title" className="mt-1 font-display text-2xl font-bold uppercase leading-tight">{step.title}</h2>
        <p className="mt-1.5 text-sm text-ink-2">{step.body}</p>
        <div className="mt-4 flex items-center gap-2">
          <button type="button" onClick={finish} className="press min-h-11 rounded-xl px-3 text-sm font-semibold text-ink-3 hover:text-ink">Saltar</button>
          <span className="flex flex-1 justify-center gap-1" aria-hidden>{STEPS.map((_, k) => <span key={k} className={`h-1.5 rounded-full transition-all ${k === i ? "w-4 bg-pitch" : "w-1.5 bg-line-strong"}`} />)}</span>
          <button ref={nextRef} type="button" onClick={next} className="press min-h-11 rounded-xl bg-pitch px-4 text-sm font-semibold text-pitch-ink">{i === STEPS.length - 1 ? "¡A jugar!" : i === 0 ? "Empezar" : "Siguiente"}</button>
        </div>
      </div>
    </div>
  );
}

/** Botón de Perfil para repetir el recorrido */
export function RestartTour() {
  const router = useRouter();
  return (
    <button type="button" onClick={() => { setFlag(KEY, null); router.push("/"); }} className="press inline-flex min-h-11 items-center rounded-xl bg-surface-2 hover:bg-surface-3 px-4 text-sm font-semibold hover:bg-surface-2">
      Repetir el tutorial
    </button>
  );
}
