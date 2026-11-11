import { notFound } from "next/navigation";
import { Card, Crest, EmptyState, PageHeader, SectionTitle } from "@/components/ui";
import { MatchRow, VenueCard } from "@/components/match/parts";
import { WdlBar } from "@/components/charts";
import { getStats } from "@/lib/data/stats";
import { teamStats } from "@/lib/stats/engine";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ds } = await getStats();
  return { title: ds.venueById.get(id)?.name ?? "Estadio" };
}

export default async function VenuePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ds } = await getStats();
  const v = ds.venueById.get(id);
  if (!v) notFound();
  const matches = ds.matches.filter((m) => m.venue_id === id).sort((a, b) => b.kickoff_at.localeCompare(a.kickoff_at));
  const played = matches.filter((m) => m.status === "played");
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Estadio" title={v.name} />
      <VenueCard v={v} />
      {v.notes && <p className="text-sm text-ink-2">{v.notes}</p>}
      <section>
        <SectionTitle>Rendimiento aquí</SectionTitle>
        {played.length === 0 ? <EmptyState title="Aún no se ha jugado aquí">Cuando se dispute un partido en este campo aparecerán las estadísticas.</EmptyState> : (
          <div className="grid gap-3 sm:grid-cols-2">
            {ds.teams.map((t) => {
              const r = teamStats(t.id, ds.matches, { venueId: id }).record;
              return (
                <Card key={t.id} className="space-y-2 p-4">
                  <div className="flex items-center gap-2 font-semibold"><Crest src={t.crest_url} name={t.name} size={22} />{t.name}</div>
                  <WdlBar wins={r.wins} draws={r.draws} losses={r.losses} />
                  <p className="tabular text-sm text-ink-2">{r.played} PJ · {r.wins}V {r.draws}E {r.losses}D · {r.goalsFor}:{r.goalsAgainst}{r.played < 3 ? " · muestra pequeña" : ""}</p>
                </Card>
              );
            })}
          </div>
        )}
      </section>
      {matches.length > 0 && (
        <section>
          <SectionTitle>Partidos en {v.name}</SectionTitle>
          <div className="space-y-2">{matches.map((m) => <MatchRow key={m.id} m={m} teams={ds.teamById} venues={ds.venueById} />)}</div>
        </section>
      )}
    </div>
  );
}
