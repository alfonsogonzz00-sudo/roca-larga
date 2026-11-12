"use client";
import { useEffect, useSyncExternalStore } from "react";

/**
 * Burbujas de novedades del menú. Cada apartado guarda en el móvil lo que ya se vio;
 * la cifra son los elementos nuevos desde entonces y se pone a cero al entrar en el apartado.
 * La primera vez que se usa no se marca nada como nuevo (para no avisar de todo el histórico).
 */
type Key = "matches" | "votes" | "activity";
const LS = (k: Key) => `rl-seen-${k}`;
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => { listeners.add(l); return () => listeners.delete(l); };

function readSeen(k: Key): Set<string> | null {
  try { const v = localStorage.getItem(LS(k)); return v ? new Set(JSON.parse(v) as string[]) : null; } catch { return null; }
}
function writeSeen(k: Key, ids: string[]) {
  try { localStorage.setItem(LS(k), JSON.stringify(ids.slice(0, 200))); } catch { /* sin almacenamiento */ }
  listeners.forEach((l) => l());
}

export function useBadge(k: Key, ids: string[], active: boolean): number {
  const key = ids.join(",");
  const count = useSyncExternalStore(subscribe, () => {
    const seen = readSeen(k);
    if (!seen) return k === "votes" ? ids.length : 0; // una votación pendiente siempre se avisa
    return ids.filter((i) => !seen.has(i)).length;
  }, () => 0);
  useEffect(() => {
    const seen = readSeen(k);
    // primera vez o al entrar en el apartado: todo lo actual queda visto
    if ((!seen && k !== "votes") || active) {
      if (seen && ids.every((i) => seen.has(i))) return;
      writeSeen(k, [...new Set([...ids, ...(seen ?? [])])]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [k, key, active]);
  return count;
}

export function Bubble({ n, className = "" }: { n: number; className?: string }) {
  if (!n) return null;
  return (
    <span aria-label={`${n} ${n === 1 ? "novedad" : "novedades"}`}
      className={`absolute -top-1.5 -right-2.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#e5383b] px-1 text-[11px] font-bold leading-none text-white ring-2 ring-[var(--bg-elev)] ${className}`}>
      {n > 9 ? "9+" : n}
    </span>
  );
}
