/**
 * Motor estadístico: todo se deriva de los datos brutos del partido.
 * La portería no se registra ni se tiene en cuenta.
 */
import { localHour, seasonOf } from "@/lib/format";
import type { Goal, GkSpell, Match, MatchMvp, MatchPlayer, PeerRatingAvg, PerformanceWeights, Player, Team, TeamBest, Weather } from "@/lib/types";

export interface StatsInput {
  teams: Team[];
  players: Player[];
  matches: Match[];
  matchPlayers: MatchPlayer[];
  goals: Goal[];
  spells: GkSpell[];
  mvps: MatchMvp[];
  /** Mejor jugador de cada equipo (votación). Opcional para datos antiguos. */
  teamBests?: TeamBest[];
  /** Media de valoraciones de los demás (0-3), publicada al cerrar la votación */
  peerRatings?: PeerRatingAvg[];
}

export type Result = "W" | "D" | "L";

/** Una actuación: un jugador en un partido disputado */
export interface Participation {
  matchId: string;
  playerId: string;
  teamId: string;
  opponentId: string;
  kickoff: string;
  season: string;
  hour: number;
  venueId: string | null;
  weather: Weather | null;
  temp: number | null;
  origin: Match["origin"];
  goalsFor: number;
  goalsAgainst: number;
  result: Result;
  goals: number;
  assists: number;
  ownGoals: number;
  concededAsGk: number;
  gkSpells: number;
  isMvp: boolean;
  /** Elegido mejor de su equipo en la votación */
  isTeamBest: boolean;
  guestsBrought: number;
  isGuest: boolean;
  /** Pagó el campo / reservó la pista */
  paidField: boolean;
  bookedField: boolean;
  /** Parte estadística sin bonus (0-10) */
  statCore: number;
  /** Bonus fuera del tope: invitados, pagar el campo, reservar la pista */
  bonus: number;
  /** Nota estadística mostrada (statCore + bonus) */
  statRating: number;
  /** Media de valoraciones de los demás (0-3) o null si no hay */
  peerScore: number | null;
  peerRaters: number;
  /** Nota final del partido */
  rating: number;
}

export interface FilterOptions {
  teamId?: string;
  season?: string;
  venueId?: string;
  from?: string;
  to?: string;
}

export const playedMatches = (matches: Match[]) =>
  matches.filter((m) => m.status === "played" && m.home_score != null && m.away_score != null);

export function matchWeather(m: Match): { weather: Weather | null; temp: number | null } {
  return { weather: m.actual_weather ?? m.forecast_weather, temp: m.actual_temp_c ?? m.forecast_temp_c };
}

export function resultFor(gf: number, ga: number): Result {
  return gf > ga ? "W" : gf < ga ? "L" : "D";
}

const r2 = (x: number) => Math.round(x * 100) / 100;

/**
 * Parte estadística de la nota (sobre 10). Parte de 6,0 y suma +0,5 por jugar, +2,5 por gol propio,
 * +1,2 por asistencia, +0,8 por cada gol del equipo que no marca él (el asistente sí lo cobra)
 * y −1,0 por cada gol encajado por el equipo. Tope 10. Se ignora la portería y las votaciones.
 */
export function statCore(p: Pick<Participation, "goals" | "assists" | "goalsFor" | "goalsAgainst">, w: PerformanceWeights): number {
  const raw = w.base + w.played
    + p.goals * w.goal
    + p.assists * w.assist
    + Math.max(0, p.goalsFor - p.goals) * w.team_goal
    + p.goalsAgainst * w.team_conceded;
  return r2(Math.min(w.max, Math.max(w.min, raw)));
}

/** Bonus que se suman por encima del tope: +0,2 por invitado, por pagar el campo y por reservar la pista */
export function bonusOf(p: Pick<Participation, "guestsBrought" | "paidField" | "bookedField">, w: PerformanceWeights): number {
  return r2(p.guestsBrought * w.guest_bonus + (p.paidField ? w.paid_bonus ?? 0.2 : 0) + (p.bookedField ? w.booked_bonus ?? 0.2 : 0));
}

