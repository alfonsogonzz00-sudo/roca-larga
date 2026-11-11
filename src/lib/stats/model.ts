/**
 * MOTOR PREDICTIVO · modelo de Poisson con factores ponderados y contracción
 * ---------------------------------------------------------------------------
 * Para cada equipo se estima su tasa de goles λ como:
 *
 *     log λ_A = log μ + Σ_f  w_f · ½ · (ataque_A,f + defensa_B,f)
 *
 *   μ          media de goles por equipo y partido de todo el histórico
 *   w_f        peso configurado del factor f (normalizado a 1 entre los activos)
 *   ataque_A,f = log( GF̃_A,f / μ )    GF̃ = goles a favor contraídos hacia μ
 *   defensa_B,f= log( GC̃_B,f / μ )    GC̃ = goles en contra contraídos hacia μ
 *
 * Contracción (shrinkage) bayesiana:  x̃ = (Σ w_i·x_i + k·μ) / (Σ w_i + k)
 * Con pocas observaciones el factor vuelve a la media (efecto ≈ 0): así una
 * muestra de 2 partidos pesa mucho menos que una de 20, sin inventar datos.
 * La fiabilidad del factor es  s_f = n_f / (n_f + k).
 *
 * El marcador sigue dos Poisson independientes con medias λ_A y λ_B; de ahí
 * salen probabilidades de victoria/empate/derrota y el marcador más probable.
 * Los goleadores probables reparten λ según la tasa individual contraída.
 * Todo es determinista: mismos datos + misma configuración = mismo resultado.
 */
import { localHour } from "@/lib/format";
import { FACTOR_KEYS, FACTOR_LABELS, type FactorKey, type FactorWeights, type Match, type ModelParams, type PerformanceWeights, type Weather } from "@/lib/types";
import { matchWeather, playedMatches, type Participation, type StatsInput } from "./engine";

export const MODEL_VERSION = "poisson-shrink-1.0";

// ---------------------------------------------------------------------
// Utilidades matemáticas
// ---------------------------------------------------------------------
export function poissonPmf(k: number, lambda: number): number {
  if (lambda <= 0) return k === 0 ? 1 : 0;
  let logP = -lambda + k * Math.log(lambda);
  for (let i = 2; i <= k; i++) logP -= Math.log(i);
  return Math.exp(logP);
}

export interface ScoreMatrix {
  pHome: number;
  pDraw: number;
  pAway: number;
  mostLikely: { home: number; away: number; p: number };
  topScores: { home: number; away: number; p: number }[];
}

export function scoreMatrix(lh: number, la: number, max = 20): ScoreMatrix {
  const ph = Array.from({ length: max + 1 }, (_, i) => poissonPmf(i, lh));
  const pa = Array.from({ length: max + 1 }, (_, i) => poissonPmf(i, la));
  let pHome = 0, pDraw = 0, pAway = 0, total = 0;
  const cells: { home: number; away: number; p: number }[] = [];
  for (let i = 0; i <= max; i++) for (let j = 0; j <= max; j++) {
    const p = ph[i] * pa[j];
    total += p;
    if (i > j) pHome += p; else if (i === j) pDraw += p; else pAway += p;
    cells.push({ home: i, away: j, p });
  }
  cells.sort((a, b) => b.p - a.p);
  return {
    pHome: pHome / total, pDraw: pDraw / total, pAway: pAway / total,
    mostLikely: { ...cells[0], p: cells[0].p / total },
    topScores: cells.slice(0, 5).map((c) => ({ ...c, p: c.p / total })),
  };
}

function shrink(sumWX: number, sumW: number, prior: number, k: number) {
  return (sumWX + k * prior) / (sumW + k);
}

const safeLog = (x: number) => Math.log(Math.max(x, 1e-6));

export function normalizeWeights(weights: FactorWeights, enabled: Record<FactorKey, boolean>) {
  const active = FACTOR_KEYS.filter((k) => enabled[k] !== false && weights[k] > 0);
  const total = active.reduce((s, k) => s + weights[k], 0);
  const out = {} as Record<FactorKey, number>;
  for (const k of FACTOR_KEYS) out[k] = active.includes(k) && total > 0 ? weights[k] / total : 0;
  return out;
}

