/**
 * Meshy empaqueta toda la textura en una franja estrecha a la izquierda y rellena
 * el resto estirando los bordes. Recorta todas las texturas a esa franja y reescala
 * las UV: misma nitidez, ~8 veces menos memoria de GPU y personalización más rápida.
 * Uso: node scripts/crop-atlas.mjs entrada.glb salida.glb   (antes de cuantizar)
 */
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import sharp from "sharp";

const [, , input, output] = process.argv;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(input);
const root = doc.getRoot();
let uMax = 0, uMin = 1;
const uvs = new Set();
for (const mesh of root.listMeshes()) for (const prim of mesh.listPrimitives()) {
  const uv = prim.getAttribute("TEXCOORD_0"); if (!uv || uvs.has(uv)) continue; uvs.add(uv);
  const e = [];
  for (let i = 0; i < uv.getCount(); i++) { uv.getElement(i, e); uMax = Math.max(uMax, e[0]); uMin = Math.min(uMin, e[0]); }
}
if (uMin < -0.001 || uMax > 0.9) { console.log(JSON.stringify({ skipped: true, uMin, uMax })); await io.write(output, doc); process.exit(0); }
const frac = Math.min(1, uMax + 0.004); // un margen de padding
for (const tex of root.listTextures()) {
  const img = Buffer.from(tex.getImage());
  const meta = await sharp(img).metadata();
  const w = Math.max(8, Math.ceil(meta.width * frac));
  const out = await sharp(img).extract({ left: 0, top: 0, width: w, height: meta.height }).png().toBuffer();
  tex.setImage(new Uint8Array(out)).setMimeType("image/png");
}
// la fracción real usada por la textura base (todas comparten tamaño en Meshy)
const base = root.listTextures()[0];
const bw = (await sharp(Buffer.from(base.getImage())).metadata()).width;
const full = Math.round(bw / frac);
const k = full / bw; // u' = u * k
for (const uv of uvs) {
  const e = [];
  for (let i = 0; i < uv.getCount(); i++) { uv.getElement(i, e); e[0] = Math.min(1, e[0] * k); uv.setElement(i, e); }
}
await io.write(output, doc);
console.log(JSON.stringify({ uMax: +uMax.toFixed(4), frac: +frac.toFixed(4), width: bw }));
