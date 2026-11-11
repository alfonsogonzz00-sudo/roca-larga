"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/data/session";
import { friendlyError, type ActionResult } from "@/lib/errors";
import { FACTOR_KEYS } from "@/lib/types";

const str = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
};
const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Color no válido (usa #RRGGBB)");

async function admin() {
  const s = await getSession();
  if (!s?.isAdmin) throw new Error("Sólo el administrador");
  return createClient();
}
async function staff() {
  const s = await getSession();
  if (!s?.isStaff) throw new Error("Sólo administrador u organizadores");
  return createClient();
}
function done(message: string): ActionResult {
  revalidatePath("/", "layout");
  return { ok: true, message };
}
async function run(fn: () => Promise<{ error: unknown } | void>, message: string): Promise<ActionResult> {
  try {
    const r = await fn();
    if (r && r.error) return { ok: false, error: friendlyError(r.error) };
    return done(message);
  } catch (e) {
    return { ok: false, error: friendlyError(e) };
  }
}

// --- Vinculaciones ---------------------------------------------------------
export async function reviewLinkAction(_: ActionResult | null, fd: FormData) {
  const approve = fd.get("decision") === "approve";
  return run(async () => (await staff()).rpc("review_player_link", { p_link: String(fd.get("link_id")), p_approve: approve, p_note: str(fd, "note") }),
    approve ? "Vinculación aprobada." : "Solicitud rechazada.");
}

// --- Usuarios ------------------------------------------------------------
export async function setRoleAction(_: ActionResult | null, fd: FormData) {
  return run(async () => (await admin()).rpc("set_user_role", { p_user: String(fd.get("user_id")), p_role: String(fd.get("role")) }), "Rol actualizado.");
}
export async function setStatusAction(_: ActionResult | null, fd: FormData) {
  return run(async () => (await admin()).rpc("set_user_status", { p_user: String(fd.get("user_id")), p_status: String(fd.get("status")) }), "Estado actualizado.");
}
export async function linkUserAction(_: ActionResult | null, fd: FormData) {
  const player = str(fd, "player_id");
  return run(async () => player
    ? (await admin()).rpc("admin_link_player", { p_user: String(fd.get("user_id")), p_player: player })
    : (await admin()).rpc("admin_unlink_player", { p_user: String(fd.get("user_id")) }), player ? "Cuenta asociada." : "Cuenta desvinculada.");
}

// --- Jugadores -------------------------------------------------------------
const playerSchema = z.object({
  full_name: z.string().trim().min(2, "Nombre obligatorio").max(80),
  nickname: z.string().trim().max(30).nullable(),
  team_id: z.string().uuid().nullable(),
  usual_position: z.enum(["POR", "DEF", "MED", "DEL"]).nullable(),
  shirt_number: z.number().int().min(0).max(99).nullable(),
  photo_url: z.string().max(500).nullable(),
  bio: z.string().max(500).nullable(),
  active: z.boolean(),
});
export async function savePlayerAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const kind = fd.get("kind") === "guest" ? "guest" : "member";
  const p = playerSchema.safeParse({
    full_name: fd.get("full_name"), nickname: str(fd, "nickname"), team_id: kind === "guest" ? null : str(fd, "team_id"),
    usual_position: str(fd, "usual_position"), shirt_number: str(fd, "shirt_number") ? Number(fd.get("shirt_number")) : null,
    photo_url: str(fd, "photo_url"), bio: str(fd, "bio"), active: fd.get("active") === "on",
  });
  if (!p.success) return { ok: false, error: p.error.issues[0].message };
  if (kind === "member" && !p.data.team_id) return { ok: false, error: "Elige el equipo" };
  const id = str(fd, "id");
  return run(async () => {
    const sb = await admin();
    return id ? sb.from("players").update(p.data).eq("id", id) : sb.from("players").insert({ ...p.data, kind });
  }, id ? "Jugador actualizado." : "Jugador creado.");
}
export async function deletePlayerAction(_: ActionResult | null, fd: FormData) {
  return run(async () => (await admin()).from("players").delete().eq("id", String(fd.get("id"))), "Jugador eliminado.");
}

// --- Equipos ----------------------------------------------------------------
export async function saveTeamAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const p = z.object({
    name: z.string().trim().min(2).max(60), short_name: z.string().trim().min(2).max(30), full_name: z.string().max(120).nullable(),
    crest_url: z.string().max(500).nullable(), headquarters: z.string().max(200).nullable(), home_venue_id: z.string().uuid().nullable(),
    primary_color: hex, secondary_color: hex, founded_label: z.string().max(80).nullable(), description: z.string().max(1500).nullable(),
  }).safeParse({
    name: fd.get("name"), short_name: fd.get("short_name"), full_name: str(fd, "full_name"), crest_url: str(fd, "crest_url"),
    headquarters: str(fd, "headquarters"), home_venue_id: str(fd, "home_venue_id"), primary_color: fd.get("primary_color"),
    secondary_color: fd.get("secondary_color"), founded_label: str(fd, "founded_label"), description: str(fd, "description"),
  });
  if (!p.success) return { ok: false, error: p.error.issues[0].message };
  return run(async () => (await admin()).from("teams").update(p.data).eq("id", String(fd.get("id"))), "Equipo actualizado.");
}

