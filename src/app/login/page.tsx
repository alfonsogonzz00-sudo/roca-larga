import { redirect } from "next/navigation";
import { signInWithGoogle } from "@/app/actions/auth";
import { Card, Notice } from "@/components/ui";
import { SubmitButton } from "@/components/ui/client";
import { getSession } from "@/lib/data/session";
import { getSettings } from "@/lib/data/config";
import { EmailForms } from "./forms";

export const metadata = { title: "Entrar" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next = "/", error } = await searchParams;
  const [session, settings] = await Promise.all([getSession(), getSettings()]);
  if (session) redirect(session.player ? next : "/registro");
  return (
    <div className="mx-auto max-w-sm py-4">
      <div className="mb-6 text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/icon-192.png" alt="" width={72} height={72} className="mx-auto mb-3 rounded-2xl" />
        <h1 className="font-display text-4xl font-bold uppercase">{settings.app_name}</h1>
        <p className="mt-1 text-sm text-ink-2">Entra para votar, gestionar partidos y simular en El Despacho.</p>
      </div>
      {error && <Notice tone="danger" className="mb-4">{error}</Notice>}
      <Card className="p-4">
        <form action={signInWithGoogle}>
          <input type="hidden" name="next" value={next} />
          <SubmitButton variant="secondary" className="w-full" pendingLabel="Abriendo Google…">
            <svg aria-hidden width="18" height="18" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>
            Continuar con Google
          </SubmitButton>
        </form>
        <div className="my-4 flex items-center gap-3 text-xs text-ink-3"><span className="h-px flex-1 bg-line" />o con email<span className="h-px flex-1 bg-line" /></div>
        <EmailForms next={next} />
      </Card>
      <p className="mt-4 text-center text-xs text-ink-3">Consultar partidos y estadísticas no requiere cuenta.</p>
    </div>
  );
}
