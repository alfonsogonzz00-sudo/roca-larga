import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/data/session", () => ({ getSession: async () => ({ isStaff: true }) }));
const CAR = "11111111-1111-1111-1111-111111111111", MON = "22222222-2222-2222-2222-222222222222";
const VEN = "33333333-3333-3333-3333-333333333333", F231 = "44444444-4444-4444-4444-444444444444";
const pl = (id: string, team: string, name: string) => ({ id, team_id: team, full_name: name, nickname: null, kind: "member", active: true });
const players = [
  pl("p1", MON, "Alfonso González"), pl("p2", MON, "Ángel Núñez"), pl("p3", MON, "Raúl de la Fuente"),
  pl("c1", CAR, "Manuel Baquero"),
];
vi.mock("@/lib/data/stats", () => ({
  getStats: async () => ({
    ds: {
      teams: [{ id: CAR, name: "Caravelle F.C.", short_name: "Caravelle" }, { id: MON, name: "S.D. Monecillo", short_name: "Monecillo" }],
      venues: [{ id: VEN, name: "Calasancio" }],
      formations: [{ id: F231, name: "2-3-1", is_default: true }],
      players,
    },
    settings: { players_per_side: 7 },
  }),
}));

const reply = (input: unknown) => vi.fn(async () => new Response(JSON.stringify({ content: [{ type: "tool_use", name: "preparar_partido", input }] }), { status: 200 }));

describe("partido por nota de voz", () => {
  beforeEach(() => { process.env.ANTHROPIC_API_KEY = "test"; });
  afterEach(() => { vi.unstubAllGlobals(); });

  it("valida contra los datos reales y avisa de lo dudoso", async () => {
    const fetchMock = reply({
      fecha: "2099-03-10", hora: null, estadio_id: VEN, local_id: MON, visitante_id: CAR,
      formacion_local_id: "inventada", convocados_local: ["p1", "p2", "c1", "nope"], convocados_visitante: ["c1", "p3"],
      nombres_no_reconocidos: ["Pepito"], tiempo: "lluvia", temperatura: 12.4, observaciones: "Peto oscuro", confirmado: true, dudas: [],
    });
    vi.stubGlobal("fetch", fetchMock);
    const { draftMatchFromVoice } = await import("@/app/actions/voice");
    const r = await draftMatchFromVoice("El 10 de marzo en Calasancio, Monecillo contra Caravelle, juegan Sito, Ángel, Pepito");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.initial.home_team_id).toBe(MON);
    expect(r.initial.home.players).toEqual(["p1", "p2"]);   // un jugador de Caravelle no puede ir con Monecillo
    expect(r.initial.away.players).toEqual(["c1"]);
    expect(r.initial.home_formation_id).toBe(F231);         // id inventado → formación por defecto
    expect(r.initial.time).toBe("21:00");
    expect(r.initial.forecast_weather).toBe("lluvia");
    expect(r.initial.forecast_temp_c).toBe("12");
    expect(r.initial.status).toBe("confirmed");
    expect(r.notes.join(" ")).toMatch(/Pepito/);
    expect(r.notes.join(" ")).toMatch(/hora/);
    // la clave va en la cabecera, nunca en el cuerpo
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>)["x-api-key"]).toBe("test");
    expect(String(init.body)).not.toContain("test\"");
  });

  it("sin clave configurada da un error claro", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const { draftMatchFromVoice } = await import("@/app/actions/voice");
    const r = await draftMatchFromVoice("El martes a las nueve en Calasancio");
    expect(r).toEqual({ ok: false, error: expect.stringMatching(/ANTHROPIC_API_KEY/) });
  });
});