// ---------------------------------------------------------------------
// Vista del histórico preparada para el modelo
// ---------------------------------------------------------------------
interface HSide { teamId: string; players: Set<string>; gf: number; ga: number }
interface HMatch {
  id: string;
  kickoff: string;
  venueId: string | null;
  hour: number;
  weather: Weather | null;
  temp: number | null;
  home: HSide;
  away: HSide;
  completeness: number; // 0..1 · partidos históricos sin alineaciones pesan menos en factores de composición
}

export function buildHistory(input: Pick<StatsInput, "matches" | "matchPlayers">, before?: string): HMatch[] {
  const mpBy = new Map<string, { team: string; player: string }[]>();
  for (const mp of input.matchPlayers) {
    if (!mp.participated) continue;
    const l = mpBy.get(mp.match_id) ?? [];
    l.push({ team: mp.team_id, player: mp.player_id });
    mpBy.set(mp.match_id, l);
  }
  return playedMatches(input.matches)
    .filter((m) => !before || m.kickoff_at < before)
    .sort((a, b) => a.kickoff_at.localeCompare(b.kickoff_at))
    .map((m) => {
      const mps = mpBy.get(m.id) ?? [];
      const hp = new Set(mps.filter((x) => x.team === m.home_team_id).map((x) => x.player));
      const ap = new Set(mps.filter((x) => x.team === m.away_team_id).map((x) => x.player));
      const { weather, temp } = matchWeather(m);
      return {
        id: m.id, kickoff: m.kickoff_at, venueId: m.venue_id, hour: localHour(m.kickoff_at), weather, temp,
        home: { teamId: m.home_team_id, players: hp, gf: m.home_score!, ga: m.away_score! },
        away: { teamId: m.away_team_id, players: ap, gf: m.away_score!, ga: m.home_score! },
        completeness: Math.min(1, (hp.size + ap.size) / 14),
      };
    });
}

function sideOf(m: HMatch, teamId: string): HSide | null {
  return m.home.teamId === teamId ? m.home : m.away.teamId === teamId ? m.away : null;
}

function otherSide(m: HMatch, s: HSide): HSide {
  return s === m.home ? m.away : m.home;
}

const sameSlot = (h1: number, h2: number) => Math.abs(h1 - h2) <= 1;
function sameWeather(m: HMatch, weather: Weather | null, temp: number | null) {
  if (weather && m.weather) return m.weather === weather && (temp == null || m.temp == null || Math.abs(m.temp - temp) <= 6);
  if (temp != null && m.temp != null) return Math.abs(m.temp - temp) <= 4;
  return false;
}

// ---------------------------------------------------------------------
// Factores de equipo
// ---------------------------------------------------------------------
export interface Scenario {
  homeTeamId: string;
  awayTeamId: string;
  homePlayers: string[];
  awayPlayers: string[];
  venueId: string | null;
  kickoff: string;
  weather: Weather | null;
  temp: number | null;
}

interface FactorObs { n: number; gf: number; ga: number; k: number; base: { gf: number; ga: number }; note: string }

function pairs(n: number) { return (n * (n - 1)) / 2; }

