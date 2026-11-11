import Link from "next/link";
import { notFound } from "next/navigation";
import { Award, MapPin } from "lucide-react";
import { Avatar, Card, Crest, EmptyState, ResultBadge, SectionTitle, Stat } from "@/components/ui";
import { Tabs } from "@/components/ui/client";
import { Hint } from "@/components/onboarding/hint";
import { getSession } from "@/lib/data/session";
import { LineChart, WdlBar } from "@/components/charts";
import { getStats } from "@/lib/data/stats";
import { bestVenue, evolution, playerTotals, topPerformances } from "@/lib/stats/engine";
import { fmtDate, fmtShortDay, num, teamColor } from "@/lib/format";
import { POSITION_LABELS } from "@/lib/types";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ds } = await getStats();
  return { title: ds.playerById.get(id)?.full_name ?? "Jugador" };
}

export default async function PlayerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [{ ds, parts, settings }, s] = await Promise.all([getStats(), getSession()]);
  const p = ds.playerById.get(id);
  if (!p) notFound();
  const team = p.team_id ? ds.teamById.get(p.team_id) : null;
  const color = teamColor(team);
  const tot = playerTotals(id, parts);
  const top = topPerformances(id, parts, 3);
  const bv = bestVenue(id, parts);
  const evo = evolution(id, parts);
  const mine = parts.filter((x) => x.playerId === id).sort((a, b) => b.kickoff.localeCompare(a.kickoff));
  const w = settings.performance_weights;
  const brought = ds.matchPlayers.filter((mp) => mp.brought_by_id === id).length;

  const summary = tot.matches > 0 && (
    <div className="space-y-5">
      <section>
        <SectionTitle>Como jugador de campo</SectionTitle>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="Goles por partido" value={num(tot.goalsPerMatch, 2)} />
          <Stat label="Asist. por partido" value={num(tot.assistsPerMatch, 2)} />
          <Stat label="Mejor de su equipo" value={tot.teamBests} />
          <Stat label="Invitados traídos" value={brought} hint={brought && w.guest_bonus ? `+${num(w.guest_bonus, 1)} a la nota c/u` : undefined} />
        </div>
        <div className="mt-3 flex items-center gap-3 text-sm"><span className="text-ink-3">{tot.wins}V · {tot.draws}E · {tot.losses}D</span><WdlBar className="flex-1" wins={tot.wins} draws={tot.draws} losses={tot.losses} /></div>
      </section>
      <section>
        <SectionTitle>Top 3 actuaciones</SectionTitle>
        <div className="space-y-2">
          {top.map((x, i) => {
            const m = ds.matchById.get(x.matchId)!;
            return (
              <Link key={x.matchId} href={`/partidos/${x.matchId}`} className="press flex items-center gap-3 rounded-2xl border border-line bg-surface p-3 hover:border-line-strong">
                <span className="font-display text-3xl font-bold text-gold">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">{fmtShortDay(x.kickoff)} · {ds.teamById.get(m.home_team_id)?.short_name} {m.home_score}–{m.away_score} {ds.teamById.get(m.away_team_id)?.short_name}</div>
                  <div className="truncate text-xs text-ink-3">{x.goals} goles · {x.assists} asist.{x.isMvp ? " · MVP" : ""}{x.isTeamBest ? " · mejor de su equipo" : ""}{x.guestsBrought ? ` · trajo ${x.guestsBrought} invitado${x.guestsBrought > 1 ? "s" : ""}` : ""}</div>
                </div>
                <div className="text-right"><div className="font-display tabular text-2xl font-bold">{num(x.rating, 1)}</div><div className="text-[11px] uppercase text-ink-3">nota</div></div>
                {x.isMvp && <Award size={18} className="text-gold" aria-label="MVP" />}
              </Link>
            );
          })}
        </div>
        <p className="mt-1.5 text-xs text-ink-3">Nota (sobre {num(w.max, 0)}) = parte de {num(w.base, 1)} · +{num(w.played, 1)} por jugar · +{num(w.goal, 1)} por gol · +{num(w.assist, 1)} por asistencia · +{num(w.team_goal, 1)} por cada gol del equipo que no marca él · {num(w.team_conceded, 1)} por gol encajado por el equipo{w.guest_bonus ? ` · +${num(w.guest_bonus, 1)} por invitado traído` : ""}. No cuentan las votaciones.</p>
      </section>
      {bv && (
        <section>
          <SectionTitle>Su estadio</SectionTitle>
          <Link href={`/estadios/${bv.venueId}`} className="press flex items-center gap-3 rounded-2xl border border-line bg-surface p-4 hover:border-line-strong">
            <MapPin className="text-pitch" aria-hidden />
            <div className="flex-1">
              <div className="font-semibold">{ds.venueById.get(bv.venueId)?.name}</div>
              <div className="text-xs text-ink-3">{bv.matches} partidos · {bv.goals} goles · {bv.wins} victorias · nota media {num(bv.ratingAvg, 1)}{bv.smallSample ? " · muestra pequeña" : ""}</div>
            </div>
          </Link>
        </section>
      )}
      <section>
        <SectionTitle>Evolución</SectionTitle>
        <Card className="p-4">
          <LineChart labels={evo.map((e) => fmtDate(e.kickoff))} series={[
            { name: "Goles acumulados", color: "var(--pitch)", values: evo.map((e) => e.goals) },
            { name: "Asistencias acumuladas", color: "var(--gold)", values: evo.map((e) => e.assists) },
          ]} />
        </Card>
      </section>
    </div>
  );

  const matchesList = (
    <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
      {mine.map((x) => (
        <li key={x.matchId}>
          <Link href={`/partidos/${x.matchId}`} className="flex min-h-12 items-center gap-3 px-3 py-2 text-sm hover:bg-surface-2">
            <ResultBadge r={x.result} />
            <span className="flex-1">{fmtShortDay(x.kickoff)} <span className="text-ink-3">· {x.goalsFor}–{x.goalsAgainst}</span></span>
            <span className="tabular text-xs text-ink-2">{x.goals}G {x.assists}A</span>
            {x.isMvp && <Award size={16} className="text-gold" aria-label="MVP" />}
          </Link>
        </li>
      ))}
    </ul>
  );

  return (
    <div className="space-y-5">
      <div className="relative overflow-hidden rounded-3xl p-5 text-white" style={{ background: `linear-gradient(135deg, ${color}, color-mix(in srgb, ${color} 45%, #0b0f0c))` }}>
        <div className="flex items-center gap-4">
          <span className="rounded-full ring-4 ring-white/25"><Avatar name={p.full_name} src={p.photo_url} size={84} color={color} /></span>
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-3xl font-bold uppercase leading-none">{p.nickname ?? p.full_name}</h1>
            {p.nickname && <p className="mt-1 truncate text-sm text-white/80">{p.full_name}</p>}
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-white/85">
              {team ? <Link href={`/equipos/${team.slug}`} className="inline-flex items-center gap-1.5 rounded-none bg-black/25 px-2 py-1"><Crest src={team.crest_url} name={team.name} size={16} />{team.short_name}</Link> : <span className="rounded-none bg-black/25 px-2 py-1">Invitado</span>}
              {p.usual_position && <span className="rounded-none bg-black/25 px-2 py-1">{POSITION_LABELS[p.usual_position]}</span>}
              {p.shirt_number != null && <span className="rounded-none bg-black/25 px-2 py-1">#{p.shirt_number}</span>}
              {!p.active && <span className="rounded-none bg-black/40 px-2 py-1">Inactivo</span>}
            </div>
          </div>
          {tot.matches > 0 && (
            <div className="shrink-0 text-center">
              <div className="font-display tabular text-4xl font-bold leading-none">{num(tot.ratingAvg, 1)}</div>
              <div className="text-[11px] uppercase tracking-wider text-white/75">nota media</div>
            </div>
          )}
        </div>
        {tot.matches > 0 && (
          <dl className="mt-5 grid grid-cols-4 rounded-2xl bg-black/25 py-2.5 text-center">
            {([["Partidos", tot.matches], ["Goles", tot.goals], ["Asist.", tot.assists], ["MVP", tot.mvps]] as const).map(([l, v]) => (
              <div key={l}><dd className="font-display tabular text-2xl font-bold leading-none">{v}</dd><dt className="mt-1 text-[11px] uppercase tracking-wider text-white/70">{l}</dt></div>
            ))}
          </dl>
        )}
      </div>

      {s?.player?.id === p.id && tot.matches > 0 && <Hint id="my-card" title="Esta es tu ficha">La <strong>nota</strong> de cada partido es sobre 10: partes de 6,0, sumas por jugar, por tus goles y asistencias y por cada gol de tu equipo, y restas por cada gol que encaja tu equipo. Las votaciones no cuentan.</Hint>}
      {tot.matches === 0 ? <EmptyState title="Sin partidos todavía">Cuando dispute su primer partido aparecerán aquí sus estadísticas.</EmptyState> : (
        <Tabs tabs={[
          { label: "Resumen", content: summary },
          { label: `Partidos (${mine.length})`, content: matchesList },
        ]} />
      )}
      <p className="text-center text-xs text-ink-3">¿Cómo rendiría en otro contexto? <Link href={`/despacho?tab=individual&player=${p.id}`} className="font-semibold text-pitch">Simúlalo en El Despacho</Link></p>
    </div>
  );
}
