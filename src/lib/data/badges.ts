import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { Session } from "./session";
import { getPendingVoteIds } from "./votes";

/** Novedades que alimentan las burbujas rojas del menú (el «visto» se guarda en el móvil) */
export interface NavBadges { matches: string[]; votes: string[]; activity: string[] }

export const getNavBadges = cache(async (s: Session | null): Promise<NavBadges> => {
  const supabase = await createClient();
  const since = new Date(Date.now() - 14 * 864e5).toISOString();
  const [{ data: ms }, votes, act] = await Promise.all([
    // partidos próximos o recién jugados; el estado forma parte del id para avisar también de cambios
    supabase.from("matches").select("id,status,kickoff_at").gte("kickoff_at", since).in("status", ["pending", "confirmed", "played", "postponed", "cancelled"]).order("kickoff_at", { ascending: false }).limit(30),
    getPendingVoteIds(s),
    s ? supabase.rpc("public_activity", { p_before: null, p_limit: 30 }) : Promise.resolve({ data: [] as { id: number; actor_name: string | null }[] }),
  ]);
  const me = s?.profile.display_name ?? null;
  return {
    matches: (ms ?? []).map((m) => `${m.id}:${m.status}`),
    votes,
    activity: ((act.data ?? []) as { id: number; actor_name: string | null }[]).filter((a) => !me || a.actor_name !== me).map((a) => String(a.id)),
  };
});
