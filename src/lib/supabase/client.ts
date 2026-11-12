"use client";
import { createBrowserClient } from "@supabase/ssr";
import { env } from "@/lib/env";

let client: ReturnType<typeof createBrowserClient> | null = null;

export function createClient() {
  if (!client) client = createBrowserClient(env.supabaseUrl, env.supabaseKey, {
    // Sólo el proxy del servidor renueva la sesión: dos renovadores a la vez (pestaña que vuelve
    // a primer plano + petición al servidor) gastan el mismo refresh token y Supabase cierra la sesión.
    auth: { autoRefreshToken: false },
  });
  return client;
}
