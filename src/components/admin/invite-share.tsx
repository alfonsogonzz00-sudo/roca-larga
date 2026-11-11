"use client";
import { useState, useSyncExternalStore } from "react";
import { Check, Copy, Share2 } from "lucide-react";

const noop = () => () => {};
const useOrigin = () => useSyncExternalStore(noop, () => window.location.origin, () => "https://roca-larga.vercel.app");

const template = (url: string) => `⚽ *Roca Larga* · Caravelle F.C. vs S.D. Monecillo

Ya tenemos app para los partidos: convocatorias, resultados, estadísticas, notas y votación del MVP.

👉 Entra aquí y crea tu cuenta: ${url}/login

1. Regístrate con tu correo y una contraseña (confirma el correo que te llega).
2. Elige tu equipo, tu nombre y pon tu apodo.
3. Cuando te pregunte por las notificaciones, dale a «Permitir».

📲 *Instálala como app*
• iPhone (Safari): botón Compartir ⬆️ → «Añadir a pantalla de inicio».
• Android (Chrome): menú ⋮ → «Instalar aplicación».
Ábrela siempre desde el icono.`;

/** Invitación lista para mandar al grupo de WhatsApp */
export function InviteShare() {
  const origin = useOrigin();
  const [edited, setEdited] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const text = edited ?? template(origin);

  const share = async () => {
    // En el móvil abre el menú de compartir (WhatsApp, grupos…); si no, WhatsApp directamente
    if (navigator.share) {
      try { await navigator.share({ text }); return; } catch (e) { if ((e as Error).name === "AbortError") return; }
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener");
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* sin permiso */ }
  };

  return (
    <div className="space-y-3">
      <label htmlFor="invite-text" className="block text-sm font-semibold">Mensaje de invitación</label>
      <textarea id="invite-text" value={text} onChange={(e) => setEdited(e.target.value)} rows={11}
        className="w-full border border-line bg-surface px-3 py-2 text-sm leading-relaxed focus:border-pitch focus:outline-none" />
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={share} className="press inline-flex min-h-11 items-center gap-2 bg-[#25d366] px-4 text-sm font-semibold text-[#06210f]">
          <Share2 size={18} aria-hidden /> Compartir por WhatsApp
        </button>
        <button type="button" onClick={copy} className="press inline-flex min-h-11 items-center gap-2 border border-line bg-surface px-4 text-sm font-semibold">
          {copied ? <Check size={18} aria-hidden /> : <Copy size={18} aria-hidden />} {copied ? "Copiado" : "Copiar texto"}
        </button>
        {edited !== null && <button type="button" onClick={() => setEdited(null)} className="min-h-11 px-3 text-sm text-ink-3 underline-offset-2 hover:underline">Restablecer</button>}
      </div>
      <p className="text-xs text-ink-3">En el móvil se abre el menú de compartir: elige WhatsApp y el grupo. Al registrarse, cada uno te llegará como solicitud en Usuarios para que la valides.</p>
    </div>
  );
}
