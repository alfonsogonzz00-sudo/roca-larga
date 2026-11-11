import Link from "next/link";
import { Card, PageHeader, Select } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { fmtDateTime } from "@/lib/format";

const TYPES = [["", "Todo"], ["match", "Partidos"], ["vote", "Votaciones"], ["link", "Vinculaciones"], ["user", "Usuarios"], ["players", "Jugadores"], ["teams", "Equipos"], ["venues", "Estadios"], ["prediction_configs", "Modelo"], ["ui_texts", "Textos"], ["app_settings", "Ajustes"]];

export default async function AdminActivity({ searchParams }: { searchParams: Promise<{ f?: string; page?: string }> }) {
  const sp = await searchParams;
  const page = Math.max(0, Number(sp.page) || 0);
  const supabase = await createClient();
  let q = supabase.from("activity_log").select("*").order("created_at", { ascending: false }).range(page * 50, page * 50 + 49);
  if (sp.f) q = sp.f.includes("_") || ["players", "teams", "venues"].includes(sp.f) ? q.eq("entity_type", sp.f) : q.like("action", `${sp.f}.%`);
  const { data } = await q;
  return (
    <div className="space-y-4">
      <PageHeader title="Registro de actividad" subtitle="Quién hizo qué y cuándo. Las votaciones registran participación, nunca el contenido." />
      <form method="get" className="flex gap-2"><Select name="f" defaultValue={sp.f ?? ""} aria-label="Filtrar">{TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select><button className="min-h-11 rounded-xl bg-pitch px-4 text-sm font-semibold text-pitch-ink">Filtrar</button></form>
      <Card className="divide-y divide-line">
        {(data ?? []).map((a) => (
          <details key={a.id} className="px-4 py-2.5 text-sm">
            <summary className="cursor-pointer list-none">
              <span className="tabular text-xs text-ink-3">{fmtDateTime(a.created_at)}</span> · <strong>{a.actor_name}</strong> {a.summary.charAt(0).toLowerCase() + a.summary.slice(1)}
              {a.entity_type === "match" && a.entity_id && <> · <Link href={`/partidos/${a.entity_id}`} className="text-pitch">ver</Link></>}
            </summary>
            {a.changes && <pre className="mt-2 overflow-x-auto rounded-lg bg-surface-2 p-2 text-xs">{JSON.stringify(a.changes, null, 2)}</pre>}
          </details>
        ))}
      </Card>
      <div className="flex justify-between text-sm">
        {page > 0 ? <Link href={`?f=${sp.f ?? ""}&page=${page - 1}`} className="font-semibold text-pitch">← Más recientes</Link> : <span />}
        {(data?.length ?? 0) === 50 && <Link href={`?f=${sp.f ?? ""}&page=${page + 1}`} className="font-semibold text-pitch">Anteriores →</Link>}
      </div>
    </div>
  );
}
