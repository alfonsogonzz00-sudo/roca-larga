import { recalcAction, purgeDemoAction } from "@/app/actions/admin";
import { Card, Notice, PageHeader, SectionTitle, Stat } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/ui/client";
import { createClient } from "@/lib/supabase/server";
import { getStats } from "@/lib/data/stats";
import { env } from "@/lib/env";
import { serverEnv } from "@/lib/server-env";

export default async function AdminHome() {
  const supabase = await createClient();
  const { ds } = await getStats();
  const [{ data: users }, { data: pending }, { count: notifPending }, { count: subs }, { data: push }] = await Promise.all([
    supabase.rpc("admin_list_users"),
    supabase.rpc("pending_link_requests"),
    supabase.from("notifications").select("*", { count: "exact", head: true }).eq("status", "pending"),
    supabase.from("push_subscriptions").select("*", { count: "exact", head: true }),
    supabase.rpc("push_config_status"),
  ]);
  const ps = (push ?? {}) as { vapid?: boolean; secret?: boolean; app_url?: boolean; cron?: boolean };
  const demo = ds.matches.filter((m) => m.is_demo).length + ds.players.filter((p) => p.is_demo).length + ds.venues.filter((v) => v.is_demo).length;
  const checks = [
    { ok: Boolean(ps.vapid || (env.vapidPublicKey && serverEnv.vapidPrivateKey)), label: "Notificaciones push (Notificaciones → Activar)" },
    { ok: Boolean(ps.secret && ps.app_url && ps.cron), label: "Envío automático de avisos" },
    { ok: ds.venues.length > 0, label: "Estadios dados de alta" },
    { ok: ds.teams.every((t) => t.headquarters), label: "Sedes de los equipos" },
  ];
  return (
    <div className="space-y-6">
      <PageHeader title="Administración" />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Usuarios" value={users?.length ?? 0} />
        <Stat label="Solicitudes" value={pending?.length ?? 0} hint="pendientes de validar" />
        <Stat label="Partidos" value={ds.matches.length} />
        <Stat label="Dispositivos push" value={subs ?? 0} hint={`${notifPending ?? 0} avisos en cola`} />
      </div>
      <section>
        <SectionTitle>Puesta a punto</SectionTitle>
        <Card className="divide-y divide-line">
          {checks.map((c) => (
            <div key={c.label} className="flex min-h-11 items-center justify-between px-4 text-sm"><span>{c.label}</span><span className={c.ok ? "text-win" : "text-gold"}>{c.ok ? "✓ Listo" : "Pendiente"}</span></div>
          ))}
        </Card>
      </section>
      <section className="grid gap-3 sm:grid-cols-2">
        <Card className="space-y-2 p-4">
          <div className="font-semibold">Recalcular</div>
          <p className="text-sm text-ink-2">Las estadísticas se calculan siempre al vuelo desde los datos de cada partido. Esto vuelve a contar las votaciones cerradas (útil tras cambiar la puntuación 3-2-1 o el desempate).</p>
          <ActionForm action={recalcAction}><SubmitButton variant="secondary">Recalcular recuentos</SubmitButton></ActionForm>
        </Card>
        <Card className="space-y-2 p-4">
          <div className="font-semibold">Datos de demostración</div>
          <p className="text-sm text-ink-2">{demo ? `Hay ${demo} registros marcados como demostración.` : "No hay datos de demostración."}</p>
          {demo > 0 && <ActionForm action={purgeDemoAction} confirm="¿Eliminar todos los datos de demostración?"><SubmitButton variant="danger">Eliminar datos de prueba</SubmitButton></ActionForm>}
        </Card>
      </section>
      {(pending?.length ?? 0) > 0 && <Notice tone="warn">Hay solicitudes de vinculación esperando. Revísalas en Usuarios.</Notice>}
    </div>
  );
}