/**
 * Nota final del partido. Con valoraciones de los demás:
 *   stat_share (70 %) × parte estadística + media de valoraciones (0-3) + bonus.
 * Sin valoraciones (partidos antiguos o nadie votó): parte estadística + bonus.
 */
export function finalRating(core: number, bonus: number, peer: number | null, w: PerformanceWeights): number {
  if (peer == null) return r2(core + bonus);
  const share = w.stat_share ?? 0.7;
  const peerMax = w.peer_max ?? 3;
  return r2(share * core + Math.min(peerMax, Math.max(0, peer)) + bonus);
}

/** Compatibilidad: nota sin valoraciones (parte estadística + bonus) */
export function rate(p: Pick<Participation, "goals" | "assists" | "goalsFor" | "goalsAgainst" | "guestsBrought"> & Partial<Pick<Participation, "paidField" | "bookedField">>, w: PerformanceWeights): number {
  return finalRating(statCore(p, w), bonusOf({ guestsBrought: p.guestsBrought, paidField: Boolean(p.paidField), bookedField: Boolean(p.bookedField) }, w), null, w);
}

export function buildParticipations(input: StatsInput, w: PerformanceWeights): Participation[] {
  const played = playedMatches(input.matches);
  const playerById = new Map(input.players.map((p) => [p.id, p]));
  const goalsByMatch = groupBy(input.goals, (g) => g.match_id);
  const spellsByMatch = groupBy(input.spells, (s) => s.match_id);
  const mvpSet = new Set(input.mvps.map((m) => `${m.match_id}:${m.player_id}`));
  const bestSet = new Set((input.teamBests ?? []).map((b) => `${b.match_id}:${b.player_id}`));
  const peerMap = new Map((input.peerRatings ?? []).map((r) => [`${r.match_id}:${r.player_id}`, r]));
  const mpByMatch = groupBy(input.matchPlayers.filter((mp) => mp.participated), (mp) => mp.match_id);
  const out: Participation[] = [];

  for (const m of played) {
    const goals = goalsByMatch.get(m.id) ?? [];
    const spells = spellsByMatch.get(m.id) ?? [];
    const mps = mpByMatch.get(m.id) ?? [];
    const { weather, temp } = matchWeather(m);
    for (const mp of mps) {
      const home = mp.team_id === m.home_team_id;
      const gf = (home ? m.home_score : m.away_score)!;
      const ga = (home ? m.away_score : m.home_score)!;
      const p: Participation = {
        matchId: m.id,
        playerId: mp.player_id,
        teamId: mp.team_id,
        opponentId: home ? m.away_team_id : m.home_team_id,
        kickoff: m.kickoff_at,
        season: seasonOf(m.kickoff_at),
        hour: localHour(m.kickoff_at),
        venueId: m.venue_id,
        weather,
        temp,
        origin: m.origin,
        goalsFor: gf,
        goalsAgainst: ga,
        result: resultFor(gf, ga),
        goals: goals.filter((g) => g.scorer_id === mp.player_id && !g.is_own_goal).length,
        assists: goals.filter((g) => g.assist_id === mp.player_id).length,
        ownGoals: goals.filter((g) => g.scorer_id === mp.player_id && g.is_own_goal).length,
        concededAsGk: goals.filter((g) => g.conceded_gk_id === mp.player_id).length,
        gkSpells: spells.filter((s) => s.player_id === mp.player_id).length,
        isMvp: mvpSet.has(`${m.id}:${mp.player_id}`),
        isTeamBest: bestSet.has(`${m.id}:${mp.player_id}`),
        guestsBrought: mps.filter((o) => o.brought_by_id === mp.player_id).length,
        isGuest: playerById.get(mp.player_id)?.kind === "guest",
        paidField: m.paid_by_id === mp.player_id,
        bookedField: m.booked_by_id === mp.player_id,
        statCore: 0, bonus: 0, statRating: 0, peerScore: null, peerRaters: 0,
        rating: 0,
      };
      const peer = peerMap.get(`${m.id}:${mp.player_id}`);
      p.statCore = statCore(p, w);
      p.bonus = bonusOf(p, w);
      p.statRating = r2(p.statCore + p.bonus);
      p.peerScore = peer ? Number(peer.avg) : null;
      p.peerRaters = peer?.raters ?? 0;
      p.rating = finalRating(p.statCore, p.bonus, p.peerScore, w);
      out.push(p);
    }
  }
  return out;
}

