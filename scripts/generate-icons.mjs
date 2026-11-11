import sharp from "sharp";
const D = "public/icons/";
// Icono de la app: logotipo RocaLarga casi a sangre sobre fondo oscuro con brillo verde
const BG = "#0b0f0c";
async function logoIcon(size, { rounded = false, scale = 0.92 } = {}) {
  const lw = Math.round(size * scale);
  const logoBuf = await sharp("public/brand/rocalarga.png").resize({ width: lw }).png().toBuffer();
  const { height: lh } = await sharp(logoBuf).metadata();
  const glow = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
    <defs><radialGradient id="g" cx="50%" cy="55%" r="65%"><stop offset="0" stop-color="#1f5a33"/><stop offset="0.6" stop-color="#10241a"/><stop offset="1" stop-color="${BG}"/></radialGradient></defs>
    <rect width="${size}" height="${size}" ${rounded ? `rx="${Math.round(size * 0.22)}"` : ""} fill="url(#g)"/></svg>`);
  return sharp(glow).composite([{ input: logoBuf, left: Math.round((size - lw) / 2), top: Math.round((size - lh) / 2) }]).png();
}
await (await logoIcon(192)).toFile(D + "icon-192.png");
await (await logoIcon(512)).toFile(D + "icon-512.png");
await (await logoIcon(512, { scale: 0.76 })).toFile(D + "maskable-512.png");   // zona segura de Android
await (await logoIcon(180)).toFile(D + "apple-touch-icon.png");                  // iOS redondea solo
await (await logoIcon(180)).toFile("src/app/apple-icon.png");
await (await logoIcon(64, { rounded: true, scale: 0.94 })).toFile("src/app/icon.png"); // favicon
// Pantallas de inicio iOS: logotipo + «powered by LongRock»
const logo = "public/brand/rocalarga.png";
for (const [w,h] of [[1179,2556],[1290,2796],[1170,2532],[750,1334],[1242,2688],[828,1792]]) {
  const lw = Math.round(w * 0.72);
  const logoBuf = await sharp(logo).resize({ width: lw }).png().toBuffer();
  const { height: lh } = await sharp(logoBuf).metadata();
  const fs = Math.round(w / 30);
  const text = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${fs * 3}"><text x="50%" y="${fs * 1.6}" text-anchor="middle" font-family="Arial, sans-serif" font-weight="600" font-size="${fs}" letter-spacing="${fs * 0.15}" fill="#5c6574">POWERED BY <tspan fill="#1a1d23">LONGROCK</tspan></text></svg>`);
  const top = Math.round(h / 2 - lh / 2 - fs);
  await sharp({ create: { width: w, height: h, channels: 4, background: "#ffffff" } })
    .composite([{ input: logoBuf, left: Math.round((w - lw) / 2), top }, { input: text, left: 0, top: top + lh + Math.round(fs * 0.6) }])
    .png().toFile(D + `splash-${w}x${h}.png`);
}