// --- Estadios ------------------------------------------------------------------
export async function saveVenueAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const p = z.object({
    name: z.string().trim().min(2, "Nombre obligatorio").max(80), address: z.string().max(200).nullable(), city: z.string().max(80).nullable(),
    maps_url: z.string().url("Enlace de mapa no válido").max(500).nullable(), image_url: z.string().max(500).nullable(),
    surface: z.string().max(60).nullable(), notes: z.string().max(1000).nullable(), active: z.boolean(),
    phone: z.string().max(40).nullable(), phone_alt: z.string().max(120).nullable(),
    website: z.string().url("Web no válida").max(500).nullable(), booking_url: z.string().url("Enlace de reserva no válido").max(500).nullable(),
    pitch_info: z.string().max(200).nullable(), hours: z.string().max(200).nullable(),
  }).safeParse({
    name: fd.get("name"), address: str(fd, "address"), city: str(fd, "city"), maps_url: str(fd, "maps_url"), image_url: str(fd, "image_url"),
    surface: str(fd, "surface"), notes: str(fd, "notes"), active: fd.get("active") === "on",
    phone: str(fd, "phone"), phone_alt: str(fd, "phone_alt"), website: str(fd, "website"), booking_url: str(fd, "booking_url"),
    pitch_info: str(fd, "pitch_info"), hours: str(fd, "hours"),
  });
  if (!p.success) return { ok: false, error: p.error.issues[0].message };
  const id = str(fd, "id");
  return run(async () => {
    const sb = await admin();
    return id ? sb.from("venues").update(p.data).eq("id", id) : sb.from("venues").insert(p.data);
  }, id ? "Estadio actualizado." : "Estadio creado.").then((r) => { revalidatePath("/estadios", "layout"); return r; });
}
export async function deleteVenueAction(_: ActionResult | null, fd: FormData) {
  return run(async () => (await admin()).from("venues").delete().eq("id", String(fd.get("id"))), "Estadio eliminado.");
}

// --- Formaciones -------------------------------------------------------------
export async function saveFormationAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const raw = String(fd.get("name") ?? "").trim();
  const lines = raw.split("-").map((x) => Number(x));
  if (!lines.length || lines.some((x) => !Number.isInteger(x) || x < 1) || lines.reduce((a, b) => a + b, 0) !== 6) {
    return { ok: false, error: "La formación debe tener líneas que sumen 6 jugadores de campo (p. ej. 2-3-1)." };
  }
  return run(async () => (await admin()).from("formations").insert({ name: lines.join("-"), lines, sort_order: 50 }), "Formación añadida.");
}
export async function toggleFormationAction(_: ActionResult | null, fd: FormData) {
  return run(async () => (await admin()).from("formations").update({ active: fd.get("active") === "true" }).eq("id", String(fd.get("id"))), "Formación actualizada.");
}
export async function defaultFormationAction(_: ActionResult | null, fd: FormData) {
  return run(async () => {
    const sb = await admin();
    await sb.from("formations").update({ is_default: false }).eq("is_default", true);
    return sb.from("formations").update({ is_default: true, active: true }).eq("id", String(fd.get("id")));
  }, "Formación por defecto actualizada.");
}

// --- Textos --------------------------------------------------------------------
export async function saveTextAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const value = String(fd.get("value") ?? "").trim();
  if (!value) return { ok: false, error: "El texto no puede quedar vacío" };
  const variants = String(fd.get("variants") ?? "").split("\n").map((x) => x.trim()).filter(Boolean).slice(0, 20);
  return run(async () => (await admin()).from("ui_texts").update({ value, variants }).eq("key", String(fd.get("key"))), "Texto guardado.");
}
export async function resetTextAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const sb = await admin();
    const { data } = await sb.from("ui_texts").select("default_value").eq("key", String(fd.get("key"))).single();
    return sb.from("ui_texts").update({ value: data!.default_value, variants: [] }).eq("key", String(fd.get("key")));
  }, "Texto restaurado.");
}
export async function addTextAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const key = String(fd.get("key") ?? "").trim().toLowerCase();
  const value = String(fd.get("value") ?? "").trim();
  if (!/^[a-z0-9_.]+$/.test(key) || !value) return { ok: false, error: "Clave (minúsculas, puntos y guiones bajos) y texto obligatorios" };
  return run(async () => (await admin()).from("ui_texts").insert({ key, value, default_value: value, category: String(fd.get("category") || "personalizado") }), "Texto añadido.");
}

