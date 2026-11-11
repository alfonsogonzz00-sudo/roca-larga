import Link from "next/link";
import { Avatar, Crest, cx } from "@/components/ui";
import { playerName, teamColor } from "@/lib/format";
import type { Formation, Player, Position, Team } from "@/lib/types";

export interface PitchPlayer {
  player: Player;
  position: Position | null;
  rating?: number | null;
  goals?: number;
  assists?: number;
  isMvp?: boolean;
  attendance?: "pending" | "yes" | "no";
}
export interface PitchSide { team: Team; formation: Formation | null; players: PitchPlayer[] }

/** Color de la nota (sobre 10) */
export function ratingColor(r: number): string {
  if (r >= 8) return "#1f8ef1";
  if (r >= 7) return "#22a650";
  if (r >= 6.5) return "#c9b21a";
  if (r >= 6) return "#ef8a24";
  return "#e5484d";
}

export function RatingBadge({ value, size = "sm" }: { value: number; size?: "sm" | "md" }) {
  return (
    <span className={cx("inline-flex items-center justify-center rounded font-bold tabular text-white", size === "md" ? "min-w-10 px-1.5 py-0.5 text-base" : "min-w-7 px-1 text-[11px] leading-[1.15rem]")}
      style={{ background: ratingColor(value) }} aria-label={`Nota ${value.toFixed(1)}`}>
      {value.toFixed(1).replace(".", ",")}
    </span>
  );
}

export function BallIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <circle cx="12" cy="12" r="10.5" fill="#fff" stroke="#111" strokeWidth="1.5" />
      <path d="M12 7.2l3.3 2.4-1.3 3.9h-4l-1.3-3.9z" fill="#111" />
      <path d="M12 1.6v5.6M15.3 9.6l5.1-1.8M14 13.5l3.2 4.4M10 13.5l-3.2 4.4M8.7 9.6L3.6 7.8" stroke="#111" strokeWidth="1.2" />
    </svg>
  );
}
function BootIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
      <circle cx="12" cy="12" r="11" fill="#fff" />
      <path d="M5 7h5l1.2 4.2c.2.6.7 1 1.3 1.1l5.6.9c.8.1 1.4.8 1.4 1.6V16H5z" fill="#111" />
      <path d="M5 17.2h14.5" stroke="#111" strokeWidth="1.4" strokeLinecap="round" strokeDasharray="1.6 1.6" />
    </svg>
  );
}

function Event({ icon, n, label }: { icon: React.ReactNode; n: number; label: string }) {
  return (
    <span className="relative inline-flex rounded-full shadow" aria-label={`${n} ${label}`}>
      {icon}
      {n > 1 && <span className="absolute -top-1.5 -right-2 rounded-none bg-black px-1 text-[9px] font-bold leading-[0.85rem] text-white">{n}</span>}
    </span>
  );
}

function PlayerChip({ pp, color }: { pp: PitchPlayer; color: string }) {
  const { player: p } = pp;
  return (
    <Link href={`/jugadores/${p.id}`} className="press flex w-[4.6rem] flex-col items-center text-center">
      <span className={cx("relative", pp.attendance === "no" && "opacity-40")}>
        <span className="block rounded-full ring-2 ring-white/80"><Avatar name={p.full_name} src={p.photo_url} size={42} color={color} /></span>
        {/* eventos: goles y asistencias arriba a la derecha */}
        {(pp.goals || pp.assists) ? (
          <span className="absolute -top-1.5 -right-3 flex flex-col gap-0.5">
            {pp.goals ? <Event icon={<BallIcon />} n={pp.goals} label={pp.goals === 1 ? "gol" : "goles"} /> : null}
            {pp.assists ? <Event icon={<BootIcon />} n={pp.assists} label={pp.assists === 1 ? "asistencia" : "asistencias"} /> : null}
          </span>
        ) : null}
        {pp.isMvp && <span className="absolute -top-1.5 -left-2 rounded-none bg-[#d6b25e] px-1 text-[9px] font-black leading-[0.95rem] text-[#16130a]" aria-label="MVP">MVP</span>}
        {pp.attendance === "yes" && <span className="absolute -right-1 -bottom-1 flex h-4 w-4 items-center justify-center rounded-none bg-win text-[10px] font-bold text-[#07130b]" aria-label="Confirmado">✓</span>}
        {pp.rating != null && <span className="absolute -bottom-2 left-1/2 -translate-x-1/2"><RatingBadge value={pp.rating} /></span>}
      </span>
      <span className={cx("w-full truncate text-[11px] font-semibold leading-tight text-white", pp.rating != null ? "mt-3" : "mt-1")}>{p.nickname ?? playerName(p, "short").split(" ").slice(-1)[0]}</span>
    </Link>
  );
}

