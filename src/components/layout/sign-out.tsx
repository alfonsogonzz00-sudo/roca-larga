"use client";
import { LogOut } from "lucide-react";
import { signOut } from "@/app/actions/auth";
import { SubmitButton } from "@/components/ui/client";

/** Cerrar sesión borrando antes las páginas guardadas sin conexión en este dispositivo */
export function SignOutButton() {
  const clearPages = () => {
    try {
      navigator.serviceWorker?.controller?.postMessage({ type: "CLEAR_PAGES" });
      void caches?.keys().then((ks) => Promise.all(ks.filter((k) => k.endsWith("-pages")).map((k) => caches.delete(k))));
    } catch {
      // sin service worker o sin Cache Storage: no hay nada que borrar
    }
  };
  return (
    <form action={signOut} onSubmit={clearPages}>
      <SubmitButton variant="ghost" className="text-danger"><LogOut size={18} /> Cerrar sesión</SubmitButton>
    </form>
  );
}
