/**
 * Mapa de zonas de un modelo de jugador para personalizarlo en la app.
 * Rasteriza cada triángulo en el espacio UV de la textura y genera un PNG:
 *   B = zona   (0 nada · 80 piernas bajo la rodilla: botas y medias · 160 espalda imprimible)
 *   R,G = coordenadas de la espalda (x, y del modelo, normalizadas al área de impresión)
 * Mismo tamaño que la textura base del modelo (las UV casan píxel a píxel).
 * Uso: node scripts/build-kit-map.mjs modelo.glb salida.png
 */
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import sharp from "sharp";

const [, , input, output] = process.argv;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(input);
const baseTex = doc.getRoot().listMaterials()[0].getBaseColorTexture();
const { width: W, height: Hh } = await sharp(Buffer.from(baseTex.getImage())).metadata();

const mul = (m, [x, y, z]) => [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]];
const tris = [];
let minY = Infinity, maxY = -Infinity, minX = Infinity, maxX = -Infinity;
for (const node of doc.getRoot().listNodes()) {
  const mesh = node.getMesh(); if (!mesh) continue;
  const M = node.getWorldMatrix();
  for (const prim of mesh.listPrimitives()) {
    const pos = prim.getAttribute("POSITION"), uv = prim.getAttribute("TEXCOORD_0"), idx = prim.getIndices();
    const P = [], U = [];
    const e = [];
    for (let i = 0; i < pos.getCount(); i++) { P.push(mul(M, pos.getElement(i, e).slice())); U.push(uv.getElement(i, e).slice()); }
    for (const p of P) { minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]); minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]); }
    const n = idx ? idx.getCount() : P.length;
    for (let t = 0; t < n; t += 3) {
      const a = idx ? idx.getScalar(t) : t, b = idx ? idx.getScalar(t + 1) : t + 1, c = idx ? idx.getScalar(t + 2) : t + 2;
      tris.push([[P[a], U[a]], [P[b], U[b]], [P[c], U[c]]]);
    }
  }
}
const H = maxY - minY;
// Zonas relativas a la altura del modelo (pose A, mirando a +Z)
const KNEE = minY + 0.25 * H;
const PRINT = { x0: -0.13 * H, x1: 0.13 * H, y0: minY + 0.52 * H, y1: minY + 0.80 * H };

const buf = Buffer.alloc(W * Hh * 3);
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
let counts = { legs: 0, back: 0 };
for (const [[pa, ua], [pb, ub], [pc, uc]] of tris) {
  const cy = (pa[1] + pb[1] + pc[1]) / 3, cx = (pa[0] + pb[0] + pc[0]) / 3;
  const nrm = cross(sub(pb, pa), sub(pc, pa));
  const len = Math.hypot(...nrm) || 1, nz = nrm[2] / len;
  let zone = 0;
  if (cy < KNEE) zone = 80;
  else if (nz < -0.35 && cy > PRINT.y0 && cy < PRINT.y1 && cx > PRINT.x0 && cx < PRINT.x1) zone = 160;
  if (!zone) continue;
  zone === 80 ? counts.legs++ : counts.back++;
  // rasterizado en UV (v invertida: origen arriba)
  const A = [ua[0] * W, ua[1] * Hh], B = [ub[0] * W, ub[1] * Hh], C = [uc[0] * W, uc[1] * Hh];
  const x0 = Math.max(0, Math.floor(Math.min(A[0], B[0], C[0])) - 1), x1 = Math.min(W - 1, Math.ceil(Math.max(A[0], B[0], C[0])) + 1);
  const y0 = Math.max(0, Math.floor(Math.min(A[1], B[1], C[1])) - 1), y1 = Math.min(Hh - 1, Math.ceil(Math.max(A[1], B[1], C[1])) + 1);
  const den = (B[1] - C[1]) * (A[0] - C[0]) + (C[0] - B[0]) * (A[1] - C[1]);
  if (Math.abs(den) < 1e-9) continue;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const px = x + 0.5, py = y + 0.5;
    const w1 = ((B[1] - C[1]) * (px - C[0]) + (C[0] - B[0]) * (py - C[1])) / den;
    const w2 = ((C[1] - A[1]) * (px - C[0]) + (A[0] - C[0]) * (py - C[1])) / den;
    const w3 = 1 - w1 - w2;
    const eps = -1.2 / Math.max(1, Math.abs(den) ** 0.5); // dilata un pelín los bordes
    if (w1 < eps || w2 < eps || w3 < eps) continue;
    const o = (y * W + x) * 3;
    if (zone === 160) {
      const X = w1 * pa[0] + w2 * pb[0] + w3 * pc[0], Y = w1 * pa[1] + w2 * pb[1] + w3 * pc[1];
      // de espaldas, la x del espectador es la -x del modelo
      buf[o] = Math.round(Math.min(1, Math.max(0, (PRINT.x1 - X) / (PRINT.x1 - PRINT.x0))) * 255);
      buf[o + 1] = Math.round(Math.min(1, Math.max(0, (PRINT.y1 - Y) / (PRINT.y1 - PRINT.y0))) * 255);
    }
    buf[o + 2] = Math.max(buf[o + 2], zone);
  }
}
await sharp(buf, { raw: { width: W, height: Hh, channels: 3 } }).png({ compressionLevel: 9 }).toFile(output);
// La textura base aparte: la app la recolorea en el móvil sin tener que leerla del GLB
await sharp(Buffer.from(baseTex.getImage())).webp({ quality: 92 }).toFile(output.replace(/-map\.png$/, "-base.webp"));
console.log(JSON.stringify({ width: W, height_px: Hh, height: +H.toFixed(3), knee: +KNEE.toFixed(3), print: PRINT, counts }));
