import { describe, expect, it } from "vitest";
import { writeFileSync, mkdirSync } from "node:fs";
import assets from "@/lib/poster/assets.json";
import { buildPoster, parsePosterSlug, posterDay, posterLabels, posterList, posterTime, posterVersion, surname, POSTER_VARIANTS, type PosterAssets } from "@/lib/poster/model";
import { posterJpeg, posterResponse } from "@/lib/poster/render";
import sharp from "sharp";
import type { Match, MatchPlayer, Player, Team } from "@/lib/types";

const CAR = "car", MON = "mon";
const team = (id: string, slug: string, name: string, short: string, color: string) => ({ id, slug, name, short_name: short, crest_url: `/crests/${slug}.png?v=3`, primary_color: color }) as Team;
const teams = [team(CAR, "caravelle", "Caravelle F.C.", "Caravelle", "#1f7a3c"), team(MON, "monecillo", "S.D. Monecillo", "Monecillo", "#151515")];
const pl = (id: string, t: string, full_name: string, pos: Player["usual_position"], num: number | null = null) => ({ id, team_id: t, full_name, nickname: null, usual_position: pos, shirt_number: num, kind: "member" }) as Player;
// Ids reales de jugadores con imagen para que la prueba dibuje figuras de verdad
const players = [
  pl("c57cc7da-7f4e-4e49-ad17-908506f411e7", MON, "Raúl de la Fuente", "DEF", 4), pl("ff8b4e54-4eee-4d8f-b234-482452a9c779", MON, "Ángel Núñez", "MED"),
  pl("2de1a3a5-5457-418e-966c-34c9a803e970", MON, "Javier Núñez", "MED"), pl("b0ab7e5d-4234-4fdc-adeb-eaee7ef9e2b6", MON, "Alfonso González", "DEL", 14),
  pl("m5", MON, "Juan Moreno", "DEL"), pl("801cd257-c498-4e37-b54e-7ea7b4fefbfe", MON, "Miguel Aceña", "DEL"), pl("m7", MON, "Alex Márquez", null),
  pl("c1", CAR, "Rafael Cañas", "DEF"), pl("c2", CAR, "Miguel Orzáez", "DEF"), pl("512314c6-4b72-4b24-ac2b-e102ae7cab15", CAR, "José Vargas", "MED", 6),
  pl("c4", CAR, "Ignacio Sierra", "MED"), pl("c5", CAR, "Carlos Zurera", "MED"), pl("c6", CAR, "Manuel Pineda", "DEL"),
  pl("ba7603f7-f488-484b-a14f-7a1960c4d379", CAR, "José Manuel Maqueda", "DEL", 9),
];
const match = { id: "match-1", kickoff_at: "2026-11-17T20:00:00+00:00", venue_id: "v1", home_team_id: CAR, away_team_id: MON, status: "confirmed" } as Match;
const matchPlayers = players.map((p) => ({ match_id: match.id, player_id: p.id, team_id: p.team_id!, called: true, participated: true, lineup_position: null, brought_by_id: null, attendance: "yes" }) as MatchPlayer);
const src = { match, teams, venue: { name: "Open Arena", city: "Córdoba" } as never, matchPlayers, playerById: new Map(players.map((p) => [p.id, p])) };
const A = assets as PosterAssets;

