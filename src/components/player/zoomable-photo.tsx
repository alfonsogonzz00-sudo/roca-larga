"use client";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { X } from "lucide-react";

/** Foto de perfil que se amplía a pantalla completa al tocarla */
export function ZoomablePhoto({ src, alt, children, className, style }: { src: string | null; alt: string; children: ReactNode; className?: string; style?: CSSProperties }) {
  const [open, setOpen] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    const trigger = triggerRef.current;
    return () => { document.body.style.overflow = prev; window.removeEventListener("keydown", onKey); trigger?.focus(); };
  }, [open]);

  if (!src) return <span className={className} style={style}>{children}</span>;
  return (
    <>
      <button ref={triggerRef} type="button" onClick={() => setOpen(true)} aria-label={`Ampliar la foto de ${alt}`} className={className} style={style}>
        {children}
      </button>
      {open && (
        <div role="dialog" aria-modal="true" aria-label={`Foto de ${alt}`} onClick={() => setOpen(false)}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={alt} className="max-h-[85dvh] w-auto max-w-full rounded-3xl object-contain shadow-2xl" />
          <button ref={closeRef} type="button" onClick={() => setOpen(false)} aria-label="Cerrar"
            className="absolute top-[max(1rem,env(safe-area-inset-top))] right-4 flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-white">
            <X size={22} aria-hidden />
          </button>
        </div>
      )}
    </>
  );
}
