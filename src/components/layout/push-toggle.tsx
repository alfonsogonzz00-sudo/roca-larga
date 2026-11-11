"use client";
import { useEffect, useState } from "react";
import { Bell, BellOff, BellRing, Share, SquarePlus } from "lucide-react";
import { removePushSubscription, savePushSubscription, sendTestPush } from "@/app/actions/push";
import { Button, Notice } from "@/components/ui";

type State = "loading" | "unsupported" | "ios-install" | "denied" | "off" | "on" | "nokey";

function urlB64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

/** Activa/desactiva las notificaciones push en este dispositivo, con ayuda para iOS */
export function PushToggle({ vapidKey }: { vapidKey: string }) {
  const [state, setState] = useState<State>("loading");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
      const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
      if (!vapidKey) return setState("nokey");
      if (isIOS && !standalone) return setState("ios-install");
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return setState("unsupported");
      if (Notification.permission === "denied") return setState("denied");
      const reg = await navigator.serviceWorker.getRegistration();
      const subscription = await reg?.pushManager.getSubscription();
      // Re-sincroniza: si el servidor la perdió (claves regeneradas, otra cuenta…), vuelve a guardarla
      if (subscription) await savePushSubscription(subscription.toJSON(), navigator.userAgent).catch(() => null);
      setState(subscription ? "on" : "off");
    })().catch(() => setState("unsupported"));
  }, [vapidKey]);

  const enable = async () => {
    setBusy(true); setMsg(null);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") { setState(perm === "denied" ? "denied" : "off"); return; }
      const reg = (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register("/sw.js"));
      await navigator.serviceWorker.ready;
      const subscription = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8Array(vapidKey) });
      const r = await savePushSubscription(subscription.toJSON(), navigator.userAgent);
      setMsg(r.ok ? { ok: true, text: r.message ?? "Activado" } : { ok: false, text: r.error });
      if (r.ok) setState("on");
    } catch {
      setMsg({ ok: false, text: "No se pudieron activar los avisos en este navegador." });
    } finally { setBusy(false); }
  };

  const disable = async () => {
    setBusy(true);
    const reg = await navigator.serviceWorker.getRegistration();
    const subscription = await reg?.pushManager.getSubscription();
    if (subscription) {
      await removePushSubscription(subscription.endpoint);
      await subscription.unsubscribe();
    }
    setState("off"); setBusy(false);
    setMsg({ ok: true, text: "Avisos desactivados en este dispositivo." });
  };

  const test = async () => {
    setBusy(true); setMsg(null);
    const r = await sendTestPush();
    setBusy(false);
    setMsg(r.ok ? { ok: true, text: r.message ?? "Enviado" } : { ok: false, text: r.error });
  };

  return (
    <div className="space-y-2">
      {state === "loading" && <p className="text-sm text-ink-3">Comprobando este dispositivo…</p>}
      {state === "nokey" && <Notice tone="warn">Las notificaciones push aún no están configuradas en el servidor (el administrador debe activarlas en Administración → Notificaciones).</Notice>}
      {state === "unsupported" && <Notice>Este navegador no admite notificaciones push. La app funciona igual; prueba con Chrome en Android o instalando la app en iPhone.</Notice>}
      {state === "denied" && <Notice tone="warn">Has bloqueado las notificaciones para esta app. Actívalas en los ajustes del navegador o del sistema (Ajustes → Notificaciones) y vuelve aquí.</Notice>}
      {state === "ios-install" && (
        <Notice tone="info">
          <p className="font-semibold">En iPhone, primero instala la app:</p>
          <ol className="mt-1 list-decimal space-y-1 pl-5">
            <li>Abre esta web en Safari y pulsa <Share size={14} className="inline" aria-label="Compartir" /> Compartir.</li>
            <li>Elige <SquarePlus size={14} className="inline" aria-hidden /> «Añadir a pantalla de inicio».</li>
            <li>Abre la app desde el icono y vuelve a Perfil para activar los avisos.</li>
          </ol>
        </Notice>
      )}
      {state === "off" && <Button onClick={enable} disabled={busy}><Bell size={18} /> Activar avisos en este dispositivo</Button>}
      {state === "on" && (
        <div className="flex flex-wrap gap-2">
          <Button onClick={test} disabled={busy}><BellRing size={18} /> Enviar aviso de prueba</Button>
          <Button variant="secondary" onClick={disable} disabled={busy}><BellOff size={18} /> Desactivar avisos aquí</Button>
        </div>
      )}
      {msg && <Notice tone={msg.ok ? "ok" : "danger"}>{msg.text}</Notice>}
    </div>
  );
}
