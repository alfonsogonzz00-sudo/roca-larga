/**
 * Carteles prepartido: plantillas (dibujo).
 *
 * Se dibujan con next/og (Satori): sólo flexbox y posiciones absolutas, y todo `div` con más de un
 * hijo necesita display:flex (lo pone `h`). No se usa JSX para poder probarlas con vitest.
 * Cada plantilla tiene su tipografía y su paleta por equipo.
 */
import { createElement, type CSSProperties, type ReactElement } from "react";
import { POSTER_H as H, POSTER_W as W, type PosterData, type PosterPlayer } from "./model";

export interface PosterImages {
  /** data: URI de la imagen del jugador (o null si no se pudo cargar) */
  player: (id: string) => string | null;
  crest: (slug: string) => string | null;
  brand: string | null;
  grain: string | null;
}

type Child = ReactElement | string | null | false | undefined | Child[];
const h = (style: CSSProperties, ...children: Child[]): ReactElement =>
  createElement("div", { style: { display: "flex", ...style } }, ...(children.flat(4).filter(Boolean) as (ReactElement | string)[]));
const t = (text: string, style: CSSProperties) => h(style, text);
const img = (src: string | null, style: CSSProperties): ReactElement | null =>
  src ? createElement("img", { src, style, alt: "" }) : null;
const abs = (s: CSSProperties): CSSProperties => ({ position: "absolute", ...s });

const GREEN = "#1f7a3c", LEAF = "#2a8a48", DEEP = "#0f3d22", CREAM = "#f2efe3", INK = "#121212", GOLD = "#b8963e", MUSTARD = "#d8b24a", BONE = "#e6dfcf";
const BRAND_RATIO = 747 / 325;
const isCaravelle = (d: PosterData) => d.team.slug === "caravelle";

const infoLine = (d: PosterData, sep = " · ") => [d.day, d.time, d.venue?.toUpperCase()].filter(Boolean).join(sep);
const grain = (im: PosterImages) => im.grain && h(abs({ left: 0, top: 0, width: W, height: H, backgroundImage: `url(${im.grain})`, backgroundRepeat: "repeat", backgroundSize: "256px 256px" }));
const brand = (im: PosterImages, height: number) => img(im.brand, { height, width: height * BRAND_RATIO });
/** Imagen de un jugador escalada a `height`; devuelve también el ancho para colocarla */
function figure(im: PosterImages, p: PosterPlayer | undefined, height: number) {
  if (!p?.img) return null;
  const src = im.player(p.id);
  return src ? { src, w: Math.round((p.img.w / p.img.h) * height), h: height } : null;
}
/** Reparte los nombres en filas equilibradas (para bloques centrados) */
function rows(names: string[], perRow: number): string[][] {
  const n = Math.ceil(names.length / perRow);
  const out: string[][] = [];
  let i = 0;
  for (let r = 0; r < n; r++) {
    const size = Math.ceil((names.length - i) / (n - r));
    out.push(names.slice(i, i + size));
    i += size;
  }
  return out;
}

