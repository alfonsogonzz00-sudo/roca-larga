import Link from "next/link";
import { notFound } from "next/navigation";
import { Award, Crown, Footprints, Goal, UserPlus } from "lucide-react";
import { Avatar, Card, Crest, EmptyState, SectionTitle } from "@/components/ui";
import { FormStrip, WdlBar, WdlDonut } from "@/components/charts";
import { getStats } from "@/lib/data/stats";
import { getTexts } from "@/lib/data/config";
import { playerTotals, teamBadges, teamStats } from "@/lib/stats/engine";
import { pct, playerName, teamColor } from "@/lib/format";
import { POSITION_LABELS } from "@/lib/types";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { ds } = await getStats();
  return { title: ds.teams.find((t) => t.slug === slug)?.name ?? "Equipo" };
}

const BADGE_ICON = { star: Crown, top_scorer: Goal, top_assist: Footprints, top_mvp: Award, guest_bringer: UserPlus };

export default async function TeamPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [{ ds, parts }, t] = await Promise.all([getStats(), getTexts()]);
  const team = ds.teams.find((x) => x.slug === slug);
  if (!team) notFound();
  const st = teamStats(team.id, ds.matches);
  const r = st.record;
  const badges = teamBadges(team.id, parts, ds.players);
  const roster = ds.players.filter((p) => p.team_id === team.id && p.kind === "member").sort((a, b) => Number(b.active) - Number(a.active) || a.full_name.localeCompare(b.full_name));
  const teamParts = parts.filter((p) => p.teamId === team.id);
  const venues = [...st.byVenue.entries()].sort((a, b) => b[1].played - a[1].played);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4 rounded-3xl p-5" style={{ background: `linear-gradient(135deg, ${team.primary_color}, ${team.primary_color}cc)` }}>
        <span className="flex h-24 w-24 shrink-0 items-center justify-center rounded-2xl bg-white p-2"><Crest src={team.crest_url} name={team.name} size={80} /></span>
        <div className="min-w-0 text-white">
          <h1 className="font-display text-3xl font-bold uppercase leading-none sm:text-4xl">{team.name}</h1>
          <p className="mt-1 text-sm text-white/80">{team.full_name}</p>
          {team.headquarters && <p className="text-sm text-white/80">Sede: {team.headquarters}</p>}
          {team.founded_label && <p className="text-xs text-white/70">{team.founded_label}</p>}
        </div>
      </div>
      {team.description && <p className="text-sm text-ink-2">{team.description}</p>}

      <section>
        <SectionTitle>Balance</SectionTitle>
        <Card className="p-4">
          {r.played === 0 ? <p className="text-sm text-ink-3">Todavía no ha disputado partidos.</p> : (
            <>
              <div className="flex items-center gap-4">
                <WdlDonut wins={r.wins} draws={r.draws} losses={r.losses} label={team.name} />
                <dl className="grid flex-1 grid-cols-3 text-center">
                  {([["Victorias", r.wins, "text-win"], ["Empates", r.draws, "text-draw"], ["Derrotas", r.losses, "text-loss"]] as const).map(([l, v, c]) => (
                    <div key={l}><dt className="text-xs text-ink-3">{l}</dt><dd className={`font-display tabular text-3xl font-bold ${c}`}>{v}</dd></div>
                  ))}
                </dl>
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-line pt-3 text-sm">
                <span><span className="text-ink-3">Partidos</span> <strong className="tabular">{r.played}</strong></span>
                <span><span className="text-ink-3">Goles</span> <strong className="tabular">{r.goalsFor}:{r.goalsAgainst}</strong> <span className="tabular text-ink-3">({r.goalDiff >= 0 ? "+" : ""}{r.goalDiff})</span></span>
                <span><span className="text-ink-3">% victorias</span> <strong className="tabular">{pct(r.winPct)}</strong></span>
                {st.form.length > 0 && <span className="flex items-center gap-2"><span className="text-ink-3">Racha</span><FormStrip results={st.form.slice(-5).map((f) => f.result)} /></span>}
              </div>
            </>
          )}
        </Card>
      </section>

      {venues.length > 0 && (
        <section>
          <SectionTitle>Por estadio</SectionTitle>
          <Card className="p-4">
            <ul className="space-y-3">
              {venues.map(([vid, vr]) => (
                <li key={vid}>
                  <div className="mb-1 flex justify-between gap-2 text-sm"><span className="truncate font-semibold">{vid === "none" ? "Estadio desconocido" : ds.venueById.get(vid)?.name}</span><span className="tabular shrink-0 text-ink-2">{vr.wins}V {vr.draws}E {vr.losses}D · {vr.goalsFor}:{vr.goalsAgainst}</span></div>
                  <WdlBar wins={vr.wins} draws={vr.draws} losses={vr.losses} />
                  {vr.played < 3 && <p className="mt-0.5 text-[11px] text-ink-3">Muestra pequeña ({vr.played} partido{vr.played === 1 ? "" : "s"})</p>}
                </li>
              ))}
            </ul>
          </Card>
        </section>
      )}

      <section>
        <SectionTitle>Destacados</SectionTitle>
        {badges.length === 0 ? <EmptyState title="Sin datos todavía">{t("history.empty")}</EmptyState> : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {badges.map((b) => {
              const Icon = BADGE_ICON[b.key];
              const p = ds.playerById.get(b.playerId);
              return (
                <Link key={b.key} href={`/jugadores/${b.playerId}`} className="press rounded-2xl border border-line bg-surface p-3 hover:border-line-strong">
                  <Icon size={20} className="text-gold" aria-hidden />
                  <div className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-ink-3">{t(`badge.${b.key}`)}</div>
                  <div className="truncate font-semibold">{playerName(p, "short")}</div>
                  <div className="text-xs text-ink-2">{b.detail}</div>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      <section>
        <SectionTitle>Plantilla ({roster.filter((p) => p.active).length})</SectionTitle>
        <Card className="divide-y divide-line">
          <div className="flex items-center gap-3 px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-ink-3" aria-hidden>
            <span className="flex-1">Jugador</span>
            <span className="grid w-[8.5rem] grid-cols-4 text-center"><span>PJ</span><span>G</span><span>A</span><span>MVP</span></span>
          </div>
          {roster.map((p) => {
            const tot = playerTotals(p.id, teamParts);
            return (
              <Link key={p.id} href={`/jugadores/${p.id}`} className={`press flex min-h-14 items-center gap-3 px-3 py-2 hover:bg-surface-2 ${p.active ? "" : "opacity-60"}`}>
                <Avatar name={p.full_name} src={p.photo_url} size={38} color={teamColor(team)} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{p.nickname ?? playerName(p, "short")}</span>
                  <span className="block truncate text-xs text-ink-3">{[p.nickname && playerName(p, "short"), p.usual_position && POSITION_LABELS[p.usual_position], tot.gkSpells ? `${tot.concededAsGk} enc. en portería` : null, !p.active && "Inactivo"].filter(Boolean).join(" · ") || "Sin partidos"}</span>
                </span>
                <span className="grid w-[8.5rem] shrink-0 grid-cols-4 text-center font-display tabular text-lg font-bold" aria-label={`${tot.matches} partidos, ${tot.goals} goles, ${tot.assists} asistencias, ${tot.mvps} MVP`}>
                  <span className="text-ink-2">{tot.matches}</span><span>{tot.goals}</span><span>{tot.assists}</span><span className={tot.mvps ? "text-gold" : "text-ink-3"}>{tot.mvps}</span>
                </span>
              </Link>
            );
          })}
        </Card>
        <p className="mt-2 text-xs text-ink-3">«Enc. en portería» = goles encajados en sus turnos de portero; no cuentan en su valoración como jugador de campo.</p>
      </section>
    </div>
  );
}
