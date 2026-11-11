import Link from "next/link";
import { ChevronRight, Cloud, CloudFog, CloudRain, MapPin, Sun, Thermometer, Wind, HelpCircle } from "lucide-react";
import { Avatar, Card, Crest, Pill, cx } from "@/components/ui";
import { fmtShortDay, fmtTime, num, pct, playerName } from "@/lib/format";
import type { MatchPrediction } from "@/lib/stats/model";
import { POSITION_LABELS, STATUS_LABELS, WEATHER_LABELS, type Formation, type Match, type MatchStatus, type Player, type Position, type Team, type Venue, type Weather } from "@/lib/types";

export function StatusPill({ status }: { status: MatchStatus }) {
  const tone = { pending: "neutral", confirmed: "pitch", played: "neutral", postponed: "gold", cancelled: "danger" } as const;
  return <Pill tone={tone[status]}>{STATUS_LABELS[status]}</Pill>;
}

const WICON: Record<Weather, typeof Sun> = { despejado: Sun, nublado: Cloud, lluvia: CloudRain, viento: Wind, niebla: CloudFog, otro: HelpCircle };

export function WeatherBadge({ weather, temp, label }: { weather: Weather | null; temp: number | null; label?: string }) {
  if (!weather && temp == null) return <span className="text-sm text-ink-3">Sin información meteorológica</span>;
  const Icon = weather ? WICON[weather] : Thermometer;
  return (
    <span className="inline-flex items-center gap-1.5 text-sm text-ink-2">
      <Icon size={16} aria-hidden />
      {label && <span className="text-ink-3">{label}</span>}
      {weather && WEATHER_LABELS[weather]}
      {temp != null && <span className="tabular">{weather ? " · " : ""}{num(Number(temp), 0)} °C</span>}
    </span>
  );
}

/** Fila de partido para listados */
export function MatchRow({ m, teams, venues }: { m: Match; teams: Map<string, Team>; venues: Map<string, Venue> }) {
  const h = teams.get(m.home_team_id)!;
  const a = teams.get(m.away_team_id)!;
  const played = m.status === "played";
  return (
    <Link href={`/partidos/${m.id}`} className="group flex min-h-16 items-center gap-3 rounded-2xl border border-line bg-surface px-3 py-2.5 transition hover:border-line-strong">
      <div className="w-14 shrink-0 text-center">
        <div className="text-[11px] font-semibold uppercase text-ink-3">{fmtShortDay(m.kickoff_at).split(" ").slice(0, 1)}</div>
        <div className="font-display tabular text-lg font-bold leading-none">{fmtShortDay(m.kickoff_at).split(" ").slice(1).join(" ")}</div>
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        <TeamLine team={h} score={played ? m.home_score : null} winner={played && m.home_score! > m.away_score!} />
        <TeamLine team={a} score={played ? m.away_score : null} winner={played && m.away_score! > m.home_score!} />
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1 text-right">
        {played ? <span className="text-[11px] text-ink-3">{m.origin === "historical" ? "Histórico" : "Final"}</span> : <StatusPill status={m.status} />}
        {!played && <span className="tabular text-sm font-semibold">{fmtTime(m.kickoff_at)}</span>}
        {m.venue_id && <span className="max-w-28 truncate text-[11px] text-ink-3">{venues.get(m.venue_id)?.name}</span>}
      </div>
      <ChevronRight size={18} className="shrink-0 text-ink-3 transition group-hover:translate-x-0.5" aria-hidden />
    </Link>
  );
}

function TeamLine({ team, score, winner }: { team: Team; score: number | null; winner: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <Crest src={team.crest_url} name={team.name} size={22} />
      <span className={cx("flex-1 truncate text-sm", winner ? "font-bold text-ink" : "font-medium text-ink-2")}>{team.name}</span>
      {score != null && <span className={cx("font-display tabular text-xl font-bold", winner ? "text-ink" : "text-ink-3")}>{score}</span>}
    </div>
  );
}

