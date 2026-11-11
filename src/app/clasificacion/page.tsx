import Link from "next/link";
import { Briefcase, MapPin } from "lucide-react";
import { Avatar, Card, Crest, EmptyState, PageHeader, SectionTitle, Select, cx, inputCls } from "@/components/ui";
import { HBars, LineChart, WdlBar } from "@/components/charts";
import { MatchRow } from "@/components/match/parts";
import { getStats } from "@/lib/data/stats";
import { getTexts } from "@/lib/data/config";
import { RANKING_LABELS, bestVenue, playedMatches, ranking, teamStats, type RankingStat } from "@/lib/stats/engine";
import { fmtDate, num, pct, playerName, teamColor } from "@/lib/format";

export const metadata = { title: "Clasificación" };

const TABS = [
  { key: "equipos", label: "Equipos" },
  { key: "individual", label: "Individual" },
  { key: "rankings", label: "Rankings" },
  { key: "partidos", label: "Partidos" },
] as const;

type SP = { tab?: string; team?: string; season?: string; venue?: string; stat?: string; min?: string; guests?: string };

export default async function History({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const tab = TABS.some((t) => t.key === sp.tab) ? sp.tab! : "equipos";
  const [{ ds }, t] = await Promise.all([getStats(), getTexts()]);
  const played = playedMatches(ds.matches);

  return (
    <div>
      <PageHeader title="Clasificación" subtitle={`${played.length} partidos disputados desde el primer registro.`} />
      <div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {ds.teams.map((tm) => (
          <Link key={tm.id} href={`/equipos/${tm.slug}`} className="press flex min-h-14 items-center gap-2 rounded-2xl border border-line bg-surface px-3 text-sm font-semibold hover:border-line-strong">
            <Crest src={tm.crest_url} name={tm.name} size={28} /><span className="truncate">{tm.short_name}</span>
          </Link>
        ))}
        <Link href="/despacho" className="press flex min-h-14 items-center gap-2 rounded-2xl border border-line bg-surface px-3 text-sm font-semibold hover:border-line-strong">
          <Briefcase size={20} aria-hidden className="text-ink-3" /><span className="truncate">El Despacho</span>
        </Link>
        <Link href="/estadios" className="press flex min-h-14 items-center gap-2 rounded-2xl border border-line bg-surface px-3 text-sm font-semibold hover:border-line-strong">
          <MapPin size={20} aria-hidden className="text-ink-3" /><span className="truncate">Estadios</span>
        </Link>
      </div>
      <nav aria-label="Secciones del histórico" className="no-scrollbar mb-5 flex gap-1 overflow-x-auto rounded-xl bg-surface-2 p-1">
        {TABS.map((x) => (
          <Link key={x.key} href={`/clasificacion?tab=${x.key}`} aria-current={tab === x.key ? "page" : undefined}
            className={cx("flex min-h-10 flex-1 items-center justify-center whitespace-nowrap rounded-lg px-3 text-sm font-semibold", tab === x.key ? "bg-surface text-ink shadow-card" : "text-ink-3")}>
            {x.label}
          </Link>
        ))}
      </nav>
      {played.length === 0 && tab !== "partidos" ? <EmptyState title="Sin historia todavía">{t("history.empty")}</EmptyState> : (
        <>
          {tab === "equipos" && <TeamsTab />}
          {tab === "individual" && <IndividualTab />}
          {tab === "rankings" && <RankingsTab sp={sp} />}
          {tab === "partidos" && (
            <div className="space-y-2">
              {ds.matches.length === 0 ? <EmptyState title="Sin partidos">{t("history.empty")}</EmptyState> :
                [...ds.matches].sort((a, b) => b.kickoff_at.localeCompare(a.kickoff_at)).map((m) => <MatchRow key={m.id} m={m} teams={ds.teamById} venues={ds.venueById} />)}
            </div>
          )}
        </>
      )}
    </div>
  );
}

async function TeamsTab() {
  const { ds } = await getStats();
  const [a, b] = ds.teams;
  const sa = teamStats(a.id, ds.matches);
  const sb = teamStats(b.id, ds.matches);
  const played = sa.record.played;
  // Evolución: victorias acumuladas de cada equipo partido a partido
  const evoA: number[] = [], evoB: number[] = [];
  let wa = 0, wb = 0;
  for (const f of sa.form) { if (f.result === "W") wa++; if (f.result === "L") wb++; evoA.push(wa); evoB.push(wb); }
  const venues = new Set([...sa.byVenue.keys()]);
  const seasons = [...sa.bySeason.keys()].sort().reverse();
  return (
    <div className="space-y-6">
      <Card className="p-4">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-center">
          <TeamHead team={a} wins={sa.record.wins} />
          <div><div className="font-display tabular text-3xl font-bold text-ink-3">{sa.record.draws}</div><div className="text-[11px] uppercase text-ink-3">empates</div></div>
          <TeamHead team={b} wins={sb.record.wins} />
        </div>
        <div className="mt-4 flex h-3 overflow-hidden rounded-full">
          <span style={{ width: `${(sa.record.wins / (played || 1)) * 100}%`, background: a.primary_color }} />
          <span style={{ width: `${(sa.record.draws / (played || 1)) * 100}%` }} className="bg-surface-3" />
          <span style={{ width: `${(sb.record.wins / (played || 1)) * 100}%`, background: b.primary_color }} />
        </div>
        <p className="mt-2 text-center text-xs text-ink-3">{played} enfrentamientos</p>
      </Card>

      <Card className="p-4">
        <div className="mb-3 grid grid-cols-[1fr_auto_1fr] items-center text-sm font-semibold">
          <span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: teamColor(a) }} aria-hidden />{a.short_name}</span>
          <span className="text-xs font-normal text-ink-3">cara a cara</span>
          <span className="flex items-center justify-end gap-2">{b.short_name}<span className="h-2.5 w-2.5 rounded-full" style={{ background: teamColor(b) }} aria-hidden /></span>
        </div>
        <dl className="space-y-2.5">
          {([
            ["% victorias", sa.record.winPct, sb.record.winPct, (v: number) => pct(v)],
            ["Goles marcados", sa.record.goalsFor, sb.record.goalsFor, (v: number) => String(v)],
            ["Goles por partido", sa.record.goalsFor / (sa.record.played || 1), sb.record.goalsFor / (sb.record.played || 1), (v: number) => num(v)],
          ] as const).map(([label, va, vb, f]) => {
            const total = va + vb || 1;
            return (
              <div key={label}>
                <div className="flex items-baseline justify-between text-sm">
                  <span className={va >= vb ? "font-display tabular text-lg font-bold" : "font-display tabular text-lg text-ink-3"}>{f(va)}</span>
                  <dt className="text-xs text-ink-3">{label}</dt>
                  <span className={vb >= va ? "font-display tabular text-lg font-bold" : "font-display tabular text-lg text-ink-3"}>{f(vb)}</span>
                </div>
                <div className="mt-1 flex h-1.5 gap-0.5 overflow-hidden rounded-full" aria-hidden>
                  <span style={{ width: `${(va / total) * 100}%`, background: teamColor(a) }} />
                  <span style={{ width: `${(vb / total) * 100}%`, background: teamColor(b) }} />
                </div>
              </div>
            );
          })}
          <div className="flex items-baseline justify-between border-t border-line pt-2.5 text-sm">
            <span className="font-display tabular text-lg font-bold">{sa.biggestWin ? `${sa.biggestWin.gf}-${sa.biggestWin.ga}` : "—"}</span>
            <dt className="text-xs text-ink-3">Mayor victoria</dt>
            <span className="font-display tabular text-lg font-bold">{sb.biggestWin ? `${sb.biggestWin.gf}-${sb.biggestWin.ga}` : "—"}</span>
          </div>
        </dl>
      </Card>

      <section>
        <SectionTitle>Evolución (victorias acumuladas)</SectionTitle>
        <Card className="p-4">
          <LineChart labels={sa.form.map((f) => fmtDate(f.kickoff))} series={[
            { name: a.short_name, color: teamColor(a), values: evoA },
            { name: b.short_name, color: teamColor(b), values: evoB },
          ]} />
        </Card>
      </section>

      <section>
        <SectionTitle>Rendimiento en cada estadio</SectionTitle>
        <div className="space-y-2">
          {[...venues].map((vid) => {
            const ra = sa.byVenue.get(vid)!;
            return (
              <Card key={vid} className="p-3">
                <div className="mb-1 flex justify-between text-sm"><span className="font-semibold">{vid === "none" ? "Estadio desconocido" : ds.venueById.get(vid)?.name}</span><span className="tabular text-ink-3">{ra.played} PJ{ra.played < 3 ? " · muestra pequeña" : ""}</span></div>
                <div className="flex items-center gap-2 text-xs"><span className="w-20 truncate">{a.short_name}</span><WdlBar className="flex-1" wins={ra.wins} draws={ra.draws} losses={ra.losses} /><span className="tabular w-16 text-right">{ra.goalsFor}:{ra.goalsAgainst}</span></div>
              </Card>
            );
          })}
        </div>
      </section>

      {seasons.length > 0 && (
        <section>
          <SectionTitle>Por temporada</SectionTitle>
          <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
            {seasons.map((s) => {
              const r = sa.bySeason.get(s)!;
              return (
                <li key={s} className="flex items-center justify-between px-4 py-3 text-sm">
                  <span className="font-semibold">{s}</span>
                  <span className="tabular text-ink-2">{a.short_name} {r.wins} · {r.draws} · {r.losses} {b.short_name} <span className="text-ink-3">({r.goalsFor}:{r.goalsAgainst})</span></span>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}

function TeamHead({ team, wins }: { team: { name: string; short_name: string; crest_url: string | null; slug: string }; wins: number }) {
  return (
    <Link href={`/equipos/${team.slug}`} className="flex flex-col items-center gap-1">
      <Crest src={team.crest_url} name={team.name} size={52} />
      <span className="font-display tabular text-4xl font-bold">{wins}</span>
      <span className="text-[11px] uppercase text-ink-3">victorias {team.short_name}</span>
    </Link>
  );
}

async function IndividualTab() {
  const { ds, parts } = await getStats();
  const P = (id: string) => ds.playerById.get(id);
  const team = (id: string) => ds.teamById.get(P(id)?.team_id ?? "");
  const leaders = (stat: RankingStat, n = 5) => ranking(parts, stat).slice(0, n);
  const fmtRow = (stat: RankingStat, digits = 0) => (r: ReturnType<typeof ranking>[number]) => ({
    label: <Link href={`/jugadores/${r.playerId}`} className="font-medium">{playerName(P(r.playerId), "short")}</Link>,
    value: Number(r[stat] ?? 0),
    color: teamColor(team(r.playerId)),
    sub: `${r.matches} PJ${digits ? "" : ""}`,
  });
  const gk = ranking(parts, "concededPerSpell", { minMatches: 1 }).filter((r) => r.gkSpells >= 2).slice(0, 5);
  const bestPerf = [...parts].filter((p) => !p.isGuest).sort((a, b) => b.rating - a.rating).slice(0, 5);
  const venueKings = ds.venues.map((v) => {
    const ps = parts.filter((p) => p.venueId === v.id && !p.isGuest);
    const ids = [...new Set(ps.map((p) => p.playerId))];
    const best = ids.map((id) => ({ id, bv: bestVenue(id, ps, 2) })).filter((x) => x.bv && !x.bv.smallSample).sort((x, y) => y.bv!.ratingAvg - x.bv!.ratingAvg)[0];
    return best ? { venue: v.name, id: best.id, avg: best.bv!.ratingAvg, n: best.bv!.matches } : null;
  }).filter(Boolean) as { venue: string; id: string; avg: number; n: number }[];

  const block = (title: string, stat: RankingStat, digits = 0) => {
    const rows = leaders(stat);
    return (
      <Card className="p-4">
        <SectionTitle>{title}</SectionTitle>
        {rows.length && rows[0][stat] ? <HBars rows={rows.map(fmtRow(stat, digits))} format={(v) => num(v, digits)} /> : <p className="text-sm text-ink-3">Sin datos suficientes.</p>}
      </Card>
    );
  };
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {block("Máximos goleadores", "goals")}
      {block("Máximos asistentes", "assists")}
      {block("Más MVP", "mvps")}
      {block("Más partidos", "matches")}
      <Card className="p-4">
        <SectionTitle>Mejores actuaciones</SectionTitle>
        <ol className="space-y-2 text-sm">
          {bestPerf.map((p, i) => (
            <li key={`${p.matchId}${p.playerId}`}><Link href={`/partidos/${p.matchId}`} className="flex justify-between gap-2"><span><span className="tabular mr-2 text-ink-3">{i + 1}.</span>{playerName(P(p.playerId), "short")} <span className="text-ink-3">· {fmtDate(p.kickoff)} · {p.goals}G {p.assists}A{p.isMvp ? " · MVP" : ""}</span></span><span className="font-display tabular font-bold">{num(p.rating, 1)}</span></Link></li>
          ))}
        </ol>
      </Card>
      <Card className="p-4">
        <SectionTitle>Porteros (encajados por turno)</SectionTitle>
        {gk.length ? <HBars rows={gk.map((r) => ({ label: <Link href={`/jugadores/${r.playerId}`}>{playerName(P(r.playerId), "short")}</Link>, value: r.concededPerSpell ?? 0, sub: `${r.gkSpells} turnos · ${r.concededAsGk} encajados` }))} format={(v) => num(v, 2)} color="var(--gold)" />
          : <p className="text-sm text-ink-3">Hacen falta al menos 2 turnos de portería registrados por jugador.</p>}
        <p className="mt-2 text-xs text-ink-3">Menos es mejor. Estadística independiente de la nota.</p>
      </Card>
      <Card className="p-4 lg:col-span-2">
        <SectionTitle>Mejor rendimiento por estadio</SectionTitle>
        {venueKings.length ? (
          <ul className="grid gap-2 sm:grid-cols-2">
            {venueKings.map((v) => <li key={v.venue} className="rounded-xl bg-surface-2 px-3 py-2 text-sm"><div className="text-xs text-ink-3">{v.venue}</div><Link href={`/jugadores/${v.id}`} className="font-semibold">{playerName(P(v.id), "short")}</Link> <span className="text-ink-3">· nota {num(v.avg, 1)} en {v.n} partidos</span></li>)}
          </ul>
        ) : <p className="text-sm text-ink-3">Se necesitan al menos 2 partidos de un jugador en un mismo estadio.</p>}
      </Card>
    </div>
  );
}

async function RankingsTab({ sp }: { sp: SP }) {
  const { ds, parts } = await getStats();
  const stat = (Object.keys(RANKING_LABELS).includes(sp.stat ?? "") ? sp.stat : "goals") as RankingStat;
  const min = Math.max(1, Number(sp.min) || 1);
  const seasons = [...new Set(parts.map((p) => p.season))].sort().reverse();
  const rows = ranking(parts, stat, { teamId: sp.team || undefined, season: sp.season || undefined, venueId: sp.venue || undefined, minMatches: min, includeGuests: sp.guests === "1" });
  const digits = ["ratingAvg", "goalsPerMatch", "assistsPerMatch", "concededPerSpell", "ratingTotal"].includes(stat) ? 2 : 0;
  return (
    <div className="space-y-4">
      <form method="get" className="grid grid-cols-2 gap-2 rounded-2xl border border-line bg-surface p-3 sm:grid-cols-3 lg:grid-cols-6">
        <input type="hidden" name="tab" value="rankings" />
        <Select name="stat" defaultValue={stat} aria-label="Estadística">{Object.entries(RANKING_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
        <Select name="team" defaultValue={sp.team ?? ""} aria-label="Equipo"><option value="">Los dos equipos</option>{ds.teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select>
        <Select name="season" defaultValue={sp.season ?? ""} aria-label="Temporada"><option value="">Siempre</option>{seasons.map((s) => <option key={s} value={s}>{s}</option>)}</Select>
        <Select name="venue" defaultValue={sp.venue ?? ""} aria-label="Estadio"><option value="">Todo campo</option>{ds.venues.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</Select>
        <label className="flex items-center gap-2 text-sm"><span className="shrink-0 text-ink-3">Mín. PJ</span><input name="min" type="number" min={1} defaultValue={min} className={inputCls} /></label>
        <button className="min-h-11 rounded-xl bg-pitch px-4 text-sm font-semibold text-pitch-ink">Aplicar</button>
      </form>
      <Card className="p-4">
        <SectionTitle>{RANKING_LABELS[stat]}</SectionTitle>
        {rows.length === 0 ? <p className="text-sm text-ink-3">Ningún jugador cumple los filtros. No inventamos datos: prueba a relajar el mínimo de partidos.</p> : (
          <>
          <ol className="mb-4 grid grid-cols-3 items-end gap-2 text-center" aria-label="Podio">
            {[1, 0, 2].map((k) => {
              const r = rows[k];
              if (!r) return <li key={k} />;
              const p = ds.playerById.get(r.playerId);
              const tm = p?.team_id ? ds.teamById.get(p.team_id) : null;
              const h = ["h-24", "h-16", "h-12"][k];
              return (
                <li key={k} className="stagger">
                  <Link href={`/jugadores/${r.playerId}`} className="press flex flex-col items-center gap-1">
                    <span className={k === 0 ? "rounded-full ring-4 ring-gold" : "rounded-full ring-2 ring-line-strong"}><Avatar name={p?.full_name ?? "?"} src={p?.photo_url} size={k === 0 ? 56 : 44} color={teamColor(tm)} /></span>
                    <span className="w-full truncate text-xs font-semibold">{playerName(p, "nick")}</span>
                    <span className={`flex w-full flex-col items-center justify-start rounded-t-xl pt-1.5 ${h} ${k === 0 ? "bg-gold-soft" : "bg-surface-2"}`}>
                      <span className={`font-display tabular text-xl font-bold ${k === 0 ? "text-gold" : ""}`}>{num(Number(r[stat] ?? 0), digits)}</span>
                      <span className="text-[11px] text-ink-3">{k + 1}.º</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ol>
          <HBars rows={rows.slice(0, 25).map((r) => {
            const p = ds.playerById.get(r.playerId);
            const tm = p?.team_id ? ds.teamById.get(p.team_id) : null;
            return {
              label: <Link href={`/jugadores/${r.playerId}`} className="font-medium">{playerName(p, "short")}</Link>,
              value: Number(r[stat] ?? 0),
              color: teamColor(tm),
              sub: `${tm?.short_name ?? "Invitado"} · ${r.matches} PJ · ${r.goals}G ${r.assists}A ${r.mvps} MVP`,
            };
          })} format={(v) => num(v, digits)} />
          </>
        )}
        {stat === "concededPerSpell" && <p className="mt-2 text-xs text-ink-3">Orden ascendente: menos encajados por turno es mejor.</p>}
      </Card>
    </div>
  );
}
