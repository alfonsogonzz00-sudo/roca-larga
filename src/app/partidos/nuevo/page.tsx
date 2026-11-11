import { PageHeader } from "@/components/ui";
import { MatchForm } from "@/components/forms/match-form";
import { ResultForm } from "@/components/forms/result-form";
import { requireStaff } from "@/lib/data/session";
import { getStats } from "@/lib/data/stats";

export const metadata = { title: "Nuevo partido" };

export default async function NewMatch({ searchParams }: { searchParams: Promise<{ historico?: string }> }) {
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