/** Observaciones (ponderadas) de goles a favor/en contra de un bloque de jugadores o equipo */
function teamFactor(key: FactorKey, h: HMatch[], teamId: string, players: string[], rivals: string[], sc: Scenario, mu: number, P: ModelParams, teamBase: { gf: number; ga: number }): FactorObs {
  let sw = 0, sgf = 0, sga = 0;
  const add = (w: number, s: HSide) => { sw += w; sgf += w * s.gf; sga += w * s.ga; };
  const muBase = { gf: mu, ga: mu };
  switch (key) {
    case "composition_teammates": {
      if (!players.length) return { n: 0, gf: mu, ga: mu, k: P.k_pair, base: muBase, note: "Sin alineación indicada" };
      const set = new Set(players);
      const denom = players.length > 1 ? pairs(players.length) : 1;
      for (const m of h) for (const s of [m.home, m.away]) {
        const o = [...s.players].filter((p) => set.has(p)).length;
        const w = players.length > 1 ? pairs(o) / denom : o;
        if (w > 0) add(w, s);
      }
      return { n: sw, gf: shrink(sgf, sw, mu, P.k_pair), ga: shrink(sga, sw, mu, P.k_pair), k: P.k_pair, base: muBase, note: "Partidos en los que estos jugadores coincidieron" };
    }
    case "composition_rivals": {
      if (!players.length || !rivals.length) return { n: 0, gf: mu, ga: mu, k: P.k_pair, base: muBase, note: "Sin alineaciones de ambos equipos" };
      const set = new Set(players), rset = new Set(rivals);
      for (const m of h) for (const s of [m.home, m.away]) {
        const o = otherSide(m, s);
        const a = [...s.players].filter((p) => set.has(p)).length;
        const b = [...o.players].filter((p) => rset.has(p)).length;
        const w = (a * b) / (players.length * rivals.length);
        if (w > 0) add(w, s);
      }
      return { n: sw, gf: shrink(sgf, sw, mu, P.k_pair), ga: shrink(sga, sw, mu, P.k_pair), k: P.k_pair, base: muBase, note: "Enfrentamientos previos contra estos rivales" };
    }
    case "venue_history": {
      if (!sc.venueId) return { n: 0, gf: mu, ga: mu, k: P.k_venue, base: muBase, note: "Estadio sin especificar" };
      for (const m of h) { const s = sideOf(m, teamId); if (s && m.venueId === sc.venueId) add(1, s); }
      return { n: sw, gf: shrink(sgf, sw, mu, P.k_venue), ga: shrink(sga, sw, mu, P.k_venue), k: P.k_venue, base: muBase, note: "Todos sus partidos en este estadio" };
    }
    case "recent_form": {
      const last = h.filter((m) => sideOf(m, teamId)).slice(-3);
      for (const m of last) add(1, sideOf(m, teamId)!);
      return { n: sw, gf: shrink(sgf, sw, mu, P.k_recent), ga: shrink(sga, sw, mu, P.k_recent), k: P.k_recent, base: muBase, note: "Últimos 3 partidos" };
    }
    case "recent_venue": {
      if (!sc.venueId) return { n: 0, gf: mu, ga: mu, k: P.k_recent, base: muBase, note: "Estadio sin especificar" };
      const last = h.filter((m) => m.venueId === sc.venueId && sideOf(m, teamId)).slice(-3);
      for (const m of last) add(1, sideOf(m, teamId)!);
      return { n: sw, gf: shrink(sgf, sw, mu, P.k_recent), ga: shrink(sga, sw, mu, P.k_recent), k: P.k_recent, base: muBase, note: "Últimos 3 partidos en este estadio" };
    }
    case "weather": {
      if (!sc.weather && sc.temp == null) return { n: 0, gf: teamBase.gf, ga: teamBase.ga, k: P.k_context, base: teamBase, note: "Clima sin especificar" };
      for (const m of h) { const s = sideOf(m, teamId); if (s && sameWeather(m, sc.weather, sc.temp)) add(1, s); }
      return { n: sw, gf: shrink(sgf, sw, teamBase.gf, P.k_context), ga: shrink(sga, sw, teamBase.ga, P.k_context), k: P.k_context, base: teamBase, note: "Partidos con condiciones similares" };
    }
    case "time_slot": {
      const hr = localHour(sc.kickoff);
      for (const m of h) { const s = sideOf(m, teamId); if (s && sameSlot(m.hour, hr)) add(1, s); }
      return { n: sw, gf: shrink(sgf, sw, teamBase.gf, P.k_context), ga: shrink(sga, sw, teamBase.ga, P.k_context), k: P.k_context, base: teamBase, note: `Partidos a una hora similar (${hr}:00 ± 1 h)` };
    }
  }
}

