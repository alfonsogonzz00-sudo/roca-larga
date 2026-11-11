import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { ModelParams, PerformanceWeights, PredictionConfig } from "@/lib/types";

export interface AppSettings {
  app_name: string;
  app_tagline: string;
  timezone: string;
  players_per_side: number;
  organizers_per_team: number;
  vote_tiebreak: string[];
  mvp_tie_fallback: "shared" | "none";
  performance_weights: PerformanceWeights;
  model_params: ModelParams;
  demo_mode: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  app_name: "Roca Larga",
  app_tagline: "Caravelle F.C. · S.D. Monecillo",
  timezone: "Europe/Madrid",
  players_per_side: 7,
  organizers_per_team: 2,
  vote_tiebreak: ["other_votes", "goal_contributions"],
  mvp_tie_fallback: "shared",
  performance_weights: { base: 6, played: 0.5, goal: 2.5, assist: 1.2, team_goal: 0.8, team_conceded: -1, guest_bonus: 0.5, max: 10, min: 0 },
  model_params: { k_team: 4, k_venue: 4, k_recent: 2, k_context: 5, k_pair: 3, k_player: 4, min_matches: 3 },
  demo_mode: false,
};

export const getSettings = cache(async (): Promise<AppSettings> => {
  const supabase = await createClient();
  const { data } = await supabase.from("app_settings").select("key,value");
  const s: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  for (const row of data ?? []) s[row.key] = row.value;
  s.performance_weights = { ...DEFAULT_SETTINGS.performance_weights, ...(s.performance_weights as object) };
  return s as unknown as AppSettings;
});

/** Textos personalizables. t("clave") devuelve el texto (o una variante aleatoria si existen). */
export const getTexts = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.from("ui_texts").select("key,value,variants");
  const map = new Map<string, { value: string; variants: string[] }>();
  for (const r of data ?? []) map.set(r.key, { value: r.value, variants: r.variants ?? [] });
  return (key: string, fallback?: string) => {
    const e = map.get(key);
    if (!e) return fallback ?? key;
    if (e.variants.length) {
      const all = [e.value, ...e.variants];
      return all[Math.floor(Math.random() * all.length)];
    }
    return e.value;
  };
});

export type TextFn = Awaited<ReturnType<typeof getTexts>>;

export const getActiveConfigs = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.from("prediction_configs").select("*").eq("is_active", true);
  const rows = (data ?? []) as PredictionConfig[];
  return {
    next_match: rows.find((r) => r.scope === "next_match") ?? null,
    simulation: rows.find((r) => r.scope === "simulation") ?? null,
  };
});
