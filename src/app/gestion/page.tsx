import Link from "next/link";
import { ButtonLink, Card, PageHeader, SectionTitle } from "@/components/ui";
import { PendingLinks, type PendingLink } from "@/components/forms/pending-links";
import { requireStaff } from "@/lib/data/session";
import { createClient } from "@/lib/supabase/server";
import { getStats } from "@/lib/data/stats";
import { fmtDateTime, fmtShortDay } from "@/lib/format";

export const metadata = { title: "Gestión" };

export default async function Management() {
  const s = await requireStaff();
  const supabase = await createClient();
  const { ds } = await getStats();
  const [{ data: pending }, { data: log }] = await Promise.all([
    supabase.rpc("pending_link_requests"),
    supabase.from("activity_log").select("id,created_at,actor_name,summary,entity_type,entity_id").order("created_at", { ascending: false }).limit(40),
  ]);
  const recent = ds.matches.filter((m) => m.vote_enabled && (m.status === "played" || m.status === "confirmed")).slice(0, 5);
  const receipts = await Promise.all(recent.map(async (m) => (await supabase.rpc("vote_receipts", { p_match: m.id })).data as { player_name: string }[] | null));
  return (
    <div className="space-y-6">
      <PageHeader eyebrow={s.isAdmin ? "Administrador" : "Organizador"} title="Gestión" action={<ButtonLink href="/partidos/nuevo">Nuevo partido</ButtonLink>} />
      <div className="flex flex-wrap gap-2">
        <ButtonLink href="/partidos/nuevo?historico=1" variant="secondary">Registrar partido histórico</ButtonLink>
        {s.isAdmin && <ButtonLink href="/admin" variant="secondary">Administración</ButtonLink>}
      </div>
      <section><SectionTitle>Solicitudes de tu equipo</SectionTitle><PendingLinks rows={(pending ?? []) as PendingLink[]} teams={ds.teamById} /></section>
      <section>
        <SectionTitle>Participación en votaciones</SectionTitle>
        <div className="space-y-2">
          {recent.map((m, i) => {
            const rc = receipts[i];
            const elig = ds.matchPlayers.filter((x) => x.match_id === m.id && x.participated).length;
            return (
              <Card key={m.id} className="p-3 text-sm">
                <Link href={`/partidos/${m.id}`} className="font-semibold">{ds.teamById.get(m.home_team_id)?.short_name} vs {ds.teamById.get(m.away_team_id)?.short_name} · {fmtShortDay(m.kickoff_at)}</Link>
                <div className="text-xs text-ink-3">Han votado {rc?.length ?? 0} de {elig}{m.vote_closed_at ? " · cerrada" : ""}</div>
                {rc?.length ? <div className="mt-1 text-xs text-ink-2">{rc.map((r) => r.player_name).join(", ")}</div> : null}
              </Card>
            );
          })}
        </div>
        <p className="mt-1 text-xs text-ink-3">Se ve quién ha votado, nunca a quién.</p>
      </section>
      <section>
        <SectionTitle>Actividad reciente</SectionTitle>
        <Card className="p-4">
          <ol className="space-y-2 text-sm">
            {(log ?? []).map((a) => <li key={a.id}><span className="tabular text-ink-3">{fmtDateTime(a.created_at)}</span> · <strong>{a.actor_name}</strong> {a.summary.charAt(0).toLowerCase() + a.summary.slice(1)}</li>)}
          </ol>
        </Card>
      </section>
    </div>
  );
}
