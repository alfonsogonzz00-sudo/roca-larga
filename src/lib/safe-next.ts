/**
 * Destino tras iniciar sesión: sólo rutas internas de la app.
 * Se resuelve con el analizador de URLs (que trata «\\» como «/») y se exige el mismo origen,
 * así «//evil.com», «/\\evil.com» o «https://evil.com» vuelven a «/».
 */
export function safeNext(n: unknown): string {
  if (typeof n !== "string" || !n.startsWith("/") || n.startsWith("//") || n.includes("\\") || /[\u0000-\u001f]/.test(n)) return "/";
  try {
    const base = "https://app.invalid";
    const u = new URL(n, base);
    return u.origin === base ? `${u.pathname}${u.search}${u.hash}` : "/";
  } catch {
    return "/";
  }
}
