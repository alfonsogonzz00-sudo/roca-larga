"use server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/data/session";
import { modelContext } from "@/lib/data/stats";
import { predictIndividual, predictMatch, type IndividualPrediction, type MatchPrediction } from "@/lib/stats/model";
import { madridLocalToIso } from "@/lib/format";
import type { Weather } from "@/lib/types";

const uuid = z.string().uuid();
const base = z.object({
  venue_id: z.union([uuid, z.literal("")]),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Indica la fecha"),
  time: z.string().regex(/^\d{2}:\d{2}$/, "Indica la hora"),
  weather: z.enum(["", "despejado", "nublado", "lluvia", "viento", "niebla", "otro"]),
  temp: z.union([z.number().min(-20).max(55), z.null()]),
});

type R<T> = { ok: true; data: T } | { ok: false; error: string };

export async function simulateMatchAction(input: unknown): Promise<R<MatchPrediction>> {
  const s = await getSession();
  if (!s) return { ok: false, error: "Inicia sesión para usar los simuladores." };
  const p = base.extend({ home_team_id: uuid, away_team_id: uuid, home_players: z.array(uuid).max(12), away_players: z.array(uuid).max(12) }).safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0].message };
  const d = p.data;
  if (d.home_team_id === d.away_team_id) return { ok: false, error: "Elige dos equipos distintos" };
  const ctx = await modelContext("simulation");
  const pred = predictMatch({
    homeTeamId: d.home_team_id, awayTeamId: d.away_team_id, homePlayers: d.home_players, awayPlayers: d.away_players,
    venueId: d.venue_id || null, kickoff: madridLocalToIso(d.date, d.time), weather: (d.weather || null) as Weather | null, temp: d.temp,
  }, ctx);
  const supabase = await createClient();
  await supabase.from("simulation_runs").insert({ user_id: s.userId, kind: "match", input: d, output: { ...pred, players: pred.players.slice(0, 20) } });
  return { ok: true, data: pred };
}

export async function simulateIndividualAction(input: unknown): Promise<R<IndividualPrediction>> {
  const s = await getSession();
  if (!s) return { ok: false, error: "Inicia sesión para usar los simuladores." };
  const p = base.extend({ team_id: uuid, player_id: uuid, teammates: z.array(uuid).max(11), rivals: z.array(uuid).max(12) }).safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0].message };
  const d = p.data;
  const ctx = await modelContext("simulation");
  const pred = predictIndividual({
    playerId: d.player_id, teamId: d.team_id, teammates: d.teammates.filter((x) => x !== d.player_id), rivals: d.rivals,
    venueId: d.venue_id || null, kickoff: madridLocalToIso(d.date, d.time), weather: (d.weather || null) as Weather | null, temp: d.temp,
  }, ctx);
  const supabase = await createClient();
  await supabase.from("simulation_runs").insert({ user_id: s.userId, kind: "individual", input: d, output: pred });
  return { ok: true, data: pred };
}
