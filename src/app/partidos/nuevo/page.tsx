import Link from "next/link";
import { ChevronRight, Mic, PenLine } from "lucide-react";
import { PageHeader } from "@/components/ui";
import { VoiceMatch } from "./voice-match";
import { MatchForm } from "@/components/forms/match-form";
import { ResultForm } from "@/components/forms/result-form";
import { requireStaff } from "@/lib/data/session";
import { getStats } from "@/lib/data/stats";

export const metadata = { title: "Nuevo partido" };

export default async function NewMatch({ searchParams }: { searchParams: Promise<{ historico?: string; modo?: string }> }) {
  const sp = await searchParams;
  const s = await requireStaff();
  const { ds, settings } = await getStats();
  const [t1, t2] = ds.teams;
  const def = ds.formations.find((f) => f.is_default)?.id ?? "";
  if (sp.historico) {
    return (
      <div>
        <PageHeader eyebrow="Histórico" title="Partido histórico" subtitle="Registra un encuentro ya disputado. Lo que no sepas puede quedar vacío: no inventamos datos." />
        <ResultForm teams={ds.teams} players={ds.players} venues={ds.venues} formations={ds.formations} perSide={settings.players_per_side}
          initial={{
            mode: "historical", date: "", time: "20:00", venue_id: "", notes: "", home_team_id: t1.id, away_team_id: t2.id,
            home_formation_id: "", away_formation_id: "", home: { players: [], guests: [] }, away: { players: [], guests: [] },
            goals: [], spells: [], actual_weather: "", actual_temp_c: "", incidents: "", final_notes: "", manual_mvp_ids: [], exceptional: false,
          }} />
      </div>
    );
  }
  if (sp.modo === "voz") {
    return (
      <div>
        <PageHeader eyebrow="Nuevo partido" title="Por nota de voz" subtitle="Cuéntalo como se lo dirías al grupo; la app lo convierte en el partido." />
        <VoiceMatch teams={ds.teams} players={ds.players} venues={ds.venues} formations={ds.formations} isAdmin={s.isAdmin} perSide={settings.players_per_side} />
      </div>
    );
  }
  if (sp.modo !== "manual") {
    const opt = (href: string, Icon: typeof Mic, title: string, text: string, accent: boolean) => (
      <Link href={href} className="press flex items-center gap-4 rounded-3xl bg-surface p-5 shadow-card">
        <span className={accent ? "flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-pitch text-pitch-ink" : "flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-surface-2 text-ink"}><Icon size={26} /></span>
        <span className="min-w-0 flex-1"><span className="block text-[17px] font-semibold leading-snug">{title}</span><span className="mt-0.5 block text-sm text-ink-3">{text}</span></span>
        <ChevronRight size={20} className="shrink-0 text-ink-3" />
      </Link>
    );
    return (
      <div className="space-y-4">
        <PageHeader eyebrow="Partidos" title="Nuevo partido" subtitle="¿Cómo quieres crearlo?" />
        {opt("/partidos/nuevo?modo=voz", Mic, "Crear partido mediante nota de voz", "Dictas los detalles y la app prepara el partido para que lo confirmes.", true)}
        {opt("/partidos/nuevo?modo=manual", PenLine, "Crear manualmente", "Rellenas el formulario paso a paso, como siempre.", false)}
      </div>
    );
  }
  return (
    <div>
      <PageHeader eyebrow="Partidos" title="Nuevo partido" />
      <MatchForm teams={ds.teams} players={ds.players} venues={ds.venues} formations={ds.formations} isAdmin={s.isAdmin} perSide={settings.players_per_side}
        initial={{
          date: "", time: "21:00", venue_id: "", home_team_id: t1.id, away_team_id: t2.id, home_formation_id: def, away_formation_id: def,
          forecast_weather: "", forecast_temp_c: "", notes: "", status: "pending", exceptional_lineup: false, exceptional_reason: "",
          home: { players: [], guests: [], positions: {} }, away: { players: [], guests: [], positions: {} },
        }} />
    </div>
  );
}
