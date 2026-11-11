"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, CalendarDays, Shield, Trophy, UserRound, Vote, Settings, ClipboardList } from "lucide-react";
import { NAV, isActive } from "./nav-items";
import { cx } from "@/components/ui";
import { Brand } from "./brand";

const ICONS = { Trophy, CalendarDays, Vote, Activity, UserRound };

/** Navegación inferior fija (móvil). Cinco apartados, siempre visibles. */
export function BottomNav({ labels, voteBadge }: { labels: Record<string, string>; voteBadge?: number }) {
  const path = usePathname();
  return (
    <nav aria-label="Principal" className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-elev/95 backdrop-blur lg:hidden">
      <ul className="mx-auto grid max-w-xl grid-cols-5">
        {NAV.map((item) => {
          const Icon = ICONS[item.icon];
          const active = isActive(path, item.href);
          const label = labels[item.key] ?? item.label;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                data-tour={item.href}
                aria-current={active ? "page" : undefined}
                className={cx(
                  "relative flex min-h-14 flex-col items-center justify-center gap-0.5 px-0.5 pt-1.5 pb-1 text-[11px] font-semibold leading-tight",
                  active ? "text-pitch" : "text-ink-3",
                )}
              >
                {active && <span className="absolute top-0 h-0.5 w-8 rounded-full bg-pitch" />}
                <span className="relative">
                  <Icon size={22} strokeWidth={active ? 2.4 : 1.9} aria-hidden />
                  {item.href === "/votacion" && voteBadge ? (
                    <span className="absolute -top-1 -right-2 min-w-4 rounded-full bg-gold px-1 text-center text-[10px] font-bold text-[#16130a]">{voteBadge}</span>
                  ) : null}
                </span>
                <span className="w-full truncate text-center">{label.replace(/^El /, "")}</span>
              </Link>
            </li>
          );
        })}
      </ul>
      <div className="h-safe-bottom" />
    </nav>
  );
}

/** Navegación lateral (escritorio) */
export function SideNav({ labels, appName, tagline, isAdmin, isStaff, voteBadge }: { labels: Record<string, string>; appName: string; tagline: string; isAdmin: boolean; isStaff: boolean; voteBadge?: number }) {
  const path = usePathname();
  const link = (href: string, label: string, Icon: typeof Shield, badge?: number) => {
    const active = isActive(path, href);
    return (
      <Link
        key={href}
        href={href}
        data-tour={href}
        aria-current={active ? "page" : undefined}
        className={cx("flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold transition", active ? "bg-pitch-soft text-pitch" : "text-ink-2 hover:bg-surface-2 hover:text-ink")}
      >
        <Icon size={19} aria-hidden />
        <span className="flex-1">{label}</span>
        {badge ? <span className="rounded-full bg-gold px-1.5 text-xs font-bold text-[#16130a]">{badge}</span> : null}
      </Link>
    );
  };
  return (
    <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-line bg-elev px-4 py-6 lg:flex">
      <Link href="/" className="mb-8 block px-3" aria-label={appName}>
        <Brand size="md" stacked className="items-start" />
        <span className="mt-2 block text-xs text-ink-3">{tagline}</span>
      </Link>
      <nav aria-label="Principal" className="flex flex-col gap-1">
        {NAV.map((i) => link(i.href, labels[i.key] ?? i.label, ICONS[i.icon], i.href === "/votacion" ? voteBadge : undefined))}
      </nav>
      {(isStaff || isAdmin) && (
        <div className="mt-8 border-t border-line pt-4">
          <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-ink-3">Gestión</p>
          {isStaff && link("/gestion", "Gestión", ClipboardList)}
          {isAdmin && link("/admin", "Administración", Settings)}
        </div>
      )}
    </aside>
  );
}
