import { beforeAll, describe, expect, it } from "vitest";
import { createDb, type Db } from "./harness";

let db: Db;
let admin: string, orgCar: string, pMon1: string, pMon2: string, stranger: string;
let car: string, mon: string;
let carPlayers: string[], monPlayers: string[];
let venue: string, formation: string;

async function expectError(p: Promise<unknown>, match: RegExp) {
  await expect(p).rejects.toThrow(match);
}

/** Crea un usuario, solicita vínculo y lo aprueba el admin */
async function linkedUser(email: string, playerId: string) {
  const id = await db.createUser(email);
  await db.as(id, `select public.request_player_link($1, $2)`, [playerId, email.split("@")[0]]);
  const [l] = await db.su<{ id: string }>(`select id from public.player_links where user_id = $1 and status='pending'`, [id]);
  await db.as(admin, `select public.review_player_link($1, true, null)`, [l.id]);
  return id;
}

beforeAll(async () => {
  db = await createDb("owner@example.com");
  [{ id: car }] = await db.su<{ id: string }>(`select id from public.teams where slug='caravelle'`);
  [{ id: mon }] = await db.su<{ id: string }>(`select id from public.teams where slug='monecillo'`);
  carPlayers = (await db.su<{ id: string }>(`select id from public.players where team_id=$1 order by full_name`, [car])).map((r) => r.id);
  monPlayers = (await db.su<{ id: string }>(`select id from public.players where team_id=$1 order by full_name`, [mon])).map((r) => r.id);
  [{ id: venue }] = await db.su<{ id: string }>(`insert into public.venues(name, is_demo) values ('Campo de pruebas [DEMO]', true) returning id`);
  [{ id: formation }] = await db.su<{ id: string }>(`select id from public.formations where is_default`);
  admin = await db.createUser("owner@example.com", { provider: "google" });
}, 60000);

