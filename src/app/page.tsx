import Link from "next/link";
import { Activity, Award, ChevronRight, Hourglass, MapPin, Plus, Trophy, Vote } from "lucide-react";
import { Avatar, ButtonLink, Card, Crest, EmptyState, Notice, Pill, SectionTitle, cx } from "@/components/ui";
import { MatchRow, PredictionPanel, Scoreboard, StatusPill, WeatherBadge } from "@/components/match/parts";
import { AttendanceButtons } from "@/components/match/attendance";
import { Countdown } from "@/components/match/countdown";
import { getStats, predictionForMatch } from "@/lib/data/stats";
import { getTexts } from "@/lib/data/config";
import { getSession, type Session } from "@/lib/data/session";
import { createClient } from "@/lib/supabase/server";
import { ranking } from "@/lib/stats/engine";
import { fmtDay, fmtShortDay, fmtTime, nowMs, playerName, relativeFromNow, teamColor } from "@/lib/format";
import type { Match } from "@/lib/types";

type Stats = Awaited<ReturnType<typeof getStats>>;
type T = Awaited<ReturnType<typeof getTexts>>;

/**
 * Inicio · cambia según el momento deportivo:
 *  1. Avisos que requieren acción (voto pendiente, cuenta sin vincular)
 *  2. MVP recién anunciado (72 h)
 *  3. Próximo partido + tu convocatoria + cuenta atrás + pronóstico
 *  4. Último resultado · destacados · actividad reciente · anteriores
 */