export interface FactorExplanation {
  key: FactorKey;
  label: string;
  weight: number;          // peso normalizado configurado
  reliability: number;     // s_f
  effectiveWeight: number; // weight · reliability
  sample: number;          // observaciones equivalentes (media de ambos equipos)
  homeEffect: number;      // aportación a log λ_local
  awayEffect: number;      // aportación a log λ_visitante
  note: string;
}

export interface PlayerProjection {
  playerId: string;
  teamId: string;
  xGoals: number;
  xAssists: number;
  pScore: number;
  pAssist: number;
  expectedRating: number;
  sample: number;
}

export interface MatchPrediction {
  status: "ok" | "insufficient";
  modelVersion: string;
  configName: string;
  sampleMatches: number;
  baseline: number;
  lambdaHome: number;
  lambdaAway: number;
  matrix: ScoreMatrix | null;
  factors: FactorExplanation[];
  players: PlayerProjection[];
  confidence: { score: number; level: "insuficiente" | "baja" | "media" | "alta" };
  warnings: string[];
}

export interface ModelContext {
  history: HMatch[];
  parts: Participation[];
  weights: FactorWeights;
  enabled: Record<FactorKey, boolean>;
  configName: string;
  params: ModelParams;
  perf: PerformanceWeights;
}

function teamBaseRates(h: HMatch[], teamId: string, mu: number, P: ModelParams) {
  let n = 0, gf = 0, ga = 0;
  for (const m of h) { const s = sideOf(m, teamId); if (s) { n++; gf += s.gf; ga += s.ga; } }
  return { gf: shrink(gf, n, mu, P.k_team), ga: shrink(ga, n, mu, P.k_team), n };
}

function confidenceLevel(score: number, n: number, minMatches: number): MatchPrediction["confidence"]["level"] {
  if (n < minMatches) return "insuficiente";
  return score < 0.3 ? "baja" : score < 0.55 ? "media" : "alta";
}