describe("usuarios y roles", () => {
  it("el propietario verificado se convierte en administrador automáticamente", async () => {
    const [p] = await db.su<{ role: string }>(`select role from public.profiles where id=$1`, [admin]);
    expect(p.role).toBe("admin");
  });

  it("un segundo usuario con el mismo email no confirmado no obtiene admin", async () => {
    const other = await db.createUser("intruso@example.com", { confirmed: false });
    const [p] = await db.su<{ role: string }>(`select role from public.profiles where id=$1`, [other]);
    expect(p.role).toBe("player");
  });

  it("flujo de registro: candidatos, solicitud, aprobación y apodo", async () => {
    const cands = await db.as(null, `select * from public.link_candidates($1)`, [mon]).catch(() => null);
    expect(cands).toBeNull(); // anónimo no puede listar
    pMon1 = await linkedUser("mon1@example.com", monPlayers[0]);
    const [pl] = await db.su<{ nickname: string }>(`select nickname from public.players where id=$1`, [monPlayers[0]]);
    expect(pl.nickname).toBe("mon1");
    const [prof] = await db.su<{ player_id: string }>(`select player_id from public.profiles where id=$1`, [pMon1]);
    expect(prof.player_id).toBe(monPlayers[0]);
  });

  it("no se puede reclamar un jugador ya vinculado", async () => {
    const u = await db.createUser("ladron@example.com");
    await expectError(db.as(u, `select public.request_player_link($1, 'x')`, [monPlayers[0]]), /ya está vinculado/);
  });

  it("notificaciones: sólo el admin guarda claves VAPID y el despachador exige el secreto", async () => {
    const pub = "B" + "a".repeat(86), priv = "c".repeat(43);
    const nobody = await db.createUser("nadie@example.com");
    await expectError(db.as(nobody, `select public.admin_set_vapid_keys($1, $2)`, [pub, priv]), /Sólo el administrador/);
    await expectError(db.as(admin, `select public.admin_set_vapid_keys('corta', 'x')`), /no válidas/);
    await db.as(admin, `select public.admin_set_vapid_keys($1, $2)`, [pub, priv]);
    const k = await db.as(null, `select public.vapid_public_key() as k`);
    expect(k[0].k).toBe(pub);
    await expectError(db.as(null, `select * from public.dispatch_credentials('mal')`), /No autorizado/);
  });

  it("muro de actividad: sólo usuarios registrados y sin acciones administrativas", async () => {
    await expectError(db.as(null, `select * from public.public_activity()`), /permission denied/);
    const u = await db.createUser("muro@example.com");
    const rows = await db.as(u, `select action from public.public_activity(null, 100)`);
    expect(rows.every((r) => !/^(user|push|stats|demo|link\.request)/.test(String(r.action)))).toBe(true);
  });

  it("organizadores: máximo 2 por equipo y nunca admin", async () => {
    orgCar = await linkedUser("org1@example.com", carPlayers[0]);
    const org2 = await linkedUser("org2@example.com", carPlayers[1]);
    const org3 = await linkedUser("org3@example.com", carPlayers[2]);
    await db.as(admin, `select public.set_user_role($1, 'organizer')`, [orgCar]);
    await db.as(admin, `select public.set_user_role($1, 'organizer')`, [org2]);
    await expectError(db.as(admin, `select public.set_user_role($1, 'organizer')`, [org3]), /máximo de organizadores/);
    await expectError(db.as(admin, `select public.set_user_role($1, 'admin')`, [org3]), /un administrador/);
    await expectError(db.as(orgCar, `select public.set_user_role($1, 'organizer')`, [org3]), /Sólo el administrador/);
    // un organizador no puede escalar privilegios tocando la tabla
    await db.as(orgCar, `update public.profiles set role='admin' where id=$1`, [orgCar]).catch(() => null);
    const [p] = await db.su<{ role: string }>(`select role from public.profiles where id=$1`, [orgCar]);
    expect(p.role).toBe("organizer");
  });

  it("un organizador sólo valida solicitudes de su equipo", async () => {
    const u = await db.createUser("mon2@example.com");
    await db.as(u, `select public.request_player_link($1, 'Kala')`, [monPlayers[1]]);
    const [l] = await db.su<{ id: string }>(`select id from public.player_links where user_id=$1`, [u]);
    await expectError(db.as(orgCar, `select public.review_player_link($1, true, null)`, [l.id]), /organizador del equipo/);
    const visible = await db.as(orgCar, `select * from public.pending_link_requests()`);
    expect(visible.length).toBe(0);
    await db.as(admin, `select public.review_player_link($1, true, null)`, [l.id]);
    pMon2 = u;
  });

  it("los perfiles ajenos no son visibles", async () => {
    const rows = await db.as(pMon1, `select id from public.profiles`);
    expect(rows.length).toBe(1);
    stranger = await db.createUser("anon@example.com");
    const rows2 = await db.as(stranger, `select * from public.activity_log`);
    expect(rows2.length).toBe(0);
  });
});

