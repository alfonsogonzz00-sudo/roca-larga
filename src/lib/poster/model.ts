/**
 * Carteles prepartido: datos y reglas (sin dibujo).
 *
 * Un cartel = plantilla × equipo. Todo sale de datos reales del partido (convocados, estadio, hora);
 * las imágenes de jugadores se declaran en assets.json (lo genera scripts/build-poster-assets.mjs).
 * Aquí no se inventa nada: sin dorsal completo se muestra la posición; sin imagen, el jugador sólo
 * aparece en la lista.
 */
import type { Match, MatchPlayer, Player, Position, Team, Venue } from "@/lib/types";
import { APP_TZ } from "@/lib/format";

export const POSTER_W = 1080;
export const POSTER_H = 1350;

export const POSTER_VARIANTS = [
  { key: "titular", label: "Siete inicial" },
  { key: "gala", label: "Gala" },
  { key: "trio", label: "Trío" },
  { key: "plantel", label: "Plantel" },
] as const;
export type PosterVariant = (typeof POSTER_VARIANTS)[number]["key"];
export type PosterSide = "local" | "visitante";

/** Cuántos jugadores con imagen admite cada plantilla */
const HEROES: Record<PosterVariant, number> = { titular: 1, gala: 1, trio: 3, plantel: 5 };

export interface PosterImage { kind: "pose" | "fig"; w: number; h: number }
export type PosterAssets = Record<string, { pose?: { w: number; h: number }; fig?: { w: number; h: number } }>;

export interface PosterPlayer {
  id: string;
  /** Apellido en mayúsculas, con inicial si se repite en el equipo */
  label: string;
  /** Dorsal (si todo el equipo lo tiene) o posición */
  tag: string;
  img: PosterImage | null;
}

export interface PosterTeam { slug: string; name: string; short: string; crest: string | null; color: string }

export interface PosterData {
  matchId: string;
  variant: PosterVariant;
  day: string;
  time: string;
  venue: string | null;
  city: string | null;
  team: PosterTeam;
  rival: PosterTeam;
  players: PosterPlayer[];
  /** Jugadores que salen en imagen, protagonista primero */
  heroes: PosterPlayer[];
}

export function parsePosterSlug(slug: string): { variant: PosterVariant; side: PosterSide } | null {
  const m = /^([a-z]+)-(local|visitante)$/.exec(slug);
  if (!m) return null;
  const variant = POSTER_VARIANTS.find((v) => v.key === m[1])?.key;
  return variant ? { variant, side: m[2] as PosterSide } : null;
}

const PARTICLES = new Set(["de", "del", "la", "las", "los", "y", "da", "do", "dos", "van", "von"]);

/** «Raúl de la Fuente» → «DE LA FUENTE» · «José Manuel Maqueda» → «MAQUEDA» */
export function surname(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length < 2) return fullName.trim().toUpperCase();
  let i = parts.length - 1;
  while (i > 1 && PARTICLES.has(parts[i - 1].toLowerCase())) i--;
  return parts.slice(i).join(" ").toUpperCase();
}

/** Apellidos para la lista; si dos coinciden en el equipo, se antepone la inicial del nombre */
export function posterLabels(players: Pick<Player, "id" | "full_name">[]): Map<string, string> {
  const base = players.map((p) => ({ id: p.id, s: surname(p.full_name), initial: p.full_name.trim().charAt(0).toUpperCase() }));
  const count = new Map<string, number>();
  for (const b of base) count.set(b.s, (count.get(b.s) ?? 0) + 1);
  return new Map(base.map((b) => [b.id, (count.get(b.s) ?? 0) > 1 ? `${b.initial}. ${b.s}` : b.s]));
}

