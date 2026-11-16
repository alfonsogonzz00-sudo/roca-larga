"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { friendlyError, type ActionResult } from "@/lib/errors";

const schema = z.object({ match: z.string().uuid(), player: z.string().uuid(), paid: z.boolean() });

/** Marca o desmarca que un jugador ha pagado su parte del partido */
export async function setPaymentAction(match: string, player: string, paid: boolean): Promise<ActionResult> {
  const p = schema.safeParse({ match, player, paid });
  if (!p.success) return { ok: false, error: "Datos no válidos" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_payment", { p_match: p.data.match, p_player: p.data.player, p_paid: p.data.paid });
  if (error) return { ok: false, error: friendlyError(error) };
  revalidatePath(`/partidos/${p.data.match}`);
  return { ok: true };
}
