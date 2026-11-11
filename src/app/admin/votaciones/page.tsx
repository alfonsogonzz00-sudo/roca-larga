import Link from "next/link";
import { Card, EmptyState, PageHeader, Pill } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { getStats } from "@/lib/data/stats";
import { fmtDateTime, fmtShortDay, playerName } from "@/lib/format";

interface Receipt { player_id: string; player_name: string; first_voted_at: string; last_voted_at: string; changes: number }

export default async function AdminVotes() {
  const { ds } = await getStats();
  const supabase = await createClient();
  const ms = ds.matches.filter((m) => m.vote_enabled && ["confirmed", "played"].includes(m.status)).slice(0, 20);
  const data = await Promise.all(ms.map(async (m) => ({
    m,
    receipts: ((await supabase.rpc("vote_receipts", { p_match: m.id })).data ?? []) as Receipt[],
    log: (await supabase.from("activity_log").select("created_at,summary").eq("entity_id", m.id).eq("action", "vote.close").maybeSingle()).data,
  })));
  return (
    <div className="space-y-4">
      <PageHeader title="Votaciones" subtitle="Auditoría de participación. El contenido de cada papeleta no es accesible para nadie." />
      {data.length === 0 ? <EmptyState title="Sin votaciones" /> : data.map(({ m, receipts, log }) => {
        const participants = ds.matchPlayers.filter((x) => x.match_id === m.id && x.participated);
        const voted = new Set(receipts.map((r) => r.player_id));
        const open = !m.vote_closed_at && m.vote_opens_at && new Date(m.vote_opens_at) <= new Date();
        return (
          <Card key={m.id} className="space-y-2 p-4 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Link href={`/partidos/${m.id}`} className="font-semibold">{ds.teamById.get(m.home_team_id)?.short_name} vs {ds.teamById.get(m.away_team_id)?.short_name} · {fmtShortDay(m.kickoff_at)}</Link>
              <Pill tone={m.vote_closed_at ? "neutral" : open ? "gold" : "pitch"}>{m.vote_closed_at ? "Cerrada" : open ? "Abierta" : "Programada"}</Pill>
            </div>
            <div className="text-xs text-ink-3">Abre {m.vote_opens_at && fmtDateTime(m.vote_opens_at)} · cierra {m.vote_closes_at && fmtDateTime(m.vote_closes_at)}{log ? ` · ${log.summary}` : ""}</div>
            <div>Participación: <strong>{receipts.length}</strong> de {participants.length}</div>
            <ul className="grid gap-1 sm:grid-cols-2">
              {participants.map((p) => {
                const r = receipts.find((x) => x.player_id === p.player_id);
                return <li key={p.player_id} className="flex justify-between gap-2 text-xs"><span>{playerName(ds.playerById.get(p.player_id), "short")}</span><span className={voted.has(p.player_id) ? "text-win" : "text-ink-3"}>{r ? `✓ ${fmtDateTime(r.first_voted_at)}${r.changes ? ` · ${r.changes} cambio(s)` : ""}` : "sin votar"}</span></li>;
              })}
            </ul>
          </Card>
        );
      })}
    </div>
  );
}
