import Link from "next/link";
import { Card, Crest, PageHeader } from "@/components/ui";
import { FormStrip, WdlBar } from "@/components/charts";
import { getStats } from "@/lib/data/stats";
import { teamStats } from "@/lib/stats/engine";

export const metadata = { title: "Equipos" };

export default async function Teams() {
  const { ds } = await getStats();
  return (
    <div>
      <PageHeader title="Equipos" subtitle="Dos clubes, una rivalidad." />
      <div className="grid gap-4 sm:grid-cols-2">
        {ds.teams.map((t) => {
          const st = teamStats(t.id, ds.matches);
          const r = st.record;
          const players = ds.players.filter((p) => p.team_id === t.id && p.kind === "member" && p.active).length;
          return (
            <Link key={t.id} href={`/equipos/${t.slug}`} className="block">
              <Card className="overflow-hidden transition hover:border-line-strong">
                <div className="flex items-center gap-4 p-4" style={{ background: `linear-gradient(135deg, ${t.primary_color}22, transparent 70%)` }}>
                  <span className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-white p-2 shadow-card"><Crest src={t.crest_url} name={t.name} size={64} /></span>
                  <div className="min-w-0">
                    <h2 className="font-display text-2xl font-bold uppercase leading-none">{t.name}</h2>
                    <p className="mt-1 text-sm text-ink-2">{t.headquarters ? `Sede: ${t.headquarters}` : t.full_name}</p>
                    <p className="text-xs text-ink-3">{players} jugadores en plantilla</p>
                  </div>
                </div>
                <div className="space-y-3 border-t border-line p-4">
                  <div className="grid grid-cols-4 text-center">
                    {[["PJ", r.played], ["V", r.wins], ["E", r.draws], ["D", r.losses]].map(([l, v]) => (
                      <div key={l as string}><div className="text-[11px] font-semibold text-ink-3">{l}</div><div className="font-display tabular text-2xl font-bold">{v}</div></div>
                    ))}
                  </div>
                  <WdlBar wins={r.wins} draws={r.draws} losses={r.losses} />
                  <div className="flex items-center justify-between text-sm">
                    <span className="tabular text-ink-2">{r.goalsFor}:{r.goalsAgainst} ({r.goalDiff >= 0 ? "+" : ""}{r.goalDiff})</span>
                    {st.form.length > 0 && <FormStrip results={st.form.slice(-5).map((f) => f.result)} />}
                  </div>
                </div>
              </Card>
            </Link>
          );
        })}
      </div>
      <Link href="/estadios" className="mt-4 flex min-h-12 items-center justify-between rounded-2xl border border-line bg-surface px-4 text-sm font-semibold hover:border-line-strong">
        <span>🏟️ Estadios: teléfonos, reservas y cómo llegar</span><span aria-hidden className="text-ink-3">›</span>
      </Link>
    </div>
  );
}
