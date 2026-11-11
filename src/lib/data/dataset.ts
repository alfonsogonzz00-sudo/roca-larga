import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { fetchAll } from "./fetch-all";
import type { Formation, GkSpell, Goal, Match, MatchMvp, MatchPlayer, Player, Team, Venue } from "@/lib/types";

/**
 * Conjunto de datos deportivos completo. Con el volumen de dos equipos
 * (decenas o cientos de partidos) es más fiable calcular todo a partir de
 * los datos brutos que mantener agregados: no hay nada que desincronizar.
 */
export interface Dataset {
  teams: Team[];
  venues: Venue[];
  players: Player[];
  formations: Formation[];
  matches: Match[];
  matchPlayers: MatchPlayer[];
  goals: Goal[];
  spells: GkSpell[];
  mvps: MatchMvp[];
  // índices
  teamById: Map<string, Team>;
  venueById: Map<string, Venue>;
  playerById: Map<string, Player>;
  formationById: Map<string, Formation>;
  matchById: Map<string, Match>;
}

export const loadDataset = cache(async (): Promise<Dataset> => {
  const supabase = await createClient();
  const [teams, venues, players, formations, matches, matchPlayers, goals, spells, mvps] = await Promise.all([
    fetchAll<Team>(supabase, "teams", "*", (q) => q.order("sort_order")),
    fetchAll<Venue>(supabase, "venues", "*", (q) => q.order("name")),
    fetchAll<Player>(supabase, "players", "*", (q) => q.order("full_name")),
    fetchAll<Formation>(supabase, "formations", "*", (q) => q.order("sort_order")),
    fetchAll<Match>(supabase, "matches", "*", (q) => q.order("kickoff_at", { ascending: false })),
    fetchAll<MatchPlayer>(supabase, "match_players", "match_id,player_id,team_id,called,participated,lineup_position,brought_by_id,attendance"),
    fetchAll<Goal>(supabase, "goals", "*", (q) => q.order("seq")),
    fetchAll<GkSpell>(supabase, "goalkeeper_spells", "*", (q) => q.order("seq")),
    fetchAll<MatchMvp>(supabase, "match_mvps"),
  ]);
  return {
    teams, venues, players, formations, matches, matchPlayers, goals, spells, mvps,
    teamById: new Map(teams.map((t) => [t.id, t])),
    venueById: new Map(venues.map((v) => [v.id, v])),
    playerById: new Map(players.map((p) => [p.id, p])),
    formationById: new Map(formations.map((f) => [f.id, f])),
    matchById: new Map(matches.map((m) => [m.id, m])),
  };
});
