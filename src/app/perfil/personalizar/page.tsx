import { redirect } from "next/navigation";
import { requireSession } from "@/lib/data/session";
import { getStats } from "@/lib/data/stats";
import { EmptyState, ButtonLink } from "@/components/ui";
import { playerName, teamColor } from "@/lib/format";
import { KitEditor } from "./kit-editor";

export const metadata = { title: "Personalizar mi jugador" };

export default async function PersonalizarPage() {
  const s = await requireSession("/perfil/personalizar");
  if (!s.player) redirect("/perfil");
  const p = s.player;
  if (!p.model_url || !p.model_map_url) {
    return <EmptyState title="Aún no tienes modelo 3D" action={<ButtonLink href="/perfil" variant="secondary">Volver al perfil</ButtonLink>}>Cuando el administrador suba tu modelo podrás personalizar botas, medias y dorsal.</EmptyState>;
  }
  const { ds } = await getStats();
  const team = p.team_id ? ds.teamById.get(p.team_id) : null;
  const takenNumbers: Record<number, string> = {};
  for (const x of ds.players) if (x.id !== p.id && x.team_id === p.team_id && x.shirt_number != null && x.active) takenNumbers[x.shirt_number] = playerName(x, "short");
  return (
    <KitEditor
      player={{ name: p.nickname ?? p.full_name, src: p.model_url, poster: p.card_photo_url ?? null, mapUrl: p.model_map_url, kit: (p.kit ?? null) as never, number: p.shirt_number }}
      teamColor={teamColor(team)} takenNumbers={takenNumbers} />
  );
}
