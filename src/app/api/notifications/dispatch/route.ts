import { NextResponse, type NextRequest } from "next/server";
import * as webpush from "web-push";
import { createAnonClient } from "@/lib/supabase/server";
import { serverEnv } from "@/lib/server-env";
import { env } from "@/lib/env";

/**
 * Despachador de notificaciones push.
 * Lo despierta pg_cron (cada minuto, sólo si hay avisos pendientes) o Vercel Cron.
 * Seguridad: exige el secreto compartido; la BD vuelve a comprobarlo antes de entregar datos.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface Row { notification_id: string; user_id: string; title: string; body: string; url: string | null; type: string; subscription_id: string | null; endpoint: string | null; p256dh: string | null; auth: string | null }

async function handle(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "");
  const allowed = [serverEnv.dispatchSecret, process.env.CRON_SECRET].filter(Boolean);
  if (!token || !allowed.includes(token)) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!serverEnv.dispatchSecret || !env.vapidPublicKey || !serverEnv.vapidPrivateKey) {
    return NextResponse.json({ error: "Faltan VAPID o NOTIFICATIONS_DISPATCH_SECRET" }, { status: 503 });
  }
  webpush.setVapidDetails(serverEnv.vapidSubject, env.vapidPublicKey, serverEnv.vapidPrivateKey);
  const supabase = createAnonClient();
  // Cierra votaciones vencidas también desde aquí (redundancia con pg_cron)
  await supabase.rpc("close_due_votes");
  const { data, error } = await supabase.rpc("claim_notifications", { p_secret: serverEnv.dispatchSecret, p_limit: 200 });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const byNotif = new Map<string, Row[]>();
  for (const r of (data ?? []) as Row[]) byNotif.set(r.notification_id, [...(byNotif.get(r.notification_id) ?? []), r]);

  const results = await Promise.all([...byNotif.entries()].map(async ([id, rows]) => {
    const subs = rows.filter((r) => r.endpoint);
    if (!subs.length) return { notification_id: id, ok: true, error: "Sin dispositivos suscritos" };
    const dead: string[] = [], okSubs: string[] = [];
    let anyOk = false, lastErr = "";
    await Promise.all(subs.map(async (r) => {
      try {
        await webpush.sendNotification(
          { endpoint: r.endpoint!, keys: { p256dh: r.p256dh!, auth: r.auth! } },
          JSON.stringify({ title: r.title, body: r.body, url: r.url ?? "/", tag: `${r.type}:${id}` }),
          { TTL: 60 * 60 * 12, urgency: r.type === "match_reminder" ? "high" : "normal" },
        );
        anyOk = true;
        okSubs.push(r.subscription_id!);
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) dead.push(r.subscription_id!);
        lastErr = `${status ?? ""} ${(e as Error).message}`.slice(0, 300);
      }
    }));
    return { notification_id: id, ok: anyOk || dead.length === subs.length, error: anyOk ? null : lastErr, dead_subscription_ids: dead, ok_subscription_ids: okSubs };
  }));

  if (results.length) await supabase.rpc("report_notifications", { p_secret: serverEnv.dispatchSecret, p_results: results });
  return NextResponse.json({ processed: results.length, delivered: results.filter((r) => r.ok).length });
}

export const POST = handle;
export const GET = handle;
