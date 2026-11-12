"use server";
import { getSession } from "@/lib/data/session";
import { getStats } from "@/lib/data/stats";
import { APP_TZ } from "@/lib/format";
import type { MatchFormInitial } from "@/components/forms/match-form";

/**
 * Convierte el dictado de un partido en un borrador del formulario.
 * Usa la API de Claude con una herramienta de salida estructurada: el modelo sólo puede elegir
 * entre los equipos, estadios, formaciones y jugadores que existen en la app, y todo se vuelve
 * a validar aquí. No crea nada: el organizador revisa el formulario y pulsa «Crear partido».
 */

export type VoiceDraftResult =
  | { ok: true; initial: MatchFormInitial; notes: string[] }
  | { ok: false; error: string };

const WEATHERS = ["despejado", "nublado", "lluvia", "viento", "niebla", "otro"] as const;

export async function draftMatchFromVoice(transcript: string): Promise<VoiceDraftResult> {
  const s = await getSession();
  if (!s?.isStaff) return { ok: false, error: "Sólo el administrador o un organizador puede crear partidos." };
  const text = transcript.trim();
  if (text.length < 8) return { ok: false, error: "Dicta algo más: fecha, hora, estadio y quién juega." };
  if (text.length > 4000) return { ok: false, error: "El dictado es demasiado largo. Resúmelo un poco." };
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return { ok: false, error: "Falta configurar la clave de Claude (ANTHROPIC_API_KEY) en el servidor." };

  const { ds, settings } = await getStats();
  const teams = ds.teams.map((t) => ({ id: t.id, nombre: t.name, corto: t.short_name }));
  const venues = ds.venues.map((v) => ({ id: v.id, nombre: v.name }));
  const formations = ds.formations.map((f) => ({ id: f.id, nombre: f.name, por_defecto: f.is_default }));
  const players = ds.players.filter((p) => p.kind === "member" && p.active).map((p) => ({ id: p.id, equipo_id: p.team_id, nombre: p.full_name, apodo: p.nickname }));
  const now = new Date();
  const today = new Intl.DateTimeFormat("es-ES", { timeZone: APP_TZ, weekday: "long", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const isoToday = new Intl.DateTimeFormat("sv-SE", { timeZone: APP_TZ }).format(now);

  const tool = {
    name: "preparar_partido",
    description: "Rellena el borrador del partido con lo que dice el dictado. Usa sólo ids de las listas dadas.",
    input_schema: {
      type: "object",
      properties: {
        fecha: { type: ["string", "null"], description: "YYYY-MM-DD. Resuelve expresiones relativas («el martes», «mañana») respecto a hoy. Siempre una fecha futura o de hoy." },
        hora: { type: ["string", "null"], description: "HH:MM en 24 h («a las nueve» de noche → 21:00; en fútbol amateur por la tarde/noche salvo que diga mañana)." },
        estadio_id: { type: ["string", "null"] },
        local_id: { type: ["string", "null"], description: "Equipo local. Si no se dice, null." },
        visitante_id: { type: ["string", "null"] },
        formacion_local_id: { type: ["string", "null"] },
        formacion_visitante_id: { type: ["string", "null"] },
        convocados_local: { type: "array", items: { type: "string" }, description: "ids de jugadores del equipo local" },
        convocados_visitante: { type: "array", items: { type: "string" }, description: "ids de jugadores del equipo visitante" },
        nombres_no_reconocidos: { type: "array", items: { type: "string" }, description: "Nombres dictados que no casan con ningún jugador" },
        tiempo: { type: ["string", "null"], enum: [...WEATHERS, null] },
        temperatura: { type: ["number", "null"] },
        observaciones: { type: ["string", "null"], description: "Otros detalles útiles (peto, quién trae balón…), en una o dos frases." },
        confirmado: { type: "boolean", description: "true sólo si dice que está confirmado / cerrado." },
        dudas: { type: "array", items: { type: "string" }, description: "Lo que no estaba claro y conviene revisar, frases cortas en español." },
      },
      required: ["fecha", "hora", "estadio_id", "local_id", "visitante_id", "convocados_local", "convocados_visitante", "nombres_no_reconocidos", "dudas", "confirmado"],
    },
  };

  const system = `Eres el asistente de una app de fútbol 7 entre dos equipos de amigos. Conviertes un dictado en el borrador de un partido.
Hoy es ${today} (${isoToday}), zona horaria Europe/Madrid. Cada equipo juega con ${settings.players_per_side}.
Reglas: usa sólo ids de las listas; reconoce a los jugadores por nombre, apellido o apodo (también diminutivos y faltas de transcripción); un jugador sólo puede ir en su propio equipo; no inventes nada que no se diga: si falta, null o lista vacía y añádelo a «dudas». Responde llamando a la herramienta.
EQUIPOS: ${JSON.stringify(teams)}
ESTADIOS: ${JSON.stringify(venues)}
FORMACIONES: ${JSON.stringify(formations)}
JUGADORES: ${JSON.stringify(players)}`;

  let input: Record<string, unknown>;
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || "claude-haiku-5-5",
        max_tokens: 1200,
        system,
        tools: [tool],
        tool_choice: { type: "tool", name: tool.name },
        messages: [{ role: "user", content: `Dictado del organizador:\n"""${text}"""` }],
      }),
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) {
      const status = res.status;
      return { ok: false, error: status === 401 ? "La clave de Claude no es válida. Revísala en Vercel." : status === 429 ? "Demasiadas peticiones seguidas. Prueba en un minuto." : `No se pudo procesar el dictado (error ${status}).` };
    }
    const json = await res.json() as { content?: { type: string; name?: string; input?: Record<string, unknown> }[] };
    const block = json.content?.find((c) => c.type === "tool_use" && c.name === tool.name);
    if (!block?.input) return { ok: false, error: "No he entendido el dictado. Prueba a decir fecha, hora, estadio y quién juega." };
    input = block.input;
  } catch {
    return { ok: false, error: "No hay conexión con el servicio de IA. Prueba de nuevo o créalo manualmente." };
  }

  // ---- validación estricta contra los datos reales -------------------------------------
  const notes: string[] = [];
  const str = (v: unknown) => (typeof v === "string" ? v : null);
  const teamIds = new Set(ds.teams.map((t) => t.id));
  const pick = (v: unknown, set: Set<string>) => { const x = str(v); return x && set.has(x) ? x : null; };
  let home = pick(input.local_id, teamIds), away = pick(input.visitante_id, teamIds);
  if (!home && !away) { home = ds.teams[0].id; away = ds.teams[1].id; notes.push("No se dijo quién es local: lo he puesto por defecto."); }
  else if (!away || away === home) away = ds.teams.find((t) => t.id !== home)!.id;
  else if (!home) home = ds.teams.find((t) => t.id !== away)!.id;

  const date = str(input.fecha) && /^\d{4}-\d{2}-\d{2}$/.test(String(input.fecha)) ? String(input.fecha) : "";
  const time = str(input.hora) && /^\d{2}:\d{2}$/.test(String(input.hora)) ? String(input.hora) : "21:00";
  if (!date) notes.push("Falta la fecha.");
  if (date && date < isoToday) notes.push("La fecha entendida ya ha pasado: revísala.");
  if (!str(input.hora)) notes.push("No se dijo la hora: he puesto las 21:00.");
  const venue = pick(input.estadio_id, new Set(ds.venues.map((v) => v.id)));
  if (!venue) notes.push("No he reconocido el estadio.");
  const formIds = new Set(ds.formations.map((f) => f.id));
  const def = ds.formations.find((f) => f.is_default)?.id ?? "";
  const byId = new Map(ds.players.map((p) => [p.id, p]));
  const side = (v: unknown, teamId: string) => {
    const ids = Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
    const ok = [...new Set(ids)].filter((id) => byId.get(id)?.team_id === teamId && byId.get(id)?.active);
    return { players: ok, guests: [], positions: {} };
  };
  const hs = side(input.convocados_local, home!), as = side(input.convocados_visitante, away!);
  const unknown = Array.isArray(input.nombres_no_reconocidos) ? input.nombres_no_reconocidos.filter((x): x is string => typeof x === "string") : [];
  if (unknown.length) notes.push(`No he reconocido a: ${unknown.join(", ")}.`);
  const per = settings.players_per_side;
  for (const [label, sd] of [["local", hs], ["visitante", as]] as const) {
    if (sd.players.length && sd.players.length !== per) notes.push(`El equipo ${label} tiene ${sd.players.length} convocados (se juega con ${per}).`);
  }
  for (const d of Array.isArray(input.dudas) ? input.dudas : []) if (typeof d === "string" && d.trim()) notes.push(d.trim());
  const weather = str(input.tiempo);
  const temp = typeof input.temperatura === "number" && Number.isFinite(input.temperatura) ? String(Math.round(input.temperatura)) : "";

  return {
    ok: true,
    notes: [...new Set(notes)].slice(0, 8),
    initial: {
      date, time, venue_id: venue ?? "",
      home_team_id: home!, away_team_id: away!,
      home_formation_id: pick(input.formacion_local_id, formIds) ?? def,
      away_formation_id: pick(input.formacion_visitante_id, formIds) ?? def,
      forecast_weather: weather && (WEATHERS as readonly string[]).includes(weather) ? weather : "",
      forecast_temp_c: temp,
      notes: (str(input.observaciones) ?? "").slice(0, 500),
      status: input.confirmado === true ? "confirmed" : "pending",
      exceptional_lineup: false, exceptional_reason: "",
      home: hs, away: as,
    },
  };
}
