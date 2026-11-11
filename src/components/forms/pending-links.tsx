import { reviewLinkAction } from "@/app/actions/admin";
import { Card, EmptyState } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/ui/client";
import { fmtDateTime } from "@/lib/format";
import type { Team } from "@/lib/types";

export interface PendingLink { link_id: string; display_name: string | null; email: string | null; auth_provider: string | null; player_name: string; team_id: string; requested_nickname: string | null; created_at: string }

export function PendingLinks({ rows, teams }: { rows: PendingLink[]; teams: Map<string, Team> }) {
  if (!rows.length) return <EmptyState title="Sin solicitudes">No hay vinculaciones pendientes.</EmptyState>;
  return (
    <div className="space-y-2">
      {rows.map((r) => (
        <Card key={r.link_id} className="space-y-3 p-4">
          <div className="text-sm">
            <div><strong>{r.display_name ?? r.email}</strong> <span className="text-ink-3">({r.email} · {r.auth_provider === "google" ? "Google" : "email"})</span></div>
            <div>quiere ser <strong>{r.player_name}</strong> de {teams.get(r.team_id)?.name}{r.requested_nickname && <> con apodo «{r.requested_nickname}»</>}</div>
            <div className="text-xs text-ink-3">{fmtDateTime(r.created_at)}</div>
          </div>
          <div className="flex gap-2">
            <ActionForm action={reviewLinkAction}><input type="hidden" name="link_id" value={r.link_id} /><input type="hidden" name="decision" value="approve" /><SubmitButton>Aprobar</SubmitButton></ActionForm>
            <ActionForm action={reviewLinkAction}><input type="hidden" name="link_id" value={r.link_id} /><input type="hidden" name="decision" value="reject" /><SubmitButton variant="secondary">Rechazar</SubmitButton></ActionForm>
          </div>
        </Card>
      ))}
    </div>
  );
}
