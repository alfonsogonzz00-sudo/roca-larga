import { enablePushAction, saveNotificationTypeAction } from "@/app/actions/admin";
import { Card, Field, Input, Notice, PageHeader, SectionTitle, Textarea } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/ui/client";
import { createClient } from "@/lib/supabase/server";
import { fmtDateTime } from "@/lib/format";

interface NT { type: string; label: string; enabled: boolean; title_template: string; body_template: string; lead_minutes: number[]; description: string | null }

export default async function AdminNotifications() {
  const supabase = await createClient();
  const [{ data: types }, { data: queue }, { data: status }, { count: subs }] = await Promise.all([
    supabase.from("notification_types").select("*").order("type"),
    supabase.from("notifications").select("id,type,title,status,scheduled_for,sent_at,error").order("created_at", { ascending: false }).limit(30),
    supabase.rpc("push_config_status"),
    supabase.from("push_subscriptions").select("*", { count: "exact", head: true }),
  ]);
  const st = (status ?? {}) as { vapid?: boolean; secret?: boolean; app_url?: boolean; cron?: boolean };
  const ready = Boolean(st.vapid && st.secret && st.app_url && st.cron);
  return (
    <div className="space-y-6">
      <PageHeader title="Avisos push" subtitle="Variables disponibles: {{dia}}, {{hora}}, {{estadio}}, {{local}}, {{visitante}}, {{partido}}, {{cierre}}, {{mvp}}, {{antelacion}}." />
      <Card className="space-y-3 p-4">
        <div className="flex items-center justify-between gap-2"><strong>Estado del servicio</strong><span className={ready ? "text-sm text-win" : "text-sm text-gold"}>{ready ? "✓ Funcionando" : "Sin activar"}</span></div>
        <ul className="space-y-1 text-sm text-ink-2">
          <li>{st.vapid ? "✓" : "·"} Claves de envío (VAPID)</li>
          <li>{st.secret ? "✓" : "·"} Secreto interno del despachador</li>
          <li>{st.app_url ? "✓" : "·"} Dirección de la app</li>
          <li>{st.cron ? "✓" : "·"} Tarea automática cada minuto</li>
          <li>{subs ?? 0} dispositivos con avisos activados</li>
        </ul>
        {!st.vapid ? (
          <ActionForm action={enablePushAction}><SubmitButton pendingLabel="Activando…">Activar notificaciones</SubmitButton></ActionForm>
        ) : (
          <details className="text-sm">
            <summary className="cursor-pointer text-ink-3">Regenerar claves</summary>
            <Notice tone="warn" className="my-2">Sólo si sospechas que las claves se han filtrado. Todos los dispositivos dejarán de recibir avisos hasta que cada uno los vuelva a activar en Perfil.</Notice>
            <ActionForm action={enablePushAction} confirm="¿Regenerar las claves? Todos tendrán que reactivar los avisos."><SubmitButton variant="danger">Regenerar claves</SubmitButton></ActionForm>
          </details>
        )}
        <p className="text-xs text-ink-3">Las claves se generan y guardan en el servidor; no se muestran en ningún sitio.</p>
      </Card>
      {((types ?? []) as NT[]).map((t) => (
        <Card key={t.type} className="p-4">
          <ActionForm action={saveNotificationTypeAction} className="space-y-3">
            <input type="hidden" name="type" value={t.type} />
            <div className="flex items-center justify-between gap-2"><strong>{t.label}</strong><label className="flex items-center gap-2 text-sm"><input type="checkbox" name="enabled" defaultChecked={t.enabled} className="h-5 w-5" /> Activado</label></div>
            {t.description && <p className="text-xs text-ink-3">{t.description}</p>}
            <Field label="Título" htmlFor={`tt-${t.type}`}><Input id={`tt-${t.type}`} name="title_template" defaultValue={t.title_template} required /></Field>
            <Field label="Texto" htmlFor={`tb-${t.type}`}><Textarea id={`tb-${t.type}`} name="body_template" defaultValue={t.body_template} required /></Field>
            {t.type === "match_reminder"
              ? <Field label="Antelación (minutos, separados por comas)" htmlFor="lead" hint="1440 = 24 h · 120 = 2 h"><Input id="lead" name="lead_minutes" defaultValue={t.lead_minutes.join(", ")} /></Field>
              : <input type="hidden" name="lead_minutes" value="" />}
            <SubmitButton>Guardar</SubmitButton>
          </ActionForm>
        </Card>
      ))}
      <section>
        <SectionTitle>Últimos avisos</SectionTitle>
        <Card className="divide-y divide-line text-sm">
          {(queue ?? []).length === 0 ? <p className="p-4 text-ink-3">Aún no se ha generado ningún aviso.</p> : (queue ?? []).map((n) => (
            <div key={n.id} className="flex flex-wrap justify-between gap-2 px-4 py-2"><span>{n.title}</span><span className="text-xs text-ink-3">{n.status} · {fmtDateTime(n.sent_at ?? n.scheduled_for)}{n.error ? ` · ${n.error}` : ""}</span></div>
          ))}
        </Card>
        <p className="mt-1 text-xs text-ink-3">Los avisos de partidos aplazados o cancelados se descartan automáticamente («skipped»).</p>
      </section>
    </div>
  );
}
