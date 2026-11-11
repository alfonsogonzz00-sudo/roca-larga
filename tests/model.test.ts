import { describe, expect, it } from "vitest";
import { buildParticipations, rate, ranking, teamBadges, teamStats, topPerformances, playerTotals } from "@/lib/stats/engine";
import { backtest, buildHistory, normalizeWeights, poissonPmf, predictIndividual, predictMatch, scoreMatrix, type ModelContext } from "@/lib/stats/model";
import type { Goal, Match, MatchMvp, MatchPlayer, Player, Team } from "@/lib/types";

const PERF = { base: 6, played: 0.5, goal: 2.5, assist: 1.2, team_goal: 0.8, team_conceded: -1, guest_bonus: 0.5, max: 10, min: 0 };
const PARAMS = { k_team: 4, k_venue: 4, k_recent: 2, k_context: 5, k_pair: 3, k_player: 4, min_matches: 3 };
const W = { composition_teammates: 30, composition_rivals: 20, venue_history: 20, recent_form: 10, recent_venue: 10, weather: 7.5, time_slot: 2.5 };
const EN = Object.fromEntries(Object.keys(W).map((k) => [k, true])) as Record<keyof typeof W, boolean>;

// Datos sintéticos de PRUEBA (no reales)
const teams: Team[] = [
  { id: "A", slug: "a", name: "A", short_name: "A" } as Team,
  { id: "B", slug: "b", name: "B", short_name: "B" } as Team,
];
const players: Player[] = [
  ...Array.from({ length: 8 }, (_, i) => ({ id: `a${i}`, kind: "member", team_id: "A", full_name: `A${i}`, nickname: null }) as Player),
  ...Array.from({ length: 8 }, (_, i) => ({ id: `b${i}`, kind: "member", team_id: "B", full_name: `B${i}`, nickname: null }) as Player),
];

function makeData(n: number, scoreFn: (i: number) => [number, number], venue = (i: number) => (i % 2 ? "V1" : "V2")) {
  const matches: Match[] = [];
  const mps: MatchPlayer[] = [];
  const goals: Goal[] = [];
  const mvps: MatchMvp[] = [];
  for (let i = 0; i < n; i++) {
    const [h, a] = scoreFn(i);
    const id = `m${i}`;
    matches.push({
      id, kickoff_at: new Date(Date.UTC(2026, 0, 1 + i * 7, 19)).toISOString(), venue_id: venue(i),
      home_team_id: "A", away_team_id: "B", status: "played", origin: "scheduled", home_score: h, away_score: a,
      actual_weather: i % 3 ? "despejado" : "lluvia", actual_temp_c: 15, forecast_weather: null, forecast_temp_c: null,
    } as Match);
    for (let j = 0; j < 7; j++) {
      mps.push({ match_id: id, player_id: `a${j}`, team_id: "A", called: true, participated: true } as MatchPlayer);
      mps.push({ match_id: id, player_id: `b${j}`, team_id: "B", called: true, participated: true } as MatchPlayer);
    }
    let seq = 0;
    for (let g = 0; g < h; g++) goals.push({ id: `${id}h${g}`, match_id: id, team_id: "A", seq: ++seq, scorer_id: "a0", assist_id: g % 2 ? "a1" : null, conceded_gk_id: "b6", minute: null, is_own_goal: false });
    for (let g = 0; g < a; g++) goals.push({ id: `${id}a${g}`, match_id: id, team_id: "B", seq: ++seq, scorer_id: "b0", assist_id: null, conceded_gk_id: "a6", minute: null, is_own_goal: false });
    mvps.push({ match_id: id, player_id: h >= a ? "a0" : "b0", source: "vote", points: 10 });
  }
  return { teams, players, matches, matchPlayers: mps, goals, spells: [], mvps };
}

function ctxFor(data: ReturnType<typeof makeData>): ModelContext {
  return { history: buildHistory(data), parts: buildParticipations(data, PERF), weights: W, enabled: EN, configName: "test", params: PARAMS, perf: PERF };
}

const lineupA = Array.from({ length: 7 }, (_, i) => `a${i}`);
const lineupB = Array.from({ length: 7 }, (_, i) => `b${i}`);
const scenario = { homeTeamId: "A", awayTeamId: "B", homePlayers: lineupA, awayPlayers: lineupB, venueId: "V1", kickoff: "2026-12-01T19:00:00Z", weather: "despejado" as const, temp: 15 };

describe("matemáticas", () => {
  it("Poisson suma 1 y la matriz de resultado es coherente", () => {
    let s = 0;
    for (let k = 0; k < 40; k++) s += poissonPmf(k, 4.2);
    expect(s).toBeCloseTo(1, 6);
    const m = scoreMatrix(3, 3);
    expect(m.pHome + m.pDraw + m.pAway).toBeCloseTo(1, 6);
    expect(m.pHome).toBeCloseTo(m.pAway, 6);
  });

  it("los pesos activos se normalizan a 1 y los desactivados valen 0", () => {
    const w = normalizeWeights(W, { ...EN, weather: false });
    const total = Object.values(w).reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(1, 9);
    expect(w.weather).toBe(0);
  });
});