describe("partidos", () => {
  let matchId: string;
  const callup = () => ({
    home: { players: carPlayers.slice(0, 7) },
    away: { players: monPlayers.slice(0, 7) },
  });

  it("un jugador no puede crear partidos", async () => {
    await expectError(
      db.as(pMon1, `select public.create_match($1)`, [{ kickoff_at: new Date(Date.now() + 864e5).toISOString(), home_team_id: car, away_team_id: mon }]),
      /administrador o los organizadores/,
    );
  });

  it("no se confirma sin 7 convocados por equipo", async () => {
    await expectError(
      db.as(orgCar, `select public.create_match($1)`, [{
        kickoff_at: new Date(Date.now() + 864e5).toISOString(), home_team_id: car, away_team_id: mon,
        status: "confirmed", home: { players: carPlayers.slice(0, 6) }, away: { players: monPlayers.slice(0, 7) },
      }]),
      /7 convocados/,
    );
  });

  it("organizador crea y confirma: se encolan avisos para convocados vinculados", async () => {
    const [r] = await db.as<{ create_match: string }>(orgCar, `select public.create_match($1)`, [{
      kickoff_at: new Date(Date.now() + 2 * 864e5).toISOString(), venue_id: venue, home_team_id: car, away_team_id: mon,
      home_formation_id: formation, away_formation_id: formation, forecast_weather: "despejado", forecast_temp_c: 18,
      status: "confirmed", ...callup(),
    }]);
    matchId = r.create_match;
    const notes = await db.su<{ type: string; body: string }>(`select type, body from public.notifications where match_id=$1 order by type`, [matchId]);
    expect(notes.filter((n) => n.type === "match_confirmed").length).toBe(5); // 3 de Caravelle + 2 de Monecillo vinculados
    expect(notes[0].body).toMatch(/Campo de pruebas/);
    const log = await db.su<{ summary: string }>(`select summary from public.activity_log where entity_id=$1`, [matchId]);
    expect(log.map((l) => l.summary).join("|")).toMatch(/Ha creado un partido.*\|Ha confirmado/);
  });

  it("un convocado confirma su asistencia", async () => {
    await db.as(pMon1, `select public.set_my_attendance($1, true)`, [matchId]);
    const [r] = await db.su<{ attendance: string }>(`select attendance from public.match_players where match_id=$1 and player_id=$2`, [matchId, monPlayers[0]]);
    expect(r.attendance).toBe("yes");
  });

  it("un jugador no puede escribir directamente en partidos ni goles", async () => {
    await expectError(db.as(pMon1, `update public.matches set home_score=9 where id=$1`, [matchId]), /permission denied/);
    await expectError(db.as(pMon1, `insert into public.goals(match_id, team_id, seq) values ($1, $2, 1)`, [matchId, mon]), /permission denied/);
  });

  it("aplazar descarta avisos pendientes; reconfirmar los regenera con la nueva fecha", async () => {
    const newDate = new Date(Date.now() + 3 * 864e5).toISOString();
    await db.as(orgCar, `select public.set_match_status($1, 'postponed', 'Lluvia', $2)`, [matchId, newDate]);
    const skipped = await db.su(`select 1 from public.notifications where match_id=$1 and status='skipped'`, [matchId]);
    expect(skipped.length).toBeGreaterThan(0);
    await db.as(orgCar, `select public.set_match_status($1, 'confirmed', null, null)`, [matchId]);
    const pending = await db.su(`select 1 from public.notifications where match_id=$1 and status='pending' and type='match_confirmed'`, [matchId]);
    expect(pending.length).toBe(5);
  });

  it("no se puede finalizar antes de empezar", async () => {
    await expectError(db.as(orgCar, `select public.finalize_match($1, $2)`, [matchId, { home_score: 0, away_score: 0, ...callup() }]), /todavía no ha empezado/);
  });

  it("votación: sólo participantes, sin auto-voto, sin duplicados, modificable", async () => {
    await db.su(`update public.matches set kickoff_at = now() - interval '1 hour' where id=$1`, [matchId]);
    const [m] = await db.su<{ vote_closes_at: Date; kickoff_at: Date }>(`select vote_closes_at, kickoff_at from public.matches where id=$1`, [matchId]);
    expect(new Date(m.vote_closes_at).getTime() - new Date(m.kickoff_at).getTime()).toBe(24 * 3600 * 1000);

    await expectError(db.as(stranger, `select public.cast_mvp_vote($1,$2,$3,$4)`, [matchId, carPlayers[0], carPlayers[1], carPlayers[2]]), /no está vinculada/);
    await expectError(db.as(pMon1, `select public.cast_mvp_vote($1,$2,$3,$4)`, [matchId, monPlayers[0], carPlayers[1], carPlayers[2]]), /a ti mismo/);
    await expectError(db.as(pMon1, `select public.cast_mvp_vote($1,$2,$3,$4)`, [matchId, carPlayers[1], carPlayers[1], carPlayers[2]]), /repetir/);
    await expectError(db.as(pMon1, `select public.cast_mvp_vote($1,$2,$3,$4)`, [matchId, carPlayers[10], carPlayers[1], carPlayers[2]]), /participado/);

    const [v1] = await db.as<{ cast_mvp_vote: string }>(pMon1, `select public.cast_mvp_vote($1,$2,$3,$4)`, [matchId, carPlayers[0], carPlayers[1], carPlayers[2]]);
    expect(v1.cast_mvp_vote).toBe("created");
    const [v2] = await db.as<{ cast_mvp_vote: string }>(pMon1, `select public.cast_mvp_vote($1,$2,$3,$4)`, [matchId, monPlayers[1], carPlayers[1], carPlayers[2]]);
    expect(v2.cast_mvp_vote).toBe("updated");
    await db.as(pMon2, `select public.cast_mvp_vote($1,$2,$3,$4)`, [matchId, monPlayers[0], carPlayers[0], carPlayers[3]]);
    await db.as(orgCar, `select public.cast_mvp_vote($1,$2,$3,$4)`, [matchId, monPlayers[1], monPlayers[0], carPlayers[1]]);

    const [mine] = await db.as<{ first_id: string }>(pMon1, `select * from public.my_mvp_ballot($1)`, [matchId]);
    expect(mine.first_id).toBe(monPlayers[1]);
  });

  it("anonimato: nadie lee papeletas, ni el admin; el log no contiene elecciones", async () => {
    await expectError(db.as(admin, `select * from public.mvp_ballots`), /permission denied/);
    await expectError(db.as(orgCar, `select * from public.mvp_ballots`), /permission denied/);
    const cols = await db.su<{ column_name: string }>(`select column_name from information_schema.columns where table_schema='public' and table_name='mvp_ballots'`);
    expect(cols.map((c) => c.column_name)).not.toContain("user_id");
    expect(cols.map((c) => c.column_name)).not.toContain("player_id");
    const logs = await db.su<{ changes: unknown; summary: string }>(`select changes, summary from public.activity_log where action like 'vote.%'`);
    expect(logs.length).toBe(4);
    expect(JSON.stringify(logs)).not.toMatch(new RegExp(carPlayers[0]));
    const receipts = await db.as(admin, `select * from public.vote_receipts($1)`, [matchId]);
    expect(receipts.length).toBe(3);
    // Recuento no visible antes del cierre
    const tallies = await db.as(pMon1, `select * from public.mvp_tallies where match_id=$1`, [matchId]);
    expect(tallies.length).toBe(0);
  });

  it("finalizar valida 7+7 y que los goles cuadren con el marcador", async () => {
    await expectError(db.as(orgCar, `select public.finalize_match($1,$2)`, [matchId, {
      home_score: 1, away_score: 0, home: { players: carPlayers.slice(0, 6) }, away: { players: monPlayers.slice(0, 7) }, goals: [],
    }]), /exactamente 7/);
    await expectError(db.as(orgCar, `select public.finalize_match($1,$2)`, [matchId, {
      home_score: 2, away_score: 0, ...callup(), goals: [{ team_id: car, scorer_id: carPlayers[0] }],
    }]), /no cuadran/);
    await expectError(db.as(pMon1, `select public.finalize_match($1,$2)`, [matchId, { home_score: 0, away_score: 0, ...callup() }]), /organizadores/);
  });

  it("finalizar: goles, asistencias, porteros, encajados atribuidos al portero", async () => {
    const payload = {
      home_score: 2, away_score: 1, ...callup(),
      goals: [
        { team_id: car, scorer_id: carPlayers[0], assist_id: carPlayers[1], conceded_gk_id: monPlayers[2], minute: 5 },
        { team_id: car, scorer_id: carPlayers[0], conceded_gk_id: monPlayers[3], minute: 20 },
        { team_id: mon, scorer_id: monPlayers[0], assist_id: monPlayers[1], conceded_gk_id: carPlayers[4], minute: 30 },
      ],
      gk_spells: [
        { team_id: mon, player_id: monPlayers[2], start_minute: 0, end_minute: 7 },
        { team_id: mon, player_id: monPlayers[3], start_minute: 7, end_minute: 21 },
        { team_id: car, player_id: carPlayers[4], start_minute: 0, end_minute: 40 },
      ],
      actual_weather: "nublado", actual_temp_c: 15, final_notes: "Partidazo",
    };
    await db.as(orgCar, `select public.finalize_match($1,$2)`, [matchId, payload]);
    const [m] = await db.su<{ status: string; home_score: number }>(`select status, home_score from public.matches where id=$1`, [matchId]);
    expect(m.status).toBe("played");
    const gk = await db.su<{ n: number }>(`select count(*)::int n from public.goals where conceded_gk_id=$1`, [monPlayers[2]]);
    expect(gk[0].n).toBe(1);
    // re-finalizar (edición) no duplica
    await db.as(orgCar, `select public.finalize_match($1,$2)`, [matchId, payload]);
    const goals = await db.su<{ n: number }>(`select count(*)::int n from public.goals where match_id=$1`, [matchId]);
    expect(goals[0].n).toBe(3);
    const spells = await db.su<{ n: number }>(`select count(*)::int n from public.goalkeeper_spells where match_id=$1`, [matchId]);
    expect(spells[0].n).toBe(3);
    const log = await db.su<{ action: string }>(`select action from public.activity_log where entity_id=$1 and action like 'match.%' order by id`, [matchId]);
    expect(log.map((l) => l.action)).toContain("match.result_edit");
  });

  it("cierre automático a las 24h, recuento 3-2-1 y aviso del MVP", async () => {
    await db.su(`update public.matches set kickoff_at = now() - interval '25 hours' where id=$1`, [matchId]);
    await expectError(db.as(pMon2, `select public.cast_mvp_vote($1,$2,$3,$4)`, [matchId, carPlayers[0], carPlayers[1], carPlayers[2]]), /cerrada/);
    const [r] = await db.as<{ close_due_votes: number }>(null, `select public.close_due_votes()`);
    expect(r.close_due_votes).toBe(1);
    // monPlayers[1]: 3 (pMon1) + 3 (orgCar) = 6 ; monPlayers[0]: 3 (pMon2) + 2 (orgCar) = 5
    const tallies = await db.as<{ player_id: string; points: number }>(null, `select player_id, points from public.mvp_tallies where match_id=$1 order by points desc`, [matchId]);
    expect(tallies[0]).toMatchObject({ player_id: monPlayers[1], points: 6 });
    expect(tallies[1]).toMatchObject({ player_id: monPlayers[0], points: 5 });
    const mvps = await db.su<{ player_id: string }>(`select player_id from public.match_mvps where match_id=$1`, [matchId]);
    expect(mvps).toEqual([{ player_id: monPlayers[1] }]);
    const notes = await db.su(`select 1 from public.notifications where match_id=$1 and type='mvp_result'`, [matchId]);
    expect(notes.length).toBe(5);
    const log = await db.su<{ summary: string; is_system: boolean }>(`select summary, is_system from public.activity_log where action='vote.close'`);
    expect(log[0].is_system).toBe(true);
    // idempotente
    const [again] = await db.as<{ close_due_votes: number }>(null, `select public.close_due_votes()`);
    expect(again.close_due_votes).toBe(0);
  });

  it("corregir participantes tras el cierre rehace el recuento sin votos de no participantes", async () => {
    // pMon2 (monPlayers[1]) pasa a no haber jugado: su papeleta deja de contar y no puede ser MVP
    const payload = {
      home_score: 2, away_score: 1,
      home: { players: carPlayers.slice(0, 7) },
      away: { players: [...monPlayers.slice(0, 1), ...monPlayers.slice(2, 8)] },
      goals: [
        { team_id: car, scorer_id: carPlayers[0] }, { team_id: car, scorer_id: carPlayers[0] }, { team_id: mon, scorer_id: monPlayers[0] },
      ],
    };
    await db.as(admin, `select public.finalize_match($1,$2)`, [matchId, payload]);
    const tallies = await db.as<{ player_id: string; points: number }>(null, `select player_id, points from public.mvp_tallies where match_id=$1 order by points desc`, [matchId]);
    expect(tallies.find((t) => t.player_id === monPlayers[1])).toBeUndefined();
    const [top] = tallies;
    expect(top.player_id).toBe(carPlayers[1]); // 2 (pMon1) + 1 (orgCar)
  });
});

