#!/usr/bin/env node
/**
 * Prepara las imágenes de jugadores para los carteles prepartido.
 *
 *   node scripts/build-poster-assets.mjs <carpeta-de-recortes>
 *
 * La carpeta contiene PNG con fondo transparente (ya recortados):
 *   <id-jugador>.png        figura de cuerpo entero → se queda con el medio cuerpo («fig»)
 *   <id-jugador>-pose.png   retrato de medio cuerpo con postura propia («pose», tiene prioridad)
 *
 * Escribe public/poster/players/<id>-{fig|pose}.png (1000 px de alto, paleta) y
 * src/lib/poster/assets.json, que es lo que lee la app para saber qué jugadores tienen imagen.
 * También genera el grano de papel (public/poster/grain.png).
 */
import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";

const src = process.argv[2];
if (!src || !fs.existsSync(src)) { console.error("Uso: node scripts/build-poster-assets.mjs <carpeta-de-recortes>"); process.exit(1); }
const OUT = "public/poster/players", MANIFEST = "src/lib/poster/assets.json";
const HEIGHT = 1000, FIG_KEEP = 0.56;
const UUID = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(-pose)?\.png$/;
fs.mkdirSync(OUT, { recursive: true });

const manifest = fs.existsSync(MANIFEST) ? JSON.parse(fs.readFileSync(MANIFEST, "utf8")) : {};
for (const f of fs.readdirSync(src).sort()) {
  const m = UUID.exec(f);
  if (!m) continue;
  const [, id, pose] = m, kind = pose ? "pose" : "fig";
  let img = sharp(path.join(src, f));
  const meta = await img.metadata();
  if (kind === "fig") img = img.extract({ left: 0, top: 0, width: meta.width, height: Math.round(meta.height * FIG_KEEP) });
  const buf = await img.resize({ height: HEIGHT, kernel: "lanczos3" }).sharpen({ sigma: 0.8 }).linear(1.06, -6)
    .png({ palette: true, quality: 92, effort: 8 }).toBuffer();
  const out = await sharp(buf).metadata();
  fs.writeFileSync(path.join(OUT, `${id}-${kind}.png`), buf);
  manifest[id] = { ...manifest[id], [kind]: { w: out.width, h: out.height } };
  console.log(kind.padEnd(4), id, `${out.width}×${out.height}`, `${Math.round(buf.length / 1024)} KB`);
}
fs.writeFileSync(MANIFEST, JSON.stringify(Object.fromEntries(Object.entries(manifest).sort()), null, 2) + "\n");

// Grano de papel (mosaico): quita el acabado «digital limpio»
const N = 256, raw = Buffer.alloc(N * N * 4);
let seed = 11;
for (let i = 0; i < N * N; i++) {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  const v = seed >>> 24;
  raw[i * 4] = raw[i * 4 + 1] = raw[i * 4 + 2] = v;
  raw[i * 4 + 3] = Math.round(255 * 0.1 * (0.4 + (v / 255) * 0.6));
}
await sharp(raw, { raw: { width: N, height: N, channels: 4 } }).png().toFile("public/poster/grain.png");
console.log("manifest →", MANIFEST);
