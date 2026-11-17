/**
 * Carteles prepartido: carga de recursos (tipografías, escudos, jugadores) y salida PNG.
 * Los archivos se leen del disco; next.config.ts los incluye en el despliegue de la ruta del cartel.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import { POSTER_H, POSTER_W, type PosterData } from "./model";
import { POSTER_FONTS, renderPoster, type PosterImages } from "./templates";

const ROOT = process.cwd();
const PUBLIC = path.join(ROOT, "public");

function dataUri(buf: Buffer): string | null {
  const mime = buf[0] === 0x89 && buf[1] === 0x50 ? "image/png" : buf[0] === 0xff && buf[1] === 0xd8 ? "image/jpeg" : null;
  return mime ? `data:${mime};base64,${buf.toString("base64")}` : null; // el motor no dibuja otros formatos
}
async function fromPublic(rel: string): Promise<string | null> {
  const file = path.join(PUBLIC, path.normalize(rel.split("?")[0]));
  if (!file.startsWith(PUBLIC + path.sep)) return null;
  try { return dataUri(await readFile(file)); } catch { return null; }
}
/** Escudo: archivo propio de la app o subido a Supabase Storage */
async function crest(url: string | null): Promise<string | null> {
  if (!url) return null;
  if (url.startsWith("/")) return fromPublic(url);
  if (!/^https:\/\/[a-z0-9]+\.supabase\.co\/storage\/v1\/object\/public\//.test(url)) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    return res.ok ? dataUri(Buffer.from(await res.arrayBuffer())) : null;
  } catch { return null; }
}

let fontCache: Promise<{ name: string; weight: 400 | 500 | 700 | 800 | 900; style: "normal" | "italic"; data: Buffer }[]> | null = null;
const fonts = () => (fontCache ??= Promise.all(POSTER_FONTS.map(async (f) => ({
  name: f.name, weight: f.weight, style: f.style, data: await readFile(path.join(ROOT, "src/lib/poster/fonts", f.file)),
}))));

export async function loadPosterImages(d: PosterData): Promise<PosterImages> {
  const [players, crests, brand, grain] = await Promise.all([
    Promise.all(d.heroes.map(async (p) => [p.id, p.img ? await fromPublic(`poster/players/${p.id}-${p.img.kind}.png`) : null] as const)),
    Promise.all([d.team, d.rival].map(async (t) => [t.slug, await crest(t.crest)] as const)),
    fromPublic("brand/rocalarga.png"),
    fromPublic("poster/grain.png"),
  ]);
  const pm = new Map(players), cm = new Map(crests);
  return { player: (id) => pm.get(id) ?? null, crest: (slug) => cm.get(slug) ?? null, brand, grain };
}

export async function posterResponse(d: PosterData, headers?: Record<string, string>): Promise<ImageResponse> {
  const [images, fontData] = await Promise.all([loadPosterImages(d), fonts()]);
  return new ImageResponse(renderPoster(d, images), { width: POSTER_W, height: POSTER_H, fonts: fontData, headers });
}
