import { redirect } from "next/navigation";
import { Card, Notice } from "@/components/ui";
import { getSession } from "@/lib/data/session";
import { getSettings } from "@/lib/data/config";
import { EmailForms } from "./forms";
import { Brand } from "@/components/layout/brand";

export const metadata = { title: "Entrar" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string; ok?: string }> }) {
  const { next = "/", error, ok } = await searchParams;
  const [session, settings] = await Promise.all([getSession(), getSettings()]);
  if (session) redirect(session.player ? next : "/registro");
  return (
    <div className="mx-auto max-w-sm py-4">
      <div className="mb-6 text-center">
        <h1 className="sr-only">{settings.app_name}</h1>
        <Brand size="lg" stacked className="mx-auto mb-4" />
        <p className="mt-1 text-sm text-ink-2">Entra para votar, gestionar partidos y simular en El Despacho.</p>
      </div>
      {ok === "confirmed" && <Notice tone="ok" className="mb-4">¡Correo confirmado! Ahora entra con tu email y contraseña.</Notice>}
      {error && <Notice tone="danger" className="mb-4">{error}</Notice>}
      <Card className="p-4">
        <EmailForms next={next} />
      </Card>
      <p className="mt-4 text-center text-xs text-ink-3">Consultar partidos y estadísticas no requiere cuenta.</p>
    </div>
  );
}
