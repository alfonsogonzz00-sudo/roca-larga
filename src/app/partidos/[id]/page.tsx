import Link from "next/link";
import { notFound } from "next/navigation";
import { Award, Vote } from "lucide-react";
import { Card, Details, Notice, Pill, SectionTitle } from "@/components/ui";
import { Tabs } from "@/components/ui/client";
import { PlayerChipList, PredictionPanel, StatusPill, WeatherBadge, VenueCard } from "@/components/match/parts";
import { StaffActions } from "@/components/match/staff-actions";
import { AttendanceButtons } from "@/components/match/attendance";
import { LineupPitch } from "@/components/match/lineup-pitch";
import { MatchHeader, type ScorerLine } from "@/components/match/match-header";
import { Hint } from "@/components/onboarding/hint";
import { getStats, predictionForMatch } from "@/lib/data/stats";
import { getTexts } from "@/lib/data/config";
import { getSession } from "@/lib/data/session";
import { createClient } from "@/lib/supabase/server";
import { fmtDateTime, fmtDay, fmtTime, nowMs, playerName, teamColor } from "@/lib/format";
import type { MvpTally, Player } from "@/lib/types";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ds } = await getStats();
  const m = ds.matchById.get(id);
  if (!m) return { title: "Partido" };
  return { title: `${ds.teamById.get(m.home_team_id)?.short_name} vs ${ds.teamById.get(m.away_team_id)?.short_name}` };
}

const OK: Record<string, string> = { created: "match.created", updated: "match.updated", finalized: "match.finalized", historical: "match.finalized" };

