import Link from "next/link";
import { notFound } from "next/navigation";
import { Award, MapPin } from "lucide-react";
import { Card, EmptyState, ResultBadge, SectionTitle, Stat } from "@/components/ui";
import { Tabs } from "@/components/ui/client";
import { Hint } from "@/components/onboarding/hint";
import { getSession } from "@/lib/data/session";
import { LineChart, WdlBar } from "@/components/charts";
import { getStats } from "@/lib/data/stats";
import { bestVenue, evolution, playerTotals, topPerformances } from "@/lib/stats/engine";
import { fmtDate, fmtShortDay, num, teamColor } from "@/lib/format";
import { POSITION_LABELS, type PlayerPhysical } from "@/lib/types";
import { PlayerStage } from "@/components/player/player-stage";
import { DetailsGrid, PlayerHeader, TeamCard } from "@/components/player/player-header";
import { kitPaint, type Kit } from "@/lib/kit";
import { createClient } from "@/lib/supabase/server";

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
  // Altura y peso: sólo con sesión (la tabla no es pública)
  let phys: PlayerPhysical | null = null;
  if (s) {
    const { data } = await (await createClient()).from("player_physical").select("player_id, height_cm, weight_kg").eq("player_id", id).maybeSingle<PlayerPhysical>();
    phys = data;
  }
  const fmtH = (cm: number) => `${cm} cm`;
  const fmtW = (kg: number) => `${num(Number(kg), Number(kg) % 1 ? 1 : 0)} kg`;
  const ficha: [string, React.ReactNode][] = [
    ["Altura", phys?.height_cm ? fmtH(phys.height_cm) : s ? "—" : <Link key="h" href={`/login?next=/jugadores/${id}`} className="text-pitch">Entra</Link>],
    ["Peso", phys?.weight_kg ? fmtW(phys.weight_kg) : s ? "—" : <Link key="w" href={`/login?next=/jugadores/${id}`} className="text-pitch">Entra</Link>],
    ["Posición", p.usual_position && p.usual_position !== "POR" ? POSITION_LABELS[p.usual_position] : "—"],
    ["Dorsal", p.shirt_number ?? "—"],
    ["Partidos", tot.matches],
    ["Victorias", tot.wins],
  ];
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
              <Link key={x.matchId} href={`/partidos/${x.matchId}`} className="press flex items-center gap-3 rounded-2xl bg-surface shadow-card p-3">
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
          <Link href={`/estadios/${bv.venueId}`} className="press flex items-center gap-3 rounded-2xl bg-surface shadow-card p-4">
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
    <ul className="divide-y divide-line rounded-2xl bg-surface shadow-card">
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
      {/* 1 · Cabecera, equipo y detalles */}
      <PlayerHeader name={p.full_name} team={team} photo={p.photo_url} cardPhoto={p.card_photo_url} color={color}
        rating={tot.matches > 0 ? num(tot.ratingAvg, 1) : null}
        badge={!p.active ? <span className="mt-1 inline-block rounded-full bg-white/15 px-2 py-0.5 text-xs">Inactivo</span> : null} />
      {team && <TeamCard team={team} subtitle={[p.usual_position && p.usual_position !== "POR" ? POSITION_LABELS[p.usual_position] : null, p.shirt_number != null ? `Dorsal ${p.shirt_number}` : null].filter(Boolean).join(" · ") || null} />}
      <DetailsGrid items={ficha} />

      {/* 2 · Visor 3D */}
      {p.model_url && <PlayerStage src={p.model_url} poster={p.card_photo_url} name={p.nickname ?? p.full_name} color={color} mapUrl={p.model_map_url} paint={kitPaint(p.kit as Kit, p.shirt_number)} />}

      {/* 3 · Números */}
      {tot.matches > 0 && (
        <dl className="grid grid-cols-3 rounded-3xl bg-surface py-3.5 text-center shadow-card">
          {([["Goles", tot.goals], ["Asistencias", tot.assists], ["MVP", tot.mvps]] as const).map(([l, v]) => (
            <div key={l}><dd className="font-display tabular text-[1.65rem] font-bold leading-none">{v}</dd><dt className="mt-1 text-[10px] uppercase tracking-wider text-ink-3">{l}</dt></div>
          ))}
        </dl>
      )}

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
