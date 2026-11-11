"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getTexts } from "@/lib/data/config";
import { friendlyError, type ActionResult } from "@/lib/errors";

export async function castVoteAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const schema = z.object({ match: z.string().uuid(), first: z.string().uuid("Elige tu 1.º"), second: z.string().uuid("Elige tu 2.º"), third: z.string().uuid("Elige tu 3.º") });
  const p = schema.safeParse({ match: fd.get("match_id"), first: fd.get("first"), second: fd.get("second"), third: fd.get("third") });
  if (!p.success) return { ok: false, error: p.error.issues[0].message };
  if (new Set([p.data.first, p.data.second, p.data.third]).size !== 3) return { ok: false, error: "No puedes repetir jugador." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("cast_mvp_vote", { p_match: p.data.match, p_first: p.data.first, p_second: p.data.second, p_third: p.data.third });
  if (error) return { ok: false, error: friendlyError(error) };
  revalidatePath("/", "layout");
  const t = await getTexts();
  return { ok: true, message: t(data === "updated" ? "vote.updated" : "vote.cast") };
}
