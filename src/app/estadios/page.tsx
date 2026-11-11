import { EmptyState, PageHeader } from "@/components/ui";
import { VenueCard } from "@/components/match/parts";
import { getStats } from "@/lib/data/stats";

export const metadata = { title: "Estadios" };

export default async function VenuesPage() {
  const { ds } = await getStats();
  const venues = ds.venues.filter((v) => v.active);
  return (
    <div>
      <PageHeader title="Estadios" subtitle="Dónde jugamos, cómo reservar y cómo llegar." />
      {venues.length === 0 ? <EmptyState title="Sin estadios todavía" /> : (
        <div className="grid gap-4 sm:grid-cols-2">{venues.map((v) => <VenueCard key={v.id} v={v} />)}</div>
      )}
    </div>
  );
}
