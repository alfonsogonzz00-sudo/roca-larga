import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

/** Confirmación de email (enlace del correo de alta) */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const token_hash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const code = url.searchParams.get("code");
  const supabase = await createClient();
  let ok = false;
  if (token_hash && type) ok = !(await supabase.auth.verifyOtp({ type, token_hash })).error;
  else if (code) ok = !(await supabase.auth.exchangeCodeForSession(code)).error;
  if (ok) return NextResponse.redirect(new URL("/registro", url.origin));
  // Con ?code, Supabase ya ha verificado el correo antes de redirigir. Si el canje falla es porque el enlace
  // se abrió en otro navegador (p. ej. el de Gmail): la cuenta está confirmada, sólo falta iniciar sesión.
  if (code) return NextResponse.redirect(new URL("/login?ok=confirmed", url.origin));
  return NextResponse.redirect(new URL("/login?error=" + encodeURIComponent("El enlace ha caducado o ya se usó. Prueba a entrar con tu email y contraseña."), url.origin));
}
