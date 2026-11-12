"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getTexts } from "@/lib/data/config";
import { getSession } from "@/lib/data/session";
import { friendlyError, type ActionResult } from "@/lib/errors";

const nick = z.string().trim().min(1, "Escribe tu apodo").max(30, "Máximo 30 caracteres");
const physical = z.object({
  height: z.coerce.number({ message: "Indica tu altura" }).int("La altura va en centímetros, sin decimales").min(140, "La altura debe estar entre 140 y 220 cm").max(220, "La altura debe estar entre 140 y 220 cm"),
  weight: z.coerce.number({ message: "Indica tu peso" }).min(40, "El peso debe estar entre 40 y 160 kg").max(160, "El peso debe estar entre 40 y 160 kg"),
  position: z.enum(["DEF", "MED", "DEL"], { message: "Elige tu posición" }),
});
const readPhysical = (fd: FormData) => physical.safeParse({
  height: fd.get("height_cm"), weight: String(fd.get("weight_kg") ?? "").replace(",", "."), position: fd.get("position"),
});

export async function requestLink(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const player = z.string().uuid("Elige tu nombre en la lista").safeParse(fd.get("player_id"));
  if (!player.success) return { ok: false, error: player.error.issues[0].message };
  const n = nick.safeParse(fd.get("nickname"));
  if (!n.success) return { ok: false, error: n.error.issues[0].message };
  const ph = readPhysical(fd);
  if (!ph.success) return { ok: false, error: ph.error.issues[0].message };
  const supabase = await createClient();
  const { error } = await supabase.rpc("request_player_link", {
    p_player: player.data, p_nickname: n.data, p_height: ph.data.height, p_weight: ph.data.weight, p_position: ph.data.position,
  });
  if (error) return { ok: false, error: friendlyError(error) };
  revalidatePath("/", "layout");
  redirect("/perfil");
}

export async function cancelLink(): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_my_link_request");
  if (error) return { ok: false, error: friendlyError(error) };
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function updateNickname(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const n = nick.safeParse(fd.get("nickname"));
  if (!n.success) return { ok: false, error: n.error.issues[0].message };
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_my_nickname", { p_nickname: n.data });
  if (error) return { ok: false, error: friendlyError(error) };
  revalidatePath("/", "layout");
  return { ok: true, message: (await getTexts())("profile.nickname_saved") };
}

export async function updatePrefs(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const keys = ["match_confirmed", "match_reminder", "vote_open", "mvp_result"];
  const prefs = Object.fromEntries(keys.map((k) => [k, fd.get(k) === "on"]));
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_my_notification_prefs", { p_prefs: prefs });
  if (error) return { ok: false, error: friendlyError(error) };
  revalidatePath("/perfil");
  return { ok: true, message: "Preferencias guardadas." };
}

export async function setAttendance(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const supabase = await createClient();
  const going = fd.get("going") === "yes";
  const { error } = await supabase.rpc("set_my_attendance", { p_match: String(fd.get("match_id")), p_going: going });
  if (error) return { ok: false, error: friendlyError(error) };
  revalidatePath("/", "layout");
  const t = await getTexts();
  return { ok: true, message: t(going ? "match.attendance_yes" : "match.attendance_no") };
}

/** Guarda la URL de la foto de perfil (la BD comprueba que esté en la carpeta del usuario) */
export async function setMyPhoto(url: string | null): Promise<ActionResult> {
  const s = await getSession();
  if (!s) return { ok: false, error: "Inicia sesión para cambiar tu foto." };
  if (url !== null && (typeof url !== "string" || url.length > 500)) return { ok: false, error: "Foto no válida" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_my_photo", { p_url: url });
  if (error) return { ok: false, error: friendlyError(error) };
  revalidatePath("/", "layout");
  return { ok: true, message: url ? "Foto actualizada." : "Foto eliminada." };
}

export async function updatePhysical(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const ph = readPhysical(fd);
  if (!ph.success) return { ok: false, error: ph.error.issues[0].message };
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_my_physical", { p_height: ph.data.height, p_weight: ph.data.weight, p_position: ph.data.position });
  if (error) return { ok: false, error: friendlyError(error) };
  revalidatePath("/", "layout");
  return { ok: true, message: "Datos físicos guardados." };
}

const KIT_COLOR = z.enum(["negro", "blanco", "rojo", "azul", "verde", "amarillo", "naranja", "rosa", "morado", "gris"]);
const kitInput = z.object({
  boots: KIT_COLOR,
  socks: KIT_COLOR,
  name: z.string().trim().toUpperCase().max(12, "El nombre de la espalda admite hasta 12 letras")
    .regex(/^[A-ZÁÉÍÓÚÜÑ .'-]*$/, "Sólo letras, espacios, puntos y guiones"),
  number: z.number().int().min(0).max(99).nullable(),
});

export async function saveKit(input: unknown): Promise<ActionResult> {
  const k = kitInput.safeParse(input);
  if (!k.success) return { ok: false, error: k.error.issues[0].message };
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_my_kit", {
    p_boots: k.data.boots === "negro" ? null : k.data.boots,
    p_socks: k.data.socks === "blanco" ? null : k.data.socks,
    p_back_name: k.data.name || null,
    p_number: k.data.number,
  });
  if (error) return { ok: false, error: friendlyError(error) };
  revalidatePath("/", "layout");
  return { ok: true, message: "¡Jugador guardado!" };
}
