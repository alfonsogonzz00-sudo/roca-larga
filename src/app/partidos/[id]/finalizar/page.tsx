import { notFound } from "next/navigation";
import { Notice, PageHeader } from "@/components/ui";
import { ResultForm, type ResultSide } from "@/components/forms/result-form";
import { requireStaff } from "@/lib/data/session";
import { getStats } from "@/lib/data/stats";
import { fmtDay } from "@/lib/format";

export const metadata = { title: "Resultado" };

export default async function FinalizeMatch({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireStaff();
  const { ds, settings } = await getStats();
  const m = ds.matchById.get(id);
  if (!m) notFound();
  const played = m.status === "played";
  const side = (teamId: string): ResultSide => {
    // Si ya está disputado: participantes reales. Si no: convocados que no han dicho que no van.
    const rows = ds.matchPlayers.filter((x) => x.match_id === id && x.team_id === teamId && (played ? x.participated : x.called && x.attendance !== "no"));
    return {
      players: rows.filter((r) => ds.playerById.get(r.player_id)?.kind === "member").map((r) => r.player_id),
      guests: rows.filter((r) => ds.playerById.get(r.player_id)?.kind === "guest").map((r) => ({ player_id: r.player_id, name: ds.playerById.get(r.player_id)!.full_name, brought_by_id: r.brought_by_id })),
    };
  };
  const goals = ds.goals.filter((g) => g.match_id === id).map((g) => ({
    key: g.id, team_id: g.team_id, scorer_id: g.scorer_id ?? "", assist_id: g.assist_id ?? "", conceded_gk_id: g.conceded_gk_id ?? "",
    minute: g.minute?.toString() ?? "", is_own_goal: g.is_own_goal,
  }));
  const spells = ds.spells.filter((x) => x.match_id === id).map((x) => ({
    key: x.id, team_id: x.team_id, player_id: x.player_id, start_minute: x.start_minute?.toString() ?? "", end_minute: x.end_minute?.toString() ?? "",
  }));
  return (
    <div>
      <PageHeader eyebrow={fmtDay(m.kickoff_at)} title={played ? "Editar resultado" : "Finalizar partido"} />
      {played && <Notice tone="info" className="mb-4">Al guardar se recalcularán las estadísticas afectadas y, si la votación ya cerró, el recuento MVP. El cambio queda registrado.</Notice>}
      <ResultForm teams={ds.teams} players={ds.players} venues={ds.venues} formations={ds.formations} perSide={settings.players_per_side}
        initial={{
          id, mode: "finalize", date: "", time: "", venue_id: m.venue_id ?? "", notes: m.notes ?? "",
          home_team_id: m.home_team_id, away_team_id: m.away_team_id, home_formation_id: m.home_formation_id ?? "", away_formation_id: m.away_formation_id ?? "",
          home: side(m.home_team_id), away: side(m.away_team_id), goals, spells,
          actual_weather: m.actual_weather ?? m.forecast_weather ?? "", actual_temp_c: (m.actual_temp_c ?? m.forecast_temp_c)?.toString() ?? "",
          incidents: m.incidents ?? "", final_notes: m.final_notes ?? "", manual_mvp_ids: ds.mvps.filter((x) => x.match_id === id && x.source === "manual").map((x) => x.player_id),
          exceptional: m.exceptional_lineup, historicalOrigin: m.origin === "historical",
        }} />
    </div>
  );
}
