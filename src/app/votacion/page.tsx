import Link from "next/link";
import { Award, Vote } from "lucide-react";
import { Card, EmptyState, PageHeader, Pill, SectionTitle } from "@/components/ui";
import { getStats } from "@/lib/data/stats";
import { getTexts } from "@/lib/data/config";
import { getSession } from "@/lib/data/session";
import { getOpenVoteMatches } from "@/lib/data/votes";
import { createClient } from "@/lib/supabase/server";
import { fmtShortDay, playerName, relativeFromNow } from "@/lib/format";

export const metadata = { title: "Votación MVP" };

export default async function Votes() {
  const [{ ds }, s, t, open] = await Promise.all([getStats(), getSession(), getTexts(), getOpenVoteMatches()]);
  const supabase = await createClient();
  const myReceipts = s?.player ? new Set(((await supabase.from("mvp_vote_receipts").select("match_id").eq("player_id", s.player.id)).data ?? []).map((r) => r.match_id)) : new Set<string>();
  const closed = ds.matches.filter((m) => m.vote_closed_at).sort((a, b) => b.kickoff_at.localeCompare(a.kickoff_at)).slice(0, 15);
  const label = (mid: string) => {
    const m = ds.matchById.get(mid)!;
    return `${ds.teamById.get(m.home_team_id)?.short_name} vs ${ds.teamById.get(m.away_team_id)?.short_name}`;
  };
  return (
    <div className="space-y-8">
      <PageHeader title={t("vote.title")} subtitle="Votación conjunta, anónima y con cierre automático 24 h después del inicio." />
      <section>
        <SectionTitle>Abiertas ahora</SectionTitle>
        {open.length === 0 ? <EmptyState title="Urnas vacías">{t("vote.none_open")}</EmptyState> : (
          <div className="space-y-2">
            {open.map((m) => {
              const participant = s?.player && ds.matchPlayers.some((x) => x.match_id === m.id && x.player_id === s.player!.id && x.participated);
              const voted = myReceipts.has(m.id);
              return (
                <Link key={m.id} href={`/votacion/${m.id}`} className="block">
                  <Card className="flex items-center gap-3 p-4 hover:border-line-strong">
                    <Vote className="text-gold" aria-hidden />
                    <div className="flex-1">
                      <div className="font-semibold">{label(m.id)} · {fmtShortDay(m.kickoff_at)}</div>
                      <div className="text-xs text-ink-3">Cierra {relativeFromNow(m.vote_closes_at!)}</div>
                    </div>
                    {participant ? (voted ? <Pill tone="pitch">Votado</Pill> : <Pill tone="gold">Te falta votar</Pill>) : <Pill>Ver</Pill>}
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </section>
      <section>
        <SectionTitle>Últimos MVP</SectionTitle>
        {closed.length === 0 ? <p className="text-sm text-ink-3">Todavía no se ha cerrado ninguna votación.</p> : (
          <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
            {closed.map((m) => {
              const mv = ds.mvps.filter((x) => x.match_id === m.id);
              return (
                <li key={m.id}>
                  <Link href={`/partidos/${m.id}`} className="flex min-h-14 items-center gap-3 px-4 py-2">
                    <Award size={18} className={mv.length ? "text-gold" : "text-ink-3"} aria-hidden />
                    <div className="flex-1">
                      <div className="text-sm font-semibold">{mv.length ? mv.map((x) => playerName(ds.playerById.get(x.player_id), "short")).join(" y ") : "Sin MVP"}</div>
                      <div className="text-xs text-ink-3">{label(m.id)} · {fmtShortDay(m.kickoff_at)}</div>
                    </div>
                    {myReceipts.has(m.id) && <span className="text-xs text-ink-3">Votaste</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
