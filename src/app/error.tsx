"use client";
import { Button } from "@/components/ui";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="py-16 text-center">
      <p className="font-display text-2xl font-bold uppercase">Algo ha fallado</p>
      <p className="mx-auto mt-2 max-w-sm text-sm text-ink-2">No hemos podido cargar esta pantalla. Si no tienes conexión, inténtalo cuando vuelva.</p>
      {error.digest && <p className="mt-1 text-xs text-ink-3">Ref.: {error.digest}</p>}
      <Button onClick={reset} className="mt-6">Reintentar</Button>
    </div>
  );
}
