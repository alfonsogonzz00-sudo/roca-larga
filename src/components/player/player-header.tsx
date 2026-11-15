import Link from "next/link";
import type { ReactNode } from "react";
import { Avatar, Crest } from "@/components/ui";
import type { Team } from "@/lib/types";
import { ZoomablePhoto } from "./zoomable-photo";

/** Cabecera de jugador: foto (ampliable), nombre en una línea, equipo, nota media y totales, sobre el fondo */
export function PlayerHeader({ name, nickname, team, photo, cardPhoto, color, rating, ratingNote, badge, totals }: {
  name: string; nickname?: string | null; team?: Team | null; photo?: string | null; cardPhoto?: string | null;
  color: string; rating?: string | null; ratingNote?: string | null; badge?: ReactNode;
  /** Totales de toda la trayectoria */
  totals?: { matches: number; goals: number; assists: number; mvps: number } | null;
}) {
  return (
    <header className="pt-1">
      <div className="flex items-center gap-4">
        <ZoomablePhoto src={photo ?? cardPhoto ?? null} alt={name}
          style={{ boxShadow: `0 0 0 2px var(--bg), 0 0 0 4px ${color}` }}
          className="relative h-24 w-24 shrink-0 overflow-hidden rounded-full bg-surface-2">
          {photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photo} alt="" className="h-full w-full object-cover" />
          ) : cardPhoto ? (
            // la foto de ficha es de cuerpo entero: se encuadra la cara
            // eslint-disable-next-line @next/next/no-img-element
            <img src={cardPhoto} alt="" className="h-full w-full origin-[50%_9%] scale-[3.1] object-cover object-top" />
          ) : (
            <Avatar name={name} size={96} color={color} />
          )}
        </ZoomablePhoto>
        <div className="min-w-0 flex-1">
          <h1 className="truncate whitespace-nowrap text-[clamp(1.25rem,5.6vw,1.75rem)] font-semibold leading-tight tracking-tight">{name}</h1>
          {nickname && <p className="truncate text-[15px] text-ink-3">«{nickname}»</p>}
          {team && (
            <Link href={`/equipos/${team.slug}`} className="mt-1.5 inline-flex items-center gap-1.5 text-[15px] text-ink-2">
              <Crest src={team.crest_url} name={team.name} size={20} />{team.name}
            </Link>
          )}
          {badge && <div>{badge}</div>}
        </div>
      </div>
      {(rating || (totals && totals.matches > 0)) && (
        <div className="mt-5 flex items-end gap-4 border-t border-line pt-4">
          {rating && (
            <div className="shrink-0">
              <div className="font-display tabular text-[3.25rem] font-bold leading-[0.9]">{rating}</div>
              <div className="mt-1 text-xs text-ink-3">Nota media{ratingNote ? ` · ${ratingNote}` : ""}</div>
            </div>
          )}
          {totals && totals.matches > 0 && (
            <dl className="grid flex-1 grid-cols-4 text-center">
              {([["Partidos", totals.matches], ["Goles", totals.goals], ["Asist.", totals.assists], ["MVP", totals.mvps]] as const).map(([l, v]) => (
                <div key={l}><dd className="tabular text-xl font-semibold leading-none">{v}</dd><dt className="mt-1 text-[11px] text-ink-3">{l}</dt></div>
              ))}
            </dl>
          )}
        </div>
      )}
    </header>
  );
}

/** Tarjeta del equipo (escudo + nombre + subtítulo) */
export function TeamCard({ team, subtitle }: { team: Team; subtitle?: string | null }) {
  return (
    <Link href={`/equipos/${team.slug}`} className="press flex items-center gap-5 rounded-3xl bg-surface px-5 py-4 shadow-card">
      <Crest src={team.crest_url} name={team.name} size={52} />
      <div className="min-w-0">
        <p className="truncate text-lg font-semibold">{team.name}</p>
        {subtitle && <p className="truncate text-[15px] text-ink-3">{subtitle}</p>}
      </div>
    </Link>
  );
}

/** Detalles en rejilla de 3 columnas (etiqueta pequeña arriba, dato grande abajo) */
export function DetailsGrid({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-3 gap-y-3 rounded-2xl bg-surface px-2 py-3 text-center shadow-card">
      {items.map(([label, value]) => (
        <div key={label} className="flex min-w-0 flex-col-reverse items-center gap-0.5 px-1">
          <dd className="max-w-full truncate text-[15px] font-bold tabular">{value}</dd>
          <dt className="text-[10px] font-semibold uppercase tracking-wide text-ink-3">{label}</dt>
        </div>
      ))}
    </dl>
  );
}