// ---------------------------------------------------------------------
// Equipos
// ---------------------------------------------------------------------
export interface TeamRecord {
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDiff: number;
  winPct: number;
  pointsPerMatch: number;
}

export function emptyRecord(): TeamRecord {
  return { played: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, goalDiff: 0, winPct: 0, pointsPerMatch: 0 };
}

function addToRecord(r: TeamRecord, gf: number, ga: number) {
  r.played++;
  r.goalsFor += gf;
  r.goalsAgainst += ga;
  if (gf > ga) r.wins++;
  else if (gf === ga) r.draws++;
  else r.losses++;
  r.goalDiff = r.goalsFor - r.goalsAgainst;
  r.winPct = r.wins / r.played;
  r.pointsPerMatch = (r.wins * 3 + r.draws) / r.played;
}

export interface TeamStats {
  teamId: string;
  record: TeamRecord;
  byVenue: Map<string | "none", TeamRecord>;
  bySeason: Map<string, TeamRecord>;
  form: { matchId: string; result: Result; gf: number; ga: number; kickoff: string }[]; // cronológico
  biggestWin: { matchId: string; gf: number; ga: number } | null;
}

export function teamStats(teamId: string, matches: Match[], filter: FilterOptions = {}): TeamStats {
  const record = emptyRecord();
  const byVenue = new Map<string, TeamRecord>();
  const bySeason = new Map<string, TeamRecord>();
  const form: TeamStats["form"] = [];
  let biggestWin: TeamStats["biggestWin"] = null;
  const ms = applyMatchFilter(playedMatches(matches), filter)
    .filter((m) => m.home_team_id === teamId || m.away_team_id === teamId)
    .sort((a, b) => a.kickoff_at.localeCompare(b.kickoff_at));
  for (const m of ms) {
    const home = m.home_team_id === teamId;
    const gf = (home ? m.home_score : m.away_score)!;
    const ga = (home ? m.away_score : m.home_score)!;
    addToRecord(record, gf, ga);
    const vk = m.venue_id ?? "none";
    if (!byVenue.has(vk)) byVenue.set(vk, emptyRecord());
    addToRecord(byVenue.get(vk)!, gf, ga);
    const sk = seasonOf(m.kickoff_at);
    if (!bySeason.has(sk)) bySeason.set(sk, emptyRecord());
    addToRecord(bySeason.get(sk)!, gf, ga);
    form.push({ matchId: m.id, result: resultFor(gf, ga), gf, ga, kickoff: m.kickoff_at });
    if (gf > ga && (!biggestWin || gf - ga > biggestWin.gf - biggestWin.ga)) biggestWin = { matchId: m.id, gf, ga };
  }
  return { teamId, record, byVenue, bySeason, form, biggestWin };
}

export function applyMatchFilter(ms: Match[], f: FilterOptions): Match[] {
  return ms.filter((m) =>
    (!f.season || seasonOf(m.kickoff_at) === f.season) &&
    (!f.venueId || m.venue_id === f.venueId) &&
    (!f.from || m.kickoff_at >= f.from) &&
    (!f.to || m.kickoff_at <= f.to),
  );
}

