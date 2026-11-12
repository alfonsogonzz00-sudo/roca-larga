/**
 * Personalización del jugador 3D (botas, medias, nombre y dorsal).
 * Funciona sobre la textura del modelo y un «mapa de zonas» generado al subir el modelo
 * (scripts/build-kit-map.mjs):
 *   azul ≈ 80  → piernas bajo la rodilla (botas: píxeles oscuros · medias: blancos)
 *   azul ≈ 160 → espalda imprimible; rojo/verde = coordenadas x,y en el área de impresión
 */

export const KIT_COLORS = {
  negro: { label: "Negro", hex: "#16171a" },
  blanco: { label: "Blanco", hex: "#f4f4f2" },
  rojo: { label: "Rojo", hex: "#d7262f" },
  azul: { label: "Azul", hex: "#2457c5" },
  verde: { label: "Verde", hex: "#1f9d4c" },
  amarillo: { label: "Amarillo", hex: "#f2c81b" },
  naranja: { label: "Naranja", hex: "#f2711c" },
  rosa: { label: "Rosa", hex: "#ec4f9c" },
  morado: { label: "Morado", hex: "#6d3fd1" },
  gris: { label: "Gris", hex: "#8a9099" },
} as const;
export type KitColor = keyof typeof KIT_COLORS;
export const KIT_COLOR_KEYS = Object.keys(KIT_COLORS) as KitColor[];

export interface Kit { boots?: KitColor; socks?: KitColor; back_name?: string }
/** Lo que se pinta: colores (por defecto, los originales del modelo), nombre y número */
export interface KitPaint { boots: KitColor; socks: KitColor; name: string; number: number | null }

export const DEFAULT_BOOTS: KitColor = "negro";
export const DEFAULT_SOCKS: KitColor = "blanco";

export function kitPaint(kit: Kit | null | undefined, number: number | null | undefined): KitPaint {
  return {
    boots: kit?.boots ?? DEFAULT_BOOTS,
    socks: kit?.socks ?? DEFAULT_SOCKS,
    name: kit?.back_name ?? "",
    number: number ?? null,
  };
}

export const kitKey = (k: KitPaint) => `${k.boots}|${k.socks}|${k.name}|${k.number ?? ""}`;
export const isDefaultPaint = (k: KitPaint) => k.boots === DEFAULT_BOOTS && k.socks === DEFAULT_SOCKS && !k.name && k.number == null;

const hexRgb = (h: string) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)] as const;

/**
 * Aplica la personalización sobre la textura base (RGBA, en sitio).
 * `print` es el dibujo del nombre y el dorsal en el espacio de la espalda (RGBA, pw×ph).
 */
export function paintTexture(
  base: Uint8ClampedArray, map: Uint8ClampedArray, k: KitPaint,
  print?: { data: Uint8ClampedArray; width: number; height: number },
) {
  const boots = k.boots === DEFAULT_BOOTS ? null : hexRgb(KIT_COLORS[k.boots].hex);
  const socks = k.socks === DEFAULT_SOCKS ? null : hexRgb(KIT_COLORS[k.socks].hex);
  const n = Math.min(base.length, map.length) / 4;
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    const zone = map[o + 2];
    if (zone < 40) continue;
    if (zone < 120) {
      if (!boots && !socks) continue;
      const r = base[o], g = base[o + 1], b = base[o + 2];
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      const v = mx / 255, s = mx ? (mx - mn) / mx : 0;
      if (boots && v < 0.38 && s < 0.45) {
        // bota: mantiene el sombreado del cuero
        const shade = 0.5 + 0.95 * (v / 0.38);
        base[o] = Math.min(255, boots[0] * shade); base[o + 1] = Math.min(255, boots[1] * shade); base[o + 2] = Math.min(255, boots[2] * shade);
      } else if (socks && v > 0.42 && s < 0.2) {
        // media: blanca (y sus sombras y costuras) → color, conservando pliegues
        const shade = 0.5 + 0.55 * ((v - 0.42) / 0.58);
        base[o] = Math.min(255, socks[0] * shade); base[o + 1] = Math.min(255, socks[1] * shade); base[o + 2] = Math.min(255, socks[2] * shade);
      }
    } else if (print) {
      const px = Math.min(print.width - 1, Math.round((map[o] / 255) * (print.width - 1)));
      const py = Math.min(print.height - 1, Math.round((map[o + 1] / 255) * (print.height - 1)));
      const p = (py * print.width + px) * 4;
      const a = print.data[p + 3] / 255;
      if (a <= 0) continue;
      base[o] = base[o] * (1 - a) + print.data[p] * a;
      base[o + 1] = base[o + 1] * (1 - a) + print.data[p + 1] * a;
      base[o + 2] = base[o + 2] * (1 - a) + print.data[p + 2] * a;
    }
  }
}
