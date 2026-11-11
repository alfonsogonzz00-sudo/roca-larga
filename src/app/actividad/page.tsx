import Link from "next/link";
import { ButtonLink, Card, EmptyState, PageHeader } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/data/session";
import { getTexts } from "@/lib/data/config";
import { fmtTime } from "@/lib/format";

export const metadata = { title: "Actividad" };

interface Row { id: number; created_at: string; actor_name: string | null; action: string; entity_type: string; entity_id: string | null; summary: string; is_system: boolean }

const ICON: Record<string, string> = {
  "match.create": "📅", "match.historical": "📜", "match.status": "🔁", "match.update": "✏️", "match.finalize": "🏁",
  "match.result_edit": "🛠️", "match.attendance": "🙋", "match.delete": "🗑️", "vote.cast": "🗳️", "vote.update": "🔄",
  "vote.close": "🏆", "link.approve": "🤝", "link.admin": "🤝",
};

const dayFmt = new Intl.DateTimeFormat("es-ES", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Madrid" });
const dayKey = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(new Date(iso));

export default async function ActivityPage({ searchParams }: { searchParams: Promise<{ before?: string }> }) {
  const { before } = await searchParams;
  const [s, t] = await Promise.all([getSession(), getTexts()]);
  if (!s) {
    return (
      <div>
        <PageHeader title="Actividad" subtitle="Lo último que ha pasado en el grupo." />
        <EmptyState title="Entra para ver la actividad" action={<ButtonLink href="/login?next=/actividad">Entrar</ButtonLink>}>
          Convocatorias, resultados, quién ha votado y los MVP, todo en un mismo muro.
        </EmptyState>
      </div>
    );
  }
  const supabase = await createClient();
  const b = Number(before);
  const { data } = await supabase.rpc("public_activity", { p_before: Number.isFinite(b) && b > 0 ? b : null, p_limit: 40 });
  const rows = (data ?? []) as Row[];
  const groups: { key: string; label: string; items: Row[] }[] = [];
  for (const r of rows) {
    const k = dayKey(r.created_at);
    const g = groups.at(-1);
    if (g?.key === k) g.items.push(r);
    else groups.push({ key: k, label: dayFmt.format(new Date(r.created_at)), items: [r] });
  }
  return (
    <div className="space-y-5">
      <PageHeader title="Actividad" subtitle="Lo último que ha pasado en el grupo. Los votos son secretos: sólo se ve quién ha votado." />
      {rows.length === 0 ? <EmptyState title="Nada por aquí">{t("activity.empty")}</EmptyState> : groups.map((g) => (
        <section key={g.key}>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-3 first-letter:uppercase">{g.label}</h2>
          <Card className="divide-y divide-line">
            {g.items.map((r) => {
              const href = r.entity_type === "match" && r.entity_id && r.action !== "match.delete" ? `/partidos/${r.entity_id}` : r.entity_type === "player" && r.entity_id ? `/jugadores/${r.entity_id}` : null;
              const who = r.is_system || !r.actor_name ? "Roca Larga" : r.actor_name;
              const text = r.summary.charAt(0).toLowerCase() + r.summary.slice(1);
              const body = (
                <div className="flex items-start gap-3 px-4 py-3">
                  <span aria-hidden className="mt-0.5 text-lg leading-none">{ICON[r.action] ?? "•"}</span>
                  <p className="min-w-0 flex-1 text-sm"><strong>{who}</strong> <span className="text-ink-2">{r.is_system ? r.summary : text}</span></p>
                  <span className="tabular shrink-0 text-xs text-ink-3">{fmtTime(r.created_at)}</span>
                </div>
              );
              return href ? <Link key={r.id} href={href} className="block hover:bg-surface-2">{body}</Link> : <div key={r.id}>{body}</div>;
            })}
          </Card>
        </section>
      ))}
      <div className="flex justify-between text-sm">
        {before ? <Link href="/actividad" className="font-semibold text-pitch">← Lo más reciente</Link> : <span />}
        {rows.length === 40 && <Link href={`/actividad?before=${rows.at(-1)!.id}`} className="font-semibold text-pitch">Más antiguo →</Link>}
      </div>
    </div>
  );
}
