import sharp from "sharp";
import { writeFileSync } from "node:fs";
const D = "/home/claude/roca-larga/public/icons/";
const svg = (full, id="c") => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><defs><clipPath id="${id}"><rect width="512" height="512" rx="${full ? 0 : 112}"/></clipPath></defs>
<g clip-path="url(#${id})"><rect width="512" height="512" fill="#0f2a18"/>
<g opacity="0.18">${[0,1,2,3,4,5].map(i=>`<rect x="${i*86}" y="0" width="43" height="512" fill="#2f7a46"/>`).join("")}</g></g>
<line x1="256" y1="${full?110:70}" x2="256" y2="${full?402:442}" stroke="#d6b25e" stroke-width="22" stroke-linecap="round"/>
<circle cx="256" cy="256" r="${full?92:118}" fill="none" stroke="#d6b25e" stroke-width="22"/>
<circle cx="256" cy="256" r="22" fill="#f4f2ec"/></svg>`;
writeFileSync(D+"icon.svg", svg(false));
await sharp(Buffer.from(svg(false))).resize(192).png().toFile(D+"icon-192.png");
await sharp(Buffer.from(svg(false))).resize(512).png().toFile(D+"icon-512.png");
await sharp(Buffer.from(svg(true))).resize(512).png().toFile(D+"maskable-512.png");
await sharp(Buffer.from(svg(true))).resize(180).png().toFile(D+"apple-touch-icon.png");
await sharp(Buffer.from(svg(false))).resize(72).png().toFile(D+"badge-72.png");
for (const [w,h] of [[1179,2556],[1290,2796],[1170,2532],[750,1334],[1242,2688],[828,1792]]) {
  const s = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="#0b0f0c"/>
  <g transform="translate(${w/2-110},${h/2-180}) scale(0.43)">${svg(false,"s").replace(/<svg[^>]*>|<\/svg>/g,"")}</g>
  <text x="50%" y="${h/2+120}" text-anchor="middle" font-family="Arial Narrow, Arial, sans-serif" font-weight="700" font-size="${Math.round(w/13)}" fill="#eef1ea" letter-spacing="4">ROCA LARGA</text>
  <text x="50%" y="${h/2+120+Math.round(w/18)}" text-anchor="middle" font-family="Arial, sans-serif" font-size="${Math.round(w/34)}" fill="#d6b25e">CARAVELLE F.C. · S.D. MONECILLO</text></svg>`;
  await sharp(Buffer.from(s)).png().toFile(D+`splash-${w}x${h}.png`);
}
