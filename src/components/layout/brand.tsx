import { cx } from "@/components/ui";

/** Logotipo de Roca Larga con la firma «powered by LongRock» (siempre juntos) */
export function Brand({ size = "md", className, stacked }: { size?: "sm" | "md" | "lg"; className?: string; stacked?: boolean }) {
  const h = { sm: 28, md: 40, lg: 96 }[size];
  return (
    <span className={cx("inline-flex items-center gap-2", stacked && "flex-col gap-1.5", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/rocalarga-640.png" alt="Roca Larga" height={h} width={Math.round(h * 2.3)} style={{ height: h, width: "auto" }} className="shrink-0 select-none" draggable={false} />
      <span className={cx("whitespace-nowrap font-semibold uppercase tracking-[0.12em] text-ink-3", size === "lg" ? "text-xs" : "text-[9px] leading-tight")}>
        powered by <span className="text-ink-2">LongRock</span>
      </span>
    </span>
  );
}
