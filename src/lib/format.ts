/** Formateo de fechas/números en la zona horaria de la app (Europe/Madrid). */
export const APP_TZ = "Europe/Madrid";

const dayFmt = new Intl.DateTimeFormat("es-ES", { timeZone: APP_TZ, weekday: "long", day: "numeric", month: "long" });
const shortDayFmt = new Intl.DateTimeFormat("es-ES", { timeZone: APP_TZ, weekday: "short", day: "numeric", month: "short" });
const dateFmt = new Intl.DateTimeFormat("es-ES", { timeZone: APP_TZ, day: "2-digit", month: "2-digit", year: "numeric" });
const timeFmt = new Intl.DateTimeFormat("es-ES", { timeZone: APP_TZ, hour: "2-digit", minute: "2-digit", hour12: false });
const dateTimeFmt = new Intl.DateTimeFormat("es-ES", { timeZone: APP_TZ, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });

export const fmtDay = (iso: string) => cap(dayFmt.format(new Date(iso)));
export const fmtShortDay = (iso: string) => cap(shortDayFmt.format(new Date(iso)).replace(/\./g, ""));
export const fmtDate = (iso: string) => dateFmt.format(new Date(iso));
export const fmtTime = (iso: string) => timeFmt.format(new Date(iso));
export const fmtDateTime = (iso: string) => dateTimeFmt.format(new Date(iso));

export function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Hora local (0-23) en Madrid de un instante */
export function localHour(iso: string): number {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone: APP_TZ, hour: "2-digit", hour12: false }).format(new Date(iso))) % 24;
}

/** Año de temporada: de agosto a julio ("2025/26") */
export function seasonOf(iso: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: APP_TZ, year: "numeric", month: "numeric" }).formatToParts(new Date(iso));
  const y = Number(parts.find((p) => p.type === "year")!.value);
  const m = Number(parts.find((p) => p.type === "month")!.value);
  const start = m >= 8 ? y : y - 1;
  return `${start}/${String((start + 1) % 100).padStart(2, "0")}`;
}

/** Convierte "YYYY-MM-DD" + "HH:MM" en hora de Madrid a ISO UTC (maneja horario de verano). */
export function madridLocalToIso(date: string, time: string): string {
  const [y, mo, d] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  // Primera aproximación: tratar como UTC y corregir con el desfase real de Madrid en ese instante
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  const offset = tzOffsetMinutes(new Date(guess));
  let ts = guess - offset * 60000;
  const offset2 = tzOffsetMinutes(new Date(ts));
  if (offset2 !== offset) ts = guess - offset2 * 60000;
  return new Date(ts).toISOString();
}

function tzOffsetMinutes(d: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: APP_TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(d);
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"));
  return Math.round((asUtc - d.getTime()) / 60000);
}

/** ISO UTC → { date: YYYY-MM-DD, time: HH:MM } en Madrid (para formularios) */
export function isoToMadridParts(iso: string): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return { date: `${get("year")}-${get("month")}-${get("day")}`, time: `${String(Number(get("hour")) % 24).padStart(2, "0")}:${get("minute")}` };
}

export function pct(x: number, digits = 0) {
  return `${(x * 100).toFixed(digits).replace(".", ",")} %`;
}

export function num(x: number, digits = 1) {
  return x.toFixed(digits).replace(".", ",");
}

export function playerName(p: { full_name: string; nickname: string | null } | undefined, mode: "full" | "short" | "nick" = "full") {
  if (!p) return "Desconocido";
  if (mode === "nick") return p.nickname || p.full_name.split(" ")[0];
  if (mode === "short") {
    const parts = p.full_name.split(" ");
    if (parts.length <= 2) return p.full_name;
    // Conserva partículas del apellido: «Raúl de la Fuente», «Juan del Río»
    let i = parts.length - 1;
    while (i > 1 && /^(de|la|del|las|los|y)$/i.test(parts[i - 1])) i--;
    return `${parts[0]} ${parts.slice(i).join(" ")}`;
  }
  return p.full_name;
}

/** Instante actual (aislado para facilitar pruebas) */
export function nowMs() {
  return Date.now();
}

export function relativeFromNow(iso: string): string {
  const diff = new Date(iso).getTime() - Date.now();
  const abs = Math.abs(diff);
  const h = Math.floor(abs / 3600000);
  const m = Math.floor((abs % 3600000) / 60000);
  const label = h >= 24 ? `${Math.floor(h / 24)} d ${h % 24} h` : h > 0 ? `${h} h ${m} min` : `${m} min`;
  return diff >= 0 ? `en ${label}` : `hace ${label}`;
}

/** Color de equipo legible sobre fondos oscuros: si el principal es casi negro, usa el secundario */
export function teamColor(t: { primary_color: string; secondary_color: string } | undefined | null): string {
  if (!t) return "var(--ink-3)";
  const hex = t.primary_color.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum < 0.12 ? t.secondary_color : t.primary_color;
}
