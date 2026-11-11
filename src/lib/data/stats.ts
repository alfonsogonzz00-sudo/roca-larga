import "server-only";
import { cache } from "react";
import { loadDataset } from "./dataset";
import { getActiveConfigs, getSettings } from "./config";
import { buildParticipations } from "@/lib/stats/engine";
import { buildHistory, predictMatch, type ModelContext, type Scenario } from "@/lib/stats/model";
import { FACTOR_KEYS, type FactorKey, type FactorWeights, type Match, type PredictionConfig } from "@/lib/types";

/** Contexto estadístico común (datos + valoraciones + configuración del modelo) */
export const getStats = cache(async () => {
  const [ds, settings, configs] = await Promise.all([loadDataset(), getSettings(), getActiveConfigs()]);
  const parts = buildParticipations(ds, settings.performance_weights);
  return { ds, settings, configs, parts };
});

const DEFAULT_WEIGHTS: Record<"next_match" | "simulation", FactorWeights> = {
  next_match: { composition_teammates: 30, composition_rivals: 20, venue_history: 20, recent_form: 10, recent_venue: 10, weather: 7.5, time_slot: 2.5 },
  simulation: { composition_teammates: 30, composition_rivals: 20, venue_history: 20, recent_form: 12.5, recent_venue: 7.5, weather: 7.5, time_slot: 2.5 },
};

export async function modelContext(scope: "next_match" | "simulation", before?: string, override?: PredictionConfig | null): Promise<ModelContext> {
  const { ds, settings, configs, parts } = await getStats();
  const cfg = override ?? configs[scope];
  const enabled = Object.fromEntries(FACTOR_KEYS.map((k) => [k, cfg?.enabled?.[k] !== false])) as Record<FactorKey, boolean>;
  return {
    history: buildHistory(ds, before),
    parts: before ? parts.filter((p) => p.kickoff < before) : parts,
    weights: cfg?.weights ?? DEFAULT_WEIGHTS[scope],
    enabled,
    configName: cfg?.name ?? "Valores originales",
    params: settings.model_params,
    perf: settings.performance_weights,
  };
}

/** Pronóstico de un partido programado (o el que se habría hecho antes de un partido ya jugado) */
export async function predictionForMatch(m: Match) {
  const { ds } = await getStats();
  const lineup = ds.matchPlayers.filter((mp) => mp.match_id === m.id && (m.status === "played" ? mp.participated : mp.called && mp.attendance !== "no"));
  const sc: Scenario = {
    homeTeamId: m.home_team_id,
    awayTeamId: m.away_team_id,
    homePlayers: lineup.filter((x) => x.team_id === m.home_team_id).map((x) => x.player_id),
    awayPlayers: lineup.filter((x) => x.team_id === m.away_team_id).map((x) => x.player_id),
    venueId: m.venue_id,
    kickoff: m.kickoff_at,
    weather: m.forecast_weather ?? m.actual_weather,
    temp: m.forecast_temp_c ?? m.actual_temp_c,
  };
  // Sólo con partidos anteriores al encuentro: así el pronóstico es reproducible
  const ctx = await modelContext("next_match", m.kickoff_at);
  return predictMatch(sc, ctx);
}
