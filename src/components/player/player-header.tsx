import Link from "next/link";
import type { ReactNode } from "react";
import { Avatar, Crest } from "@/components/ui";
import type { Team } from "@/lib/types";

/** Cabecera de jugador (estilo ficha deportiva): foto, nombre, equipo y nota media */
export function PlayerHeader({ name, nickname, team, photo, cardPhoto, color, rating, ratingNote, badge }: {
  name: string; nickname?: string | null; team?: Team | null; photo?: string | null; cardPhoto?: string | null;
  color: string; rating?: string | null; ratingNote?: string | null; badge?: ReactNode;
}) {
  return (
    <header className="-mx-4 -mt-5 px-4 pt-6 pb-6 text-white lg:mx-0 lg:mt-0 lg:rounded-3xl"
      style={{ background: `linear-gradient(160deg, color-mix(in srgb, ${color} 28%, #2b2a28) 0%, #1c1d20 100%)` }}>
      <div className="flex items-center gap-4">
        <span className="relative h-[4.5rem] w-[4.5rem] shrink-0 overflow-hidden rounded-full bg-white ring-[3px] ring-white">
          {photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photo} alt="" className="h-full w-full object-cover" />
          ) : cardPhoto ? (
            // la foto de ficha es de cuerpo entero: se encuadra la cara
            // eslint-disable-next-line @next/next/no-img-element
            <img src={cardPhoto} alt="" className="h-full w-full origin-[50%_9%] scale-[3.1] object-cover object-top" />
          ) : (
            <Avatar name={name} size={72} color={color} />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="text-[1.6rem] font-semibold leading-tight tracking-tight">{name}</h1>
          {nickname && <p className="truncate text-sm text-white/65">«{nickname}»</p>}
          {team && (
            <Link href={`/equipos/${team.slug}`} className="mt-1 inline-flex items-center gap-1.5 text-[17px] text-white/90">
              <Crest src={team.crest_url} name={team.name} size={20} />{team.name}
            </Link>
          )}
          {badge}
        </div>
        {rating && (
          <div className="shrink-0 rounded-2xl bg-white/12 px-3.5 py-2.5 text-center backdrop-blur">
            <div className="tabular text-2xl font-semibold leading-none">{rating}</div>
            <div className="mt-1 text-[12px] text-white/70">Nota media</div>
            {ratingNote && <div className="text-[11px] text-white/55">{ratingNote}</div>}
          </div>
        )}
      </div>
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