describe("carteles prepartido · datos", () => {
  it("saca el apellido conservando partículas y nombres compuestos", () => {
    expect(surname("Raúl de la Fuente")).toBe("DE LA FUENTE");
    expect(surname("José Manuel Maqueda")).toBe("MAQUEDA");
    expect(surname("Juan del Río")).toBe("DEL RÍO");
    expect(surname("Pelé")).toBe("PELÉ");
  });
  it("distingue con la inicial los apellidos repetidos", () => {
    const l = posterLabels([{ id: "a", full_name: "Ángel Núñez" }, { id: "b", full_name: "Javier Núñez" }, { id: "c", full_name: "Juan Moreno" }]);
    expect([l.get("a"), l.get("b"), l.get("c")]).toEqual(["Á. NÚÑEZ", "J. NÚÑEZ", "MORENO"]);
  });
  it("fecha y hora en horario de Madrid", () => {
    expect(posterDay(match.kickoff_at)).toBe("MARTES 17 NOV");
    expect(posterTime(match.kickoff_at)).toBe("21:00");
  });
  it("sólo acepta plantillas y lados conocidos", () => {
    expect(parsePosterSlug("gala-visitante")).toEqual({ variant: "gala", side: "visitante" });
    expect(parsePosterSlug("gala-otro")).toBeNull();
    expect(parsePosterSlug("../etc-local")).toBeNull();
  });
  it("sin dorsales completos muestra posiciones, y no inventa imágenes", () => {
    const d = buildPoster(src, "plantel", "visitante", A)!;
    expect(d.team.short).toBe("Monecillo");
    expect(d.players.map((p) => p.label)).toEqual(["DE LA FUENTE", "Á. NÚÑEZ", "J. NÚÑEZ", "ACEÑA", "GONZÁLEZ", "MORENO", "MÁRQUEZ"]);
    expect(d.players.map((p) => p.tag)).toEqual(["DEF", "MED", "MED", "DEL", "DEL", "DEL", ""]);
    expect(d.heroes.every((p) => p.img)).toBe(true);
    expect(d.heroes.find((p) => p.id === "m5")).toBeUndefined();
    // Quien tiene postura propia va delante
    expect(d.heroes[0].img!.kind).toBe("pose");
  });
  it("con todos los dorsales, lista numerada por dorsal", () => {
    const numbered = { ...src, playerById: new Map(players.map((p, i) => [p.id, { ...p, shirt_number: 20 - i }])) };
    const d = buildPoster(numbered, "titular", "local", A)!;
    expect(d.players.map((p) => Number(p.tag))).toEqual([...d.players.map((p) => Number(p.tag))].sort((a, b) => a - b));
  });
  it("no ofrece carteles de un equipo sin convocados, y la versión cambia con la convocatoria", () => {
    const onlyHome = { ...src, matchPlayers: matchPlayers.filter((x) => x.team_id === CAR) };
    expect(posterList(src)).toHaveLength(POSTER_VARIANTS.length * 2);
    expect(posterList(onlyHome).every((p) => p.team === "Caravelle")).toBe(true);
    expect(buildPoster(onlyHome, "gala", "visitante", A)).toBeNull();
    expect(posterVersion(onlyHome)).not.toBe(posterVersion(src));
  });
  it("quien ha dicho que no va no sale en el cartel", () => {
    const out = { ...src, matchPlayers: matchPlayers.map((x) => (x.player_id === "m5" ? { ...x, attendance: "no" as const } : x)) };
    expect(buildPoster(out, "titular", "visitante", A)!.players.some((p) => p.label === "MORENO")).toBe(false);
  });
});

describe("carteles prepartido · dibujo", () => {
  mkdirSync("/tmp/carteles", { recursive: true });
  for (const v of POSTER_VARIANTS) for (const side of ["local", "visitante"] as const) {
    it(`genera el PNG «${v.key}» (${side})`, async () => {
      const res = await posterResponse(buildPoster(src, v.key, side, A)!);
      const png = Buffer.from(await res.arrayBuffer());
      expect(res.headers.get("content-type")).toBe("image/png");
      expect(png.subarray(1, 4).toString()).toBe("PNG");
      expect(png.readUInt32BE(16)).toBe(1080);
      expect(png.readUInt32BE(20)).toBe(1350);
      writeFileSync(`/tmp/carteles/${v.key}-${side}.png`, png);
    });
  }
  it("sirve JPEG ligero a tamaño completo y en miniatura", async () => {
    const d = buildPoster(src, "plantel", "visitante", A)!;
    const [full, thumb] = await Promise.all([posterJpeg(d), posterJpeg(d, 720)]);
    const [mf, mt] = await Promise.all([sharp(full).metadata(), sharp(thumb).metadata()]);
    expect([mf.format, mf.width, mf.height]).toEqual(["jpeg", 1080, 1350]);
    expect([mt.format, mt.width, mt.height]).toEqual(["jpeg", 720, 900]);
    expect(full.length).toBeLessThan(500 * 1024);
    expect(thumb.length).toBeLessThan(180 * 1024);
    writeFileSync("/tmp/carteles/ligero-plantel-visitante.jpg", full);
    writeFileSync("/tmp/carteles/ligero-plantel-visitante-720.jpg", thumb);
  });
  it("un equipo sin ninguna imagen también tiene cartel", async () => {
    const res = await posterResponse(buildPoster(src, "trio", "local", {})!);
    expect(Buffer.from(await res.arrayBuffer()).length).toBeGreaterThan(20000);
  });
});
