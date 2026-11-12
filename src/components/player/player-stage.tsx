"use client";
import { useEffect, useRef, useState } from "react";
import { Pause, Play, RotateCcw } from "lucide-react";
import { isDefaultPaint, kitKey, paintTexture, type KitPaint } from "@/lib/kit";
import { cx } from "@/components/ui";

interface MVTexture { readonly __t?: never }
interface MVMaterial { pbrMetallicRoughness: { baseColorTexture: { texture: MVTexture | null; setTexture(t: MVTexture | null): void } } }
type MV = HTMLElement & {
  model?: { materials: MVMaterial[] };
  createTexture(uri: string): Promise<MVTexture>;
  resetTurntableRotation?: () => void;
  jumpCameraToGoal?: () => void;
  cameraOrbit: string; cameraTarget: string;
};

declare module "react" {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      "model-viewer": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & Record<string, unknown>;
    }
  }
}

export type StageFocus = "full" | "boots" | "back";
const CAMERA: Record<StageFocus, { orbit: string; target: string }> = {
  full: { orbit: "0deg 82deg auto", target: "auto auto auto" },
  boots: { orbit: "25deg 72deg 1.35m", target: "0m -0.72m 0m" },
  back: { orbit: "180deg 84deg 1.7m", target: "0m 0.28m 0m" },
};

// ---- utilidades de textura (sólo navegador) -----------------------------------------
const pixelCache = new Map<string, Promise<ImageData>>();
function loadPixels(url: string): Promise<ImageData> {
  let p = pixelCache.get(url);
  if (!p) {
    p = (async () => {
      const blob = await (await fetch(url)).blob();
      const bmp = await createImageBitmap(blob, { colorSpaceConversion: "none", premultiplyAlpha: "none" });
      const c = document.createElement("canvas");
      c.width = bmp.width; c.height = bmp.height;
      const ctx = c.getContext("2d", { willReadFrequently: true })!;
      ctx.drawImage(bmp, 0, 0);
      return ctx.getImageData(0, 0, c.width, c.height);
    })();
    pixelCache.set(url, p);
    p.catch(() => pixelCache.delete(url));
  }
  return p;
}

/** Nombre y dorsal dibujados en el espacio de la espalda (mismo encuadre que el mapa) */
async function drawPrint(name: string, number: number | null) {
  const W = 372, H = 400;
  try { await document.fonts.load('700 190px "Barlow Condensed"'); } catch { /* usa la de reserva */ }
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const ctx = c.getContext("2d")!;
  ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
  ctx.lineJoin = "round";
  const ink = (text: string, size: number, y: number, maxW: number) => {
    ctx.font = `700 ${size}px "Barlow Condensed", "Arial Narrow", sans-serif`;
    const w = ctx.measureText(text).width;
    const s = w > maxW ? maxW / w : 1;
    ctx.save(); ctx.translate(W / 2, y); ctx.scale(s, 1);
    ctx.lineWidth = Math.max(2, size * 0.06); ctx.strokeStyle = "#2b2412"; ctx.strokeText(text, 0, 0);
    ctx.fillStyle = "#c99a2e"; ctx.fillText(text, 0, 0);
    ctx.restore();
  };
  if (name) ink(name, 46, 86, 230);
  if (number != null) ink(String(number), 196, 286, 250);
  return ctx.getImageData(0, 0, W, H);
}