export function predictMatch(sc: Scenario, ctx: ModelContext): MatchPrediction {
  const h = ctx.history;
  const P = ctx.params;
  const warnings: string[] = [];
  const empty: MatchPrediction = {
    status: "insufficient", modelVersion: MODEL_VERSION, configName: ctx.configName, sampleMatches: h.length, baseline: 0,
    lambdaHome: 0, lambdaAway: 0, matrix: null, factors: [], players: [], confidence: { score: 0, level: "insuficiente" },
    warnings: ["Todavía no hay partidos disputados en el histórico: no se puede calcular un pronóstico fundamentado."],
  };
  if (!h.length) return empty;

  const goalsTotal = h.reduce((s, m) => s + m.home.gf + m.away.gf, 0);
  const mu = Math.max(goalsTotal / (2 * h.length), 0.25);
  const W = normalizeWeights(ctx.weights, ctx.enabled);
  const baseH = teamBaseRates(h, sc.homeTeamId, mu, P);
  const baseA = teamBaseRates(h, sc.awayTeamId, mu, P);

  let logH = Math.log(mu), logA = Math.log(mu);
  let confNum = 0;
  const factors: FactorExplanation[] = [];
  for (const key of FACTOR_KEYS) {
    const w = W[key];
    const fH = teamFactor(key, h, sc.homeTeamId, sc.homePlayers, sc.awayPlayers, sc, mu, P, baseH);
    const fA = teamFactor(key, h, sc.awayTeamId, sc.awayPlayers, sc.homePlayers, sc, mu, P, baseA);
    // Factores contextuales (clima, horario) se miden respecto al propio equipo:
    // se combinan con la base del equipo para no perder su nivel general.
    const contextual = key === "weather" || key === "time_slot";
    const atkH = safeLog(fH.gf / fH.base.gf) + (contextual ? safeLog(baseH.gf / mu) : 0);
    const defA = safeLog(fA.ga / fA.base.ga) + (contextual ? safeLog(baseA.ga / mu) : 0);
    const atkA = safeLog(fA.gf / fA.base.gf) + (contextual ? safeLog(baseA.gf / mu) : 0);
    const defH = safeLog(fH.ga / fH.base.ga) + (contextual ? safeLog(baseH.ga / mu) : 0);
    const effH = w * 0.5 * (atkH + defA);
    const effA = w * 0.5 * (atkA + defH);
    logH += effH;
    logA += effA;
    const n = (fH.n + fA.n) / 2;
    const rel = n / (n + fH.k);
    confNum += w * rel;
    factors.push({
      key, label: FACTOR_LABELS[key], weight: w, reliability: rel, effectiveWeight: w * rel, sample: n,
      homeEffect: effH, awayEffect: effA, note: w === 0 ? "Desactivado" : fH.note,
    });
  }
  const lambdaHome = Math.exp(logH);
  const lambdaAway = Math.exp(logA);
  const matrix = scoreMatrix(lambdaHome, lambdaAway);
  const volume = h.length / (h.length + 5);
  const score = confNum * volume;
  const level = confidenceLevel(score, h.length, P.min_matches);
  if (h.length < P.min_matches) warnings.push(`Sólo hay ${h.length} partido${h.length === 1 ? "" : "s"} en el histórico: el pronóstico es orientativo.`);
  if (!sc.homePlayers.length || !sc.awayPlayers.length) warnings.push("Sin alineaciones completas, la composición de los equipos no puede influir.");
  for (const f of factors) if (f.weight > 0.1 && f.reliability < 0.25) warnings.push(`Poca información para «${f.label}» (${f.sample.toFixed(1)} partidos equivalentes): su influencia se ha reducido.`);

  const players = [
    ...projectPlayers(sc.homePlayers, sc.homeTeamId, lambdaHome, lambdaAway, ctx),
    ...projectPlayers(sc.awayPlayers, sc.awayTeamId, lambdaAway, lambdaHome, ctx),
  ];

  return {
    status: "ok", modelVersion: MODEL_VERSION, configName: ctx.configName, sampleMatches: h.length, baseline: mu,
    lambdaHome, lambdaAway, matrix, factors, players, confidence: { score, level }, warnings,
  };
}

/** Reparte λ del equipo entre sus jugadores según su tasa individual contraída */
function projectPlayers(playerIds: string[], teamId: string, lambda: number, lambdaOpp: number, ctx: ModelContext): PlayerProjection[] {
  if (!playerIds.length) return [];
  const P = ctx.params;
  const parts = ctx.parts;
  const totalParts = parts.length || 1;
  const gMu = parts.reduce((s, p) => s + p.goals, 0) / totalParts;
  const aMu = parts.reduce((s, p) => s + p.assists, 0) / totalParts;
  const mvpMu = parts.filter((p) => p.isMvp).length / totalParts;
  const totalGoals = ctx.history.reduce((s, m) => s + m.home.gf + m.away.gf, 0);
  const assistedShare = totalGoals ? parts.reduce((s, p) => s + p.assists, 0) / totalGoals : 0;
  const rows = playerIds.map((id) => {
    const ps = parts.filter((p) => p.playerId === id);
    const n = ps.length;
    return {
      id, n,
      g: shrink(ps.reduce((s, p) => s + p.goals, 0), n, gMu, P.k_player),
      a: shrink(ps.reduce((s, p) => s + p.assists, 0), n, aMu, P.k_player),
      mvp: shrink(ps.filter((p) => p.isMvp).length, n, mvpMu, P.k_player),
    };
  });
  const sumG = rows.reduce((s, r) => s + r.g, 0) || 1;
  const sumA = rows.reduce((s, r) => s + r.a, 0) || 1;
  const teamAssists = lambda * assistedShare;
  const w = ctx.perf;
  return rows.map((r) => {
    const xG = (lambda * r.g) / sumG;
    const xA = (teamAssists * r.a) / sumA;
    return {
      playerId: r.id, teamId, xGoals: xG, xAssists: xA,
      pScore: 1 - Math.exp(-xG), pAssist: 1 - Math.exp(-xA),
      expectedRating: Math.min(w.max, Math.max(w.min, w.base + w.played + xG * w.goal + xA * w.assist + Math.max(0, lambda - xG) * w.team_goal + lambdaOpp * w.team_conceded)),
      sample: r.n,
    };
  });
}

