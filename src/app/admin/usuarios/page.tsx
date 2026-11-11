import { linkUserAction, setRoleAction, setStatusAction } from "@/app/actions/admin";
import { Card, PageHeader, Pill, SectionTitle, Select } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/ui/client";
import { PendingLinks, type PendingLink } from "@/components/forms/pending-links";
import { createClient } from "@/lib/supabase/server";
import { getStats } from "@/lib/data/stats";
import { getSession } from "@/lib/data/session";
import { fmtDateTime } from "@/lib/format";

interface U { id: string; email: string | null; display_name: string | null; auth_provider: string | null; role: string; status: string; player_id: string | null; player_name: string | null; team_id: string | null; created_at: string; last_seen_at: string | null }

export default async function Users() {
  const supabase = await createClient();
  const [{ ds }, s] = await Promise.all([getStats(), getSession()]);
  const [{ data: users }, { data: pending }] = await Promise.all([supabase.rpc("admin_list_users"), supabase.rpc("pending_link_requests")]);
  const linked = new Set((users as U[] ?? []).map((u) => u.player_id).filter(Boolean));
  const members = ds.players.filter((p) => p.kind === "member");
  return (
    <div className="space-y-6">
      <PageHeader title="Usuarios" subtitle="Vinculaciones, roles y accesos. El rol de administrador es único y se asigna por configuración segura." />
      <section><SectionTitle>Solicitudes de vinculación</SectionTitle><PendingLinks rows={(pending ?? []) as PendingLink[]} teams={ds.teamById} /></section>
      <section>
        <SectionTitle>Cuentas ({users?.length ?? 0})</SectionTitle>
        <div className="space-y-2">
          {(users as U[] ?? []).map((u) => {
            const self = u.id === s?.userId;
            return (
              <Card key={u.id} className="space-y-3 p-4">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <strong>{u.display_name ?? u.email}</strong><span className="text-ink-3">{u.email}</span>
                  <Pill tone={u.role === "admin" ? "gold" : u.role === "organizer" ? "pitch" : "neutral"}>{u.role === "admin" ? "Administrador" : u.role === "organizer" ? "Organizador" : "Jugador"}</Pill>
                  {u.status === "suspended" && <Pill tone="danger">Suspendido</Pill>}
                  <span className="text-xs text-ink-3">{u.auth_provider === "google" ? "Google" : "Email"} · alta {fmtDateTime(u.created_at)}{u.last_seen_at ? ` · visto ${fmtDateTime(u.last_seen_at)}` : ""}</span>
                </div>
                {!self && (
                  <div className="grid gap-2 sm:grid-cols-3">
                    <ActionForm action={linkUserAction} className="flex gap-2">
                      <input type="hidden" name="user_id" value={u.id} />
                      <Select name="player_id" defaultValue={u.player_id ?? ""} aria-label="Jugador vinculado" className="min-h-10">
                        <option value="">Sin jugador</option>
                        {members.filter((p) => p.id === u.player_id || !linked.has(p.id)).map((p) => <option key={p.id} value={p.id}>{p.full_name} ({ds.teamById.get(p.team_id!)?.short_name})</option>)}
                      </Select>
                      <SubmitButton variant="secondary" className="min-h-10">OK</SubmitButton>
                    </ActionForm>
                    {u.role !== "admin" && (
                      <ActionForm action={setRoleAction} className="flex gap-2">
                        <input type="hidden" name="user_id" value={u.id} />
                        <Select name="role" defaultValue={u.role} aria-label="Rol" className="min-h-10"><option value="player">Jugador</option><option value="organizer">Organizador</option></Select>
                        <SubmitButton variant="secondary" className="min-h-10">OK</SubmitButton>
                      </ActionForm>
                    )}
                    <ActionForm action={setStatusAction} confirm={u.status === "active" ? "¿Suspender esta cuenta?" : undefined}>
                      <input type="hidden" name="user_id" value={u.id} />
                      <input type="hidden" name="status" value={u.status === "active" ? "suspended" : "active"} />
                      <SubmitButton variant={u.status === "active" ? "ghost" : "secondary"} className="min-h-10">{u.status === "active" ? "Suspender" : "Reactivar"}</SubmitButton>
                    </ActionForm>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-ink-3">Máximo de organizadores por equipo configurable en Ajustes. Un organizador debe estar vinculado a un jugador de su equipo.</p>
      </section>
    </div>
  );
}
