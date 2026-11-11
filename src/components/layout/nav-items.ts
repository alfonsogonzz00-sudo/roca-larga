export const NAV = [
  { href: "/", key: "nav.matches", label: "Partidos", icon: "CalendarDays" },
  { href: "/equipos", key: "nav.teams", label: "Equipos", icon: "Shield" },
  { href: "/votacion", key: "nav.vote", label: "Votación", icon: "Vote" },
  { href: "/historico", key: "nav.history", label: "Histórico", icon: "History" },
  { href: "/despacho", key: "nav.office", label: "El Despacho", icon: "Briefcase" },
  { href: "/perfil", key: "nav.profile", label: "Perfil", icon: "UserRound" },
] as const;

export function isActive(path: string, href: string) {
  if (href === "/") return path === "/" || path.startsWith("/partidos");
  return path === href || path.startsWith(href + "/") || (href === "/equipos" && path.startsWith("/jugadores"));
}