// ---------------------------------------------------------------------
// Jugadores
// ---------------------------------------------------------------------
export interface PlayerTotals {
  playerId: string;
  matches: number;
  wins: number;
  draws: number;
  losses: number;
  goals: number;
  assists: number;
  mvps: number;
  teamBests: number;
  concededAsGk: number;
  gkSpells: number;
  gkMatches: number;
  guestsBrought: number;
  ratingTotal: number;
  ratingAvg: number;
  goalsPerMatch: number;
  assistsPerMatch: number;
  concededPerSpell: number | null;
}

export function playerTotals(playerId: string, parts: Participation[]): PlayerTotals {
  const ps = parts.filter((p) => p.playerId === playerId);
  const t: PlayerTotals = {
    playerId, matches: ps.length, wins: 0, draws: 0, losses: 0, goals: 0, assists: 0, mvps: 0, teamBests: 0,
    concededAsGk: 0, gkSpells: 0, gkMatches: 0, guestsBrought: 0, ratingTotal: 0, ratingAvg: 0,
    goalsPerMatch: 0, assistsPerMatch: 0, concededPerSpell: null,
  };
  for (const p of ps) {
    if (p.result === "W") t.wins++;
    else if (p.result === "D") t.draws++;
    else t.losses++;
    t.goals += p.goals;
    t.assists += p.assists;
    t.mvps += p.isMvp ? 1 : 0;
    t.teamBests += p.isTeamBest ? 1 : 0;
    t.concededAsGk += p.concededAsGk;
    t.gkSpells += p.gkSpells;
    t.gkMatches += p.gkSpells > 0 ? 1 : 0;
    t.guestsBrought += p.guestsBrought;
    t.ratingTotal += p.rating;
  }
  if (t.matches) {
    t.ratingAvg = t.ratingTotal / t.matches;
    t.goalsPerMatch = t.goals / t.matches;
    t.assistsPerMatch = t.assists / t.matches;
  }
  t.concededPerSpell = t.gkSpells ? t.concededAsGk / t.gkSpells : null;
  return t;
}

export function allPlayerTotals(parts: Participation[]): Map<string, PlayerTotals> {
  const ids = [...new Set(parts.map((p) => p.playerId))];
  return new Map(ids.map((id) => [id, playerTotals(id, parts)]));
}

/** Top N actuaciones (MVP + estadística). Desempate: goles+asistencias, luego más reciente. */
export function topPerformances(playerId: string, parts: Participation[], n = 3) {
  return parts
    .filter((p) => p.playerId === playerId)
    .sort((a, b) => b.rating - a.rating || b.goals + b.assists - (a.goals + a.assists) || b.kickoff.localeCompare(a.kickoff))
    .slice(0, n);
}

/** Mejor estadio: mayor nota media con al menos minMatches partidos; si ninguno llega, se marca muestra pequeña. */
export function bestVenue(playerId: string, parts: Participation[], minMatches = 2) {
  const byVenue = groupBy(parts.filter((p) => p.playerId === playerId && p.venueId), (p) => p.venueId!);
  const rows = [...byVenue.entries()].map(([venueId, ps]) => ({
    venueId,
    matches: ps.length,
    ratingAvg: ps.reduce((s, p) => s + p.rating, 0) / ps.length,
    goals: ps.reduce((s, p) => s + p.goals, 0),
    wins: ps.filter((p) => p.result === "W").length,
  }));
  const eligible = rows.filter((r) => r.matches >= minMatches);
  const pick = (eligible.length ? eligible : rows).sort((a, b) => b.ratingAvg - a.ratingAvg)[0];
  return pick ? { ...pick, smallSample: pick.matches < minMatches } : null;
}

/** Evolución acumulada partido a partido */
export function evolution(playerId: string, parts: Participation[]) {
  let g = 0, a = 0, r = 0;
  return parts
    .filter((p) => p.playerId === playerId)
    .sort((x, y) => x.kickoff.localeCompare(y.kickoff))
    .map((p, i) => {
      g += p.goals;
      a += p.assists;
      r += p.rating;
      return { kickoff: p.kickoff, matchId: p.matchId, goals: g, assists: a, ratingAvg: r / (i + 1), rating: p.rating };
    });
}

