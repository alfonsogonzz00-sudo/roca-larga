import { redirect } from "next/navigation";

/** Ruta antigua: el histórico ahora vive en Clasificación */
export default async function OldHistory({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const qs = new URLSearchParams(await searchParams).toString();
  redirect(`/clasificacion${qs ? `?${qs}` : ""}`);
}
