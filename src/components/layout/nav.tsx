"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { Activity, CalendarDays, Shield, Trophy, UserRound, Vote, Settings, ClipboardList } from "lucide-react";
import { NAV, isActive } from "./nav-items";
import { cx } from "@/components/ui";
import { Brand } from "./brand";
import { Bubble, useBadge } from "./nav-badges";
import type { NavBadges } from "@/lib/data/badges";

const ICONS = { Trophy, CalendarDays, Vote, Activity, UserRound };

/** Navegación inferior fija (móvil). Cinco apartados, siempre visibles. */
/** Cifras de novedades por apartado (se ponen a cero al entrar en cada uno) */
function useNavCounts(badges: NavBadges, path: string): Record<string, number> {
  const matches = useBadge("matches", badges.matches, isActive(path, "/"));
  const votes = useBadge("votes", badges.votes, isActive(path, "/votacion"));
  const activity = useBadge("activity", badges.activity, isActive(path, "/actividad"));
  return { "/": matches, "/votacion": votes, "/actividad": activity };
}

export function BottomNav({ labels, badges }: { labels: Record<string, string>; badges: NavBadges }) {
  const path = usePathname();
  const counts = useNavCounts(badges, path);
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  // También en el icono de la app instalada (iOS 16.4+, Android)
  useEffect(() => {
    const n = navigator as Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
    if (total > 0) n.setAppBadge?.(total).catch(() => {}); else n.clearAppBadge?.().catch(() => {});
  }, [total]);
  return (
    <nav aria-label="Principal" className="glass fixed inset-x-0 bottom-0 z-40 border-t border-black/5 lg:hidden">
      <ul className="px-safe mx-auto grid max-w-xl grid-cols-5">
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
                  "h-nav relative flex flex-col items-center justify-center gap-0.5 px-0.5 pt-1 text-[11px] font-semibold leading-tight max-[359px]:text-[10px] max-[359px]:tracking-tight",
                  active ? "text-pitch" : "text-ink-3",
                )}
              >
                <span className="relative">
                  <Icon size={22} strokeWidth={active ? 2.4 : 1.9} aria-hidden />
                  <Bubble n={counts[item.href] ?? 0} />
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
export function SideNav({ labels, appName, tagline, isAdmin, isStaff, badges }: { labels: Record<string, string>; appName: string; tagline: string; isAdmin: boolean; isStaff: boolean; badges: NavBadges }) {
  const path = usePathname();
  const counts = useNavCounts(badges, path);
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
        {badge ? <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[#e5383b] px-1.5 text-xs font-bold text-white">{badge > 9 ? "9+" : badge}</span> : null}
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
        {NAV.map((i) => link(i.href, labels[i.key] ?? i.label, ICONS[i.icon], counts[i.href]))}
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