// ============ «Siete inicial»: condensada cursiva, lista a la izquierda, protagonista a la derecha ============
function titular(d: PosterData, im: PosterImages) {
  const pal = isCaravelle(d)
    ? { bg: CREAM, stripe: "#e4e0cf", fg: DEEP, title: GREEN, accent: GREEN, blockA: GREEN, foot: GREEN, footFg: CREAM }
    : { bg: INK, stripe: "#1b1b1b", fg: CREAM, title: GOLD, accent: GOLD, blockA: "#262626", foot: GOLD, footFg: INK };
  const hero = figure(im, d.heroes[0], d.heroes[0]?.img?.kind === "pose" ? 940 : 965);
  const rowH = Math.min(86, Math.floor(600 / Math.max(d.players.length, 1)));
  const title = d.players.length === 7 ? "SIETE INICIAL" : "CONVOCATORIA";
  return h({ width: W, height: H, backgroundColor: pal.bg, position: "relative", overflow: "hidden" },
    [0, 1, 2].map((i) => h(abs({ left: 48 + i * 120, top: 120, width: 60, height: H, backgroundColor: pal.stripe }))),
    hero && img(hero.src, abs({ right: -90, bottom: 96, width: hero.w, height: hero.h })),
    h(abs({ left: 48, right: 48, top: 40, justifyContent: "space-between", alignItems: "center" }),
      brand(im, 46),
      t(infoLine(d), { fontFamily: "Barlow", fontWeight: 700, fontSize: 24, letterSpacing: 3, color: pal.fg })),
    t(title, abs({ left: 44, top: 96, fontFamily: "Sofia", fontWeight: 900, fontStyle: "italic", fontSize: 232, lineHeight: 1, letterSpacing: -3, color: pal.title })),
    h(abs({ left: 48, top: 356 }),
      h({ width: 150, height: 150, backgroundColor: pal.blockA, alignItems: "center", justifyContent: "center" }, img(im.crest(d.team.slug), { width: 122, height: 122 })),
      h({ width: 150, height: 150, backgroundColor: d.rival.color, alignItems: "center", justifyContent: "center" }, img(im.crest(d.rival.slug), { width: 122, height: 122 }))),
    h(abs({ left: 48, top: 540, flexDirection: "column" }),
      d.players.map((p) => h({ alignItems: "baseline", gap: 18, height: rowH },
        t(p.tag || " ", { fontFamily: "Sofia", fontWeight: 400, fontStyle: "italic", fontSize: rowH * 0.51, color: pal.accent, width: 74 }),
        t(p.label, { fontFamily: "Sofia", fontWeight: 900, fontStyle: "italic", fontSize: rowH * 0.98, lineHeight: 1, color: pal.fg })))),
    h(abs({ left: 0, right: 0, bottom: 0, height: 96, backgroundColor: pal.foot, alignItems: "center", justifyContent: "space-between", padding: "0 48px" }),
      t(d.team.name.toUpperCase(), { fontFamily: "Sofia", fontWeight: 900, fontStyle: "italic", fontSize: 50, color: pal.footFg, letterSpacing: 1 }),
      t(["contra " + d.rival.name, d.city?.toUpperCase()].filter(Boolean).join("  ·  "), { fontFamily: "Barlow", fontWeight: 500, fontSize: 28, letterSpacing: 2, color: pal.footFg })),
    grain(im),
  );
}

// ============ «Gala»: serif de alto contraste, protagonista centrado, nombres en bloque ============
function gala(d: PosterData, im: PosterImages) {
  const pal = isCaravelle(d) ? { bg: LEAF, fg: CREAM, title: CREAM } : { bg: GOLD, fg: INK, title: INK };
  const hero = figure(im, d.heroes[0], 1060);
  const names = rows(d.players.map((p) => p.label), 3);
  return h({ width: W, height: H, backgroundColor: pal.bg, position: "relative", overflow: "hidden" },
    img(im.crest(d.team.slug), abs({ left: (W - 1180) / 2, top: 150, width: 1180, height: 1180, opacity: 0.09 })),
    t("ALINEACIÓN", abs({ left: 0, right: 0, top: 92, justifyContent: "center", fontFamily: "Bodoni", fontWeight: 800, fontSize: 134, lineHeight: 1, letterSpacing: -1, color: pal.title })),
    hero && img(hero.src, abs({ left: (W - hero.w) / 2, top: 236, width: hero.w, height: hero.h })),
    t(infoLine(d, "  ·  "), abs({ left: 0, right: 0, top: 40, justifyContent: "center", fontFamily: "Barlow", fontWeight: 700, fontSize: 24, letterSpacing: 6, color: pal.fg })),
    h(abs({ left: 0, right: 0, bottom: 0, height: 520, backgroundImage: `linear-gradient(to bottom, ${pal.bg}00, ${pal.bg} 46%)` })),
    h(abs({ left: 40, right: 40, bottom: 150, flexDirection: "column", alignItems: "center", gap: 4 }),
      names.map((r) => t(r.join("  ·  "), { fontFamily: "Playfair", fontWeight: 700, fontSize: names.length > 3 ? 48 : 60, lineHeight: 1.12, color: pal.fg, letterSpacing: 0.5 }))),
    h(abs({ left: 48, right: 48, bottom: 40, alignItems: "center", justifyContent: "space-between" }),
      h({ alignItems: "center", gap: 14 },
        img(im.crest(d.team.slug), { width: 78, height: 78 }),
        t("contra el", { fontFamily: "Bodoni", fontWeight: 500, fontStyle: "italic", fontSize: 34, color: pal.fg }),
        img(im.crest(d.rival.slug), { width: 78, height: 78 })),
      brand(im, 46)),
    grain(im),
  );
}