export default async function Home({ searchParams }: { searchParams: Promise<{ denied?: string; ok?: string }> }) {
  const sp = await searchParams;
  const [st, t, s] = await Promise.all([getStats(), getTexts(), getSession()]);
  const { ds } = st;
  const now = nowMs();
  const upcoming = ds.matches
    .filter((m) => (m.status === "pending" || m.status === "confirmed") && new Date(m.kickoff_at).getTime() > now - 3 * 3600_000)
    .sort((a, b) => a.kickoff_at.localeCompare(b.kickoff_at));
  const next = upcoming[0];
  const later = [...upcoming.slice(1), ...ds.matches.filter((m) => m.status === "postponed")];
  const past = ds.matches.filter((m) => m.status === "played").sort((a, b) => b.kickoff_at.localeCompare(a.kickoff_at));
  const last = past[0];

  // Votaciones abiertas en las que participo y aún no he votado
  const openVotes = ds.matches.filter((m) => m.vote_enabled && !m.vote_closed_at && m.vote_opens_at && m.vote_closes_at
    && new Date(m.vote_opens_at).getTime() <= now && new Date(m.vote_closes_at).getTime() > now && (m.status === "confirmed" || m.status === "played"));
  let pendingVotes: Match[] = [];
  let activity: { id: number; actor_name: string | null; summary: string; created_at: string; is_system: boolean }[] = [];
  if (s?.player) {
    const mine = openVotes.filter((m) => ds.matchPlayers.some((x) => x.match_id === m.id && x.player_id === s.player!.id && x.participated));
    if (mine.length) {
      const supabase = await createClient();
      const { data } = await supabase.from("mvp_vote_receipts").select("match_id").eq("player_id", s.player.id).in("match_id", mine.map((m) => m.id));
      const done = new Set((data ?? []).map((r) => r.match_id as string));
      pendingVotes = mine.filter((m) => !done.has(m.id));
    }
  }
  if (s) {
    const supabase = await createClient();
    const { data } = await supabase.rpc("public_activity", { p_before: null, p_limit: 4 });
    activity = (data ?? []) as typeof activity;
  }
  const recentMvp = past.find((m) => m.vote_closed_at && now - new Date(m.vote_closed_at).getTime() < 72 * 3600_000 && ds.mvps.some((x) => x.match_id === m.id));

  return (
    <div className="space-y-7">
      {sp.denied && <Notice tone="danger">No tienes permiso para acceder a esa sección.</Notice>}
      {sp.ok === "deleted" && <Notice tone="ok">Partido eliminado.</Notice>}
      {s && !s.player && (
        <Notice tone="warn">
          {s.pendingLink ? t("profile.pending_link") : <>Tu cuenta aún no está vinculada a un jugador. <Link className="font-semibold underline" href="/registro">Vincúlala aquí</Link>.</>}
        </Notice>
      )}

      {pendingVotes.map((m) => (
        <Link key={m.id} href={`/votacion/${m.id}`} className="press animate-rise flex items-center gap-3 rounded-2xl bg-gold px-4 py-3 text-[#16130a]">
          <Vote size={22} aria-hidden className="shrink-0" />
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">Tienes un voto pendiente</span>
            <span className="block truncate text-sm opacity-80">{fmtShortDay(m.kickoff_at)} · cierra {relativeFromNow(m.vote_closes_at!)}</span>
          </span>
          <ChevronRight size={20} aria-hidden />
        </Link>
      ))}

      {recentMvp && <MvpAnnouncement m={recentMvp} st={st} />}

      <section aria-labelledby="h-next">
        <div className="mb-3 flex items-end justify-between gap-3">
          <h1 id="h-next" className="font-display text-3xl font-bold uppercase leading-none">{t("home.next_match")}</h1>
          {s?.isStaff && (
            <div className="hidden gap-2 sm:flex">
              <ButtonLink href="/partidos/nuevo?historico=1" variant="secondary">Partido histórico</ButtonLink>
              <ButtonLink href="/partidos/nuevo"><Plus size={18} /> Nuevo</ButtonLink>
            </div>
          )}
        </div>
        {next ? <NextMatch m={next} st={st} s={s} t={t} now={now} /> : (
          <EmptyState title="Sin partido programado" action={s?.isStaff ? <ButtonLink href="/partidos/nuevo"><Plus size={18} /> Crear partido</ButtonLink> : undefined}>{t("home.no_next_match")}</EmptyState>
        )}
      </section>

      {later.length > 0 && (
        <section>
          <SectionTitle>Más adelante</SectionTitle>
          <div className="space-y-2">{later.map((m) => <MatchRow key={m.id} m={m} teams={ds.teamById} venues={ds.venueById} />)}</div>
        </section>
      )}

      {last && <LastResult m={last} st={st} />}

      <Highlights st={st} />

      {activity.length > 0 && (
        <section>
          <SectionTitle action={<Link href="/actividad" className="text-sm font-semibold text-pitch">Ver todo</Link>}>Actividad reciente</SectionTitle>
          <Card className="divide-y divide-line">
            {activity.map((a) => (
              <div key={a.id} className="flex items-start gap-3 px-4 py-3 text-sm">
                <Activity size={16} aria-hidden className="mt-0.5 shrink-0 text-ink-3" />
                <p className="min-w-0 flex-1"><strong>{a.is_system || !a.actor_name ? "Roca Larga" : a.actor_name}</strong> <span className="text-ink-2">{a.is_system ? a.summary : a.summary.charAt(0).toLowerCase() + a.summary.slice(1)}</span></p>
                <span className="shrink-0 text-xs text-ink-3">{relativeFromNow(a.created_at).replace("hace ", "")}</span>
              </div>
            ))}
          </Card>
        </section>
      )}

      {past.length > 1 && (
        <section>
          <SectionTitle action={<Link href="/clasificacion?tab=partidos" className="text-sm font-semibold text-pitch">Ver todos</Link>}>{t("home.past_matches")}</SectionTitle>
          <div className="space-y-2">{past.slice(1, 5).map((m) => <MatchRow key={m.id} m={m} teams={ds.teamById} venues={ds.venueById} />)}</div>
        </section>
      )}
      {past.length === 0 && !next && <EmptyState title="Aún no hay partidos">{t("history.empty")}</EmptyState>}

      {s?.isStaff && (
        <Link href="/partidos/nuevo" aria-label="Crear partido" className="press fixed right-4 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-30 flex h-14 w-14 items-center justify-center rounded-2xl bg-pitch text-pitch-ink shadow-card sm:hidden">
          <Plus size={26} />
        </Link>
      )}
    </div>
  );
}

