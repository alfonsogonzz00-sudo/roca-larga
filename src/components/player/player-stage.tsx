"use client";
import { useEffect, useRef, useState } from "react";
import { Pause, Play, RotateCcw } from "lucide-react";

type MV = HTMLElement & { resetTurntableRotation?: () => void; cameraOrbit: string; jumpCameraToGoal?: () => void };

declare module "react" {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      "model-viewer": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & Record<string, unknown>;
    }
  }
}

const ORBIT = "0deg 82deg auto";

/** Modelo 3D del jugador (se carga sólo en esta pantalla; mientras, se ve la foto de ficha) */
export function PlayerStage({ src, poster, name, color }: { src: string; poster?: string | null; name: string; color: string }) {
  const ref = useRef<MV>(null);
  const [ready, setReady] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [spin, setSpin] = useState(true);

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

  const reset = () => {
    const el = ref.current;
    if (!el) return;
    el.cameraOrbit = ORBIT;
    el.resetTurntableRotation?.();
    el.jumpCameraToGoal?.();
  };

  return (
    <div className="relative h-[min(64vh,34rem)] overflow-hidden rounded-3xl"
      style={{ background: `radial-gradient(120% 80% at 50% 15%, color-mix(in srgb, ${color} 16%, #ffffff) 0%, var(--surface-2) 70%)` }}>
      <div aria-hidden className="absolute inset-x-[18%] bottom-[6%] h-6 rounded-[100%] bg-black/10 blur-md" />
      {poster && !loaded && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={poster} alt="" className="absolute inset-0 h-full w-full object-contain object-bottom mix-blend-multiply" />
      )}
      {ready && (
        <model-viewer ref={ref} src={src} alt={`Modelo 3D de ${name}`}
          camera-controls="" touch-action="pan-y" interaction-prompt="none"
          {...(spin ? { "auto-rotate": "" } : {})} auto-rotate-delay="0" rotation-per-second="18deg"
          camera-orbit={ORBIT} min-camera-orbit="auto 40deg auto" max-camera-orbit="auto 100deg auto"
          environment-image="neutral" exposure="1.05" shadow-intensity="0.9" shadow-softness="0.9"
          disable-pan="" loading="eager"
          style={{ width: "100%", height: "100%", background: "transparent", opacity: loaded ? 1 : 0, transition: "opacity .4s ease" }} />
      )}
      {!loaded && (
        <span className="glass absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full px-3 py-1.5 text-xs font-semibold text-ink-2">Cargando 3D…</span>
      )}
      {loaded && (
        <div className="absolute right-3 bottom-3 flex gap-2">
          <button type="button" onClick={() => setSpin((v) => !v)} aria-label={spin ? "Parar giro" : "Girar"}
            className="glass press flex h-10 w-10 items-center justify-center rounded-full text-ink">{spin ? <Pause size={16} /> : <Play size={16} />}</button>
          <button type="button" onClick={reset} aria-label="Volver a la vista inicial"
            className="glass press flex h-10 w-10 items-center justify-center rounded-full text-ink"><RotateCcw size={16} /></button>
        </div>
      )}
      {loaded && <span className="absolute top-3 left-3 rounded-full bg-black/5 px-2.5 py-1 text-[11px] font-semibold text-ink-2">Desliza para girar</span>}
    </div>
  );
}