/** «MARTES 17 NOV» en la zona horaria de la app */
export function posterDay(iso: string): string {
  const parts = new Intl.DateTimeFormat("es-ES", { timeZone: APP_TZ, weekday: "long", day: "numeric", month: "short" }).formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("weekday")} ${get("day")} ${get("month").replace(".", "")}`.toUpperCase();
}
export function posterTime(iso: string): string {
  return new Intl.DateTimeFormat("es-ES", { timeZone: APP_TZ, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

const POS_ORDER: Record<Position, number> = { POR: 0, DEF: 1, MED: 2, DEL: 3 };

interface Source {
  match: Match;
  teams: Team[];
  venue?: Venue;
  matchPlayers: MatchPlayer[];
  playerById: Map<string, Player>;
}

/** Los jugadores de un equipo que salen en el cartel: participantes si ya se jugó, convocados si no */
export function posterRoster(src: Source, teamId: string): MatchPlayer[] {
  const played = src.match.status === "played";
  return src.matchPlayers.filter((x) => x.match_id === src.match.id && x.team_id === teamId && (played ? x.participated : x.called && x.attendance !== "no"));
}

export function buildPoster(src: Source, variant: PosterVariant, side: PosterSide, assets: PosterAssets): PosterData | null {
  const { match: m } = src;
  const teamOf = (id: string) => src.teams.find((t) => t.id === id);
  const team = teamOf(side === "local" ? m.home_team_id : m.away_team_id);
  const rival = teamOf(side === "local" ? m.away_team_id : m.home_team_id);
  if (!team || !rival) return null;
  const roster = posterRoster(src, team.id)
    .map((mp) => ({ mp, p: src.playerById.get(mp.player_id) }))
    .filter((x): x is { mp: MatchPlayer; p: Player } => Boolean(x.p));
  if (roster.length === 0) return null;

  const labels = posterLabels(roster.map((x) => x.p));
  const allNumbered = roster.every((x) => x.p.shirt_number != null);
  const players: PosterPlayer[] = roster
    .map(({ mp, p }) => {
      const pos = mp.lineup_position ?? p.usual_position;
      const a = assets[p.id];
      const img: PosterImage | null = a?.pose ? { kind: "pose", ...a.pose } : a?.fig ? { kind: "fig", ...a.fig } : null;
      return { id: p.id, label: labels.get(p.id)!, tag: allNumbered ? String(p.shirt_number) : pos ?? "", img, order: pos ? POS_ORDER[pos] : 9, num: p.shirt_number ?? 999 };
    })
    .sort((a, b) => (allNumbered ? a.num - b.num : a.order - b.order) || a.label.localeCompare(b.label, "es"))
    .map(({ id, label, tag, img }) => ({ id, label, tag, img }));

  // Protagonistas: primero quien tiene postura propia; el orden rota con el partido y la plantilla
  const withImg = players.filter((p) => p.img);
  const poses = withImg.filter((p) => p.img!.kind === "pose");
  const figs = withImg.filter((p) => p.img!.kind === "fig");
  const rot = <T,>(xs: T[], n: number) => (xs.length ? [...xs.slice(n % xs.length), ...xs.slice(0, n % xs.length)] : xs);
  const seed = hash(`${m.id}:${variant}:${side}`);
  const heroes = [...rot(poses, seed), ...rot(figs, seed >>> 8)].slice(0, HEROES[variant]);

  const pt = (t: Team): PosterTeam => ({ slug: t.slug, name: t.name, short: t.short_name, crest: t.crest_url, color: t.primary_color });
  return {
    matchId: m.id, variant,
    day: posterDay(m.kickoff_at), time: posterTime(m.kickoff_at),
    venue: src.venue?.name ?? null, city: src.venue?.city ?? null,
    team: pt(team), rival: pt(rival), players, heroes,
  };
}

/** Carteles disponibles para un partido (uno por plantilla y equipo con convocados) */
export function posterList(src: Source): { slug: string; label: string; team: string }[] {
  const out: { slug: string; label: string; team: string }[] = [];
  for (const side of ["local", "visitante"] as const) {
    const teamId = side === "local" ? src.match.home_team_id : src.match.away_team_id;
    const team = src.teams.find((t) => t.id === teamId);
    if (!team || posterRoster(src, teamId).length === 0) continue;
    for (const v of POSTER_VARIANTS) out.push({ slug: `${v.key}-${side}`, label: v.label, team: team.short_name });
  }
  return out;
}

/** Cambia cuando cambia lo que se dibuja: sirve para invalidar la caché de la imagen */
export function posterVersion(src: Source): string {
  const ids = [src.match.home_team_id, src.match.away_team_id].flatMap((t) => posterRoster(src, t).map((x) => x.player_id)).sort().join(",");
  return hash(`${src.match.kickoff_at}|${src.match.venue_id}|${src.match.status}|${ids}`).toString(36);
}