// --- Configuración -----------------------------------------------------------
export async function saveSettingAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const key = String(fd.get("key"));
  let value: unknown;
  try { value = JSON.parse(String(fd.get("value"))); } catch { return { ok: false, error: "Valor no válido" }; }
  const checks: Record<string, (v: unknown) => string | null> = {
    vote_tiebreak: (v) => Array.isArray(v) && v.every((x) => ["other_votes", "goal_contributions"].includes(x as string)) ? null : "Criterios no válidos",
    mvp_tie_fallback: (v) => (v === "shared" || v === "none" ? null : "Valor no válido"),
    performance_weights: (v) => typeof v === "object" && v && ["goal", "assist", "mvp", "team_best", "win", "draw", "guest_bonus"].every((k) => typeof (v as Record<string, unknown>)[k] === "number") ? null : "Faltan pesos",
    model_params: (v) => typeof v === "object" && v && Object.values(v).every((x) => typeof x === "number" && x >= 0) ? null : "Parámetros no válidos",
    app_name: (v) => (typeof v === "string" && v.length >= 2 && v.length <= 40 ? null : "Entre 2 y 40 caracteres"),
    app_tagline: (v) => (typeof v === "string" && v.length <= 80 ? null : "Máximo 80 caracteres"),
    organizers_per_team: (v) => (Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 6 ? null : "Entre 0 y 6"),
  };
  const err = checks[key]?.(value);
  if (err) return { ok: false, error: err };
  if (!checks[key]) return { ok: false, error: "Ajuste no editable" };
  return run(async () => (await admin()).from("app_settings").update({ value }).eq("key", key), "Ajuste guardado.");
}

export async function savePredictionConfigAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const weights = Object.fromEntries(FACTOR_KEYS.map((k) => [k, Number(fd.get(`w_${k}`) ?? 0)]));
  const enabled = Object.fromEntries(FACTOR_KEYS.map((k) => [k, fd.get(`e_${k}`) === "on"]));
  const id = str(fd, "id");
  const asNew = fd.get("as_new") === "1" || !id;
  return run(async () => (await admin()).rpc("save_prediction_config", {
    p_id: asNew ? null : id, p_name: String(fd.get("name") ?? ""), p_scope: String(fd.get("scope")), p_weights: weights, p_enabled: enabled,
    p_activate: fd.get("activate") === "on", p_notes: str(fd, "notes"),
  }), "Configuración guardada.");
}
export async function activateConfigAction(_: ActionResult | null, fd: FormData) {
  return run(async () => (await admin()).rpc("activate_prediction_config", { p_id: String(fd.get("id")) }), "Configuración activada.");
}
export async function deleteConfigAction(_: ActionResult | null, fd: FormData) {
  return run(async () => (await admin()).from("prediction_configs").delete().eq("id", String(fd.get("id"))), "Configuración eliminada.");
}

// --- Notificaciones ----------------------------------------------------------------
export async function saveNotificationTypeAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const lead = String(fd.get("lead_minutes") ?? "").split(",").map((x) => x.trim()).filter(Boolean).map(Number);
  if (lead.some((x) => !Number.isInteger(x) || x < 5 || x > 10080)) return { ok: false, error: "Antelaciones en minutos entre 5 y 10080, separadas por comas" };
  const title = String(fd.get("title_template") ?? "").trim(), body = String(fd.get("body_template") ?? "").trim();
  if (!title || !body) return { ok: false, error: "Título y texto obligatorios" };
  return run(async () => (await admin()).from("notification_types").update({
    enabled: fd.get("enabled") === "on", title_template: title, body_template: body, lead_minutes: lead,
  }).eq("type", String(fd.get("type"))), "Aviso guardado.");
}

// --- Mantenimiento ---------------------------------------------------------------
export async function recalcAction(): Promise<ActionResult> {
  return run(async () => (await admin()).rpc("admin_recalculate"), "Estadísticas y recuentos recalculados.");
}
export async function purgeDemoAction(): Promise<ActionResult> {
  return run(async () => (await admin()).rpc("admin_purge_demo_data"), "Datos de demostración eliminados.");
}

/** Genera las claves VAPID en el servidor y las guarda en la BD. Nunca se muestran ni salen del servidor. */
export async function enablePushAction(): Promise<ActionResult> {
  const webpush = await import("web-push");
  const keys = webpush.generateVAPIDKeys();
  const r = await run(async () => (await admin()).rpc("admin_set_vapid_keys", { p_public: keys.publicKey, p_private: keys.privateKey }), "Notificaciones activadas. Ya podéis activar los avisos en Perfil.");
  revalidatePath("/", "layout");
  return r;
}