/** Marcador grande / cabecera de partido */
export function Scoreboard({ m, home, away, venue }: { m: Match; home: Team; away: Team; venue?: Venue }) {
  const played = m.status === "played";
  return (
    <div className="pitch-lines relative overflow-hidden rounded-3xl bg-[#0f2a18] p-5 text-white shadow-card">
      <div className="pointer-events-none absolute inset-y-0 left-1/2 w-px bg-white/10" />
      <div className="pointer-events-none absolute top-1/2 left-1/2 h-32 w-32 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/10" />
      <div className="relative grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <TeamBlock team={home} label="Local" />
        <div className="text-center">
          {played ? (
            <div className="font-display tabular text-5xl font-bold leading-none sm:text-6xl">{m.home_score}<span className="mx-2 text-white/40">–</span>{m.away_score}</div>
          ) : (
            <div>
              <div className="font-display tabular text-4xl font-bold leading-none sm:text-5xl">{fmtTime(m.kickoff_at)}</div>
              <div className="mt-1 text-xs uppercase tracking-wider text-white/60">{fmtShortDay(m.kickoff_at)}</div>
            </div>
          )}
        </div>
        <TeamBlock team={away} label="Visitante" />
      </div>
      <div className="relative mt-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-white/75">
        {played && <span>{fmtShortDay(m.kickoff_at)} · {fmtTime(m.kickoff_at)}</span>}
        <span className="inline-flex items-center gap-1"><MapPin size={13} aria-hidden />{venue?.name ?? "Estadio por confirmar"}</span>
      </div>
    </div>
  );
}

function TeamBlock({ team, label }: { team: Team; label: string }) {
  return (
    <Link href={`/equipos/${team.slug}`} className="flex flex-col items-center gap-2 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/95 p-1.5 sm:h-20 sm:w-20"><Crest src={team.crest_url} name={team.name} size={60} /></span>
      <span className="font-display text-base font-bold uppercase leading-tight sm:text-lg">{team.name}</span>
      <span className="text-[10px] uppercase tracking-widest text-white/50">{label}</span>
    </Link>
  );
}

/** Pizarra con la formación (6 de campo + portero rotatorio) */
export function FormationBoard({ formation, players, positions, color, teamName }: {
  formation: Formation | null; players: Player[]; positions: Map<string, Position | null>; color: string; teamName: string;
}) {
  const lines = formation?.lines ?? [];
  const order: Position[] = ["DEF", "MED", "DEL"];
  const pool = [...players].sort((a, b) => {
    const pa = positions.get(a.id) ?? a.usual_position ?? "MED";
    const pb = positions.get(b.id) ?? b.usual_position ?? "MED";
    const ia = pa === "POR" ? 3 : order.indexOf(pa);
    const ib = pb === "POR" ? 3 : order.indexOf(pb);
    return ia - ib;
  });
  // Reparte a los convocados por líneas (defensa → ataque); el portero rota
  const rows: Player[][] = [];
  let i = 0;
  for (const n of lines) { rows.push(pool.slice(i, i + n)); i += n; }
  const extra = pool.slice(i);
  return (
    <div className="rounded-2xl bg-[#14361f] p-3 text-white">
      <div className="mb-2 flex items-center justify-between text-xs">
        <span className="font-semibold">{teamName}</span>
        <span className="font-display tabular text-sm font-bold">{formation?.name ?? "Formación sin definir"}</span>
      </div>
      <div className="relative flex min-h-56 flex-col-reverse justify-around gap-3 rounded-xl border border-white/15 px-2 py-4">
        <div className="pointer-events-none absolute inset-x-6 top-0 h-8 rounded-b-xl border border-t-0 border-white/15" />
        <div className="pointer-events-none absolute inset-x-6 bottom-0 h-8 rounded-t-xl border border-b-0 border-white/15" />
        <div className="flex justify-center"><Chip label="POR rotatorio" color="#d6b25e" dashed /></div>
        {rows.map((r, idx) => (
          <div key={idx} className="flex justify-around">
            {Array.from({ length: lines[idx] }).map((_, j) => {
              const p = r[j];
              return <Chip key={j} label={p ? playerName(p, "nick") : "—"} color={color} />;
            })}
          </div>
        ))}
      </div>
      {extra.length > 0 && <p className="mt-2 text-xs text-white/70">Además: {extra.map((p) => playerName(p, "nick")).join(", ")}</p>}
    </div>
  );
}

