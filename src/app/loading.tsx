export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Cargando" className="space-y-4">
      <div className="h-9 w-48 animate-pulse rounded-lg bg-surface-2" />
      <div className="h-44 animate-pulse rounded-3xl bg-surface-2" />
      <div className="h-16 animate-pulse rounded-2xl bg-surface-2" />
      <div className="h-16 animate-pulse rounded-2xl bg-surface-2" />
    </div>
  );
}
