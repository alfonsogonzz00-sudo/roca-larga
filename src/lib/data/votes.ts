import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { Session } from "./session";

/** Partidos con votación abierta ahora (según hora del servidor de BD) */
export const getOpenVoteMatches = cache(async () => {
  const supabase = await createClient();
  // Cierre perezoso por si el cron se retrasara: nunca abre nada, sólo cierra lo vencido
  await supabase.rpc("close_due_votes");
  const now = new Date().toISOString();
  const { data } = await supabase
    .from("matches")
    .select("id,kickoff_at,vote_closes_at,home_team_id,away_team_id,status,home_score,away_score,venue_id")
    .eq("vote_enabled", true).is("vote_closed_at", null).in("status", ["confirmed", "played"])
    .lte("vote_opens_at", now).gt("vote_closes_at", now)
    .order("kickoff_at", { ascending: false });
  return data ?? [];
});

/** Votaciones pendientes del usuario (participó y aún no votó) */
export const getPendingVotesCount = cache(async (s: Session | null) => {
  if (!s?.player) return 0;
  const open = await getOpenVoteMatches();
  if (!open.length) return 0;
  const supabase = await createClient();
  const ids = open.map((m) => m.id);
  const [{ data: mp }, { data: rc }] = await Promise.all([
    supabase.from("match_players").select("match_id").in("match_id", ids).eq("player_id", s.player.id).eq("participated", true),
    supabase.from("mvp_vote_receipts").select("match_id").in("match_id", ids).eq("player_id", s.player.id),
  ]);
  const voted = new Set((rc ?? []).map((r) => r.match_id));
  return (mp ?? []).filter((r) => !voted.has(r.match_id)).length;
});

/** Ids de las votaciones pendientes del usuario */
export const getPendingVoteIds = cache(async (s: Session | null): Promise<string[]> => {
  if (!s?.player) return [];
  const open = await getOpenVoteMatches();
  if (!open.length) return [];
  const supabase = await createClient();
  const ids = open.map((m) => m.id);
  const [{ data: mp }, { data: rc }] = await Promise.all([
    supabase.from("match_players").select("match_id").in("match_id", ids).eq("player_id", s.player.id).eq("participated", true),
    supabase.from("mvp_vote_receipts").select("match_id").in("match_id", ids).eq("player_id", s.player.id),
  ]);
  const voted = new Set((rc ?? []).map((r) => r.match_id));
  return (mp ?? []).filter((r) => !voted.has(r.match_id)).map((r) => r.match_id as string);
});
