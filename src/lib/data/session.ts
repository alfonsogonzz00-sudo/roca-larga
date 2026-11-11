import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Player, Profile, Role } from "@/lib/types";

export interface Session {
  userId: string;
  email: string | null;
  profile: Profile;
  player: Player | null;
  role: Role;
  isAdmin: boolean;
  isStaff: boolean;
  isLinked: boolean;
  pendingLink: { player_id: string; requested_nickname: string | null; created_at: string } | null;
}

/** Sesión actual verificada en servidor (getClaims valida el JWT). */
export const getSession = cache(async (): Promise<Session | null> => {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub as string | undefined;
  if (!userId) return null;
  const { data: profile } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle<Profile>();
  if (!profile) return null;
  let player: Player | null = null;
  if (profile.player_id) {
    const { data } = await supabase.from("players").select("*").eq("id", profile.player_id).maybeSingle<Player>();
    player = data;
  }
  const { data: link } = await supabase
    .from("player_links").select("player_id,requested_nickname,created_at")
    .eq("user_id", userId).eq("status", "pending").maybeSingle();
  const active = profile.status === "active";
  return {
    userId,
    email: profile.email,
    profile,
    player,
    role: profile.role,
    isAdmin: active && profile.role === "admin",
    isStaff: active && (profile.role === "admin" || profile.role === "organizer"),
    isLinked: active && Boolean(player),
    pendingLink: link ?? null,
  };
});

export async function requireSession(next = "/") {
  const s = await getSession();
  if (!s) redirect(`/login?next=${encodeURIComponent(next)}`);
  return s;
}

export async function requireStaff() {
  const s = await requireSession();
  if (!s.isStaff) redirect("/?denied=1");
  return s;
}

export async function requireAdmin() {
  const s = await requireSession("/admin");
  if (!s.isAdmin) redirect("/?denied=1");
  return s;
}
