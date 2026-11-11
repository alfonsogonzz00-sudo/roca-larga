import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { MatchForm, type SideState } from "@/components/forms/match-form";
import { requireStaff } from "@/lib/data/session";
import { getStats } from "@/lib/data/stats";
import { isoToMadridParts } from "@/lib/format";
import type { Position } from "@/lib/types";

export const metadata = { title: "Editar partido" };

export default async function EditMatch({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await requireStaff();
  const { ds, settings } = await getStats();
  const m = ds.matchById.get(id);
  if (!m) notFound();
  if (m.status === "played") redirect(`/partidos/${id}/finalizar`);
  const { date, time } = isoToMadridParts(m.kickoff_at);
  const side = (teamId: string): SideState => {
    const rows = ds.matchPlayers.filter((x) => x.match_id === id && x.team_id === teamId && x.called);
    return {
      players: rows.filter((r) => ds.playerById.get(r.player_id)?.kind === "member").map((r) => r.player_id),
      guests: rows.filter((r) => ds.playerById.get(r.player_id)?.kind === "guest").map((r) => ({ player_id: r.player_id, name: ds.playerById.get(r.player_id)!.full_name, brought_by_id: r.brought_by_id })),
      positions: Object.fromEntries(rows.filter((r) => r.lineup_position).map((r) => [r.player_id, r.lineup_position as Position])),
    };
  };
  return (
    <div>
      <PageHeader eyebrow="Partidos" title="Editar partido" />
      <MatchForm teams={ds.teams} players={ds.players} venues={ds.venues} formations={ds.formations} isAdmin={s.isAdmin} perSide={settings.players_per_side}
        initial={{
          id, date, time, venue_id: m.venue_id ?? "", home_team_id: m.home_team_id, away_team_id: m.away_team_id,
          home_formation_id: m.home_formation_id ?? "", away_formation_id: m.away_formation_id ?? "",
          forecast_weather: m.forecast_weather ?? "", forecast_temp_c: m.forecast_temp_c?.toString() ?? "", notes: m.notes ?? "",
          status: m.status as "pending", exceptional_lineup: m.exceptional_lineup, exceptional_reason: m.exceptional_reason ?? "",
          home: side(m.home_team_id), away: side(m.away_team_id),
        }} />
    </div>
  );
}