// ============ «Trío»: tres compañeros bajo un arco, titular en Anton ============
function trio(d: PosterData, im: PosterImages) {
  const pal = isCaravelle(d)
    ? { bg: MUSTARD, arch: CREAM, title: DEEP, fg: DEEP, band: DEEP, bandFg: CREAM, accent: MUSTARD }
    : { bg: BONE, arch: INK, title: INK, fg: INK, band: INK, bandFg: CREAM, accent: GOLD };
  const BAND = 286;
  const n = d.heroes.length;
  // Protagonista en el centro y delante; los otros dos, algo más pequeños, a los lados y detrás
  const slots = n >= 3 ? [{ i: 1, x: 250, hh: 700 }, { i: 2, x: 830, hh: 700 }, { i: 0, x: 540, hh: 800 }]
    : n === 2 ? [{ i: 1, x: 740, hh: 740 }, { i: 0, x: 370, hh: 790 }]
    : [{ i: 0, x: 540, hh: 800 }];
  const names = rows(d.players.map((p) => p.label), 4);
  return h({ width: W, height: H, backgroundColor: pal.bg, position: "relative", overflow: "hidden" },
    h(abs({ left: 150, top: 330, width: 780, height: H, backgroundColor: pal.arch, borderTopLeftRadius: 390, borderTopRightRadius: 390 })),
    t("DÍA DE PARTIDO", abs({ left: 0, right: 0, top: 100, justifyContent: "center", fontFamily: "Anton", fontWeight: 400, fontSize: 168, lineHeight: 1, letterSpacing: 1, color: pal.title })),
    n === 0 && img(im.crest(d.team.slug), abs({ left: (W - 520) / 2, top: 440, width: 520, height: 520 })),
    slots.map((s) => {
      const f = figure(im, d.heroes[s.i], s.hh);
      return f && img(f.src, abs({ left: s.x - f.w / 2, bottom: BAND, width: f.w, height: f.h }));
    }),
    h(abs({ left: 48, right: 48, top: 36, justifyContent: "space-between", alignItems: "center" }),
      t(infoLine(d), { fontFamily: "Barlow", fontWeight: 700, fontSize: 24, letterSpacing: 3, color: pal.fg }),
      brand(im, 40)),
    h(abs({ left: 0, right: 0, bottom: 0, height: BAND, backgroundColor: pal.band, flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6 }),
      h({ alignItems: "center", gap: 16, marginBottom: 6 },
        img(im.crest(d.team.slug), { width: 60, height: 60 }),
        t(d.team.name.toUpperCase(), { fontFamily: "Anton", fontWeight: 400, fontSize: 44, letterSpacing: 2, color: pal.accent }),
        t("contra " + d.rival.name, { fontFamily: "Barlow", fontWeight: 500, fontSize: 28, letterSpacing: 2, color: pal.bandFg })),
      names.map((r) => t(r.join("   ·   "), { fontFamily: "Barlow", fontWeight: 700, fontSize: 42, lineHeight: 1.1, letterSpacing: 2, color: pal.bandFg }))),
    grain(im),
  );
}

