import Link from "next/link";
import { requireAdmin } from "@/lib/data/session";

const LINKS = [
  ["/admin", "Resumen"], ["/admin/usuarios", "Usuarios"], ["/admin/jugadores", "Jugadores"], ["/admin/equipos", "Equipos"],
  ["/admin/estadios", "Estadios"], ["/admin/partidos", "Partidos"], ["/admin/votaciones", "Votaciones"], ["/admin/estadisticas", "Estadísticas"],
  ["/admin/notificaciones", "Avisos"], ["/admin/textos", "Textos"], ["/admin/ajustes", "Ajustes"], ["/admin/actividad", "Actividad"],
] as const;

export const metadata = { title: "Administración" };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return (
    <div>
      <p className="mb-1 text-xs font-semibold uppercase tracking-[0.14em] text-gold">Centro de control</p>
      <nav aria-label="Administración" className="no-scrollbar -mx-4 mb-5 flex gap-1 overflow-x-auto px-4 pb-1">
        {LINKS.map(([href, label]) => (
          <Link key={href} href={href} className="flex min-h-10 shrink-0 items-center rounded-none border border-line bg-surface px-3.5 text-sm font-semibold text-ink-2 hover:text-ink">{label}</Link>
        ))}
      </nav>
      {children}
    </div>
  );
}