export default async function MatchPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string }> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const [{ ds, parts }, s, t] = await Promise.all([getStats(), getSession(), getTexts()]);
  const m = ds.matchById.get(id);
  if (!m) notFound();
  const home = ds.teamById.get(m.home_team_id)!;
  const away = ds.teamById.get(m.away_team_id)!;
  const venue = m.venue_id ? ds.venueById.get(m.venue_id) : undefined;
  const played = m.status === "played";
  const mps = ds.matchPlayers.filter((x) => x.match_id === m.id);
  const goals = ds.goals.filter((g) => g.match_id === m.id);
  const mvps = ds.mvps.filter((x) => x.match_id === m.id);
  const bests = ds.teamBests.filter((x) => x.match_id === m.id);
  const P = (pid: string) => ds.playerById.get(pid)!;
  const supabase = await createClient();
  const [{ data: tallies }, { data: vstatus }] = await Promise.all([
    supabase.from("mvp_tallies").select("*").eq("match_id", m.id).order("rank"),
    supabase.rpc("vote_status", { p_match: m.id }).maybeSingle<{ eligible: number; voted: number; is_open: boolean; closed_at: string | null }>(),
  ]);
  const activity = s?.isStaff ? (await supabase.from("activity_log").select("created_at,actor_name,summary").eq("entity_type", "match").eq("entity_id", m.id).order("created_at", { ascending: false }).limit(30)).data ?? [] : [];
  const pred = await predictionForMatch(m);
  const started = new Date(m.kickoff_at).getTime() <= nowMs();
  const mine = s?.player ? mps.find((x) => x.player_id === s.player!.id && x.called) : undefined;
  const ratingOf = new Map(parts.filter((p) => p.matchId === m.id).map((p) => [p.playerId, p.rating]));

  const sideList = (teamId: string) => {
    const rows = mps.filter((x) => x.team_id === teamId && (played ? x.participated : x.called));
    return rows.map((x) => {
      const p = P(x.player_id);
      const bringer = x.brought_by_id ? ds.playerById.get(x.brought_by_id) : null;
      const g = goals.filter((gg) => gg.scorer_id === x.player_id && !gg.is_own_goal).length;
      const a = goals.filter((gg) => gg.assist_id === x.player_id).length;
      const notes = [
        p.kind === "guest" ? `Invitado${bringer ? ` de ${playerName(bringer, "short")}` : ""}` : null,
        played && g ? `${g} ${g === 1 ? "gol" : "goles"}` : null,
        played && a ? `${a} asist.` : null,
        played && ratingOf.has(x.player_id) ? `nota ${ratingOf.get(x.player_id)!.toFixed(1).replace(".", ",")}` : null,
      ].filter(Boolean).join(" · ");
      return { player: p, position: x.lineup_position, note: notes || undefined, attendance: played ? undefined : x.attendance };
    });
  };

  const pitchSide = (tm: typeof home) => {
    const fid = tm.id === home.id ? m.home_formation_id : m.away_formation_id;
    const rows = mps.filter((x) => x.team_id === tm.id && (played ? x.participated : x.called));
    return {
      team: tm,
      formation: fid ? ds.formationById.get(fid) ?? null : null,
      players: rows.map((x) => ({
        player: P(x.player_id),
        position: x.lineup_position,
        rating: played ? ratingOf.get(x.player_id) ?? null : null,
        goals: played ? goals.filter((gg) => gg.scorer_id === x.player_id && !gg.is_own_goal).length : 0,
        assists: played ? goals.filter((gg) => gg.assist_id === x.player_id).length : 0,
        isMvp: mvps.some((mv) => mv.player_id === x.player_id),
        attendance: played ? undefined : x.attendance,
      })),
    };
  };

  const lineups = (
    <div className="space-y-4">
      <LineupPitch home={pitchSide(home)} away={pitchSide(away)} />
      {played && <p className="text-xs text-ink-3">Nota sobre 10: parte de 6,0 · +0,5 por jugar · +2,5 por gol · +1,2 por asistencia · +0,8 por cada gol del equipo · −1,0 por gol encajado. Independiente de las votaciones.</p>}
      <div className="grid gap-3 lg:grid-cols-2">
        {[home, away].map((tm) => {
          const list = sideList(tm.id);
          return (
            <Details key={tm.id} summary={`${played ? "Participantes" : "Convocados"} · ${tm.short_name} (${list.length})`}>
              <PlayerChipList items={list} color={teamColor(tm)} />
              {played && mps.some((x) => x.team_id === tm.id && x.called && !x.participated) && (
                <p className="mt-2 text-xs text-ink-3">Convocados que no jugaron: {mps.filter((x) => x.team_id === tm.id && x.called && !x.participated).map((x) => playerName(P(x.player_id), "short")).join(", ")}</p>
              )}
            </Details>
          );
        })}
      </div>
    </div>
  );

  const events = (
    <div className="space-y-4">
      <Card className="p-4">
        <SectionTitle>Goles</SectionTitle>
        {goals.length === 0 ? <p className="text-sm text-ink-3">Sin goles registrados.</p> : (
          <ol className="space-y-2">
            {goals.map((g) => {
              const tm = ds.teamById.get(g.team_id)!;
              return (
                <li key={g.id} className="flex items-start gap-3 text-sm">
                  <span className="mt-0.5 h-5 w-1 shrink-0 rounded-none" style={{ background: teamColor(tm) }} />
                  {g.minute != null && <span className="tabular w-8 shrink-0 text-ink-3">{g.minute}&apos;</span>}
                  <span className="flex-1">
                    <strong>{g.scorer_id ? playerName(P(g.scorer_id), "short") : "Goleador desconocido"}</strong>
                    {g.is_own_goal && <span className="text-ink-3"> (p.p.)</span>}
                    {g.assist_id && <span className="text-ink-2"> · asist. {playerName(P(g.assist_id), "short")}</span>}
                  </span>
                  <span className="text-xs font-semibold text-ink-3">{tm.short_name}</span>
                </li>
              );
            })}
          </ol>
        )}
      </Card>
      {(m.actual_weather || m.actual_temp_c != null || m.incidents || m.final_notes) && (
        <Card className="space-y-2 p-4 text-sm">
          <WeatherBadge weather={m.actual_weather} temp={m.actual_temp_c} label="Clima real:" />
          {m.incidents && <p><strong>Incidencias:</strong> {m.incidents}</p>}
          {m.final_notes && <p><strong>Observaciones finales:</strong> {m.final_notes}</p>}
        </Card>
      )}
    </div>
  );

  const mvpBlock = (
    <Card className="space-y-3 p-4">
      <div className="flex items-center justify-between">
        <SectionTitle className="mb-0">MVP y mejores</SectionTitle>
        {m.vote_enabled && vstatus && <Pill tone={vstatus.is_open ? "gold" : "neutral"}>{vstatus.is_open ? "Votación abierta" : vstatus.closed_at ? "Votación cerrada" : started ? "—" : "Abre al empezar"}</Pill>}
      </div>
      {mvps.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {mvps.map((x) => (
            <Link key={x.player_id} href={`/jugadores/${x.player_id}`} className="flex items-center gap-2 rounded-xl bg-gold-soft px-3 py-2">
              <Award size={18} className="text-gold" aria-hidden />
              <span className="font-semibold">{playerName(P(x.player_id))}</span>
              {x.source === "manual" ? <span className="text-xs text-ink-3">(registrado manualmente)</span> : x.points != null && <span className="text-xs text-ink-3">{x.points} votos</span>}
            </Link>
          ))}
        </div>
      ) : <p className="text-sm text-ink-3">{m.vote_enabled ? (vstatus?.closed_at ? "Nadie votó: no hay MVP." : "Se decidirá en la votación.") : "MVP no registrado."}</p>}
      {bests.length > 0 && (
        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-ink-3">{t("vote.team_best_label")}</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {[home, away].map((tm) => {
              const list = bests.filter((b) => b.team_id === tm.id);
              if (!list.length) return null;
              return (
                <div key={tm.id} className="flex items-center gap-2 rounded-xl border border-line px-3 py-2 text-sm">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-none" style={{ background: teamColor(tm) }} aria-hidden />
                  <span className="text-ink-3">{tm.short_name}</span>
                  <span className="font-semibold">{list.map((b) => <Link key={b.player_id} href={`/jugadores/${b.player_id}`} className="hover:underline">{playerName(P(b.player_id), "short")}</Link>).reduce<React.ReactNode[]>((acc, el, i) => (i ? [...acc, " y ", el] : [el]), [])}</span>
                  {list[0].votes != null && <span className="ml-auto text-xs text-ink-3">{list[0].votes} votos</span>}
                </div>
              );
            })}
          </div>
        </div>
      )}
      {m.vote_enabled && vstatus && (
        <p className="text-xs text-ink-3">Participación: {vstatus.voted} de {vstatus.eligible} · cierre {m.vote_closes_at ? `${fmtDay(m.vote_closes_at)} a las ${fmtTime(m.vote_closes_at)}` : "—"}</p>
      )}
      {vstatus?.is_open && <Link href={`/votacion/${m.id}`} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-gold px-4 text-sm font-semibold text-[#16130a]"><Vote size={18} /> Ir a votar</Link>}
      {(tallies as MvpTally[] | null)?.length ? (
        <Details summary="Recuento de votos">
          {(() => {
            const all = tallies as MvpTally[];
            const groups: { label: string; rows: MvpTally[] }[] = [
              { label: "Mejor del partido", rows: all.filter((r) => r.category === "match") },
              ...[home, away].map((tm) => ({ label: `Mejor de ${tm.short_name}`, rows: all.filter((r) => r.category === "team" && r.team_id === tm.id) })),
            ].filter((g) => g.rows.length);
            return (
              <div className="space-y-3">
                {groups.map((g) => (
                  <div key={g.label}>
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-ink-3">{g.label} · {g.rows[0].ballots} papeletas</p>
                    <ol className="space-y-1 text-sm">
                      {[...g.rows].sort((a, b) => a.rank - b.rank).map((r) => (
                        <li key={r.player_id} className="flex justify-between"><span>{r.rank}. {playerName(P(r.player_id), "short")}</span><span className="tabular text-ink-2">{r.votes} {r.votes === 1 ? "voto" : "votos"}</span></li>
                      ))}
                    </ol>
                  </div>
                ))}
              </div>
            );
          })()}
        </Details>
      ) : null}
    </Card>
  );

  const scorersOf = (teamId: string): ScorerLine[] => {
    const map = new Map<string, ScorerLine>();
    for (const g of goals.filter((x) => x.team_id === teamId)) {
      const key = (g.scorer_id ?? "?") + (g.is_own_goal ? "pp" : "");
      const name = g.scorer_id ? playerName(P(g.scorer_id), "short") : "Desconocido";
      const cur = map.get(key);
      if (cur) cur.goals += 1; else map.set(key, { name, goals: 1, ownGoal: g.is_own_goal });
    }
    return [...map.values()];
  };

  const okKey = sp.ok ? OK[sp.ok] : null;
  return (
    <div className="space-y-5">
      <MatchHeader m={m} home={home} away={away} venue={venue} scorers={{ home: scorersOf(home.id), away: scorersOf(away.id) }} />
      {okKey && <Notice tone="ok">{t(okKey)}</Notice>}
      <div className="flex flex-wrap items-center gap-2 empty:hidden">
        {!played && m.status !== "pending" && m.status !== "confirmed" && <StatusPill status={m.status} />}
        {m.origin === "historical" && <Pill>Partido histórico</Pill>}
        {m.is_demo && <Pill tone="gold">Datos de prueba</Pill>}
        {m.exceptional_lineup && <Pill tone="gold">Incidencia: {m.exceptional_reason ?? "alineación excepcional"}</Pill>}
        {m.status_reason && <span className="text-sm text-ink-3">Motivo: {m.status_reason}</span>}
      </div>
      {!played && (
        <Card className="space-y-2 p-4">
          <p className="text-sm font-semibold">{fmtDay(m.kickoff_at)} · {fmtTime(m.kickoff_at)}</p>
          <WeatherBadge weather={m.forecast_weather} temp={m.forecast_temp_c} label="Previsión:" />
          {m.notes && <p className="text-sm text-ink-2"><strong className="text-ink">Observaciones:</strong> {m.notes}</p>}
          {mine && (m.status === "pending" || m.status === "confirmed") && !started && <AttendanceButtons matchId={m.id} current={mine.attendance} />}
        </Card>
      )}
      {!played && venue && <VenueCard v={venue} compact />}
      {s?.isStaff && <StaffActions id={m.id} status={m.status} isAdmin={s.isAdmin} started={started} />}

      <Tabs tabs={[
        { label: played ? "Alineaciones" : "Convocatoria", content: lineups },
        { label: played ? "Resumen" : "Pronóstico", content: played ? <div className="space-y-4">{mvpBlock}{events}</div> : <div className="space-y-3"><Hint id="prediction" title="Es una estimación, no un resultado">El pronóstico sale del histórico real (equipos, estadio, rachas, clima y horario). Con pocos partidos la confianza es baja: tómatelo como charla de vestuario.</Hint><PredictionPanel p={pred} home={home} away={away} players={ds.playerById} lowText={t("office.low_confidence")} /></div> },
        ...(played ? [{ label: "Pronóstico previo", content: (
          <div className="space-y-2">
            <p className="text-sm text-ink-2">Lo que el modelo habría pronosticado usando sólo los partidos anteriores a este encuentro.</p>
            <PredictionPanel p={pred} home={home} away={away} players={ds.playerById} lowText={t("office.low_confidence")} />
          </div>
        ) }] : started ? [{ label: "Votación", content: mvpBlock }] : []),
        ...(s?.isStaff ? [{ label: "Actividad", content: (
          <Card className="p-4">
            {activity.length === 0 ? <p className="text-sm text-ink-3">Sin actividad.</p> : (
              <ol className="space-y-2 text-sm">
                {activity.map((a, i) => <li key={i}><span className="text-ink-3 tabular">{fmtDateTime(a.created_at)}</span> · <strong>{a.actor_name}</strong> {a.summary.charAt(0).toLowerCase() + a.summary.slice(1)}</li>)}
              </ol>
            )}
          </Card>
        ) }] : []),
      ]} />
    </div>
  );
}

export type { Player };
