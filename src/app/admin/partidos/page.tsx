import { ButtonLink, PageHeader } from "@/components/ui";
import { MatchRow } from "@/components/match/parts";
import { getStats } from "@/lib/data/stats";

export default async function AdminMatches() {
  const { ds } = await getStats();
  return (
    <div className="space-y-4">
      <PageHeader title="Partidos" subtitle="Todos los encuentros. Entra en cada uno para editar, aplazar, cancelar, corregir el resultado o eliminar." action={
        <div className="flex gap-2"><ButtonLink href="/partidos/nuevo?historico=1" variant="secondary">Histórico</ButtonLink><ButtonLink href="/partidos/nuevo">Nuevo</ButtonLink></div>
      } />
      <div className="space-y-2">{ds.matches.map((m) => <MatchRow key={m.id} m={m} teams={ds.teamById} venues={ds.venueById} />)}</div>
    </div>
  );
}
