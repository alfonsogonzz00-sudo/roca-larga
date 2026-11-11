"use client";
import { Monitor, Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";
import { cx } from "@/components/ui";

type Mode = "system" | "light" | "dark";

/** Script que se ejecuta antes de pintar para evitar el parpadeo de tema */
export const themeScript = `(function(){try{var m=localStorage.getItem('theme');if(m==='light'||m==='dark'){document.documentElement.dataset.theme=m}}catch(e){}})();`;

const listeners = new Set<() => void>();
function read(): Mode {
  try {
    const m = localStorage.getItem("theme");
    return m === "light" || m === "dark" ? m : "system";
  } catch {
    return "system";
  }
}
function applyTheme(m: Mode) {
  try {
    const root = document.documentElement;
    if (m === "system") {
      localStorage.removeItem("theme");
      root.removeAttribute("data-theme");
    } else {
      localStorage.setItem("theme", m);
      root.setAttribute("data-theme", m);
    }
  } catch {}
  listeners.forEach((l) => l());
}
const subscribe = (l: () => void) => { listeners.add(l); return () => listeners.delete(l); };

export function ThemeToggle() {
  const mode = useSyncExternalStore(subscribe, read, () => "system" as Mode);
  const opts: { m: Mode; label: string; Icon: typeof Sun }[] = [
    { m: "system", label: "Automático", Icon: Monitor },
    { m: "light", label: "Claro", Icon: Sun },
    { m: "dark", label: "Oscuro", Icon: Moon },
  ];
  return (
    <div role="radiogroup" aria-label="Tema" className="inline-flex rounded-xl border border-line bg-surface-2 p-1">
      {opts.map(({ m, label, Icon }) => (
        <button key={m} type="button" role="radio" aria-checked={mode === m} onClick={() => applyTheme(m)}
          className={cx("flex min-h-10 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold", mode === m ? "bg-surface text-ink shadow-card" : "text-ink-3")}>
          <Icon size={16} aria-hidden /> {label}
        </button>
      ))}
    </div>
  );
}
