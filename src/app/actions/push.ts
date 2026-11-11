"use server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/data/session";
import { friendlyError, type ActionResult } from "@/lib/errors";

const sub = z.object({ endpoint: z.string().url().max(2000), keys: z.object({ p256dh: z.string().max(200), auth: z.string().max(100) }) });

export async function savePushSubscription(input: unknown, userAgent: string): Promise<ActionResult> {
  const s = await getSession();
  if (!s) return { ok: false, error: "Inicia sesión para activar los avisos." };
  const p = sub.safeParse(input);
  if (!p.success) return { ok: false, error: "Suscripción no válida" };
  const supabase = await createClient();
  // Si el endpoint pertenecía a otra cuenta en este dispositivo, la RLS impide tocarlo: se borra antes con la cuenta actual si es suyo
  await supabase.from("push_subscriptions").delete().eq("endpoint", p.data.endpoint);
  const { error } = await supabase.from("push_subscriptions").insert({
    user_id: s.userId, endpoint: p.data.endpoint, p256dh: p.data.keys.p256dh, auth: p.data.keys.auth, user_agent: userAgent.slice(0, 300),
  });
  if (error) return { ok: false, error: friendlyError(error) };
  return { ok: true, message: "Avisos activados en este dispositivo." };
}

export async function removePushSubscription(endpoint: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
  if (error) return { ok: false, error: friendlyError(error) };
  return { ok: true, message: "Avisos desactivados en este dispositivo." };
}

export async function sendTestPush(): Promise<ActionResult> {
  const s = await getSession();
  if (!s) return { ok: false, error: "Inicia sesión para probar los avisos." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("send_test_notification");
  if (error) return { ok: false, error: friendlyError(error) };
  if (!data) return { ok: false, error: "No hay ningún dispositivo con avisos activados en tu cuenta. Desactiva y vuelve a activar los avisos aquí." };
  return { ok: true, message: "Aviso de prueba enviado: debería llegarte en menos de un minuto. Si no llega, revisa Ajustes → Notificaciones → Roca Larga y que no tengas un modo Concentración activo." };
}
