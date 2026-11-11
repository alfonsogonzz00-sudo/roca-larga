/** Gráficos SVG ligeros, accesibles y adaptables (sin dependencias). */
import { cx } from "@/components/ui";

export function WdlDonut({ wins, draws, losses, size = 132, label }: { wins: number; draws: number; losses: number; size?: number; label?: string }) {
  const total = wins + draws + losses;
  const r = 52, c = 2 * Math.PI * r;
  const segs = [
    { v: wins, color: "var(--win)", name: "Victorias" },
    { v: draws, color: "var(--draw)", name: "Empates" },
    { v: losses, color: "var(--loss)", name: "Derrotas" },
  ];
  let offset = 0;
  return (
    <svg width={size} height={size} viewBox="0 0 132 132" role="img" aria-label={`${label ?? ""} ${wins} victorias, ${draws} empates, ${losses} derrotas`}>
      <circle cx="66" cy="66" r={r} fill="none" stroke="var(--surface-3)" strokeWidth="16" />
      {total > 0 && segs.map((s) => {
        const len = (s.v / total) * c;
        const el = <circle key={s.name} cx="66" cy="66" r={r} fill="none" stroke={s.color} strokeWidth="16" strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-offset} transform="rotate(-90 66 66)" />;
        offset += len;
        return el;
      })}
      <text x="66" y="62" textAnchor="middle" className="fill-[var(--ink)] font-display" style={{ fontSize: 30, fontWeight: 700 }}>{total ? Math.round((wins / total) * 100) : 0}%</text>
      <text x="66" y="82" textAnchor="middle" style={{ fontSize: 11, fill: "var(--ink-3)" }}>victorias</text>
    </svg>
  );
}

export function WdlBar({ wins, draws, losses, className }: { wins: number; draws: number; losses: number; className?: string }) {
  const t = wins + draws + losses || 1;
  return (
    <div className={cx("flex h-2.5 overflow-hidden rounded-none bg-surface-3", className)} role="img" aria-label={`${wins} V, ${draws} E, ${losses} D`}>
      <span style={{ width: `${(wins / t) * 100}%` }} className="bg-win" />
      <span style={{ width: `${(draws / t) * 100}%` }} className="bg-draw" />
      <span style={{ width: `${(losses / t) * 100}%` }} className="bg-loss" />
    </div>
  );
}

/** Líneas acumuladas (evolución) — varias series sobre el mismo eje */
export function LineChart({ series, height = 160, labels }: { series: { name: string; color: string; values: number[] }[]; height?: number; labels?: string[] }) {
  const n = Math.max(0, ...series.map((s) => s.values.length));
  if (n < 2) return <p className="text-sm text-ink-3">Hacen falta al menos dos partidos para dibujar la evolución.</p>;
  const max = Math.max(1, ...series.flatMap((s) => s.values));
  const W = 320, H = height, P = 22;
  const x = (i: number) => P + (i * (W - P * 2)) / (n - 1);
  const y = (v: number) => H - P - (v / max) * (H - P * 2);
  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={series.map((s) => `${s.name}: ${s.values[s.values.length - 1]}`).join(", ")}>
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line x1={P} x2={W - P} y1={y(max * f)} y2={y(max * f)} stroke="var(--line)" strokeDasharray="3 4" />
            <text x={P - 4} y={y(max * f) + 3} textAnchor="end" style={{ fontSize: 9, fill: "var(--ink-3)" }}>{Math.round(max * f * 10) / 10}</text>
          </g>
        ))}
        {series.map((s) => (
          <g key={s.name}>
            <polyline fill="none" stroke={s.color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" points={s.values.map((v, i) => `${x(i)},${y(v)}`).join(" ")} />
            <circle cx={x(s.values.length - 1)} cy={y(s.values[s.values.length - 1])} r="3.5" fill={s.color} />
          </g>
        ))}
        {labels && <>
          <text x={P} y={H - 4} style={{ fontSize: 9, fill: "var(--ink-3)" }}>{labels[0]}</text>
          <text x={W - P} y={H - 4} textAnchor="end" style={{ fontSize: 9, fill: "var(--ink-3)" }}>{labels[labels.length - 1]}</text>
        </>}
      </svg>
      <figcaption className="mt-1 flex flex-wrap gap-3 text-xs text-ink-2">
        {series.map((s) => <span key={s.name} className="inline-flex items-center gap-1.5"><span className="h-2 w-3 rounded-sm" style={{ background: s.color }} />{s.name}</span>)}
      </figcaption>
    </figure>
  );
}

/** Barras horizontales para rankings */
export function HBars({ rows, format = (v: number) => String(v), color = "var(--pitch)" }: { rows: { label: React.ReactNode; value: number; sub?: React.ReactNode; color?: string; href?: string }[]; format?: (v: number) => string; color?: string }) {
  const max = Math.max(...rows.map((r) => r.value), 0.0001);
  return (
    <ol className="space-y-2.5">
      {rows.map((r, i) => (
        <li key={i}>
          <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
            <span className="min-w-0 truncate"><span className="tabular mr-2 text-ink-3">{i + 1}.</span>{r.label}</span>
            <span className="tabular text-lg font-bold">{format(r.value)}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-none bg-surface-3"><span className="block h-full rounded-none" style={{ width: `${(r.value / max) * 100}%`, background: r.color ?? color }} /></div>
          {r.sub && <div className="mt-0.5 text-xs text-ink-3">{r.sub}</div>}
        </li>
      ))}
    </ol>
  );
}

export function FormStrip({ results }: { results: ("W" | "D" | "L")[] }) {
  const c = { W: "bg-win", D: "bg-draw", L: "bg-loss" };
  const l = { W: "V", D: "E", L: "D" };
  return (
    <div className="flex gap-1" aria-label={`Racha: ${results.map((r) => l[r]).join(" ")}`}>
      {results.map((r, i) => <span key={i} className={cx("flex h-6 w-6 items-center justify-center rounded-md font-display text-xs font-bold text-white", c[r])}>{l[r]}</span>)}
    </div>
  );
}
