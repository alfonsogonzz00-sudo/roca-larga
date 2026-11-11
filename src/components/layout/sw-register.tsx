"use client";
import { useEffect, useState, useSyncExternalStore } from "react";

/** Registra el service worker y avisa cuando hay una versión nueva */
export function ServiceWorkerRegister() {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  useEffect(() => {
    if (!("serviceWorker" in navigator) || process.env.NODE_ENV !== "production") return;
    let reloading = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    });
    navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).then((reg) => {
      if (reg.waiting && navigator.serviceWorker.controller) setWaiting(reg.waiting);
      reg.addEventListener("updatefound", () => {
        const sw = reg.installing;
        sw?.addEventListener("statechange", () => {
          if (sw.state === "installed" && navigator.serviceWorker.controller) setWaiting(sw);
        });
      });
      const t = setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000);
      return () => clearInterval(t);
    }).catch(() => {});

    // Si hay un despliegue más nuevo que la versión cargada, recargamos solos
    // (iOS mantiene la app instalada "congelada" en memoria durante días).
    const mine = process.env.NEXT_PUBLIC_BUILD_ID;
    let checking = false;
    const check = async () => {
      if (checking || document.visibilityState !== "visible" || !mine || mine === "dev") return;
      checking = true;
      try {
        const r = await fetch("/api/version", { cache: "no-store" });
        const { v } = (await r.json()) as { v?: string };
        if (v && v !== "dev" && v !== mine && !reloading) {
          reloading = true;
          const reg = await navigator.serviceWorker.getRegistration();
          await reg?.update().catch(() => {});
          window.location.reload();
        }
      } catch { /* sin conexión: seguimos con lo que hay */ } finally { checking = false; }
    };
    check();
    document.addEventListener("visibilitychange", check);
    window.addEventListener("focus", check);
    return () => { document.removeEventListener("visibilitychange", check); window.removeEventListener("focus", check); };
  }, []);
  if (!waiting) return null;
  return (
    <div role="status" className="fixed inset-x-3 bottom-20 z-50 mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-line bg-elev p-3 shadow-card lg:bottom-6">
      <p className="flex-1 text-sm text-ink">Hay una versión nueva de la app.</p>
      <button className="min-h-10 rounded-xl bg-pitch px-3 text-sm font-semibold text-pitch-ink" onClick={() => waiting.postMessage({ type: "SKIP_WAITING" })}>
        Actualizar
      </button>
    </div>
  );
}

const subscribeOnline = (cb: () => void) => {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => { window.removeEventListener("online", cb); window.removeEventListener("offline", cb); };
};

export function OfflineBanner({ text }: { text: string }) {
  const offline = useSyncExternalStore(subscribeOnline, () => !navigator.onLine, () => false);
  if (!offline) return null;
  return <div role="status" className="bg-gold px-4 py-1.5 text-center text-xs font-semibold text-white">{text}</div>;
}
