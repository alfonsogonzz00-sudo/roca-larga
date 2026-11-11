import Link from "next/link";
import { notFound } from "next/navigation";
import { Award, MapPin } from "lucide-react";
import { Avatar, Card, Crest, EmptyState, Pill, ResultBadge, SectionTitle, Stat } from "@/components/ui";
import { LineChart, WdlBar } from "@/components/charts";
import { getStats } from "@/lib/data/stats";
import { bestVenue, evolution, playerTotals, topPerformances } from "@/lib/stats/engine";
import { fmtDate, fmtShortDay, num, pct, playerName } from "@/lib/format";
import { POSITION_LABELS } from "@/lib/types";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ds } = await getStats();
  return { title: ds.playerById.get(id)?.full_name ?? "Jugador" };
}

export default async function PlayerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ds, parts, settings } = await getStats();
  const p = ds.playerById.get(id);
  if (!p) notFound();
  const team = p.team_id ? ds.teamById.get(p.team_id) : null;
  const color = team?.primary_color ?? "var(--ink-3)";
  const tot = playerTotals(id, parts);
  const top = topPerformances(id, parts, 3);
  const bv = bestVenue(id, parts);
  const evo = evolution(id, parts);
  const mine = parts.filter((x) => x.playerId === id).sort((a, b) => b.kickoff.localeCompare(a.kickoff));
  const w = settings.performance_weights;
  const brought = ds.matchPlayers.filter((mp) => mp.brought_by_id === id).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Avatar name={p.full_name} src={p.photo_url} size={76} color={color} />
        <div className="min-w-0">
          <h1 className="font-display text-3xl font-bold uppercase leading-none">{p.full_name}</h1>
          {p.nickname && <p className="mt-1 text-lg text-gold">«{p.nickname}»</p>}
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-ink-2">
            {team ? <Link href={`/equipos/${team.slug}`} className="inline-flex items-center gap-1.5"><Crest src={team.crest_url} name={team.name} size={18} />{team.name}</Link> : <Pill>Invitado</Pill>}
            {p.usual_position && <span>· {POSITION_LABELS[p.usual_position]}</span>}
            {p.shirt_number != null && <span>· #{p.shirt_number}</span>}
            {!p.active && <Pill tone="danger">Inactivo</Pill>}
          </div>
        </div>
      </div>

      {tot.matches === 0 ? <EmptyState title="Sin partidos todavía">Cuando dispute su primer partido aparecerán aquí sus estadísticas.</EmptyState> : (
        <>
          <section>
            <SectionTitle>Como jugador de campo</SectionTitle>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat label="Partidos" value={tot.matches} />
              <Stat label="Goles" value={tot.goals} hint={`${num(tot.goalsPerMatch, 2)} por partido`} />
              <Stat label="Asistencias" value={tot.assists} hint={`${num(tot.assistsPerMatch, 2)} por partido`} />
              <Stat label="MVP" value={tot.mvps} />
              <Stat label="Valoración media" value={num(tot.ratingAvg, 2)} hint="sin contar encajados" />
              <Stat label="Victorias" value={tot.wins} hint={pct(tot.wins / tot.matches)} />
              <Stat label="Empates / Derrotas" value={`${tot.draws} / ${tot.losses}`} />
              <Stat label="Invitados traídos" value={brought} hint={brought ? `+${num(w.guest_bonus, 2)} pts c/u` : undefined} />
            </div>
            <WdlBar className="mt-3" wins={tot.wins} draws={tot.draws} losses={tot.losses} />
          </section>

          <section>
            <SectionTitle>En la portería</SectionTitle>
            <Card className="grid grid-cols-3 gap-2 p-3">
              <Stat label="Turnos" value={tot.gkSpells} />
              <Stat label="Encajados" value={tot.concededAsGk} />
              <Stat label="Por turno" value={tot.concededPerSpell != null ? num(tot.concededPerSpell, 2) : "—"} />
            </Card>
            <p className="mt-1.5 text-xs text-ink-3">Estadística separada: los goles encajados en sus periodos de portero no afectan a su valoración de campo.</p>
          </section>

          <section>
            <SectionTitle>Top 3 actuaciones</SectionTitle>
            <div className="space-y-2">
              {top.map((x, i) => {
                const m = ds.matchById.get(x.matchId)!;
                return (
                  <Link key={x.matchId} href={`/partidos/${x.matchId}`} className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-3 hover:border-line-strong">
                    <span className="font-display text-3xl font-bold text-gold">{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold">{fmtShortDay(x.kickoff)} · {ds.teamById.get(m.home_team_id)?.short_name} {m.home_score}–{m.away_score} {ds.teamById.get(m.away_team_id)?.short_name}</div>
                      <div className="text-xs text-ink-3">{x.goals} goles · {x.assists} asist.{x.isMvp ? " · MVP" : ""}{x.guestsBrought ? ` · trajo ${x.guestsBrought} invitado${x.guestsBrought > 1 ? "s" : ""}` : ""}</div>
                    </div>
                    <div className="text-right"><div className="font-display tabular text-2xl font-bold">{num(x.rating, 2)}</div><div className="text-[10px] uppercase text-ink-3">valoración</div></div>
                    {x.isMvp && <Award size={18} className="text-gold" aria-label="MVP" />}
                  </Link>
                );
              })}
            </div>
            <p className="mt-1.5 text-xs text-ink-3">Valoración = gol {num(w.goal, 2)} · asistencia {num(w.assist, 2)} · MVP {num(w.mvp, 2)} · victoria {num(w.win, 2)} · empate {num(w.draw, 2)} · invitado traído {num(w.guest_bonus, 2)}.</p>
          </section>

          {bv && (
            <section>
              <SectionTitle>Su estadio</SectionTitle>
              <Card className="flex items-center gap-3 p-4">
                <MapPin className="text-pitch" aria-hidden />
                <div className="flex-1">
                  <div className="font-semibold">{ds.venueById.get(bv.venueId)?.name}</div>
                  <div className="text-xs text-ink-3">{bv.matches} partidos · {bv.goals} goles · {bv.wins} victorias · valoración media {num(bv.ratingAvg, 2)}{bv.smallSample ? " · muestra pequeña" : ""}</div>
                </div>
              </Card>
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

          <section>
            <SectionTitle>Partidos</SectionTitle>
            <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
              {mine.map((x) => (
                <li key={x.matchId}>
                  <Link href={`/partidos/${x.matchId}`} className="flex min-h-12 items-center gap-3 px-3 py-2 text-sm">
                    <ResultBadge r={x.result} />
                    <span className="flex-1">{fmtShortDay(x.kickoff)} <span className="text-ink-3">· {x.goalsFor}–{x.goalsAgainst}</span></span>
                    <span className="tabular text-xs text-ink-2">{x.goals}G {x.assists}A{x.gkSpells ? ` · 🧤${x.concededAsGk}` : ""}</span>
                    {x.isMvp && <Award size={16} className="text-gold" aria-label="MVP" />}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
      <p className="text-center text-xs text-ink-3">¿Quieres ver cómo rendiría en otro contexto? <Link href={`/despacho?tab=individual&player=${p.id}`} className="font-semibold text-pitch">Simúlalo en El Despacho</Link> · {playerName(p, "short")}</p>
    </div>
  );
}
