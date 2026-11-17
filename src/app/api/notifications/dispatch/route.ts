import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import * as webpush from "web-push";
import { createAnonClient } from "@/lib/supabase/server";
import { serverEnv } from "@/lib/server-env";
import { env } from "@/lib/env";

/**
 * Despachador de notificaciones push.
 * Lo despierta pg_cron (cada minuto, sólo si hay avisos pendientes) o Vercel Cron.
 * Seguridad: el secreto compartido vive en la BD (private.config); la BD lo comprueba antes de entregar nada.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Comparación en tiempo constante (no revela cuántos caracteres acierta un atacante) */
function sameSecret(a: string, b: string) {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Sólo se envía a servicios push reales (la BD ya lo exige; doble comprobación) */
const PUSH_HOST = /^(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9.-]+\.push\.apple\.com|[a-z0-9.-]+\.notify\.windows\.com)$/;
const isPushEndpoint = (e: string) => {
  try { const u = new URL(e); return u.protocol === "https:" && u.port === "" && PUSH_HOST.test(u.hostname); } catch { return false; }
};

interface Row { notification_id: string; user_id: string; title: string; body: string; url: string | null; type: string; subscription_id: string | null; endpoint: string | null; p256dh: string | null; auth: string | null }

async function handle(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  // El secreto lo envía pg_cron; la BD lo valida (ya no hace falta variable de entorno).
  // Compatibilidad: si existe NOTIFICATIONS_DISPATCH_SECRET y coincide con CRON_SECRET de Vercel, se usa ese.
  const secret = process.env.CRON_SECRET && sameSecret(token, process.env.CRON_SECRET) ? serverEnv.dispatchSecret : token;
  if (!secret) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const supabase = createAnonClient();
  const { data: cred, error: credErr } = await supabase.rpc("dispatch_credentials", { p_secret: secret });
  if (credErr) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const c = (cred as { vapid_public: string | null; vapid_private: string | null; subject: string }[] | null)?.[0];
  const pub = c?.vapid_public || env.vapidPublicKey;
  const priv = c?.vapid_private || serverEnv.vapidPrivateKey;
  if (!pub || !priv) return NextResponse.json({ error: "Notificaciones sin activar (Administración → Notificaciones)" }, { status: 503 });
  webpush.setVapidDetails(c?.subject || serverEnv.vapidSubject, pub, priv);
  // Cierra votaciones vencidas también desde aquí (redundancia con pg_cron)
  await supabase.rpc("close_due_votes");
  const { data, error } = await supabase.rpc("claim_notifications", { p_secret: secret, p_limit: 200 });
  if (error) {
    console.error("claim_notifications", error.message);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }

  const byNotif = new Map<string, Row[]>();
  for (const r of (data ?? []) as Row[]) byNotif.set(r.notification_id, [...(byNotif.get(r.notification_id) ?? []), r]);

  const results = await Promise.all([...byNotif.entries()].map(async ([id, rows]) => {
    const subs = rows.filter((r) => r.endpoint);
    if (!subs.length) return { notification_id: id, ok: true, error: "Sin dispositivos suscritos" };
    const dead: string[] = [], okSubs: string[] = [];
    let anyOk = false, lastErr = "";
    await Promise.all(subs.map(async (r) => {
      if (!isPushEndpoint(r.endpoint!)) { dead.push(r.subscription_id!); return; }
      try {
        await webpush.sendNotification(
          { endpoint: r.endpoint!, keys: { p256dh: r.p256dh!, auth: r.auth! } },
          JSON.stringify({ title: r.title, body: r.body, url: r.url ?? "/", tag: `${r.type}:${id}` }),
          { TTL: 60 * 60 * 12, urgency: r.type === "match_reminder" ? "high" : "normal", timeout: 10_000 },
        );
        anyOk = true;
        okSubs.push(r.subscription_id!);
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) dead.push(r.subscription_id!);
        // Al usuario sólo le llega una categoría; el detalle técnico queda en los registros del servidor
        console.error("push", status, (e as Error).message);
        lastErr = status ? `El servicio de avisos respondió ${status}` : "No se pudo contactar con el servicio de avisos";
      }
    }));
    return { notification_id: id, ok: anyOk || dead.length === subs.length, error: anyOk ? null : lastErr, dead_subscription_ids: dead, ok_subscription_ids: okSubs };
  }));

  if (results.length) await supabase.rpc("report_notifications", { p_secret: secret, p_results: results });
  return NextResponse.json({ processed: results.length, delivered: results.filter((r) => r.ok).length });
}

export const POST = handle;
export const GET = handle;