function Chip({ label, color, dashed }: { label: string; color: string; dashed?: boolean }) {
  return (
    <span className="flex max-w-[5.5rem] flex-col items-center gap-1 text-center">
      <span className={cx("h-7 w-7 rounded-full border-2", dashed ? "border-dashed" : "border-white/70")} style={{ background: dashed ? "transparent" : color, borderColor: dashed ? color : undefined }} />
      <span className="w-full truncate text-[11px] font-semibold leading-tight">{label}</span>
    </span>
  );
}

/** Lista de jugadores con su posición */
export function PlayerChipList({ items, color }: { items: { player: Player; position?: Position | null; note?: string; attendance?: string }[]; color: string }) {
  if (!items.length) return <p className="text-sm text-ink-3">Sin jugadores.</p>;
  return (
    <ul className="divide-y divide-line">
      {items.map(({ player, position, note, attendance }) => (
        <li key={player.id} className="flex min-h-11 items-center gap-3 py-1.5">
          <Avatar name={player.full_name} src={player.photo_url} size={30} color={color} />
          <Link href={`/jugadores/${player.id}`} className="min-w-0 flex-1 truncate text-sm">
            <span className="font-medium">{player.full_name}</span>
            {player.nickname && <span className="text-ink-3"> · {player.nickname}</span>}
            {note && <span className="block text-xs text-ink-3">{note}</span>}
          </Link>
          {attendance === "yes" && <Pill tone="pitch">Va</Pill>}
          {attendance === "no" && <Pill tone="danger">No va</Pill>}
          {(position ?? player.usual_position) && <span className="text-xs font-semibold text-ink-3">{POSITION_LABELS[(position ?? player.usual_position)!].slice(0, 3).toUpperCase()}</span>}
        </li>
      ))}
    </ul>
  );
}

const LEVEL_TONE = { insuficiente: "danger", baja: "gold", media: "neutral", alta: "pitch" } as const;

