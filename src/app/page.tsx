import Link from "next/link";
import { Plus, CalendarClock } from "lucide-react";
import { ButtonLink, Card, EmptyState, Notice, PageHeader, SectionTitle } from "@/components/ui";
import { MatchRow, PredictionPanel, Scoreboard, StatusPill, WeatherBadge } from "@/components/match/parts";
import { AttendanceButtons } from "@/components/match/attendance";
import { getStats, predictionForMatch } from "@/lib/data/stats";
import { getTexts } from "@/lib/data/config";
import { getSession } from "@/lib/data/session";
import { fmtDay, nowMs, playerName, relativeFromNow } from "@/lib/format";

export default async function Home({ searchParams }: { searchParams: Promise<{ denied?: string; ok?: string }> }) {
  const sp = await searchParams;
  const [{ ds, settings }, t, s] = await Promise.all([getStats(), getTexts(), getSession()]);
  const now = nowMs();
  const upcoming = ds.matches
    .filter((m) => (m.status === "pending" || m.status === "confirmed") && new Date(m.kickoff_at).getTime() > now - 3 * 3600_000)
    .sort((a, b) => a.kickoff_at.localeCompare(b.kickoff_at));
  const next = upcoming[0];
  const others = [...upcoming.slice(1), ...ds.matches.filter((m) => m.status === "postponed")];
  const past = ds.matches.filter((m) => m.status === "played" || m.status === "cancelled" || ((m.status === "pending" || m.status === "confirmed") && new Date(m.kickoff_at).getTime() <= now - 3 * 3600_000))
    .sort((a, b) => b.kickoff_at.localeCompare(a.kickoff_at));

  return (
    <div className="space-y-8">
      {sp.denied && <Notice tone="danger">No tienes permiso para acceder a esa sección.</Notice>}
      {sp.ok === "deleted" && <Notice tone="ok">Partido eliminado.</Notice>}
      {s && !s.player && (
        <Notice tone="warn">
          {s.pendingLink ? t("profile.pending_link") : <>Tu cuenta aún no está vinculada a un jugador. <Link className="font-semibold underline" href="/registro">Vincúlala aquí</Link>.</>}
        </Notice>
      )}

      <section>
        <PageHeader eyebrow={settings.app_tagline} title={t("home.next_match")} action={s?.isStaff ? (
          <div className="flex gap-2">
            <ButtonLink href="/partidos/nuevo?historico=1" variant="secondary" className="hidden sm:inline-flex">Partido histórico</ButtonLink>
            <ButtonLink href="/partidos/nuevo" aria-label="Crear partido"><Plus size={18} /> <span className="hidden sm:inline">Nuevo</span></ButtonLink>
          </div>
        ) : undefined} />
        {next ? <NextMatch matchId={next.id} /> : <EmptyState title="Sin partido programado">{t("home.no_next_match")}</EmptyState>}
      </section>

      {others.length > 0 && (
        <section>
          <SectionTitle>Más adelante</SectionTitle>
          <div className="space-y-2">{others.map((m) => <MatchRow key={m.id} m={m} teams={ds.teamById} venues={ds.venueById} />)}</div>
        </section>
      )}

      <section>
        <SectionTitle action={past.length > 8 ? <Link href="/historico?tab=partidos" className="text-sm font-semibold text-pitch">Ver todos</Link> : undefined}>{t("home.past_matches")}</SectionTitle>
        {past.length ? (
          <div className="space-y-2">{past.slice(0, 8).map((m) => <MatchRow key={m.id} m={m} teams={ds.teamById} venues={ds.venueById} />)}</div>
        ) : <EmptyState title="Aún no hay partidos">{t("history.empty")}</EmptyState>}
      </section>

      {s?.isStaff && (
        <Link href="/partidos/nuevo" aria-label="Crear partido" className="fixed right-4 bottom-24 z-30 flex h-14 w-14 items-center justify-center rounded-2xl bg-pitch text-pitch-ink shadow-card sm:hidden">
          <Plus size={26} />
        </Link>
      )}
    </div>
  );
}

async function NextMatch({ matchId }: { matchId: string }) {
  const [{ ds }, s, t] = await Promise.all([getStats(), getSession(), getTexts()]);
  const m = ds.matchById.get(matchId)!;
  const home = ds.teamById.get(m.home_team_id)!;
  const away = ds.teamById.get(m.away_team_id)!;
  const mps = ds.matchPlayers.filter((x) => x.match_id === m.id && x.called);
  const pred = await predictionForMatch(m);
  const mine = s?.player ? mps.find((x) => x.player_id === s.player!.id) : undefined;
  const fh = m.home_formation_id ? ds.formationById.get(m.home_formation_id) : null;
  const fa = m.away_formation_id ? ds.formationById.get(m.away_formation_id) : null;
  return (
    <div className="space-y-3">
      <Link href={`/partidos/${m.id}`} className="block"><Scoreboard m={m} home={home} away={away} venue={m.venue_id ? ds.venueById.get(m.venue_id) : undefined} linkTeams={false} /></Link>
      <Card className="space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-semibold"><CalendarClock size={16} aria-hidden /> {fmtDay(m.kickoff_at)} · <span className="text-ink-3">{relativeFromNow(m.kickoff_at)}</span></div>
          <StatusPill status={m.status} />
        </div>
        <WeatherBadge weather={m.forecast_weather} temp={m.forecast_temp_c} label="Previsión:" />
        <div className="grid grid-cols-2 gap-3 text-sm">
          {[{ t: home, f: fh }, { t: away, f: fa }].map(({ t: tm, f }) => {
            const list = mps.filter((x) => x.team_id === tm.id);
            return (
              <div key={tm.id} className="rounded-xl bg-surface-2 p-3">
                <div className="flex items-center justify-between font-semibold"><span className="truncate">{tm.short_name}</span><span className="font-display tabular">{f?.name ?? "—"}</span></div>
                <div className="mt-1 text-xs text-ink-3">{list.length} convocados</div>
                <p className="mt-1 line-clamp-3 text-xs text-ink-2">{list.map((x) => playerName(ds.playerById.get(x.player_id), "nick")).join(", ") || "Sin convocatoria"}</p>
              </div>
            );
          })}
        </div>
        {m.notes && <p className="text-sm text-ink-2"><span className="font-semibold text-ink">Observaciones:</span> {m.notes}</p>}
        {mine && <AttendanceButtons matchId={m.id} current={mine.attendance} />}
      </Card>
      <PredictionPanel p={pred} home={home} away={away} players={ds.playerById} compact lowText={t("office.low_confidence")} />
    </div>
  );
}
