import sharp from "sharp";
const D = "public/icons/";
// Icono de la app: logotipo RocaLarga sobre fondo oscuro
const BG = "#0b0f0c";
async function logoIcon(size, { rounded = false, scale = 0.86 } = {}) {
  const lw = Math.round(size * scale);
  const logoBuf = await sharp("public/brand/rocalarga.png").resize({ width: lw }).png().toBuffer();
  const { height: lh } = await sharp(logoBuf).metadata();
  const base = sharp({ create: { width: size, height: size, channels: 4, background: BG } })
    .composite([{ input: logoBuf, left: Math.round((size - lw) / 2), top: Math.round((size - lh) / 2) }]);
  if (!rounded) return base.png();
  const r = Math.round(size * 0.22);
  const mask = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${r}" fill="#fff"/></svg>`);
  return sharp(await base.png().toBuffer()).composite([{ input: mask, blend: "dest-in" }]).png();
}
await (await logoIcon(192)).toFile(D + "icon-192.png");
await (await logoIcon(512)).toFile(D + "icon-512.png");
await (await logoIcon(512, { scale: 0.72 })).toFile(D + "maskable-512.png");   // zona segura de Android
await (await logoIcon(180)).toFile(D + "apple-touch-icon.png");                  // iOS redondea solo
await (await logoIcon(180)).toFile("src/app/apple-icon.png");
await (await logoIcon(64, { rounded: true, scale: 0.92 })).toFile("src/app/icon.png"); // favicon
// Pantallas de inicio iOS: logotipo + «powered by LongRock»
const logo = "public/brand/rocalarga.png";
for (const [w,h] of [[1179,2556],[1290,2796],[1170,2532],[750,1334],[1242,2688],[828,1792]]) {
  const lw = Math.round(w * 0.72);
  const logoBuf = await sharp(logo).resize({ width: lw }).png().toBuffer();
  const { height: lh } = await sharp(logoBuf).metadata();
  const fs = Math.round(w / 30);
  const text = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${fs * 3}"><text x="50%" y="${fs * 1.6}" text-anchor="middle" font-family="Arial, sans-serif" font-weight="600" font-size="${fs}" letter-spacing="${fs * 0.15}" fill="#7f897d">POWERED BY <tspan fill="#b6bdb2">LONGROCK</tspan></text></svg>`);
  const top = Math.round(h / 2 - lh / 2 - fs);
  await sharp({ create: { width: w, height: h, channels: 4, background: "#0b0f0c" } })
    .composite([{ input: logoBuf, left: Math.round((w - lw) / 2), top }, { input: text, left: 0, top: top + lh + Math.round(fs * 0.6) }])
    .png().toFile(D + `splash-${w}x${h}.png`);
}
