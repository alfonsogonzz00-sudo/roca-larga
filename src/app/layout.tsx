import type { Metadata, Viewport } from "next";
import "@fontsource/barlow-condensed/600.css";
import "@fontsource/barlow-condensed/700.css";
import "./globals.css";
import Link from "next/link";
import { Settings, ClipboardList } from "lucide-react";
import { BottomNav, SideNav } from "@/components/layout/nav";
import { Tour } from "@/components/onboarding/tour";
import { PushPrompt } from "@/components/layout/push-prompt";
import { InstallPrompt } from "@/components/layout/install-prompt";
import { createClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";
import { themeScript } from "@/components/layout/theme";
import { OfflineBanner, ServiceWorkerRegister } from "@/components/layout/sw-register";
import { getSettings, getTexts } from "@/lib/data/config";
import { getSession } from "@/lib/data/session";
import { getPendingVotesCount } from "@/lib/data/votes";
import { NAV } from "@/components/layout/nav-items";
import { Brand } from "@/components/layout/brand";

export const metadata: Metadata = {
  title: { default: "Roca Larga", template: "%s · Roca Larga" },
  description: "Caravelle F.C. vs S.D. Monecillo: partidos, estadísticas, MVP y pronósticos.",
  applicationName: "Roca Larga",
  appleWebApp: {
    capable: true,
    title: "Roca Larga",
    statusBarStyle: "default",
    startupImage: [
      { url: "/icons/splash-1179x2556.png", media: "(device-width: 393px) and (device-height: 852px) and (-webkit-device-pixel-ratio: 3)" },
      { url: "/icons/splash-1290x2796.png", media: "(device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3)" },
      { url: "/icons/splash-1170x2532.png", media: "(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3)" },
      { url: "/icons/splash-750x1334.png", media: "(device-width: 375px) and (device-height: 667px) and (-webkit-device-pixel-ratio: 2)" },
      { url: "/icons/splash-1242x2688.png", media: "(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 3)" },
      { url: "/icons/splash-828x1792.png", media: "(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 2)" },
    ],
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#ffffff",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [settings, t, session] = await Promise.all([getSettings(), getTexts(), getSession()]);
  const vapidKey = session ? (((await (await createClient()).rpc("vapid_public_key")).data as string | null) || env.vapidPublicKey) : "";
  const pending = await getPendingVotesCount(session);
  const labels = Object.fromEntries(NAV.map((n) => [n.key, t(n.key, n.label)]));
  return (
    <html lang="es" data-theme="light" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="antialiased">
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2">Saltar al contenido</a>
        <OfflineBanner text={t("generic.offline")} />
        <div className="flex">
          <SideNav labels={labels} appName={settings.app_name} tagline={settings.app_tagline} isAdmin={Boolean(session?.isAdmin)} isStaff={Boolean(session?.isStaff)} voteBadge={pending} />
          <div className="min-w-0 flex-1">
            <header className="glass pt-safe sticky top-0 z-30 border-b border-black/5 !shadow-none lg:hidden">
              <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4">
                <Link href="/" aria-label="Inicio"><Brand size="sm" /></Link>
                <div className="flex items-center gap-1">
                  {session?.isStaff && (
                    <Link href="/gestion" aria-label="Gestión" className="flex h-10 w-10 items-center justify-center rounded-xl text-ink-2 hover:bg-surface-2"><ClipboardList size={20} /></Link>
                  )}
                  {session?.isAdmin && (
                    <Link href="/admin" aria-label="Administración" className="flex h-10 w-10 items-center justify-center rounded-xl text-ink-2 hover:bg-surface-2"><Settings size={20} /></Link>
                  )}
                </div>
              </div>
            </header>
            <main id="main" className="mx-auto max-w-3xl px-4 pt-5 pb-28 lg:max-w-5xl lg:px-8 lg:pt-8 lg:pb-12">{children}</main>
          </div>
        </div>
        <BottomNav labels={labels} voteBadge={pending} />
        <Tour enabled={Boolean(session?.player)} />
        <PushPrompt enabled={Boolean(session)} vapidKey={vapidKey} afterTour={Boolean(session?.player)} />
        <InstallPrompt />
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
