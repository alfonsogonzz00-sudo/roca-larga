"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getTexts } from "@/lib/data/config";
import { friendlyError, type ActionResult } from "@/lib/errors";

export async function castVoteAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const schema = z.object({
    match: z.string().uuid(),
    team: z.string().uuid("Elige al mejor de tu equipo"),
    best: z.string().uuid("Elige al mejor del partido"),
  });
  const p = schema.safeParse({ match: fd.get("match_id"), team: fd.get("team_pick"), best: fd.get("match_pick") });
  if (!p.success) return { ok: false, error: p.error.issues[0].message };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("cast_mvp_vote", { p_match: p.data.match, p_team_pick: p.data.team, p_match_pick: p.data.best });
  if (error) return { ok: false, error: friendlyError(error) };
  revalidatePath("/", "layout");
  const t = await getTexts();
  return { ok: true, message: t(data === "updated" ? "vote.updated" : "vote.saved") };
}
