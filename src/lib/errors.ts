/** Traduce errores de Supabase/Postgres a mensajes para personas. */
export function friendlyError(e: unknown): string {
  const err = e as { message?: string; code?: string } | null;
  const msg = err?.message ?? String(e ?? "");
  if (!msg) return "Algo ha fallado. Inténtalo de nuevo.";
  if (err?.code === "42501" && /permission denied/i.test(msg)) return "No tienes permiso para hacer esto.";
  if (/JWT|not authenticated/i.test(msg)) return "Tu sesión ha caducado. Vuelve a entrar.";
  if (/duplicate key/i.test(msg)) return "Ese registro ya existe.";
  if (/violates foreign key/i.test(msg)) return "No se puede borrar: hay datos que dependen de este registro. Desactívalo en su lugar.";
  if (/rate limit/i.test(msg)) return "Ahora mismo hay demasiados registros seguidos y no se pueden enviar más correos. Espera unos minutos y vuelve a intentarlo, o avisa al administrador.";
  if (/Failed to fetch|NetworkError/i.test(msg)) return "Sin conexión. Revisa tu red e inténtalo de nuevo.";
  return msg;
}

export type ActionResult<T = undefined> = { ok: true; message?: string; data?: T } | { ok: false; error: string };
