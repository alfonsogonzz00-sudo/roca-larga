import Link from "next/link";
import { notFound } from "next/navigation";
import { Lock } from "lucide-react";
import { Card, Notice, PageHeader } from "@/components/ui";
import { Scoreboard } from "@/components/match/parts";
import { getStats } from "@/lib/data/stats";
import { getTexts } from "@/lib/data/config";
import { getSession } from "@/lib/data/session";
import { createClient } from "@/lib/supabase/server";
import { fmtDay, fmtTime, relativeFromNow, teamColor } from "@/lib/format";
import { Ballot } from "./ballot";
import { Hint } from "@/components/onboarding/hint";

export const metadata = { title: "Votar" };

export default async function VotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [{ ds, parts: allParts }, s, t] = await Promise.all([getStats(), getSession(), getTexts()]);
  const m = ds.matchById.get(id);
  if (!m) notFound();
  const supabase = await createClient();
  const { data: st } = await supabase.rpc("vote_status", { p_match: id }).maybeSingle<{ eligible: number; voted: number; is_open: boolean; closed_at: string | null }>();
  const parts = ds.matchPlayers.filter((x) => x.match_id === id && x.participated);
  const me = s?.player ? parts.find((x) => x.player_id === s.player!.id) : undefined;
  const isParticipant = Boolean(me);
  const { data: mine } = me ? await supabase.rpc("my_mvp_ballot", { p_match: id }).maybeSingle<{ team_pick_id: string; match_pick_id: string }>() : { data: null };
  const teams = [m.home_team_id, m.away_team_id].map((tid) => { const tm = ds.teamById.get(tid)!; return { id: tm.id, name: tm.name, color: teamColor(tm) }; });
  const candidates = parts.filter((x) => x.player_id !== s?.player?.id).map((x) => {
    const p = ds.playerById.get(x.player_id)!;
    const nota = allParts.find((q) => q.matchId === id && q.playerId === p.id)?.rating ?? null;
    return { id: p.id, name: p.full_name, nickname: p.nickname, photo: p.photo_url, teamId: x.team_id, rating: nota };
  });

  let body: React.ReactNode;
  if (!m.vote_enabled) body = <Notice>Este partido no tiene votación.</Notice>;
  else if (st?.closed_at) body = <Notice tone="info">{t("vote.closed")} <Link href={`/partidos/${id}`} className="font-semibold underline">Ver el MVP y el recuento</Link>.</Notice>;
  else if (!st?.is_open) body = <Notice tone="info">La votación se abre al empezar el partido ({fmtDay(m.kickoff_at)} a las {fmtTime(m.kickoff_at)}).</Notice>;
  else if (!s) body = <Notice tone="warn"><Link href={`/login?next=/votacion/${id}`} className="font-semibold underline">Inicia sesión</Link> para votar.</Notice>;
  else if (!s.player) body = <Notice tone="warn">Tu cuenta aún no está vinculada a un jugador validado.</Notice>;
  else if (!isParticipant) body = <Notice tone="warn">Sólo votan los jugadores que han participado en este partido.</Notice>;
  else body = (
    <Card className="space-y-4 p-4 pb-0">
      <Hint id="ballot" title="Dos votos, un minuto">Toca primero al mejor de tu equipo y después al mejor del partido. Puede ser la misma persona. Al final verás el resumen antes de confirmar.</Hint>
      <p className="flex items-start gap-2 text-sm text-ink-2"><Lock size={16} className="mt-0.5 shrink-0" aria-hidden />{t("vote.anonymous_note")}</p>
      {mine && <Notice tone="ok">Ya has votado. Puedes cambiar tu voto hasta el cierre.</Notice>}
      <Ballot matchId={id} myTeamId={me!.team_id} teams={teams} candidates={candidates}
        initial={mine ? { team: mine.team_pick_id, match: mine.match_pick_id } : null}
        labels={{ team: t("vote.team_pick"), match: t("vote.match_pick") }} />
    </Card>
  );

  return (
    <div className="space-y-5">
      <PageHeader eyebrow={t("vote.title")} title="¿Quién ha estado mejor?" subtitle={m.vote_closes_at && !st?.closed_at ? `Cierra el ${fmtDay(m.vote_closes_at)} a las ${fmtTime(m.vote_closes_at)} (${relativeFromNow(m.vote_closes_at)})` : undefined} />
      <Scoreboard m={m} home={ds.teamById.get(m.home_team_id)!} away={ds.teamById.get(m.away_team_id)!} venue={m.venue_id ? ds.venueById.get(m.venue_id) : undefined} />
      {st && <p className="text-sm text-ink-3">Han votado {st.voted} de {st.eligible} participantes.</p>}
      {body}
      <p className="text-xs text-ink-3">Cada participante vota dos veces: al mejor de su equipo y al mejor del partido (MVP). Gana quien más votos recibe en cada categoría; si hay empate, desempatan los votos de la otra categoría y después goles + asistencias. La votación cierra sola a las 12:00 del día siguiente al partido.</p>
    </div>
  );
}