async function NextMatch({ m, st, s, t, now }: { m: Match; st: Stats; s: Session | null; t: T; now: number }) {
  const { ds } = st;
  const home = ds.teamById.get(m.home_team_id)!;
  const away = ds.teamById.get(m.away_team_id)!;
  const venue = m.venue_id ? ds.venueById.get(m.venue_id) : undefined;
  const called = ds.matchPlayers.filter((x) => x.match_id === m.id && x.called);
  const mine = s?.player ? called.find((x) => x.player_id === s.player!.id) : undefined;
  const pred = await predictionForMatch(m);
  const myTeam = mine ? ds.teamById.get(mine.team_id) : undefined;

  return (
    <div className="space-y-3">
      <Link href={`/partidos/${m.id}`} className="press block"><Scoreboard m={m} home={home} away={away} venue={venue} linkTeams={false} /></Link>

      <Card className="divide-y divide-line">
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <p className="text-xs text-ink-3">{fmtDay(m.kickoff_at)} · {fmtTime(m.kickoff_at)}</p>
            <Countdown to={m.kickoff_at} serverNow={now} className="mt-0.5 flex items-baseline gap-2" />
          </div>
          <StatusPill status={m.status} />
        </div>
        {(venue || m.forecast_weather || m.forecast_temp_c != null) && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 text-sm">
            {venue && <Link href={`/estadios/${venue.id}`} className="inline-flex items-center gap-1.5 font-medium hover:underline"><MapPin size={15} aria-hidden className="text-ink-3" />{venue.name}</Link>}
            {(m.forecast_weather || m.forecast_temp_c != null) && <WeatherBadge weather={m.forecast_weather} temp={m.forecast_temp_c} />}
          </div>
        )}
        {mine && (
          <div className="space-y-2.5 px-4 py-3">
            <p className="flex items-center gap-2 text-sm">
              <span className="h-2.5 w-2.5 rounded-none" style={{ background: teamColor(myTeam) }} aria-hidden />
              <span><strong>Estás convocado</strong> con {myTeam?.short_name}. {mine.attendance === "yes" ? "Has confirmado que vas." : mine.attendance === "no" ? "Has dicho que no puedes." : "¿Vas?"}</span>
            </p>
            {new Date(m.kickoff_at).getTime() > now && <AttendanceButtons matchId={m.id} current={mine.attendance} />}
          </div>
        )}
        {s?.player && !mine && <p className="px-4 py-3 text-sm text-ink-3">Esta vez no estás en la convocatoria.</p>}
        <div className="grid grid-cols-2 divide-x divide-line">
          {[home, away].map((tm) => {
            const list = called.filter((x) => x.team_id === tm.id);
            const yes = list.filter((x) => x.attendance === "yes").length;
            const f = ds.formationById.get((tm.id === m.home_team_id ? m.home_formation_id : m.away_formation_id) ?? "");
            return (
              <Link key={tm.id} href={`/partidos/${m.id}`} className="block px-4 py-3 hover:bg-surface-2">
                <div className="flex items-center justify-between gap-2 text-sm font-semibold"><span className="truncate">{tm.short_name}</span><span className="font-display tabular text-ink-3">{f?.name ?? ""}</span></div>
                <div className="mt-2 flex -space-x-2">
                  {list.slice(0, 7).map((x) => { const p = ds.playerById.get(x.player_id); return <span key={x.player_id} className="rounded-full ring-2 ring-surface"><Avatar name={p?.full_name ?? "?"} src={p?.photo_url} size={26} color={teamColor(tm)} /></span>; })}
                  {list.length === 0 && <span className="text-xs text-ink-3">Sin convocatoria</span>}
                </div>
                {list.length > 0 && <p className="mt-1.5 text-xs text-ink-3">{list.length} convocados{yes ? ` · ${yes} confirmados` : ""}</p>}
              </Link>
            );
          })}
        </div>
        {m.notes && <p className="px-4 py-3 text-sm text-ink-2">{m.notes}</p>}
      </Card>

      <PredictionPanel p={pred} home={home} away={away} players={ds.playerById} compact lowText={t("office.low_confidence")} />
    </div>
  );
}

function MvpAnnouncement({ m, st }: { m: Match; st: Stats }) {
  const { ds } = st;
  const mvps = ds.mvps.filter((x) => x.match_id === m.id);
  const bests = ds.teamBests.filter((x) => x.match_id === m.id);
  const colors = ["#d6b25e", "#f4f2ec", "#3fae66", "#d6b25e", "#e5735f", "#d6b25e"];
  return (
    <Link href={`/partidos/${m.id}`} className="press relative block overflow-hidden rounded-3xl border border-gold/40 bg-gold-soft p-5">
      <span className="confetti pointer-events-none absolute inset-x-0 top-0 h-40" aria-hidden>
        {Array.from({ length: 18 }, (_, i) => (
          <i key={i} style={{ left: `${(i * 37) % 100}%`, background: colors[i % colors.length], animationDelay: `${(i % 6) * 90}ms`, ["--dx" as string]: `${((i * 23) % 60) - 30}px` }} />
        ))}
      </span>
      <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-gold"><Award size={15} aria-hidden /> El MVP ya tiene dueño</p>
      <div className="mt-3 flex items-center gap-3">
        {mvps.slice(0, 2).map((x) => { const p = ds.playerById.get(x.player_id); return <span key={x.player_id} className="animate-pop rounded-full ring-4 ring-gold"><Avatar name={p?.full_name ?? "?"} src={p?.photo_url} size={56} /></span>; })}
        <div className="min-w-0">
          <p className="font-display text-2xl font-bold uppercase leading-tight">{mvps.map((x) => playerName(ds.playerById.get(x.player_id), "nick")).join(" y ")}</p>
          <p className="text-sm text-ink-2">MVP · {fmtShortDay(m.kickoff_at)}{mvps[0]?.points ? ` · ${mvps[0].points} votos` : ""}</p>
        </div>
      </div>
      {bests.length > 0 && (
        <p className="mt-3 text-sm text-ink-2">Mejores de cada equipo: {bests.map((b) => `${ds.teamById.get(b.team_id)?.short_name} · ${playerName(ds.playerById.get(b.player_id), "nick")}`).join(" — ")}</p>
      )}
    </Link>
  );
}

