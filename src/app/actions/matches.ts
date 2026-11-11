"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getTexts } from "@/lib/data/config";
import { friendlyError, type ActionResult } from "@/lib/errors";

const uuid = z.string().uuid();
const optUuid = z.union([uuid, z.literal(""), z.null()]).optional();
const side = z.object({
  players: z.array(uuid).default([]),
  guests: z.array(z.object({ player_id: uuid, brought_by_id: z.union([uuid, z.null()]).optional() })).default([]),
  positions: z.record(z.string(), z.string()).default({}),
});

const matchPayload = z.object({
  kickoff_at: z.string().datetime({ message: "Fecha u hora no válidas" }),
  venue_id: optUuid,
  home_team_id: uuid,
  away_team_id: uuid,
  home_formation_id: optUuid,
  away_formation_id: optUuid,
  forecast_weather: z.string().optional().nullable(),
  forecast_temp_c: z.union([z.number().min(-20).max(55), z.null()]).optional(),
  notes: z.string().max(2000).optional().nullable(),
  status: z.enum(["pending", "confirmed"]).optional(),
  exceptional_lineup: z.boolean().optional(),
  exceptional_reason: z.string().max(500).optional().nullable(),
  home: side,
  away: side,
}).refine((p) => p.home_team_id !== p.away_team_id, { message: "Local y visitante deben ser distintos" });

const goal = z.object({
  team_id: uuid,
  scorer_id: optUuid,
  assist_id: optUuid,
  conceded_gk_id: optUuid,
  minute: z.union([z.number().int().min(0).max(200), z.null()]).optional(),
  is_own_goal: z.boolean().optional(),
});
const resultPayload = z.object({
  home_score: z.number().int().min(0).max(99),
  away_score: z.number().int().min(0).max(99),
  home: side,
  away: side,
  goals: z.array(goal).max(198),
  gk_spells: z.array(z.object({ team_id: uuid, player_id: uuid, start_minute: z.union([z.number().int(), z.null()]).optional(), end_minute: z.union([z.number().int(), z.null()]).optional() })).max(80),
  actual_weather: z.string().optional().nullable(),
  actual_temp_c: z.union([z.number().min(-20).max(55), z.null()]).optional(),
  incidents: z.string().max(2000).optional().nullable(),
  final_notes: z.string().max(2000).optional().nullable(),
  manual_mvp_ids: z.array(uuid).max(3).optional(),
});

function parseJson<T extends z.ZodTypeAny>(schema: T, fd: FormData): z.infer<T> | string {
  try {
    const r = schema.safeParse(JSON.parse(String(fd.get("payload") ?? "{}")));
    return r.success ? r.data : r.error.issues[0].message;
  } catch {
    return "Datos del formulario no válidos";
  }
}

function revalidateAll() {
  revalidatePath("/", "layout");
}

export async function createMatchAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const p = parseJson(matchPayload, fd);
  if (typeof p === "string") return { ok: false, error: p };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_match", { p });
  if (error) return { ok: false, error: friendlyError(error) };
  revalidateAll();
  redirect(`/partidos/${data}?ok=created`);
}

export async function updateMatchAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const id = uuid.safeParse(fd.get("id"));
  if (!id.success) return { ok: false, error: "Partido no válido" };
  const p = parseJson(matchPayload, fd);
  if (typeof p === "string") return { ok: false, error: p };
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_match", { p_id: id.data, p });
  if (error) return { ok: false, error: friendlyError(error) };
  revalidateAll();
  redirect(`/partidos/${id.data}?ok=updated`);
}

export async function setMatchStatusAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const id = uuid.safeParse(fd.get("id"));
  const status = z.enum(["pending", "confirmed", "postponed", "cancelled"]).safeParse(fd.get("status"));
  if (!id.success || !status.success) return { ok: false, error: "Datos no válidos" };
  const newKick = String(fd.get("new_kickoff") ?? "");
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_match_status", {
    p_id: id.data, p_status: status.data, p_reason: String(fd.get("reason") ?? "") || null, p_new_kickoff: newKick || null,
  });
  if (error) return { ok: false, error: friendlyError(error) };
  revalidateAll();
  const t = await getTexts();
  const msg = { confirmed: "Partido confirmado. Avisos enviados a los convocados.", postponed: t("match.postponed"), cancelled: t("match.cancelled"), pending: "Partido devuelto a pendiente." }[status.data];
  return { ok: true, message: msg };
}

export async function finalizeMatchAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const id = uuid.safeParse(fd.get("id"));
  if (!id.success) return { ok: false, error: "Partido no válido" };
  const p = parseJson(resultPayload, fd);
  if (typeof p === "string") return { ok: false, error: p };
  const supabase = await createClient();
  const { error } = await supabase.rpc("finalize_match", { p_id: id.data, p });
  if (error) return { ok: false, error: friendlyError(error) };
  revalidateAll();
  redirect(`/partidos/${id.data}?ok=finalized`);
}

export async function createHistoricalAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const meta = z.object({
    kickoff_at: z.string().datetime(), venue_id: optUuid, home_team_id: uuid, away_team_id: uuid,
    home_formation_id: optUuid, away_formation_id: optUuid, notes: z.string().max(2000).optional().nullable(),
  });
  const p = parseJson(resultPayload.and(meta), fd);
  if (typeof p === "string") return { ok: false, error: p };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_historical_match", { p });
  if (error) return { ok: false, error: friendlyError(error) };
  revalidateAll();
  redirect(`/partidos/${data}?ok=historical`);
}

export async function updateHistoricalMetaAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const id = uuid.safeParse(fd.get("id"));
  if (!id.success) return { ok: false, error: "Partido no válido" };
  let p: Record<string, unknown>;
  try { p = JSON.parse(String(fd.get("payload"))); } catch { return { ok: false, error: "Datos no válidos" }; }
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_historical_meta", { p_id: id.data, p });
  if (error) return { ok: false, error: friendlyError(error) };
  revalidateAll();
  return { ok: true, message: "Datos actualizados." };
}

export async function deleteMatchAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const id = uuid.safeParse(fd.get("id"));
  if (!id.success) return { ok: false, error: "Partido no válido" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_match", { p_id: id.data });
  if (error) return { ok: false, error: friendlyError(error) };
  revalidateAll();
  redirect("/?ok=deleted");
}

/** Crea (o reutiliza) un invitado y devuelve su id. Llamada directa desde el formulario. */
export async function createGuestAction(name: string): Promise<ActionResult<{ id: string; name: string }>> {
  const n = z.string().trim().min(2, "Escribe el nombre del invitado").max(80).safeParse(name);
  if (!n.success) return { ok: false, error: n.error.issues[0].message };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_guest", { p_name: n.data });
  if (error) return { ok: false, error: friendlyError(error) };
  return { ok: true, data: { id: data as string, name: n.data } };
}
