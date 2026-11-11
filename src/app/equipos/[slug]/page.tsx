import Link from "next/link";
import { notFound } from "next/navigation";
import { Award, Crown, Footprints, Goal, UserPlus } from "lucide-react";
import { Avatar, Card, Crest, EmptyState, Pill, SectionTitle, Stat } from "@/components/ui";
import { FormStrip, WdlBar, WdlDonut } from "@/components/charts";
import { getStats } from "@/lib/data/stats";
import { getTexts } from "@/lib/data/config";
import { playerTotals, teamBadges, teamStats } from "@/lib/stats/engine";
import { num, pct, playerName, teamColor } from "@/lib/format";
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
        <SectionTitle>Datos generales</SectionTitle>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="Partidos" value={r.played} />
          <Stat label="Victorias" value={r.wins} hint={r.played ? pct(r.winPct) : undefined} />
          <Stat label="Empates" value={r.draws} />
          <Stat label="Derrotas" value={r.losses} />
          <Stat label="Goles a favor" value={r.goalsFor} hint={r.played ? `${num(r.goalsFor / r.played)} por partido` : undefined} />
          <Stat label="Goles en contra" value={r.goalsAgainst} hint={r.played ? `${num(r.goalsAgainst / r.played)} por partido` : undefined} />
          <Stat label="Diferencia" value={`${r.goalDiff >= 0 ? "+" : ""}${r.goalDiff}`} />
          <Stat label="Racha" value={st.form.length ? <FormStrip results={st.form.slice(-5).map((f) => f.result)} /> : "—"} />
        </div>
      </section>

      <section>
        <details className="group">
          <summary className="list-none">
            <Card className="flex cursor-pointer items-center gap-5 p-4">
              <WdlDonut wins={r.wins} draws={r.draws} losses={r.losses} label={team.name} />
              <div className="flex-1 space-y-1 text-sm">
                <p className="flex items-center gap-2"><span className="h-3 w-3 rounded-sm bg-win" />{r.wins} victorias</p>
                <p className="flex items-center gap-2"><span className="h-3 w-3 rounded-sm bg-draw" />{r.draws} empates</p>
                <p className="flex items-center gap-2"><span className="h-3 w-3 rounded-sm bg-loss" />{r.losses} derrotas</p>
                <p className="pt-1 text-xs font-semibold text-pitch">Toca para ver el desglose por estadio <span className="inline-block transition group-open:rotate-180">▾</span></p>
              </div>
            </Card>
          </summary>
          <Card className="mt-2 p-4">
            <SectionTitle>Rendimiento por estadio</SectionTitle>
            {venues.length === 0 ? <p className="text-sm text-ink-3">Sin partidos disputados.</p> : (
              <ul className="space-y-3">
                {venues.map(([vid, vr]) => (
                  <li key={vid}>
                    <div className="mb-1 flex justify-between text-sm"><span className="font-semibold">{vid === "none" ? "Estadio desconocido" : ds.venueById.get(vid)?.name}</span><span className="tabular text-ink-2">{vr.played} PJ · {vr.wins}V {vr.draws}E {vr.losses}D · {vr.goalsFor}:{vr.goalsAgainst}</span></div>
                    <WdlBar wins={vr.wins} draws={vr.draws} losses={vr.losses} />
                    {vr.played < 3 && <p className="mt-0.5 text-[11px] text-ink-3">Muestra pequeña ({vr.played} partido{vr.played === 1 ? "" : "s"})</p>}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </details>
      </section>

      <section>
        <SectionTitle>Destacados</SectionTitle>
        {badges.length === 0 ? <EmptyState title="Sin datos todavía">{t("history.empty")}</EmptyState> : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {badges.map((b) => {
              const Icon = BADGE_ICON[b.key];
              const p = ds.playerById.get(b.playerId);
              return (
                <Link key={b.key} href={`/jugadores/${b.playerId}`} className="rounded-2xl border border-line bg-surface p-3 hover:border-line-strong">
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
        <div className="grid gap-2 sm:grid-cols-2">
          {roster.map((p) => {
            const tot = playerTotals(p.id, teamParts);
            return (
              <Link key={p.id} href={`/jugadores/${p.id}`} className={`rounded-2xl border border-line bg-surface p-3 hover:border-line-strong ${p.active ? "" : "opacity-60"}`}>
                <div className="flex items-center gap-3">
                  <Avatar name={p.full_name} src={p.photo_url} size={44} color={teamColor(team)} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold">{p.full_name}</div>
                    <div className="truncate text-xs text-ink-3">{[p.nickname && `«${p.nickname}»`, p.usual_position && POSITION_LABELS[p.usual_position], !p.active && "Inactivo"].filter(Boolean).join(" · ") || "—"}</div>
                  </div>
                  {tot.mvps > 0 && <Pill tone="gold"><Award size={12} /> {tot.mvps}</Pill>}
                </div>
                <div className="mt-3 grid grid-cols-5 gap-1 text-center">
                  {[["PJ", tot.matches], ["Goles", tot.goals], ["Asist.", tot.assists], ["MVP", tot.mvps]].map(([l, v]) => (
                    <div key={l as string}><div className="text-[10px] font-semibold uppercase text-ink-3">{l}</div><div className="font-display tabular text-lg font-bold">{v}</div></div>
                  ))}
                  <div className="rounded-lg bg-surface-2"><div className="text-[10px] font-semibold uppercase text-ink-3">🧤 Enc.</div><div className="font-display tabular text-lg font-bold">{tot.concededAsGk}</div></div>
                </div>
              </Link>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-ink-3">🧤 Enc. = goles encajados en sus turnos de portería (no cuentan en su valoración de campo).</p>
      </section>
    </div>
  );
}
