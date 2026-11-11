"use client";
import { createBrowserClient } from "@supabase/ssr";
import { env } from "@/lib/env";

let client: ReturnType<typeof createBrowserClient> | null = null;

export function createClient() {
  if (!client) client = createBrowserClient(env.supabaseUrl, env.supabaseKey);
  return client;
}
