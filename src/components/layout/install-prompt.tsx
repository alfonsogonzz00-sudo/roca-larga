"use client";
import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";
import { getFlag, setFlag } from "@/components/onboarding/store";

interface BIPEvent extends Event { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> }

type Mode = "native" | "inapp" | "android-manual" | null;

/** Detecta navegadores integrados (WhatsApp, Instagram, Facebook…), donde no se puede instalar */
function isInApp(ua: string) {
  return /WhatsApp|Instagram|FBAN|FBAV|FB_IAB|Line\/|Telegram|; wv\)/i.test(ua);
}

/** Banner para instalar la app en Android (en iPhone se instala desde Compartir) */
export function InstallPrompt() {
  const [mode, setMode] = useState<Mode>(null);
  const [evt, setEvt] = useState<BIPEvent | null>(null);

  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)").matches;
    const android = /Android/i.test(navigator.userAgent);
    if (standalone || !android || getFlag("rl-install-hide")) return;
    const onBip = (e: Event) => { e.preventDefault(); setEvt(e as BIPEvent); setMode("native"); };
    window.addEventListener("beforeinstallprompt", onBip);
    const onInstalled = () => { setMode(null); setFlag("rl-install-hide", "1"); };
    window.addEventListener("appinstalled", onInstalled);
    // Si Chrome no ofrece la instalación en unos segundos, enseñamos los pasos
    const t = setTimeout(() => setMode((m) => m ?? (isInApp(navigator.userAgent) ? "inapp" : "android-manual")), 2500);
    return () => { clearTimeout(t); window.removeEventListener("beforeinstallprompt", onBip); window.removeEventListener("appinstalled", onInstalled); };
  }, []);

  if (!mode) return null;
  const close = () => { setMode(null); setFlag("rl-install-hide", "1"); };
  const install = async () => {
    if (!evt) return;
    await evt.prompt();
    const { outcome } = await evt.userChoice;
    if (outcome === "accepted") close();
  };
  const openInChrome = () => {
    const u = new URL(window.location.href);
    window.location.href = `intent://${u.host}${u.pathname}${u.search}#Intent;scheme=https;package=com.android.chrome;end`;
  };

  return (
    <div role="dialog" aria-label="Instalar Roca Larga" className="bottom-above-nav fixed inset-x-3 z-50 mx-auto max-w-md glass p-3 shadow-card lg:hidden">
      <div className="flex items-start gap-3">
        <Download size={20} className="mt-0.5 shrink-0 text-pitch" aria-hidden />
        <div className="flex-1 text-sm">
          <p className="font-semibold">Instala Roca Larga en tu móvil</p>
          {mode === "native" && <p className="mt-0.5 text-ink-2">Tendrás el icono en la pantalla de inicio y te llegarán los avisos.</p>}
          {mode === "inapp" && <p className="mt-0.5 text-ink-2">Desde el navegador de WhatsApp (o Instagram) no se puede instalar. Ábrela en Chrome y te saldrá la opción.</p>}
          {mode === "android-manual" && <p className="mt-0.5 text-ink-2">En Chrome: menú <strong>⋮</strong> → <strong>«Instalar aplicación»</strong> o <strong>«Añadir a pantalla de inicio»</strong> → Instalar.</p>}
          <div className="mt-2 flex gap-2">
            {mode === "native" && <button type="button" onClick={install} className="press min-h-10 bg-pitch px-4 text-sm font-semibold text-pitch-ink">Instalar</button>}
            {mode === "inapp" && <button type="button" onClick={openInChrome} className="press min-h-10 bg-pitch px-4 text-sm font-semibold text-pitch-ink">Abrir en Chrome</button>}
          </div>
        </div>
        <button type="button" onClick={close} aria-label="Cerrar" className="-m-1 p-1 text-ink-3"><X size={18} /></button>
      </div>
    </div>
  );
}
