import Link from "next/link";
import { clsx } from "clsx";
import type { ComponentProps, ReactNode } from "react";

export const cx = clsx;

export function Card({ className, ...p }: ComponentProps<"div">) {
  return <div className={cx("rounded-2xl bg-surface shadow-card", className)} {...p} />;
}

export function SectionTitle({ children, action, className }: { children: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cx("mb-3 flex items-end justify-between gap-3", className)}>
      <h2 className="font-display text-lg font-bold uppercase tracking-wide text-ink">{children}</h2>
      {action}
    </div>
  );
}

export function PageHeader({ title, subtitle, action, eyebrow }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <header className="mb-5 flex items-start justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && <p className="mb-1 text-xs font-semibold uppercase tracking-[0.14em] text-gold">{eyebrow}</p>}
        <h1 className="font-display text-3xl font-bold uppercase leading-none tracking-wide text-ink sm:text-4xl">{title}</h1>
        {subtitle && <p className="mt-2 text-sm text-ink-2">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </header>
  );
}

type Variant = "primary" | "secondary" | "ghost" | "danger" | "gold";
const variants: Record<Variant, string> = {
  primary: "bg-pitch text-pitch-ink hover:brightness-110",
  secondary: "bg-surface-2 text-ink hover:bg-surface-3",
  ghost: "text-ink-2 hover:bg-surface-2 hover:text-ink",
  danger: "bg-danger text-white hover:brightness-110",
  gold: "bg-gold text-white hover:brightness-110",
};
const base = "press inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100";

export function Button({ variant = "primary", className, ...p }: ComponentProps<"button"> & { variant?: Variant }) {
  return <button className={cx(base, variants[variant], className)} {...p} />;
}

export function ButtonLink({ variant = "primary", className, ...p }: ComponentProps<typeof Link> & { variant?: Variant }) {
  return <Link className={cx(base, variants[variant], className)} {...p} />;
}

export function Pill({ tone = "neutral", children, className }: { tone?: "neutral" | "pitch" | "gold" | "danger" | "win" | "draw" | "loss" | "info"; children: ReactNode; className?: string }) {
  const tones = {
    neutral: "bg-surface-2 text-ink-2",
    pitch: "bg-pitch-soft text-pitch",
    gold: "bg-gold-soft text-gold",
    danger: "bg-danger-soft text-danger",
    win: "bg-win-soft text-win",
    draw: "bg-draw-soft text-draw",
    loss: "bg-loss-soft text-loss",
    info: "bg-info-soft text-info",
  };
  return <span className={cx("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold", tones[tone], className)}>{children}</span>;
}

export function Stat({ label, value, hint, className }: { label: ReactNode; value: ReactNode; hint?: ReactNode; className?: string }) {
  return (
    <div className={cx("rounded-2xl bg-surface px-3.5 py-3 shadow-card", className)}>
      <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-3">{label}</div>
      <div className="font-display tabular text-2xl font-bold leading-tight text-ink">{value}</div>
      {hint && <div className="text-xs text-ink-3">{hint}</div>}
    </div>
  );
}

export function EmptyState({ title, children, action }: { title: ReactNode; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-2xl bg-surface-2 px-5 py-8 text-center">
      <p className="font-display text-xl font-bold uppercase text-ink">{title}</p>
      {children && <div className="mx-auto mt-2 max-w-sm text-sm text-ink-2">{children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Notice({ tone = "info", children, className }: { tone?: "info" | "warn" | "danger" | "ok"; children: ReactNode; className?: string }) {
  const tones = {
    info: "bg-surface-2 text-ink-2",
    warn: "bg-gold-soft text-ink",
    danger: "bg-danger-soft text-ink",
    ok: "bg-pitch-soft text-ink",
  };
  return <div role={tone === "danger" ? "alert" : "status"} className={cx("rounded-2xl px-4 py-3 text-sm", tones[tone], className)}>{children}</div>;
}

export function Crest({ src, name, size = 40, className }: { src?: string | null; name: string; size?: number; className?: string }) {
  if (!src) {
    return (
      <span style={{ width: size, height: size }} className={cx("inline-flex items-center justify-center rounded-full bg-surface-3 font-display font-bold text-ink-2", className)}>
        {name.replace(/[^A-ZÁÉÍÓÚÑ]/g, "").slice(0, 2) || name.slice(0, 2)}
      </span>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={`Escudo de ${name}`} width={size} height={size} style={{ width: size, height: size }} className={cx("object-contain", className)} />;
}

export function Avatar({ name, src, size = 36, color }: { name: string; src?: string | null; size?: number; color?: string }) {
  const initials = name.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" width={size} height={size} className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />;
  }
  return (
    <span
      aria-hidden
      className="inline-flex shrink-0 items-center justify-center rounded-full font-display font-bold text-white"
      style={{ width: size, height: size, fontSize: size * 0.4, background: color ?? "var(--ink-3)" }}
    >
      {initials}
    </span>
  );
}

export function ResultBadge({ r }: { r: "W" | "D" | "L" }) {
  const map = { W: ["V", "bg-win"], D: ["E", "bg-draw"], L: ["D", "bg-loss"] } as const;
  return <span className={cx("inline-flex h-6 w-6 items-center justify-center rounded-md font-display text-sm font-bold text-white", map[r][1])}>{map[r][0]}</span>;
}

export function Divider() {
  return <hr className="my-4 border-line" />;
}

export function Field({ label, hint, error, children, htmlFor }: { label: ReactNode; hint?: ReactNode; error?: string; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-semibold text-ink">{label}</label>
      {children}
      {hint && !error && <p className="text-xs text-ink-3">{hint}</p>}
      {error && <p className="text-xs font-medium text-danger">{error}</p>}
    </div>
  );
}

export const inputCls =
  "block min-h-11 w-full rounded-xl border border-transparent bg-surface-2 px-3.5 text-[16px] text-ink placeholder:text-ink-3 focus:border-pitch focus:bg-surface focus:outline-none focus:ring-2 focus:ring-pitch/25 disabled:opacity-60";

export function Input(p: ComponentProps<"input">) {
  return <input {...p} className={cx(inputCls, p.className)} />;
}

export function Select(p: ComponentProps<"select">) {
  return <select {...p} className={cx(inputCls, "appearance-auto pr-8", p.className)} />;
}

export function Textarea(p: ComponentProps<"textarea">) {
  return <textarea {...p} className={cx(inputCls, "min-h-24 py-2.5", p.className)} />;
}

export function Details({ summary, children, defaultOpen }: { summary: ReactNode; children: ReactNode; defaultOpen?: boolean }) {
  return (
    <details open={defaultOpen} className="group rounded-2xl bg-surface shadow-card">
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 font-semibold text-ink">
        {summary}
        <span aria-hidden className="text-ink-3 transition group-open:rotate-180">▾</span>
      </summary>
      <div className="mx-4 border-t border-line py-3">{children}</div>
    </details>
  );
}
