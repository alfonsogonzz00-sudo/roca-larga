import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { env } from "@/lib/env";

/** Cookies de sesión: sólo por HTTPS en producción y no se envían desde otros sitios (lax) */
export const COOKIE_OPTIONS = { path: "/", sameSite: "lax" as const, secure: process.env.NODE_ENV === "production" };

/** Cliente de Supabase ligado a la sesión del usuario (RLS aplica siempre). */
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(env.supabaseUrl, env.supabaseKey, {
    cookieOptions: COOKIE_OPTIONS,
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // En Server Components no se pueden escribir cookies; el proxy refresca la sesión.
        }
      },
    },
  });
}

/** Cliente anónimo sin cookies (lectura pública y despachador con secreto). */
export function createAnonClient() {
  return createServerClient(env.supabaseUrl, env.supabaseKey, {
    cookies: { getAll: () => [], setAll: () => {} },
  });
}
