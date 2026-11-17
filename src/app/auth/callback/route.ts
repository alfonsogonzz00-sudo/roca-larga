import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/safe-next";

/** Retorno de OAuth (Google): intercambia el código por sesión */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = safeNext(url.searchParams.get("next"));
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const { data } = await supabase.from("profiles").select("player_id").maybeSingle();
      return NextResponse.redirect(new URL(data?.player_id ? next : "/registro", url.origin));
    }
  }
  return NextResponse.redirect(new URL("/login?error=No%20se%20pudo%20iniciar%20sesi%C3%B3n", url.origin));
}