// ---------------------------------------------------------------------
// Simulación individual
// ---------------------------------------------------------------------
export interface IndividualScenario {
  playerId: string;
  teamId: string;
  teammates: string[];
  rivals: string[];
  venueId: string | null;
  kickoff: string;
  weather: Weather | null;
  temp: number | null;
}

export interface IndividualPrediction {
  status: "ok" | "insufficient";
  modelVersion: string;
  configName: string;
  sample: number;
  xGoals: number;
  xAssists: number;
  pScore: number;
  pAssist: number;
  expectedRating: number;
  pWin: number;
  base: { goals: number; assists: number; rating: number; winRate: number };
  history: { avgRating: number; bestRating: number; matches: number; percentile: number };
  factors: (FactorExplanation & { goalsMultiplier: number })[];
  confidence: { score: number; level: "insuficiente" | "baja" | "media" | "alta" };
  warnings: string[];
}

export function predictIndividual(sc: IndividualScenario, ctx: ModelContext): IndividualPrediction {
  const P = ctx.params;
  const all = ctx.parts;
  const mine = all.filter((p) => p.playerId === sc.playerId).sort((a, b) => a.kickoff.localeCompare(b.kickoff));
  const n = mine.length;
  const warnings: string[] = [];
  const totalParts = all.length || 1;
  const gMu = all.reduce((s, p) => s + p.goals, 0) / totalParts;
  const aMu = all.reduce((s, p) => s + p.assists, 0) / totalParts;
  const rMu = all.reduce((s, p) => s + p.rating, 0) / totalParts;
  const wMu = all.filter((p) => p.result === "W").length / totalParts;

  const base = {
    goals: shrink(sum(mine, "goals"), n, gMu, P.k_player),
    assists: shrink(sum(mine, "assists"), n, aMu, P.k_player),
    rating: shrink(sum(mine, "rating"), n, rMu, P.k_player),
    winRate: shrink(mine.filter((p) => p.result === "W").length, n, wMu, P.k_player),
  };
  const ratings = mine.map((p) => p.rating);
  const avgRating = n ? ratings.reduce((a, b) => a + b, 0) / n : 0;

  if (!all.length) {
    return {
      status: "insufficient", modelVersion: MODEL_VERSION, configName: ctx.configName, sample: 0,
      xGoals: 0, xAssists: 0, pScore: 0, pAssist: 0, expectedRating: 0, pWin: 0, base,
      history: { avgRating: 0, bestRating: 0, matches: 0, percentile: 0 }, factors: [],
      confidence: { score: 0, level: "insuficiente" },
      warnings: ["Todavía no hay partidos disputados con alineaciones: no se puede simular."],
    };
  }

  // Participaciones de compañeros/rivales por partido
  const byMatch = new Map<string, Participation[]>();
  for (const p of all) { const l = byMatch.get(p.matchId) ?? []; l.push(p); byMatch.set(p.matchId, l); }
  const hr = localHour(sc.kickoff);
  const W = normalizeWeights(ctx.weights, ctx.enabled);

  const subsets: Record<FactorKey, { ps: { p: Participation; w: number }[]; k: number; note: string }> = {
    composition_teammates: { ps: [], k: P.k_pair, note: sc.teammates.length ? "Partidos con estos compañeros" : "Sin compañeros seleccionados" },
    composition_rivals: { ps: [], k: P.k_pair, note: sc.rivals.length ? "Partidos contra estos rivales" : "Sin rivales seleccionados" },
    venue_history: { ps: [], k: P.k_venue, note: sc.venueId ? "Sus partidos en este estadio" : "Estadio sin especificar" },
    recent_form: { ps: mine.slice(-3).map((p) => ({ p, w: 1 })), k: P.k_recent, note: "Sus 3 últimos partidos" },
    recent_venue: { ps: [], k: P.k_recent, note: "Sus 3 últimos en este estadio" },
    weather: { ps: [], k: P.k_context, note: "Partidos con condiciones similares" },
    time_slot: { ps: [], k: P.k_context, note: `Partidos a una hora similar (${hr}:00 ± 1 h)` },
  };
  const venueMine = sc.venueId ? mine.filter((p) => p.venueId === sc.venueId) : [];
  subsets.venue_history.ps = venueMine.map((p) => ({ p, w: 1 }));
  subsets.recent_venue.ps = venueMine.slice(-3).map((p) => ({ p, w: 1 }));
  for (const p of mine) {
    const mates = byMatch.get(p.matchId) ?? [];
    if (sc.teammates.length) {
      const o = mates.filter((x) => x.teamId === p.teamId && sc.teammates.includes(x.playerId)).length;
      if (o) subsets.composition_teammates.ps.push({ p, w: o / sc.teammates.length });
    }
    if (sc.rivals.length) {
      const o = mates.filter((x) => x.teamId !== p.teamId && sc.rivals.includes(x.playerId)).length;
      if (o) subsets.composition_rivals.ps.push({ p, w: o / sc.rivals.length });
    }
    if ((sc.weather || sc.temp != null) && sameWeatherP(p, sc.weather, sc.temp)) subsets.weather.ps.push({ p, w: 1 });
    if (sameSlot(p.hour, hr)) subsets.time_slot.ps.push({ p, w: 1 });
  }

  let logG = 0, logA = 0, logR = 0, logW = 0, confNum = 0;
  const factors: IndividualPrediction["factors"] = [];
  for (const key of FACTOR_KEYS) {
    const { ps, k, note } = subsets[key];
    const sw = ps.reduce((s, x) => s + x.w, 0);
    const g = shrink(ps.reduce((s, x) => s + x.w * x.p.goals, 0), sw, base.goals, k);
    const a = shrink(ps.reduce((s, x) => s + x.w * x.p.assists, 0), sw, base.assists, k);
    const r = shrink(ps.reduce((s, x) => s + x.w * x.p.rating, 0), sw, base.rating, k);
    const wr = shrink(ps.reduce((s, x) => s + x.w * (x.p.result === "W" ? 1 : 0), 0), sw, base.winRate, k);
    const w = W[key];
    const eg = w * safeLog(g / Math.max(base.goals, 1e-6));
    logG += base.goals > 0 ? eg : 0;
    logA += base.assists > 0 ? w * safeLog(a / Math.max(base.assists, 1e-6)) : 0;
    logR += base.rating > 0 ? w * safeLog(r / Math.max(base.rating, 1e-6)) : 0;
    logW += base.winRate > 0 ? w * safeLog(wr / Math.max(base.winRate, 1e-6)) : 0;
    const rel = sw / (sw + k);
    confNum += w * rel;
    factors.push({
      key, label: FACTOR_LABELS[key], weight: w, reliability: rel, effectiveWeight: w * rel, sample: sw,
      homeEffect: eg, awayEffect: 0, note: w === 0 ? "Desactivado" : note, goalsMultiplier: Math.exp(eg),
    });
  }
  const xGoals = base.goals * Math.exp(logG);
  const xAssists = base.assists * Math.exp(logA);
  const expectedRating = base.rating * Math.exp(logR);
  const pWin = Math.min(0.97, base.winRate * Math.exp(logW));
  const score = confNum * (n / (n + 5));
  const level = confidenceLevel(score, n, P.min_matches);
  if (n === 0) warnings.push("Este jugador aún no tiene partidos registrados: se usa la media del grupo.");
  else if (n < P.min_matches) warnings.push(`Sólo ${n} partido${n === 1 ? "" : "s"} de este jugador: resultado orientativo.`);
  const percentile = n ? ratings.filter((x) => x <= expectedRating).length / n : 0;

  return {
    status: "ok", modelVersion: MODEL_VERSION, configName: ctx.configName, sample: n,
    xGoals, xAssists, pScore: 1 - Math.exp(-xGoals), pAssist: 1 - Math.exp(-xAssists), expectedRating, pWin, base,
    history: { avgRating, bestRating: n ? Math.max(...ratings) : 0, matches: n, percentile },
    factors, confidence: { score, level }, warnings,
  };
}