function LastResult({ m, st }: { m: Match; st: Stats }) {
  const { ds } = st;
  const home = ds.teamById.get(m.home_team_id)!;
  const away = ds.teamById.get(m.away_team_id)!;
  const mvp = ds.mvps.find((x) => x.match_id === m.id);
  const scorers = new Map<string, number>();
  for (const g of ds.goals.filter((g) => g.match_id === m.id && g.scorer_id && !g.is_own_goal)) scorers.set(g.scorer_id!, (scorers.get(g.scorer_id!) ?? 0) + 1);
  const winner = m.home_score! > m.away_score! ? home.id : m.away_score! > m.home_score! ? away.id : null;
  return (
    <section>
      <SectionTitle>Último resultado</SectionTitle>
      <Link href={`/partidos/${m.id}`} className="press block">
        <Card className="p-4 hover:border-line-strong">
          <p className="mb-3 text-xs text-ink-3">{fmtDay(m.kickoff_at)}{m.venue_id ? ` · ${ds.venueById.get(m.venue_id)?.name}` : ""}</p>
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
            {[home, away].map((tm, i) => (
              <div key={tm.id} className={cx("flex items-center gap-2", i === 1 && "order-3 flex-row-reverse text-right")}>
                <Crest src={tm.crest_url} name={tm.name} size={36} />
                <span className={cx("text-sm leading-tight", winner === tm.id ? "font-bold" : "text-ink-2")}>{tm.short_name}</span>
              </div>
            ))}
            <div className="order-2 font-display tabular text-4xl font-bold">{m.home_score}<span className="mx-1.5 text-ink-3">–</span>{m.away_score}</div>
          </div>
          {(scorers.size > 0 || mvp) && (
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line pt-3 text-xs text-ink-2">
              {scorers.size > 0 && <span className="text-ink-3">Goles:</span>}
              {[...scorers.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([pid, n]) => <span key={pid}>{playerName(ds.playerById.get(pid), "nick")}{n > 1 ? ` ×${n}` : ""}</span>)}
              {mvp && <Pill tone="gold" className="ml-auto"><Award size={12} aria-hidden /> {playerName(ds.playerById.get(mvp.player_id), "nick")}</Pill>}
            </div>
          )}
        </Card>
      </Link>
    </section>
  );
}

function Highlights({ st }: { st: Stats }) {
  const { ds, parts } = st;
  if (!parts.length) return null;
  const items = ([
    ["goals", "Pichichi", "goles", Trophy],
    ["assists", "Asistente", "asist.", Hourglass],
    ["mvps", "Más MVP", "MVP", Award],
  ] as const).map(([stat, label, unit, Icon]) => {
    const top = ranking(parts, stat)[0];
    return top && (top[stat] as number) > 0 ? { label, unit, Icon, p: ds.playerById.get(top.playerId), v: top[stat] as number } : null;
  }).filter(Boolean) as { label: string; unit: string; Icon: typeof Trophy; p: ReturnType<typeof ds.playerById.get>; v: number }[];
  if (!items.length) return null;
  return (
    <section>
      <SectionTitle action={<Link href="/clasificacion?tab=rankings" className="text-sm font-semibold text-pitch">Rankings</Link>}>Destacados</SectionTitle>
      <div className="no-scrollbar -mx-4 flex snap-x gap-2 overflow-x-auto px-4 sm:mx-0 sm:grid sm:grid-cols-3 sm:px-0">
        {items.map(({ label, unit, Icon, p, v }) => (
          <Link key={label} href={p ? `/jugadores/${p.id}` : "#"} className="press flex min-w-[9.5rem] snap-start flex-col gap-2 rounded-2xl border border-line bg-surface p-3 hover:border-line-strong">
            <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-ink-3"><Icon size={14} aria-hidden />{label}</span>
            <span className="flex items-center gap-2">
              <Avatar name={p?.full_name ?? "?"} src={p?.photo_url} size={32} color={teamColor(ds.teamById.get(p?.team_id ?? ""))} />
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold">{playerName(p, "nick")}</span>
                <span className="block text-xs text-ink-3"><span className="font-display tabular text-base font-bold text-ink">{v}</span> {unit}</span>
              </span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