export interface Badge {
  key: "star" | "top_scorer" | "top_assist" | "top_mvp" | "guest_bringer";
  playerId: string;
  value: number;
  detail: string;
}

/** Indicadores destacados. Sólo se otorgan si hay datos reales (> 0). */
export function teamBadges(teamId: string, parts: Participation[], players: Player[]): Badge[] {
  const members = new Set(players.filter((p) => p.team_id === teamId && p.kind === "member").map((p) => p.id));
  const ps = parts.filter((p) => p.teamId === teamId && members.has(p.playerId));
  if (!ps.length) return [];
  const totals = [...allPlayerTotals(ps).values()];
  const teamMatches = new Set(ps.map((p) => p.matchId)).size;
  const minForStar = Math.max(2, Math.ceil(teamMatches * 0.3));
  const badges: Badge[] = [];
  const best = <K extends keyof PlayerTotals>(k: K, pool = totals) =>
    [...pool].sort((a, b) => (b[k] as number) - (a[k] as number) || b.matches - a.matches)[0];

  const starPool = totals.filter((t) => t.matches >= minForStar);
  const star = best("ratingAvg", starPool.length ? starPool : totals);
  if (star && star.ratingAvg > 0) badges.push({ key: "star", playerId: star.playerId, value: star.ratingAvg, detail: `${star.ratingAvg.toFixed(1).replace(".", ",")} de nota media` });
  const sc = best("goals");
  if (sc && sc.goals > 0) badges.push({ key: "top_scorer", playerId: sc.playerId, value: sc.goals, detail: `${sc.goals} goles` });
  const as = best("assists");
  if (as && as.assists > 0) badges.push({ key: "top_assist", playerId: as.playerId, value: as.assists, detail: `${as.assists} asistencias` });
  const mv = best("mvps");
  if (mv && mv.mvps > 0) badges.push({ key: "top_mvp", playerId: mv.playerId, value: mv.mvps, detail: `${mv.mvps} MVP` });
  const gb = best("guestsBrought");
  if (gb && gb.guestsBrought > 0) badges.push({ key: "guest_bringer", playerId: gb.playerId, value: gb.guestsBrought, detail: `${gb.guestsBrought} invitados` });
  return badges;
}

export type RankingStat = "goals" | "assists" | "mvps" | "teamBests" | "matches" | "ratingAvg" | "goalsPerMatch" | "assistsPerMatch" | "wins" | "ratingTotal";

export const RANKING_LABELS: Record<RankingStat, string> = {
  goals: "Goles",
  assists: "Asistencias",
  mvps: "MVP",
  teamBests: "Mejor de su equipo",
  matches: "Partidos",
  ratingAvg: "Nota media",
  ratingTotal: "Suma de notas",
  goalsPerMatch: "Goles por partido",
  assistsPerMatch: "Asistencias por partido",
  wins: "Victorias",
};

export function ranking(parts: Participation[], stat: RankingStat, opts: FilterOptions & { minMatches?: number; includeGuests?: boolean } = {}) {
  const filtered = parts.filter((p) =>
    (!opts.teamId || p.teamId === opts.teamId) &&
    (!opts.season || p.season === opts.season) &&
    (!opts.venueId || p.venueId === opts.venueId) &&
    (opts.includeGuests || !p.isGuest),
  );
  const rows = [...allPlayerTotals(filtered).values()].filter((t) => t.matches >= (opts.minMatches ?? 1));
  return rows
    .sort((a, b) => {
      const va = (a[stat] ?? 0) as number;
      const vb = (b[stat] ?? 0) as number;
      return vb - va || b.matches - a.matches;
    });
}

// ---------------------------------------------------------------------
export function groupBy<T, K>(arr: T[], key: (t: T) => K): Map<K, T[]> {
  const m = new Map<K, T[]>();
  for (const x of arr) {
    const k = key(x);
    const list = m.get(k);
    if (list) list.push(x);
    else m.set(k, [x]);
  }
  return m;
}