/** Pronóstico: probabilidades, marcador probable, factores y goleadores */
export function PredictionPanel({ p, home, away, players, compact, lowText }: {
  p: MatchPrediction; home: Team; away: Team; players: Map<string, Player>; compact?: boolean; lowText?: string;
}) {
  if (p.status !== "ok" || !p.matrix) {
    return <Card className="p-4"><p className="text-sm text-ink-2">{p.warnings[0]}</p></Card>;
  }
  const mx = p.matrix;
  const bars = [
    { label: home.short_name, v: mx.pHome, c: home.primary_color },
    { label: "Empate", v: mx.pDraw, c: "var(--ink-3)" },
    { label: away.short_name, v: mx.pAway, c: away.primary_color },
  ];
  const topScorers = [...p.players].sort((a, b) => b.pScore - a.pScore).slice(0, 5);
  const topAssists = [...p.players].sort((a, b) => b.pAssist - a.pAssist).slice(0, 3);
  return (
    <Card className="space-y-4 p-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-ink-3">Marcador más probable</div>
          <div className="font-display tabular text-3xl font-bold">{home.short_name} {mx.mostLikely.home}–{mx.mostLikely.away} {away.short_name}</div>
          <div className="text-xs text-ink-3">Goles esperados: {num(p.lambdaHome)} – {num(p.lambdaAway)} · {pct(mx.mostLikely.p)} de ese marcador exacto</div>
        </div>
        <Pill tone={LEVEL_TONE[p.confidence.level]}>Confianza {p.confidence.level}</Pill>
      </div>
      <div>
        <div className="flex h-3 overflow-hidden rounded-full" role="img" aria-label={bars.map((b) => `${b.label} ${pct(b.v)}`).join(", ")}>
          {bars.map((b) => <span key={b.label} style={{ width: `${b.v * 100}%`, background: b.c }} className="border-r border-surface last:border-0" />)}
        </div>
        <div className="mt-1.5 grid grid-cols-3 text-xs">
          {bars.map((b, i) => (
            <span key={b.label} className={cx(i === 1 ? "text-center" : i === 2 ? "text-right" : "")}>
              <span className="font-semibold text-ink">{b.label}</span> <span className="tabular text-ink-2">{pct(b.v)}</span>
            </span>
          ))}
        </div>
      </div>
      {p.warnings.length > 0 && (
        <ul className="space-y-1 rounded-xl bg-gold-soft px-3 py-2 text-xs text-ink">
          {p.confidence.level !== "alta" && lowText && <li className="font-semibold">{lowText}</li>}
          {p.warnings.slice(0, compact ? 1 : 6).map((w) => <li key={w}>• {w}</li>)}
        </ul>
      )}
      {!compact && topScorers.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <div className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-ink-3">Goleadores probables</div>
            <ul className="space-y-1">
              {topScorers.map((x) => (
                <li key={x.playerId} className="flex justify-between text-sm"><span className="truncate">{playerName(players.get(x.playerId), "short")}</span><span className="tabular text-ink-2">{pct(x.pScore)} · {num(x.xGoals, 2)} xG</span></li>
              ))}
            </ul>
          </div>
          <div>
            <div className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-ink-3">Asistentes probables</div>
            <ul className="space-y-1">
              {topAssists.map((x) => (
                <li key={x.playerId} className="flex justify-between text-sm"><span className="truncate">{playerName(players.get(x.playerId), "short")}</span><span className="tabular text-ink-2">{pct(x.pAssist)}</span></li>
              ))}
            </ul>
          </div>
        </div>
      )}
      {!compact && <FactorTable factors={p.factors} homeName={home.short_name} awayName={away.short_name} sample={p.sampleMatches} config={p.configName} />}
    </Card>
  );
}

export function FactorTable({ factors, homeName, awayName, sample, config, individual }: {
  factors: MatchPrediction["factors"]; homeName?: string; awayName?: string; sample: number; config: string; individual?: boolean;
}) {
  return (
    <details className="group rounded-xl border border-line">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between px-3 text-sm font-semibold">
        ¿Por qué este pronóstico?
        <span aria-hidden className="text-ink-3 transition group-open:rotate-180">▾</span>
      </summary>
      <div className="space-y-2 border-t border-line px-3 py-3">
        <p className="text-xs text-ink-3">Modelo de Poisson con {sample} partidos de histórico · configuración «{config}». Cada factor se contrae hacia la media según su tamaño de muestra.</p>
        {factors.map((f) => {
          const delta = individual ? f.homeEffect : f.homeEffect - f.awayEffect;
          const favors = Math.abs(delta) < 0.01 ? "neutral" : delta > 0 ? (individual ? "sube" : homeName) : individual ? "baja" : awayName;
          return (
            <div key={f.key} className="rounded-lg bg-surface-2 px-3 py-2">
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="font-semibold">{f.label}</span>
                <span className="tabular text-xs text-ink-2">peso {pct(f.weight, 1)} → efectivo {pct(f.effectiveWeight, 1)}</span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-3"><span className="block h-full rounded-full bg-pitch" style={{ width: `${f.reliability * 100}%` }} /></div>
              <div className="mt-1 flex justify-between text-xs text-ink-3">
                <span>{f.note} · {num(f.sample)} obs.</span>
                <span>{favors === "neutral" ? "Sin efecto" : individual ? `${favors === "sube" ? "Mejora" : "Empeora"} su producción` : `Favorece a ${favors}`}</span>
              </div>
            </div>
          );
        })}
      </div>
    </details>
  );
}
