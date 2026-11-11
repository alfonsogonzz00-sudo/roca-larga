"use client";
import { useSyncExternalStore, type ReactNode } from "react";
import { Lightbulb, X } from "lucide-react";
import { getFlag, setFlag, subscribeOnboarding } from "./store";

/** Ayuda contextual que aparece la primera vez que se visita una sección */
export function Hint({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  const key = `rl-hint-${id}`;
  const seen = useSyncExternalStore(subscribeOnboarding, () => getFlag(key) === "1", () => true);
  if (seen) return null;
  return (
    <aside role="note" className="animate-rise relative rounded-2xl bg-pitch-soft p-4 pr-11 text-sm">
      <p className="flex items-center gap-2 font-semibold text-ink"><Lightbulb size={16} className="text-pitch" aria-hidden />{title}</p>
      <div className="mt-1 text-ink-2">{children}</div>
      <button type="button" onClick={() => setFlag(key, "1")} className="press mt-3 rounded-full bg-pitch px-3.5 py-1.5 text-xs font-semibold text-pitch-ink">Entendido</button>
      <button type="button" onClick={() => setFlag(key, "1")} aria-label="Cerrar ayuda" className="absolute top-2 right-2 flex h-9 w-9 items-center justify-center rounded-lg text-ink-3 hover:bg-surface-2"><X size={16} /></button>
    </aside>
  );
}
