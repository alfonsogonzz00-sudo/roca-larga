/**
 * Motor estadístico: todo se deriva de los datos brutos del partido.
 * Regla clave: los goles encajados como portero NUNCA restan en la
 * valoración de campo; se muestran aparte como estadística de portería.
 */
import { localHour, seasonOf } from "@/lib/format";
import type { Goal, GkSpell, Match, MatchMvp, MatchPlayer, PerformanceWeights, Player, Team, Weather } from "@/lib/types";

export interface StatsInput {
  teams: Team[];
  players: Player[];
  matches: Match[];
  matchPlayers: MatchPlayer[];
  goals: Goal[];
  spells: GkSpell[];
  mvps: MatchMvp[];
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
  guestsBrought: number;
  isGuest: boolean;
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

export function rate(p: Pick<Participation, "goals" | "assists" | "isMvp" | "result" | "guestsBrought">, w: PerformanceWeights): number {
  return (
    p.goals * w.goal +
    p.assists * w.assist +
    (p.isMvp ? w.mvp : 0) +
    (p.result === "W" ? w.win : p.result === "D" ? w.draw : 0) +
    p.guestsBrought * w.guest_bonus
  );
}

export function buildParticipations(input: StatsInput, w: PerformanceWeights): Participation[] {
  const played = playedMatches(input.matches);
  const playerById = new Map(input.players.map((p) => [p.id, p]));
  const goalsByMatch = groupBy(input.goals, (g) => g.match_id);
  const spellsByMatch = groupBy(input.spells, (s) => s.match_id);
  const mvpSet = new Set(input.mvps.map((m) => `${m.match_id}:${m.player_id}`));
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
        guestsBrought: mps.filter((o) => o.brought_by_id === mp.player_id).length,
        isGuest: playerById.get(mp.player_id)?.kind === "guest",
        rating: 0,
      };
      p.rating = rate(p, w);
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
    playerId, matches: ps.length, wins: 0, draws: 0, losses: 0, goals: 0, assists: 0, mvps: 0,
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

/** Mejor estadio: mayor valoración media con al menos minMatches partidos; si ninguno llega, se marca muestra pequeña. */
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
  if (star && star.ratingAvg > 0) badges.push({ key: "star", playerId: star.playerId, value: star.ratingAvg, detail: `${star.ratingAvg.toFixed(2).replace(".", ",")} pts/partido` });
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

export type RankingStat = "goals" | "assists" | "mvps" | "matches" | "ratingAvg" | "goalsPerMatch" | "assistsPerMatch" | "concededPerSpell" | "wins" | "ratingTotal";

export const RANKING_LABELS: Record<RankingStat, string> = {
  goals: "Goles",
  assists: "Asistencias",
  mvps: "MVP",
  matches: "Partidos",
  ratingAvg: "Valoración media",
  ratingTotal: "Valoración total",
  goalsPerMatch: "Goles por partido",
  assistsPerMatch: "Asistencias por partido",
  concededPerSpell: "Encajados por turno de portería",
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
  const asc = stat === "concededPerSpell";
  return rows
    .filter((t) => (stat === "concededPerSpell" ? t.gkSpells > 0 : true))
    .sort((a, b) => {
      const va = (a[stat] ?? 0) as number;
      const vb = (b[stat] ?? 0) as number;
      return (asc ? va - vb : vb - va) || b.matches - a.matches;
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
