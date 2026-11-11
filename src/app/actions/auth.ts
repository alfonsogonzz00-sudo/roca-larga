"use server";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { friendlyError, type ActionResult } from "@/lib/errors";

async function origin() {
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "https";
  const host = h.get("x-forwarded-host") ?? h.get("host");
  return host ? `${proto}://${host}` : process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
}

const safeNext = (n: unknown) => (typeof n === "string" && n.startsWith("/") && !n.startsWith("//") ? n : "/");

export async function signInWithGoogle(fd: FormData) {
  const supabase = await createClient();
  const next = safeNext(fd.get("next"));
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${await origin()}/auth/callback?next=${encodeURIComponent(next)}` },
  });
  if (error || !data.url) redirect(`/login?error=${encodeURIComponent(friendlyError(error))}`);
  redirect(data.url);
}

const creds = z.object({
  email: z.string().trim().email("Escribe un email válido"),
  password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres"),
});

export async function signInWithPassword(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const parsed = creds.safeParse({ email: fd.get("email"), password: fd.get("password") });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { ok: false, error: /Invalid login/i.test(error.message) ? "Email o contraseña incorrectos." : /not confirmed/i.test(error.message) ? "Confirma tu email antes de entrar (revisa tu correo)." : friendlyError(error) };
  redirect(safeNext(fd.get("next")));
}

export async function signUpWithPassword(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const parsed = creds.safeParse({ email: fd.get("email"), password: fd.get("password") });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    ...parsed.data,
    options: { emailRedirectTo: `${await origin()}/auth/confirm?next=/registro` },
  });
  if (error) return { ok: false, error: /already registered/i.test(error.message) ? "Ya existe una cuenta con ese email. Inicia sesión." : friendlyError(error) };
  if (data.session) redirect("/registro");
  return { ok: true, message: "Te hemos enviado un email para confirmar la cuenta. Ábrelo desde este dispositivo." };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