/** Modelo 3D del jugador (se carga sólo en esta pantalla; mientras, se ve la foto de ficha) */
export function PlayerStage({ src, poster, name, color, mapUrl, paint, focus = "full", editing = false, className, children }: {
  src: string; poster?: string | null; name: string; color: string;
  mapUrl?: string | null; paint?: KitPaint; focus?: StageFocus; editing?: boolean;
  className?: string; children?: React.ReactNode;
}) {
  const ref = useRef<MV>(null);
  const origTex = useRef<MVTexture | null | undefined>(undefined);
  const lastUrl = useRef<string | null>(null);
  const [ready, setReady] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [spin, setSpin] = useState(!editing);
  const key = paint ? kitKey(paint) : "";

  useEffect(() => {
    let alive = true;
    import("@google/model-viewer").then(() => { if (alive) setReady(true); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onLoad = () => setLoaded(true);
    el.addEventListener("load", onLoad);
    return () => el.removeEventListener("load", onLoad);
  }, [ready]);

  // Cámara: el editor enfoca la zona que se está tocando
  useEffect(() => {
    const el = ref.current;
    if (!el || !loaded) return;
    el.cameraOrbit = CAMERA[focus].orbit;
    el.cameraTarget = CAMERA[focus].target;
  }, [focus, loaded]);

  // Personalización: recolorea la textura y pinta nombre y dorsal
  useEffect(() => {
    const el = ref.current;
    if (!el || !loaded || !paint || !mapUrl) return;
    const slot = el.model?.materials?.[0]?.pbrMetallicRoughness.baseColorTexture;
    if (!slot) return;
    if (origTex.current === undefined) origTex.current = slot.texture;
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        if (isDefaultPaint(paint)) { slot.setTexture(origTex.current ?? null); return; }
        const baseUrl = mapUrl.replace(/-map\.png/, "-base.webp");
        const [base, map] = await Promise.all([loadPixels(baseUrl), loadPixels(mapUrl)]);
        const print = paint.name || paint.number != null ? await drawPrint(paint.name, paint.number) : undefined;
        if (cancelled) return;
        const data = new Uint8ClampedArray(base.data);
        paintTexture(data, map.data, paint, print);
        const c = document.createElement("canvas");
        c.width = base.width; c.height = base.height;
        c.getContext("2d")!.putImageData(new ImageData(data, base.width, base.height), 0, 0);
        const blob: Blob | null = await new Promise((r) => c.toBlob(r, "image/png"));
        if (!blob || cancelled) return;
        const url = URL.createObjectURL(blob);
        const tex = await el.createTexture(url);
        if (cancelled) { URL.revokeObjectURL(url); return; }
        slot.setTexture(tex);
        if (lastUrl.current) URL.revokeObjectURL(lastUrl.current);
        lastUrl.current = url;
      } catch { /* si falla, se queda el modelo original */ }
    }, editing ? 60 : 0);
    return () => { cancelled = true; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, loaded, mapUrl, editing]);

  useEffect(() => () => { if (lastUrl.current) URL.revokeObjectURL(lastUrl.current); }, []);

  const reset = () => {
    const el = ref.current;
    if (!el) return;
    el.cameraOrbit = CAMERA.full.orbit;
    el.cameraTarget = CAMERA.full.target;
    el.resetTurntableRotation?.();
  };

  return (
    <div className={cx("relative overflow-hidden", className ?? "h-[min(64vh,34rem)] rounded-3xl")}
      style={{ background: `radial-gradient(120% 80% at 50% 15%, color-mix(in srgb, ${color} 16%, #ffffff) 0%, var(--surface-2) 70%)` }}>
      <div aria-hidden className="absolute inset-x-[18%] bottom-[6%] h-6 rounded-[100%] bg-black/10 blur-md" />
      {poster && !loaded && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={poster} alt="" className="absolute inset-0 h-full w-full object-contain object-bottom mix-blend-multiply" />
      )}
      {ready && (
        <model-viewer ref={ref} src={src} alt={`Modelo 3D de ${name}`}
          camera-controls="" touch-action="pan-y" interaction-prompt="none"
          {...(spin && !editing ? { "auto-rotate": "" } : {})} auto-rotate-delay="0" rotation-per-second="18deg"
          camera-orbit={CAMERA.full.orbit} min-camera-orbit="auto 40deg auto" max-camera-orbit="auto 100deg auto"
          interpolation-decay="120" environment-image="neutral" exposure="1.05" shadow-intensity="0.9" shadow-softness="0.9"
          disable-pan="" loading="eager"
          style={{ width: "100%", height: "100%", background: "transparent", opacity: loaded ? 1 : 0, transition: "opacity .4s ease" }} />
      )}
      {!loaded && (
        <span className="glass absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full px-3 py-1.5 text-xs font-semibold text-ink-2">Cargando 3D…</span>
      )}
      {loaded && !editing && (
        <div className="absolute right-3 bottom-3 flex gap-2">
          <button type="button" onClick={() => setSpin((v) => !v)} aria-label={spin ? "Parar giro" : "Girar"}
            className="glass press flex h-11 w-11 items-center justify-center rounded-full text-ink">{spin ? <Pause size={16} /> : <Play size={16} />}</button>
          <button type="button" onClick={reset} aria-label="Volver a la vista inicial"
            className="glass press flex h-11 w-11 items-center justify-center rounded-full text-ink"><RotateCcw size={16} /></button>
        </div>
      )}
      {loaded && !editing && <span className="absolute top-3 left-3 rounded-full bg-black/5 px-2.5 py-1 text-[11px] font-semibold text-ink-2">Desliza para girar</span>}
      {children}
    </div>
  );
}