describe("partidos históricos, invitados y configuración", () => {
  it("histórico con datos parciales y MVP manual", async () => {
    const [r] = await db.as<{ create_historical_match: string }>(orgCar, `select public.create_historical_match($1)`, [{
      kickoff_at: "2026-01-10T19:00:00Z", home_team_id: mon, away_team_id: car, home_score: 3, away_score: 3,
      home: { players: monPlayers.slice(0, 3) }, away: { players: [] },
      goals: [
        { team_id: mon, scorer_id: monPlayers[0] }, { team_id: mon }, { team_id: mon },
        { team_id: car }, { team_id: car }, { team_id: car },
      ],
      manual_mvp_ids: [monPlayers[0]],
    }]);
    const [m] = await db.su<{ origin: string; vote_enabled: boolean }>(`select origin, vote_enabled from public.matches where id=$1`, [r.create_historical_match]);
    expect(m).toMatchObject({ origin: "historical", vote_enabled: false });
    const mvp = await db.su(`select * from public.match_mvps where match_id=$1 and source='manual'`, [r.create_historical_match]);
    expect(mvp.length).toBe(1);
  });

  it("invitado con quien lo trae", async () => {
    const [g] = await db.as<{ create_guest: string }>(orgCar, `select public.create_guest('Pepe el primo')`);
    const [r] = await db.as<{ create_match: string }>(orgCar, `select public.create_match($1)`, [{
      kickoff_at: new Date(Date.now() + 5 * 864e5).toISOString(), home_team_id: car, away_team_id: mon, status: "confirmed",
      home: { players: carPlayers.slice(0, 6), guests: [{ player_id: g.create_guest, brought_by_id: carPlayers[0] }] },
      away: { players: monPlayers.slice(0, 7) },
    }]);
    const [mp] = await db.su<{ brought_by_id: string }>(`select brought_by_id from public.match_players where match_id=$1 and player_id=$2`, [r.create_match, g.create_guest]);
    expect(mp.brought_by_id).toBe(carPlayers[0]);
  });

  it("ponderaciones: deben sumar 100 y sólo el admin las cambia", async () => {
    const w = { composition_teammates: 30, composition_rivals: 20, venue_history: 20, recent_form: 10, recent_venue: 10, weather: 7.5, time_slot: 5 };
    const en = Object.fromEntries(Object.keys(w).map((k) => [k, true]));
    await expectError(db.as(admin, `select public.save_prediction_config(null,'x','next_match',$1,$2,false)`, [w, en]), /sumar 100/);
    await expectError(db.as(orgCar, `select public.save_prediction_config(null,'x','next_match',$1,$2,false)`, [{ ...w, time_slot: 2.5 }, en]), /Sólo el administrador/);
    const [r] = await db.as<{ save_prediction_config: string }>(admin, `select public.save_prediction_config(null,'Sin clima','next_match',$1,$2,true)`,
      [{ ...w, weather: 10, time_slot: 0 }, { ...en, time_slot: false }]);
    const active = await db.su<{ id: string }>(`select id from public.prediction_configs where scope='next_match' and is_active`);
    expect(active).toEqual([{ id: r.save_prediction_config }]);
    const log = await db.su(`select 1 from public.activity_log where entity_type='prediction_configs'`);
    expect(log.length).toBeGreaterThan(0);
  });

  it("anónimos leen datos deportivos pero no datos privados", async () => {
    expect((await db.as(null, `select * from public.matches`)).length).toBeGreaterThan(0);
    await expectError(db.as(null, `select * from public.profiles`), /permission denied/);
    await expectError(db.as(null, `select * from public.push_subscriptions`), /permission denied/);
    await expectError(db.as(null, `select * from private.config`), /permission denied/);
    await expectError(db.as(admin, `select * from private.config`), /permission denied/);
  });

  it("el despachador exige el secreto", async () => {
    await expectError(db.as(null, `select * from public.claim_notifications('mal', 10)`), /No autorizado/);
    const [{ value }] = await db.su<{ value: string }>(`select value from private.config where key='dispatch_secret'`);
    const rows = await db.as(null, `select * from public.claim_notifications($1, 50)`, [value]);
    expect(Array.isArray(rows)).toBe(true);
  });

  it("purga de datos de demostración", async () => {
    await expectError(db.as(orgCar, `select public.admin_purge_demo_data()`), /Sólo el administrador/);
    await db.as(admin, `select public.admin_purge_demo_data()`);
    const v = await db.su(`select 1 from public.venues where is_demo`);
    expect(v.length).toBe(0);
  });
});
