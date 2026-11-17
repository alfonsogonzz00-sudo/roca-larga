import { getStats } from "@/lib/data/stats";
import assets from "@/lib/poster/assets.json";
import { buildPoster, parsePosterSlug, type PosterAssets } from "@/lib/poster/model";
import { POSTER_WIDTHS, posterJpeg, type PosterWidth } from "@/lib/poster/render";

/**
 * Cartel prepartido en JPEG (1080×1350): /partidos/<id>/cartel/<plantilla>-<local|visitante>
 * `?w=720` sirve la miniatura de la galería. Público, como el resto de la información deportiva;
 * sólo dibuja datos ya visibles en la ficha.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string; slug: string }> }) {
  const { id, slug } = await params;
  const w = Number(new URL(req.url).searchParams.get("w") ?? POSTER_WIDTHS[0]);
  if (!POSTER_WIDTHS.includes(w as PosterWidth)) return new Response("Tamaño no válido", { status: 400 });
  const parsed = parsePosterSlug(slug);
  if (!parsed) return new Response("Cartel no encontrado", { status: 404 });
  const { ds } = await getStats();
  const match = ds.matchById.get(id);
  if (!match || match.status === "cancelled") return new Response("Cartel no encontrado", { status: 404 });
  const data = buildPoster(
    { match, teams: ds.teams, venue: match.venue_id ? ds.venueById.get(match.venue_id) : undefined, matchPlayers: ds.matchPlayers, playerById: ds.playerById },
    parsed.variant, parsed.side, assets as PosterAssets,
  );
  if (!data) return new Response("Cartel no encontrado", { status: 404 });
  try {
    // La ficha enlaza con ?v=<versión de la convocatoria>: se puede cachear sin servir carteles viejos
    const jpeg = await posterJpeg(data, w as PosterWidth);
    return new Response(new Uint8Array(jpeg), {
      headers: { "Content-Type": "image/jpeg", "Cache-Control": "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400" },
    });
  } catch (e) {
    console.error("[cartel]", id, slug, e);
    return new Response("No se ha podido generar el cartel", { status: 500 });
  }
}