// ============ «Plantel»: foto de equipo en fila, nombre gigante en Big Shoulders ============
function plantel(d: PosterData, im: PosterImages) {
  const pal = isCaravelle(d) ? { bg: INK, name: LEAF, fg: CREAM, accent: LEAF } : { bg: "#26282b", name: GOLD, fg: CREAM, accent: GOLD };
  const LIST = 318;
  const name = d.team.short.toUpperCase();
  const size = Math.min(320, Math.floor(1010 / (name.length * 0.455)));
  const n = d.heroes.length;
  // Orden de foto: el protagonista en el centro, el resto alternando a los lados
  const order = d.heroes.map((_, i) => i).sort((a, b) => (a % 2 ? -a : a) - (b % 2 ? -b : b));
  const hh = n >= 4 ? 640 : 720;
  const step = n > 1 ? Math.min(250, (W - 260) / (n - 1)) : 0;
  const x0 = W / 2 - (step * (n - 1)) / 2;
  const half = Math.ceil(d.players.length / 2);
  const col = (ps: PosterPlayer[]) => h({ flexDirection: "column", width: 470 },
    ps.map((p) => h({ alignItems: "baseline", gap: 14, height: 52 },
      t(p.tag || " ", { fontFamily: "Barlow", fontWeight: 500, fontSize: 26, color: pal.accent, width: 50 }),
      t(p.label, { fontFamily: "BigShoulders", fontWeight: 900, fontSize: 46, lineHeight: 1, letterSpacing: 1, color: pal.fg }))));
  return h({ width: W, height: H, backgroundColor: pal.bg, position: "relative", overflow: "hidden" },
    t(name, abs({ left: 0, right: 0, top: 108, justifyContent: "center", fontFamily: "BigShoulders", fontWeight: 900, fontSize: size, lineHeight: 0.9, letterSpacing: -2, color: pal.name })),
    n === 0 && img(im.crest(d.team.slug), abs({ left: (W - 480) / 2, top: 470, width: 480, height: 480 })),
    order.map((idx, k) => {
      const f = figure(im, d.heroes[idx], hh);
      return f && img(f.src, abs({ left: x0 + k * step - f.w / 2, bottom: LIST + (k % 2 ? 0 : 18), width: f.w, height: f.h }));
    }),
    h(abs({ left: 48, right: 48, top: 36, justifyContent: "space-between", alignItems: "center" }),
      t(infoLine(d, "  /  "), { fontFamily: "Barlow", fontWeight: 700, fontSize: 24, letterSpacing: 3, color: pal.fg }),
      brand(im, 40)),
    h(abs({ left: 0, right: 0, bottom: 0, height: LIST, backgroundColor: pal.bg, borderTop: `4px solid ${pal.accent}`, flexDirection: "column", padding: "20px 48px 0" }),
      h({ justifyContent: "space-between" }, col(d.players.slice(0, half)), col(d.players.slice(half))),
      h(abs({ left: 48, right: 48, bottom: 22, alignItems: "center", gap: 14 }),
        img(im.crest(d.team.slug), { width: 50, height: 50 }),
        t("contra el", { fontFamily: "Instrument", fontWeight: 400, fontStyle: "italic", fontSize: 32, color: pal.fg }),
        img(im.crest(d.rival.slug), { width: 50, height: 50 }))),
    grain(im),
  );
}

export function renderPoster(d: PosterData, im: PosterImages): ReactElement {
  switch (d.variant) {
    case "titular": return titular(d, im);
    case "gala": return gala(d, im);
    case "trio": return trio(d, im);
    case "plantel": return plantel(d, im);
  }
}

/** Tipografías que usan las plantillas (archivos en src/lib/poster/fonts) */
export const POSTER_FONTS = [
  { name: "Sofia", weight: 900, style: "italic", file: "sofia-900i.woff" },
  { name: "Sofia", weight: 400, style: "italic", file: "sofia-400i.woff" },
  { name: "Bodoni", weight: 800, style: "normal", file: "bodoni-800.woff" },
  { name: "Bodoni", weight: 500, style: "italic", file: "bodoni-500i.woff" },
  { name: "Playfair", weight: 700, style: "normal", file: "playfair-700.woff" },
  { name: "Anton", weight: 400, style: "normal", file: "anton-400.woff" },
  { name: "BigShoulders", weight: 900, style: "normal", file: "bigshoulders-900.woff" },
  { name: "Instrument", weight: 400, style: "italic", file: "instrument-400i.woff" },
  { name: "Barlow", weight: 500, style: "normal", file: "barlow-500.woff" },
  { name: "Barlow", weight: 700, style: "normal", file: "barlow-700.woff" },
] as const;