/** Reparte a los 7 por líneas según la formación (sin portero: el 7.º va al fondo, centrado) */
function rowsFor(side: PitchSide): PitchPlayer[][] {
  const lines = side.formation?.lines ?? [2, 3, 1];
  const order: Position[] = ["DEF", "MED", "DEL"];
  const pos = (x: PitchPlayer) => { const v = x.position ?? x.player.usual_position ?? "MED"; return v === "POR" ? "MED" : v; };
  const list = [...side.players].sort((a, b) => order.indexOf(pos(a)) - order.indexOf(pos(b)));
  const slots = lines.reduce((a, b) => a + b, 0);
  const back = list.length > slots ? [list.shift()!] : [];
  const rows: PitchPlayer[][] = back.length ? [back] : [];
  let i = 0;
  for (const n of lines) { rows.push(list.slice(i, i + n)); i += n; }
  const extra = list.slice(i);
  if (extra.length) rows[rows.length - 1] = [...rows[rows.length - 1], ...extra];
  return rows.filter((r) => r.length); // del fondo hacia el ataque
}

export function teamAverage(side: PitchSide): number | null {
  const r = side.players.map((x) => x.rating).filter((x): x is number => x != null);
  return r.length ? Math.round((r.reduce((a, b) => a + b, 0) / r.length) * 100) / 100 : null;
}

function TeamBar({ side }: { side: PitchSide }) {
  const avg = teamAverage(side);
  return (
    <div className="flex items-center gap-2.5 bg-surface px-3 py-2.5">
      <Crest src={side.team.crest_url} name={side.team.name} size={28} />
      <span className="font-semibold">{side.team.name}</span>
      {avg != null && <RatingBadge value={avg} size="md" />}
      <span className="ml-auto tabular text-lg font-bold text-ink-2">{side.formation?.name ?? ""}</span>
    </div>
  );
}

/** Campo completo: local arriba (atacando hacia abajo), visitante abajo */
export function LineupPitch({ home, away }: { home: PitchSide; away: PitchSide }) {
  const hr = rowsFor(home);
  const ar = [...rowsFor(away)].reverse();
  const hc = teamColor(home.team), ac = teamColor(away.team);
  return (
    <div className="overflow-hidden rounded-2xl border border-line">
      <TeamBar side={home} />
      <div className="relative bg-[#1d5a33] px-1 py-4" style={{ backgroundImage: "repeating-linear-gradient(0deg, transparent 0 56px, rgb(255 255 255 / 0.05) 56px 112px)" }}>
        {/* líneas del campo */}
        <div aria-hidden className="pointer-events-none absolute inset-2 rounded border border-white/25" />
        <div aria-hidden className="pointer-events-none absolute inset-x-2 top-1/2 h-px bg-white/25" />
        <div aria-hidden className="pointer-events-none absolute top-1/2 left-1/2 h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/25" />
        <div aria-hidden className="pointer-events-none absolute top-2 left-1/2 h-12 w-1/2 -translate-x-1/2 border border-t-0 border-white/25" />
        <div aria-hidden className="pointer-events-none absolute bottom-2 left-1/2 h-12 w-1/2 -translate-x-1/2 border border-b-0 border-white/25" />

        <div className="relative flex min-h-[19rem] flex-col justify-around gap-4 pb-6">
          {hr.map((row, i) => (
            <div key={`h${i}`} className="flex justify-around">{row.map((pp) => <PlayerChip key={pp.player.id} pp={pp} color={hc} />)}</div>
          ))}
        </div>
        <div className="relative flex min-h-[19rem] flex-col justify-around gap-4 pt-6">
          {ar.map((row, i) => (
            <div key={`a${i}`} className="flex justify-around">{row.map((pp) => <PlayerChip key={pp.player.id} pp={pp} color={ac} />)}</div>
          ))}
        </div>
      </div>
      <TeamBar side={away} />
    </div>
  );
}