function sameWeatherP(p: Participation, weather: Weather | null, temp: number | null) {
  if (weather && p.weather) return p.weather === weather && (temp == null || p.temp == null || Math.abs(p.temp - temp) <= 6);
  if (temp != null && p.temp != null) return Math.abs(p.temp - temp) <= 4;
  return false;
}

function sum<T>(arr: T[], k: keyof T) {
  return arr.reduce((s, x) => s + (x[k] as unknown as number), 0);
}

// ---------------------------------------------------------------------
// Validación retrospectiva (rendimiento del modelo)
// ---------------------------------------------------------------------
export interface BacktestResult {
  evaluated: number;
  accuracy: number;     // acierto del resultado más probable (1X2)
  logLoss: number;      // menor es mejor
  brier: number;        // menor es mejor
  baselineLogLoss: number; // modelo ingenuo: frecuencias históricas 1X2
  rows: { matchId: string; kickoff: string; predicted: "1" | "X" | "2"; actual: "1" | "X" | "2"; pActual: number }[];
}

export function backtest(input: StatsInput, partsAll: Participation[], ctxBase: Omit<ModelContext, "history" | "parts">, minPrior = 3): BacktestResult {
  const played = playedMatches(input.matches).sort((a, b) => a.kickoff_at.localeCompare(b.kickoff_at));
  const rows: BacktestResult["rows"] = [];
  let ll = 0, br = 0, hit = 0, bll = 0;
  const counts = { "1": 1, X: 1, "2": 1 };
  played.forEach((m: Match, i) => {
    if (i < minPrior) { counts[outcome(m)]++; return; }
    const history = buildHistory(input, m.kickoff_at);
    const parts = partsAll.filter((p) => p.kickoff < m.kickoff_at);
    const lineup = input.matchPlayers.filter((mp) => mp.match_id === m.id && mp.participated);
    const { weather, temp } = matchWeather(m);
    const pred = predictMatch({
      homeTeamId: m.home_team_id, awayTeamId: m.away_team_id,
      homePlayers: lineup.filter((x) => x.team_id === m.home_team_id).map((x) => x.player_id),
      awayPlayers: lineup.filter((x) => x.team_id === m.away_team_id).map((x) => x.player_id),
      venueId: m.venue_id, kickoff: m.kickoff_at, weather, temp,
    }, { ...ctxBase, history, parts });
    if (!pred.matrix) return;
    const probs = { "1": pred.matrix.pHome, X: pred.matrix.pDraw, "2": pred.matrix.pAway };
    const actual = outcome(m);
    const predicted = (Object.entries(probs).sort((a, b) => b[1] - a[1])[0][0]) as "1" | "X" | "2";
    ll += -Math.log(Math.max(probs[actual], 1e-9));
    br += (["1", "X", "2"] as const).reduce((s, k) => s + (probs[k] - (k === actual ? 1 : 0)) ** 2, 0);
    hit += predicted === actual ? 1 : 0;
    const tot = counts["1"] + counts.X + counts["2"];
    bll += -Math.log(counts[actual] / tot);
    counts[actual]++;
    rows.push({ matchId: m.id, kickoff: m.kickoff_at, predicted, actual, pActual: probs[actual] });
  });
  const n = rows.length;
  return { evaluated: n, accuracy: n ? hit / n : 0, logLoss: n ? ll / n : 0, brier: n ? br / n : 0, baselineLogLoss: n ? bll / n : 0, rows };
}

function outcome(m: Match): "1" | "X" | "2" {
  return m.home_score! > m.away_score! ? "1" : m.home_score === m.away_score ? "X" : "2";
}
