import Link from "next/link";
import { Card, PageHeader } from "@/components/ui";
import { getStats } from "@/lib/data/stats";
import { getTexts } from "@/lib/data/config";
import { getSession } from "@/lib/data/session";
import { Simulators } from "./simulators";
import { Hint } from "@/components/onboarding/hint";

export const metadata = { title: "El Despacho" };

export default async function Office({ searchParams }: { searchParams: Promise<{ tab?: string; player?: string }> }) {
  const sp = await searchParams;
  const [{ ds }, t, s] = await Promise.all([getStats(), getTexts(), getSession()]);
  return (
    <div>
      <PageHeader title={t("nav.office", "El Despacho")} subtitle={t("office.subtitle")} />
      {s && <div className="mb-4"><Hint id="office" title="¿Qué es una simulación?">Eliges equipos, jugadores, estadio, horario y clima, y El Despacho calcula qué pasaría según el histórico real. Es una <strong>estimación</strong>, no un resultado garantizado: con pocos partidos la confianza es baja y te lo avisa.</Hint></div>}
      {!s ? (
        <Card className="space-y-4 p-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl bg-surface-2 p-4"><p className="font-display text-xl font-bold uppercase">Simulador de partidos</p><p className="mt-1 text-sm text-ink-2">Monta los dos equipos, elige estadio y hora, y descubre el marcador más probable, las probabilidades y los goleadores.</p></div>
            <div className="rounded-xl bg-surface-2 p-4"><p className="font-display text-xl font-bold uppercase">Simulador individual</p><p className="mt-1 text-sm text-ink-2">¿Cuántos goles metería un jugador con estos compañeros y contra estos rivales?</p></div>
          </div>
          <div className="text-center">
            <p className="text-sm text-ink-3">Los simuladores son para los miembros del grupo.</p>
            <Link href="/login?next=/despacho" className="press mt-3 inline-flex min-h-11 items-center rounded-xl bg-pitch px-5 text-sm font-semibold text-pitch-ink">Entrar para simular</Link>
          </div>
        </Card>
      ) : (
        <Simulators teams={ds.teams} players={ds.players} venues={ds.venues.filter((v) => v.active)} formations={ds.formations.filter((f) => f.active)}
          lowText={t("office.low_confidence")} initialTab={sp.tab === "individual" ? 1 : 0} initialPlayer={sp.player} />
      )}
      <details className="mt-6 rounded-2xl border border-line bg-surface p-4 text-sm text-ink-2">
        <summary className="cursor-pointer font-semibold text-ink">Cómo calcula El Despacho</summary>
        <div className="mt-3 space-y-2">
          <p>Cada equipo tiene una tasa de goles esperada (λ). Se parte de la media de goles del histórico y se ajusta con siete factores ponderados: compañeros (30 %), rivales (20 %), estadio (20 %), últimos partidos, últimos en ese estadio, clima y horario.</p>
          <p>Cada factor se «contrae» hacia la media según cuántos partidos lo respaldan: con dos partidos apenas mueve la aguja; con veinte, pesa casi todo lo configurado. Con λ local y visitante se aplica una distribución de Poisson para obtener las probabilidades de victoria, empate y el marcador más probable.</p>
          <p>Es determinista: mismos datos y misma configuración producen siempre el mismo resultado. No hay inteligencia artificial generativa ni números aleatorios.</p>
        </div>
      </details>
    </div>
  );
}
