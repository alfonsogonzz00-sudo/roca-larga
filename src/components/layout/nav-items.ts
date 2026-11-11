export const NAV = [
  { href: "/clasificacion", key: "nav.ranking", label: "Clasificación", icon: "Trophy" },
  { href: "/", key: "nav.matches", label: "Partidos", icon: "CalendarDays" },
  { href: "/votacion", key: "nav.vote", label: "Votación", icon: "Vote" },
  { href: "/actividad", key: "nav.activity", label: "Actividad", icon: "Activity" },
  { href: "/perfil", key: "nav.profile", label: "Perfil", icon: "UserRound" },
] as const;

/** Rutas que cuelgan de Clasificación (equipos, jugadores, estadios, El Despacho) */
const UNDER_RANKING = ["/equipos", "/jugadores", "/estadios", "/despacho", "/historico"];

export function isActive(path: string, href: string) {
  if (href === "/") return path === "/" || path.startsWith("/partidos");
  if (href === "/clasificacion" && UNDER_RANKING.some((p) => path === p || path.startsWith(p + "/"))) return true;
  return path === href || path.startsWith(href + "/");
}