describe("estadísticas", () => {
  const data = makeData(6, () => [3, 1]);
  const parts = buildParticipations(data, PERF);

  it("goles encajados como portero no restan en la valoración de campo", () => {
    const gk = parts.filter((p) => p.playerId === "b6");
    expect(gk.every((p) => p.concededAsGk === 3)).toBe(true);
    const other = parts.filter((p) => p.playerId === "b5");
    expect(gk[0].rating).toBe(other[0].rating); // mismo resultado, sin goles: misma valoración
  });

  it("récord de equipo y rankings", () => {
    const ts = teamStats("A", data.matches);
    expect(ts.record).toMatchObject({ played: 6, wins: 6, goalsFor: 18, goalsAgainst: 6, goalDiff: 12 });
    const r = ranking(parts, "goals");
    expect(r[0]).toMatchObject({ playerId: "a0", goals: 18 });
    expect(playerTotals("a0", parts).mvps).toBe(6);
    expect(topPerformances("a0", parts).length).toBe(3);
    const badges = teamBadges("A", parts, players);
    expect(badges.find((b) => b.key === "top_scorer")?.playerId).toBe("a0");
  });

  it("no inventa estadísticas sin datos", () => {
    const empty = buildParticipations(makeData(0, () => [0, 0]), PERF);
    expect(teamBadges("A", empty, players)).toEqual([]);
  });
});

describe("modelo predictivo", () => {
  it("sin histórico devuelve insuficiente, nunca un número inventado", () => {
    const p = predictMatch(scenario, ctxFor(makeData(0, () => [0, 0])));
    expect(p.status).toBe("insufficient");
    expect(p.matrix).toBeNull();
  });

  it("el histórico influye: el equipo dominante es favorito", () => {
    const p = predictMatch(scenario, ctxFor(makeData(12, () => [4, 1])));
    expect(p.lambdaHome).toBeGreaterThan(p.lambdaAway);
    expect(p.matrix!.pHome).toBeGreaterThan(p.matrix!.pAway);
    expect(p.players.find((x) => x.playerId === "a0")!.xGoals).toBeGreaterThan(p.players.find((x) => x.playerId === "a3")!.xGoals);
  });

  it("es reproducible", () => {
    const d = makeData(10, (i) => [i % 4, (i + 1) % 3]);
    expect(predictMatch(scenario, ctxFor(d))).toEqual(predictMatch(scenario, ctxFor(d)));
  });

  it("con poca muestra la confianza es menor y la predicción más prudente", () => {
    const few = predictMatch(scenario, ctxFor(makeData(2, () => [5, 0])));
    const many = predictMatch(scenario, ctxFor(makeData(20, () => [5, 0])));
    expect(few.confidence.level).toBe("insuficiente");
    expect(few.confidence.score).toBeLessThan(many.confidence.score);
    expect(few.matrix!.pHome).toBeLessThan(many.matrix!.pHome);
    expect(few.warnings.length).toBeGreaterThan(0);
  });

  it("el estadio cuenta: rinde mejor donde ha ganado", () => {
    // A arrasa en V1 y pierde en V2
    const d = makeData(16, (i) => (i % 2 ? [5, 1] : [1, 4]));
    const atV1 = predictMatch({ ...scenario, venueId: "V1" }, ctxFor(d));
    const atV2 = predictMatch({ ...scenario, venueId: "V2" }, ctxFor(d));
    expect(atV1.matrix!.pHome).toBeGreaterThan(atV2.matrix!.pHome);
    const venue = atV1.factors.find((f) => f.key === "venue_history")!;
    expect(venue.reliability).toBeGreaterThan(0.5);
  });

  it("simulación individual sin compañeros ni rivales funciona y explica factores", () => {
    const d = makeData(10, () => [3, 2]);
    const r = predictIndividual({ playerId: "a0", teamId: "A", teammates: [], rivals: [], venueId: "V1", kickoff: scenario.kickoff, weather: null, temp: null }, ctxFor(d));
    expect(r.status).toBe("ok");
    expect(r.xGoals).toBeGreaterThan(1.5);
    expect(r.factors.find((f) => f.key === "composition_teammates")!.reliability).toBe(0);
    const nobody = predictIndividual({ playerId: "a5", teamId: "A", teammates: [], rivals: [], venueId: null, kickoff: scenario.kickoff, weather: null, temp: null }, ctxFor(d));
    expect(nobody.xGoals).toBeLessThan(r.xGoals);
  });

  it("validación retrospectiva produce métricas", () => {
    const d = makeData(12, (i) => [2 + (i % 3), 1]);
    const ctx = ctxFor(d);
    const bt = backtest(d, ctx.parts, { weights: W, enabled: EN, configName: "t", params: PARAMS, perf: PERF });
    expect(bt.evaluated).toBe(9);
    expect(bt.accuracy).toBeGreaterThan(0.5);
  });
});

describe("nota del partido (sobre 10)", () => {
  const base = { goals: 0, assists: 0, goalsFor: 0, goalsAgainst: 0, guestsBrought: 0 };
  it("parte de 6,0 y suma 0,5 por jugar", () => {
    expect(rate(base, PERF)).toBe(6.5);
  });
  it("gol propio +2,5 sin cobrar el +0,8 de ese gol; asistente sí lo cobra", () => {
    // Equipo gana 1-0: el goleador 6,5 + 2,5 = 9,0; el asistente 6,5 + 1,2 + 0,8 = 8,5; el resto 6,5 + 0,8 = 7,3
    expect(rate({ ...base, goals: 1, goalsFor: 1 }, PERF)).toBe(9);
    expect(rate({ ...base, assists: 1, goalsFor: 1 }, PERF)).toBe(8.5);
    expect(rate({ ...base, goalsFor: 1 }, PERF)).toBe(7.3);
  });
  it("cada gol encajado por el equipo resta 1,0", () => {
    expect(rate({ ...base, goalsAgainst: 3 }, PERF)).toBe(3.5);
  });
  it("tope en 10 y suelo en 0", () => {
    expect(rate({ ...base, goals: 4, goalsFor: 6 }, PERF)).toBe(10);
    expect(rate({ ...base, goalsAgainst: 12 }, PERF)).toBe(0);
  });
});
