import { ButtonLink } from "@/components/ui";

export default function NotFound() {
  return (
    <div className="py-16 text-center">
      <p className="font-display text-6xl font-bold text-gold">404</p>
      <p className="mt-2 font-display text-2xl font-bold uppercase">Fuera de juego</p>
      <p className="mx-auto mt-2 max-w-sm text-sm text-ink-2">Esta página no existe o el partido ya no está.</p>
      <ButtonLink href="/" className="mt-6">Volver a partidos</ButtonLink>
    </div>
  );
}
