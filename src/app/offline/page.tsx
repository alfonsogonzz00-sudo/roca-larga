export const metadata = { title: "Sin conexión" };

export default function Offline() {
  return (
    <div className="py-16 text-center">
      <p className="font-display text-3xl font-bold uppercase">Sin conexión</p>
      <p className="mx-auto mt-3 max-w-sm text-sm text-ink-2">
        No hay red ahora mismo. Las páginas que ya habías abierto siguen disponibles; vuelve a intentarlo cuando recuperes la conexión.
      </p>
    </div>
  );
}
