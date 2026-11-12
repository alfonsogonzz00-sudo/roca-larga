"use client";
import { Monitor, Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";
import { cx } from "@/components/ui";

type Mode = "system" | "light" | "dark";

/** Script que se ejecuta antes de pintar para evitar el parpadeo de tema */
// Por defecto la app es CLARA (el HTML sale con data-theme="light"); sólo cambia si el usuario eligió otra cosa.
// Clave nueva «rl-theme»: la antigua («theme») se ignora para que todos arranquen en claro.
const KEY = "rl-theme";
// También ajusta el color de la barra de estado del móvil (theme-color) al tema real.
const SYNC_BAR = `function(){var r=document.documentElement,t=r.dataset.theme,d=t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme: dark)').matches),c=d?'#121813':'#ffffff';document.querySelectorAll('meta[name=theme-color]').forEach(function(e){e.setAttribute('content',c)})}`;
export const themeScript = `(function(){try{var m=localStorage.getItem('${KEY}');document.documentElement.dataset.theme=(m==='dark'||m==='system')?m:'light';var s=${SYNC_BAR};s();document.addEventListener('DOMContentLoaded',s);matchMedia('(prefers-color-scheme: dark)').addEventListener('change',s);window.__rlSyncBar=s}catch(e){}})();`;

const listeners = new Set<() => void>();
function read(): Mode {
  try {
    const m = localStorage.getItem(KEY);
    return m === "dark" || m === "system" ? m : "light";
  } catch {
    return "light";
  }
}
function applyTheme(m: Mode) {
  try {
    const root = document.documentElement;
    localStorage.setItem(KEY, m);
    root.setAttribute("data-theme", m);
    (window as unknown as { __rlSyncBar?: () => void }).__rlSyncBar?.();
  } catch {}
  listeners.forEach((l) => l());
}
const subscribe = (l: () => void) => { listeners.add(l); return () => listeners.delete(l); };

export function ThemeToggle() {
  const mode = useSyncExternalStore(subscribe, read, () => "light" as Mode);
  const opts: { m: Mode; label: string; Icon: typeof Sun }[] = [
    { m: "light", label: "Claro", Icon: Sun },
    { m: "dark", label: "Oscuro", Icon: Moon },
    { m: "system", label: "Automático", Icon: Monitor },
  ];
  return (
    <div role="radiogroup" aria-label="Tema" className="inline-flex max-w-full flex-wrap rounded-xl bg-surface-2 p-1">
      {opts.map(({ m, label, Icon }) => (
        <button key={m} type="button" role="radio" aria-checked={mode === m} onClick={() => applyTheme(m)}
          className={cx("press flex min-h-10 items-center gap-1.5 rounded-lg px-2.5 text-sm font-semibold", mode === m ? "bg-surface text-ink shadow-card" : "text-ink-3")}>
          <Icon size={16} aria-hidden /> {label}
        </button>
      ))}
    </div>
  );
}
