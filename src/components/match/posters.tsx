"use client";

import { useState } from "react";
import { Download, Share2 } from "lucide-react";

export interface PosterItem { slug: string; label: string; team: string }

/** Carteles prepartido del partido: galería deslizable con compartir y descargar */
export function PosterGallery({ matchId, version, items, title }: { matchId: string; version: string; items: PosterItem[]; title: string }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const src = (slug: string) => `/partidos/${matchId}/cartel/${slug}?v=${version}`;
  const fileName = (it: PosterItem) => `cartel-${it.team}-${it.label}`.toLowerCase().replace(/[^a-z0-9]+/g, "-") + ".png";

  async function act(it: PosterItem, mode: "share" | "download") {
    setBusy(it.slug + mode);
    setError(null);
    try {
      const res = await fetch(src(it.slug));
      if (!res.ok) throw new Error(String(res.status));
      const file = new File([await res.blob()], fileName(it), { type: "image/png" });
      if (mode === "share" && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title });
      } else {
        const url = URL.createObjectURL(file);
        const a = document.createElement("a");
        a.href = url;
        a.download = file.name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
    } catch (e) {
      // Cancelar el menú de compartir no es un error
      if (!(e instanceof DOMException && e.name === "AbortError")) setError("No se ha podido preparar el cartel. Inténtalo de nuevo.");
    } finally {
      setBusy(null);
    }
  }

  const teams = [...new Set(items.map((i) => i.team))];
  return (
    <div className="space-y-5">
      {teams.map((team) => (
        <section key={team} aria-label={`Carteles de ${team}`}>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-3">{team}</h3>
          <ul className="no-scrollbar -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1">
            {items.filter((i) => i.team === team).map((it) => (
              <li key={it.slug} className="w-[72vw] max-w-[300px] shrink-0 snap-center">
                {/* eslint-disable-next-line @next/next/no-img-element -- imagen generada al vuelo por la propia app */}
                <img src={src(it.slug)} alt={`Cartel «${it.label}» de ${team}`} width={1080} height={1350} loading="lazy" decoding="async" className="aspect-[4/5] w-full rounded-xl bg-surface-3 object-cover" />
                <div className="mt-2 flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold">{it.label}</span>
                  <button type="button" onClick={() => act(it, "share")} disabled={busy !== null} aria-label={`Compartir el cartel «${it.label}» de ${team}`} className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-ink px-3 text-sm font-semibold text-surface disabled:opacity-60">
                    <Share2 size={16} aria-hidden /> {busy === it.slug + "share" ? "Preparando…" : "Compartir"}
                  </button>
                  <button type="button" onClick={() => act(it, "download")} disabled={busy !== null} aria-label={`Descargar el cartel «${it.label}» de ${team}`} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl bg-surface-3 text-ink disabled:opacity-60">
                    <Download size={18} aria-hidden />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    </div>
  );
}
