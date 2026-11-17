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

/** Crea un usuario y completa su ficha (queda vinculado al momento) */
async function linkedUser(email: string, playerId: string) {
  const id = await db.createUser(email);
  await db.as(id, `select public.request_player_link($1, $2)`, [playerId, email.split("@")[0]]);
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

  it("foto de perfil: sólo URLs de la carpeta propia del usuario", async () => {
    const u = await db.createUser("foto@example.com");
    await expectError(db.as(u, `select public.update_my_photo('https://evil.example.com/x.jpg')`), /desde la app/);
    await expectError(db.as(u, `select public.update_my_photo('https://fsftghnwjvztwakgaifk.supabase.co/storage/v1/object/public/media/avatars/otro-uid/1.jpg')`), /desde la app/);
    await db.as(u, `select public.update_my_photo($1)`, [`https://fsftghnwjvztwakgaifk.supabase.co/storage/v1/object/public/media/avatars/${u}/1.jpg`]);
    const r = await db.su(`select avatar_url from public.profiles where id=$1`, [u]);
    expect(String(r[0].avatar_url)).toContain(u);
    await db.as(u, `select public.update_my_photo(null)`);
  });

  it("aviso de prueba: uno por minuto y sólo para uno mismo", async () => {
    const u = await db.createUser("prueba-push@example.com");
    await db.as(u, `select public.send_test_notification()`);
    await db.as(u, `select public.send_test_notification()`);
    const n = await db.su<{ n: number }>(`select count(*)::int n from public.notifications where type='test' and user_id=$1`, [u]);
    expect(n[0].n).toBe(1);
    await expectError(db.as(null, `select public.send_test_notification()`), /permission denied|iniciar sesión/);
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

  it("el registro vincula al momento y no deja quitar un jugador ya cogido", async () => {
    const u = await db.createUser("mon2@example.com");
    await db.as(u, `select public.request_player_link($1, 'Kala')`, [monPlayers[1]]);
    const [p] = await db.su<{ player_id: string }>(`select player_id from public.profiles where id=$1`, [u]);
    expect(p.player_id).toBe(monPlayers[1]);
    const [n] = await db.su<{ nickname: string }>(`select nickname from public.players where id=$1`, [monPlayers[1]]);
    expect(n.nickname).toBe("Kala");
    const intruso = await db.createUser("intruso@example.com");
    await expectError(db.as(intruso, `select public.request_player_link($1, 'Yo')`, [monPlayers[1]]), /ya está vinculado/);
    await expectError(db.as(u, `select public.request_player_link($1, 'Otro')`, [monPlayers[2]]), /ya está vinculada/);
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
  /** Valoraciones 0-3 para todos los participantes (7+7) salvo uno mismo */
  const R = (self: string, pts: number) => Object.fromEntries([...carPlayers.slice(0, 7), ...monPlayers.slice(0, 7)].filter((p) => p !== self).map((p) => [p, pts]));
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

  it("2 h antes: «confirma» a quien no ha respondido y «quedan 2 horas» a quien va", async () => {
    const [{ kickoff_at: orig }] = await db.su<{ kickoff_at: string }>(`select kickoff_at from public.matches where id=$1`, [matchId]);
    await db.su(`update public.matches set kickoff_at = now() + interval '119 minutes' where id=$1`, [matchId]);
    await db.su(`select private.enqueue_due_reminders()`);
    const rows = await db.su<{ type: string; user_id: string; body: string }>(
      `select type, user_id, body from public.notifications where match_id=$1 and type in ('reminder_confirm','reminder_kickoff')`, [matchId]);
    const mine = rows.filter((r) => r.user_id === pMon1);
    expect(mine.map((r) => r.type)).toEqual(["reminder_kickoff"]);
    expect(mine[0].body).toMatch(/^Quedan 2 horas para que ruede el balón en Campo de pruebas/);
    expect(rows.filter((r) => r.user_id === pMon2).map((r) => r.type)).toEqual(["reminder_confirm"]);
    expect(rows.filter((r) => r.type === "match_reminder").length).toBe(0);
    await db.su(`update public.matches set kickoff_at = $2 where id=$1`, [matchId, orig]);
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
    const [exp] = await db.su<{ c: Date }>(`select private.vote_close_for($1) c`, [m.kickoff_at]);
    expect(new Date(m.vote_closes_at).getTime()).toBe(new Date(exp.c).getTime());
    // Cierra a las 14:00 (Madrid) del día siguiente al partido
    const [loc] = await db.su<{ d: number; h: string }>(`select ((vote_closes_at at time zone 'Europe/Madrid')::date - (kickoff_at at time zone 'Europe/Madrid')::date) d, to_char(vote_closes_at at time zone 'Europe/Madrid','HH24:MI') h from public.matches where id=$1`, [matchId]);
    expect(loc).toEqual({ d: 1, h: "14:00" });

    const V = `select public.cast_mvp_vote($1,$2,$3,$4)`;
    const r1 = R(monPlayers[0], 2);

    // Aviso 2 h antes del cierre, sólo a quien ha jugado y aún no ha votado
    await db.su(`update public.matches set vote_closes_at = now() + interval '119 minutes' where id=$1`, [matchId]);
    await db.su(`select private.enqueue_due_reminders()`);
    const rem = await db.su<{ title: string; body: string; url: string }>(`select title, body, url from public.notifications where match_id=$1 and type='vote_reminder'`, [matchId]);
    const [pend] = await db.su<{ n: number }>(`select count(*)::int n from public.profiles pr join public.match_players mp on mp.player_id = pr.player_id and mp.match_id=$1 and mp.participated
      where not exists (select 1 from public.mvp_vote_receipts v where v.match_id=$1 and v.player_id=mp.player_id)`, [matchId]);
    expect(pend.n).toBeGreaterThanOrEqual(3);
    expect(rem.length).toBe(pend.n);
    expect(rem[0]).toEqual({ title: "¿Has votado ya?", body: "La votación finaliza en 2h", url: `/votacion/${matchId}` });
    await db.su(`select private.enqueue_due_reminders()`);
    expect((await db.su(`select 1 from public.notifications where match_id=$1 and type='vote_reminder'`, [matchId])).length).toBe(pend.n);
    await db.su(`update public.matches set vote_closes_at = private.vote_close_for(kickoff_at) where id=$1`, [matchId]);
    await expectError(db.as(stranger, V, [matchId, carPlayers[0], carPlayers[1], r1]), /no está vinculada/);
    await expectError(db.as(pMon1, V, [matchId, monPlayers[0], carPlayers[1], r1]), /a ti mismo/);
    await expectError(db.as(pMon1, V, [matchId, monPlayers[1], monPlayers[0], r1]), /a ti mismo/);
    await expectError(db.as(pMon1, V, [matchId, carPlayers[1], carPlayers[2], r1]), /compañero/);
    await expectError(db.as(pMon1, V, [matchId, monPlayers[1], carPlayers[10], r1]), /participado/);
    await expectError(db.as(pMon1, V, [matchId, monPlayers[1], null, r1]), /mejor del partido/);
    // Valoraciones: a todos, de 0 a 3, nunca a uno mismo
    await expectError(db.as(pMon1, V, [matchId, monPlayers[1], carPlayers[0], null]), /Valora a cada jugador/);
    const { [carPlayers[3]]: _omit, ...missing } = r1;
    await expectError(db.as(pMon1, V, [matchId, monPlayers[1], carPlayers[0], missing]), /Valora a todos/);
    await expectError(db.as(pMon1, V, [matchId, monPlayers[1], carPlayers[0], { ...r1, [carPlayers[3]]: 4 }]), /de 0 a 3/);
    await expectError(db.as(pMon1, V, [matchId, monPlayers[1], carPlayers[0], { ...r1, [carPlayers[3]]: 1.5 }]), /de 0 a 3/);
    await expectError(db.as(pMon1, V, [matchId, monPlayers[1], carPlayers[0], { ...r1, [monPlayers[0]]: 3 }]), /valorarte a ti mismo/);
    await expectError(db.as(pMon1, V, [matchId, monPlayers[1], carPlayers[0], { ...missing, [carPlayers[10]]: 2 }]), /Valora a todos/);

    const [v1] = await db.as<{ cast_mvp_vote: string }>(pMon1, V, [matchId, monPlayers[1], carPlayers[0], R(monPlayers[0], 1)]);
    expect(v1.cast_mvp_vote).toBe("created");
    // misma persona en las dos elecciones: permitido; cambiar el voto reemplaza también las valoraciones
    const [v2] = await db.as<{ cast_mvp_vote: string }>(pMon1, V, [matchId, monPlayers[1], monPlayers[1], r1]);
    expect(v2.cast_mvp_vote).toBe("updated");
    await db.as(pMon2, V, [matchId, monPlayers[0], monPlayers[0], R(monPlayers[1], 1)]);
    await db.as(orgCar, V, [matchId, carPlayers[1], monPlayers[1], R(carPlayers[0], 3)]);

    const mineR = await db.as<{ player_id: string; points: number }>(pMon1, `select * from public.my_peer_ratings($1)`, [matchId]);
    expect(mineR.length).toBe(13);
    expect(mineR.every((x) => x.points === 2)).toBe(true);
    const otherR = await db.as(pMon2, `select * from public.my_peer_ratings($1)`, [matchId]);
    expect(otherR.length).toBe(13);

    const [mine] = await db.as<{ team_pick_id: string; match_pick_id: string }>(pMon1, `select * from public.my_mvp_ballot($1)`, [matchId]);
    expect(mine).toMatchObject({ team_pick_id: monPlayers[1], match_pick_id: monPlayers[1] });
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
    await expectError(db.as(admin, `select * from public.peer_ratings`), /permission denied/);
    const avgs = await db.as(pMon1, `select * from public.peer_rating_avgs where match_id=$1`, [matchId]);
    expect(avgs.length).toBe(0);
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

  it("la votación cierra a las 14:00 (Madrid) del día siguiente al partido", async () => {
    const r = await db.su<{ a: string; b: string; c: string }>(`select
      private.vote_close_for('2026-11-15 20:00 Europe/Madrid')::text a,
      private.vote_close_for('2026-11-15 00:30 Europe/Madrid')::text b,
      private.vote_close_for('2026-07-07 21:00 Europe/Madrid')::text c`);
    expect(new Date(r[0].a).toISOString()).toBe("2026-11-16T13:00:00.000Z");
    expect(new Date(r[0].b).toISOString()).toBe("2026-11-16T13:00:00.000Z");
    expect(new Date(r[0].c).toISOString()).toBe("2026-07-08T12:00:00.000Z");
  });

  it("cierre automático, MVP, mejor de cada equipo, media de valoraciones y aviso", async () => {
    // (el partido ya está disputado: su ventana no se recalcula al mover la hora, así que se simula el paso del tiempo)
    await db.su(`update public.matches set kickoff_at = now() - interval '3 days', vote_opens_at = now() - interval '3 days', vote_closes_at = now() - interval '1 hour' where id=$1`, [matchId]);
    await expectError(db.as(pMon2, `select public.cast_mvp_vote($1,$2,$3,$4)`, [matchId, monPlayers[0], carPlayers[1], R(monPlayers[1], 1)]), /cerrada/);
    const [r] = await db.as<{ close_due_votes: number }>(null, `select public.close_due_votes()`);
    expect(r.close_due_votes).toBe(1);
    // MVP: monPlayers[1] 2 votos (pMon1, orgCar) · monPlayers[0] 1 voto (pMon2)
    const tallies = await db.as<{ player_id: string; votes: number }>(null, `select player_id, votes from public.mvp_tallies where match_id=$1 and category='match' order by votes desc`, [matchId]);
    expect(tallies[0]).toMatchObject({ player_id: monPlayers[1], votes: 2 });
    expect(tallies[1]).toMatchObject({ player_id: monPlayers[0], votes: 1 });
    const mvps = await db.su<{ player_id: string }>(`select player_id from public.match_mvps where match_id=$1`, [matchId]);
    expect(mvps).toEqual([{ player_id: monPlayers[1] }]);
    // Monecillo: empate 1-1 (monPlayers[1] y monPlayers[0]); desempata «votos en la otra categoría» → monPlayers[1]
    const bests = await db.su<{ team_id: string; player_id: string }>(`select team_id, player_id from public.match_team_bests where match_id=$1 order by team_id`, [matchId]);
    expect(bests).toEqual(expect.arrayContaining([{ team_id: mon, player_id: monPlayers[1] }, { team_id: car, player_id: carPlayers[1] }]));
    expect(bests.length).toBe(2);
    // Media de valoraciones publicada al cerrar: carPlayers[0] recibe 2 (pMon1) y 1 (pMon2) → 1,5
    const avgs = await db.as<{ player_id: string; avg: string; raters: number }>(null, `select player_id, avg::text, raters from public.peer_rating_avgs where match_id=$1`, [matchId]);
    expect(avgs.length).toBe(14);
    expect(avgs.find((a) => a.player_id === carPlayers[0])).toMatchObject({ avg: "1.50", raters: 2 });
    // monPlayers[2] recibe 2, 1 y 3 → 2
    expect(avgs.find((a) => a.player_id === monPlayers[2])).toMatchObject({ avg: "2.00", raters: 3 });
    const notes = await db.su(`select 1 from public.notifications where match_id=$1 and type='mvp_result'`, [matchId]);
    expect(notes.length).toBe(5);
    const [txt] = await db.su<{ title: string; body: string }>(`select title, body from public.notifications where match_id=$1 and type='mvp_result' limit 1`, [matchId]);
    expect(txt).toEqual({ title: "La votación ha terminado.", body: "Entra y revisa quién fue el MVP de anoche" });
    const log = await db.su<{ summary: string; is_system: boolean }>(`select summary, is_system from public.activity_log where action='vote.close'`);
    expect(log[0].is_system).toBe(true);
    // idempotente
    const [again] = await db.as<{ close_due_votes: number }>(null, `select public.close_due_votes()`);
    expect(again.close_due_votes).toBe(0);
  });

  it("corregir participantes tras el cierre NO cambia el recuento publicado (sin oráculo por diferencias)", async () => {
    const snap = async () => ({
      t: await db.as(null, `select category, player_id, votes from public.mvp_tallies where match_id=$1 order by category, player_id`, [matchId]),
      a: await db.as(null, `select player_id, avg::text, raters from public.peer_rating_avgs where match_id=$1 order by player_id`, [matchId]),
      m: await db.su(`select player_id from public.match_mvps where match_id=$1 order by player_id`, [matchId]),
    });
    const before = await snap();
    expect(before.t.length).toBeGreaterThan(0);
    // pMon2 (monPlayers[1]) pasa a no haber jugado
    const payload = {
      home_score: 2, away_score: 1,
      home: { players: carPlayers.slice(0, 7) },
      away: { players: [...monPlayers.slice(0, 1), ...monPlayers.slice(2, 8)] },
      goals: [
        { team_id: car, scorer_id: carPlayers[0] }, { team_id: car, scorer_id: carPlayers[0] }, { team_id: mon, scorer_id: monPlayers[0] },
      ],
    };
    await db.as(admin, `select public.finalize_match($1,$2)`, [matchId, payload]);
    expect(await snap()).toEqual(before);
    // y la hora de un partido programado ya disputado no se puede mover
    await expectError(db.as(orgCar, `select public.update_historical_meta($1,$2)`, [matchId, { kickoff_at: new Date(Date.now() - 30 * 86400000).toISOString() }]), /no se puede cambiar/);
  });

  it("marcar quién pagó el campo y quién reservó la pista (sólo staff)", async () => {
    await expectError(db.as(pMon1, `select public.set_match_payers($1,$2,$3)`, [matchId, monPlayers[0], monPlayers[0]]), /organizadores|administrador|permiso/i);
    await db.as(orgCar, `select public.set_match_payers($1,$2,$3)`, [matchId, monPlayers[0], carPlayers[2]]);
    const [m] = await db.as<{ paid_by_id: string; booked_by_id: string }>(null, `select paid_by_id, booked_by_id from public.matches where id=$1`, [matchId]);
    expect(m).toEqual({ paid_by_id: monPlayers[0], booked_by_id: carPlayers[2] });
    const log = await db.su(`select 1 from public.activity_log where action='match.payers' and entity_id=$1`, [matchId]);
    expect(log.length).toBe(1);
  });

  it("al día siguiente a las 12:00: «No seas moroso» a los que jugaron, menos a quien pagó", async () => {
    await db.su(`update public.matches set kickoff_at = ((now() at time zone 'Europe/Madrid')::date - 1 + time '20:00') at time zone 'Europe/Madrid' where id=$1`, [matchId]);
    await db.su(`update public.app_settings set value = to_jsonb(to_char(now() at time zone 'Europe/Madrid', 'HH24:MI')) where key='payment_reminder_time'`);
    await db.su(`select private.enqueue_due_reminders()`);
    await db.su(`select private.enqueue_due_reminders()`);
    const rows = await db.su<{ title: string; body: string; player_id: string }>(`select n.title, n.body, pr.player_id from public.notifications n join public.profiles pr on pr.id = n.user_id where n.match_id=$1 and n.type='payment_reminder'`, [matchId]);
    const [pend] = await db.su<{ n: number }>(`select count(*)::int n from public.profiles pr join public.match_players mp on mp.player_id = pr.player_id and mp.match_id=$1 and mp.participated where mp.player_id <> $2`, [matchId, monPlayers[0]]);
    expect(pend.n).toBeGreaterThan(0);
    expect(rows.length).toBe(pend.n);
    expect(rows.some((r) => r.player_id === monPlayers[0])).toBe(false);
    expect(rows[0]).toMatchObject({ title: "No seas moroso", body: "Recuerda pagar el partido de ayer al capitán de tu equipo." });
  });

  it("pagos: cada uno marca el suyo; staff y quien pagó la pista, cualquiera; a las 24 h, aviso a quien no ha pagado", async () => {
    const S = `select public.set_payment($1,$2,$3)`;
    // Sin ser el jugador, ni staff, ni quien pagó la pista: no se puede marcar
    await expectError(db.as(stranger, S, [matchId, carPlayers[1], true]), /tu propio pago/);
    await expectError(db.as(null, S, [matchId, carPlayers[1], true]), /permission denied|iniciar sesión/);
    // pMon2 ya no jugó este partido (se corrigió la alineación)
    await expectError(db.as(pMon2, S, [matchId, monPlayers[1], true]), /no ha jugado/);
    // quien pagó la pista (monPlayers[0] = pMon1) marca a otro; el organizador marca el suyo y a otros
    await db.as(pMon1, S, [matchId, monPlayers[2], true]);
    await db.as(orgCar, S, [matchId, carPlayers[0], true]);
    await db.as(orgCar, S, [matchId, carPlayers[3], true]);
    await db.as(orgCar, S, [matchId, carPlayers[3], false]);
    const paid = await db.as<{ player_id: string }>(null, `select player_id from public.match_payments where match_id=$1`, [matchId]);
    expect(paid.map((p) => p.player_id).sort()).toEqual([carPlayers[0], monPlayers[2]].sort());

    await db.su(`update public.matches set kickoff_at = now() - interval '24 hours 1 minute' where id=$1`, [matchId]);
    await db.su(`select private.enqueue_due_reminders()`);
    const od = await db.su<{ body: string; player_id: string }>(`select n.body, pr.player_id from public.notifications n join public.profiles pr on pr.id = n.user_id where n.match_id=$1 and n.type='payment_overdue'`, [matchId]);
    expect(od.length).toBeGreaterThan(0);
    expect(od.some((r) => [monPlayers[0], monPlayers[2], carPlayers[0]].includes(r.player_id))).toBe(false);
    expect(od[0].body).toBe("Paga de una vez al capitán de tu equipo o tendrás problemas.");
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

  it("editar un partido con participantes no convocados no rompe (match_players_some_flag)", async () => {
    const [r] = await db.as<{ create_historical_match: string }>(orgCar, `select public.create_historical_match($1)`, [{
      kickoff_at: "2026-02-10T19:00:00Z", home_team_id: car, away_team_id: mon, home_score: 1, away_score: 0,
      home: { players: carPlayers.slice(0, 7) }, away: { players: monPlayers.slice(0, 7) },
      goals: [{ team_id: car, scorer_id: carPlayers[0] }],
    }]);
    const id = r.create_historical_match;
    const edit = (home: string[]) => db.as(orgCar, `select public.finalize_match($1,$2)`, [id, {
      home_score: 1, away_score: 0, home: { players: home }, away: { players: monPlayers.slice(0, 7) },
      goals: [{ team_id: car, scorer_id: home[0] }], gk_spells: [],
    }]);
    await edit(carPlayers.slice(0, 7));
    await edit([...carPlayers.slice(1, 7), carPlayers[7]]); // cambia un participante
    const rows = await db.su<{ player_id: string; participated: boolean }>(`select player_id, participated from public.match_players where match_id=$1 and team_id=$2`, [id, car]);
    expect(rows.length).toBe(7);
    expect(rows.map((x) => x.player_id)).not.toContain(carPlayers[0]);
    expect(rows.every((x) => x.participated)).toBe(true);
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

describe("datos físicos y modelo 3D", () => {
  it("el registro guarda altura/peso/posición", async () => {
    const u = await db.createUser("fisico@example.com");
    await db.as(u, `select public.request_player_link($1, 'Torre', 185::smallint, 79.5, 'DEF')`, [carPlayers[10]]);
    const [f] = await db.su<{ height_cm: number; weight_kg: string }>(`select height_cm, weight_kg from public.player_physical where player_id=$1`, [carPlayers[10]]);
    expect(f.height_cm).toBe(185);
    expect(Number(f.weight_kg)).toBe(79.5);
    const [p] = await db.su<{ usual_position: string }>(`select usual_position from public.players where id=$1`, [carPlayers[10]]);
    expect(p.usual_position).toBe("DEF");

    await expectError(db.as(u, `select public.set_my_physical(130::smallint, 70, 'DEL')`), /altura/);
    await expectError(db.as(u, `select public.set_my_physical(180::smallint, 70, 'POR')`), /Central, Centrocampista o Delantero/);
    await db.as(u, `select public.set_my_physical(186::smallint, 81, 'DEL')`);
    const [g] = await db.su<{ height_cm: number }>(`select height_cm from public.player_physical where player_id=$1`, [carPlayers[10]]);
    expect(g.height_cm).toBe(186);
  });

  it("altura y peso no son visibles sin sesión y sólo el admin pone modelos", async () => {
    await expectError(db.as(null, `select * from public.player_physical`), /permission denied/);
    const rows = await db.as(pMon1, `select * from public.player_physical`);
    expect(rows.length).toBeGreaterThan(0);
    await expectError(db.as(pMon1, `select public.admin_set_player_media($1, '/players/x.glb', null)`, [monPlayers[0]]), /administrador/);
    await expectError(db.as(admin, `select public.admin_set_player_media($1, 'https://evil.com/x.glb', null)`, [monPlayers[0]]), /check/);
    await db.as(admin, `select public.admin_set_player_media($1, '/players/sito.glb?v=2', '/players/sito.webp')`, [monPlayers[0]]);
    const [p] = await db.su<{ model_url: string; model_updated_at: string | null }>(`select model_url, model_updated_at from public.players where id=$1`, [monPlayers[0]]);
    expect(p.model_url).toBe("/players/sito.glb?v=2");
    expect(p.model_updated_at).not.toBeNull();
  });
});

describe("personalización del jugador 3D", () => {
  it("cada jugador guarda su kit y se valida", async () => {
    const [{ player_id }] = await db.su<{ player_id: string }>(`select player_id from public.profiles where id=$1`, [pMon1]);
    await db.as(pMon1, `select public.set_my_kit('rojo', null, 'Sito', 14::smallint)`);
    const [p] = await db.su<{ kit: Record<string, string>; shirt_number: number }>(`select kit, shirt_number from public.players where id=$1`, [player_id]);
    expect(p.kit).toEqual({ boots: "rojo", back_name: "SITO" });
    expect(p.shirt_number).toBe(14);
    await expectError(db.as(pMon1, `select public.set_my_kit('fucsia', null, null, null)`), /Color no disponible/);
    await expectError(db.as(pMon1, `select public.set_my_kit(null, null, 'NOMBRE MUY LARGO', null)`), /12 letras/);
    await expectError(db.as(pMon1, `select public.set_my_kit(null, null, null, 120::smallint)`), /0 al 99/);
    await db.as(pMon1, `update public.players set kit='{"boots":"rojo"}' where id=$1`, [monPlayers[3]]).catch(() => null);
    const [other] = await db.su<{ kit: object }>(`select kit from public.players where id=$1`, [monPlayers[3]]);
    expect(other.kit).toEqual({}); // nadie toca el kit de otro
    await expectError(db.as(null, `select public.set_my_kit('rojo', null, null, null)`), /permission denied/);
  });
});

describe("seguridad (endurecimiento 0029)", () => {
  it("tras desvincular, la misma cuenta no puede volver a reclamar al jugador", async () => {
    const free = (await db.su<{ id: string }>(`select p.id from public.players p where p.kind='member' and p.active and not exists (select 1 from public.profiles pr where pr.player_id=p.id) order by p.full_name limit 1`))[0].id;
    const u = await linkedUser("relink@example.com", free);
    await db.as(admin, `select public.admin_unlink_player($1)`, [u]);
    await expectError(db.as(u, `select public.request_player_link($1, 'x')`, [free]), /te desvinculó/);
    // el admin sí puede volver a vincularla
    await db.as(admin, `select public.admin_link_player($1,$2)`, [u, free]);
  });

  it("el voto sólo lo ve la cuenta que lo emitió", async () => {
    const [b] = await db.su<{ match_id: string; player_id: string; user_id: string }>(`select match_id, player_id, user_id from public.mvp_vote_receipts limit 1`);
    const owner = b.user_id;
    expect((await db.as(owner, `select * from public.my_mvp_ballot($1)`, [b.match_id])).length).toBe(1);
    await db.su(`update public.mvp_vote_receipts set user_id=$1 where match_id=$2 and player_id=$3`, [stranger, b.match_id, b.player_id]);
    expect((await db.as(owner, `select * from public.my_mvp_ballot($1)`, [b.match_id])).length).toBe(0);
    expect((await db.as(owner, `select * from public.my_peer_ratings($1)`, [b.match_id])).length).toBe(0);
    await db.su(`update public.mvp_vote_receipts set user_id=$1 where match_id=$2 and player_id=$3`, [owner, b.match_id, b.player_id]);
  });

  it("foto de perfil: sólo del Storage de este proyecto y con extensión de imagen", async () => {
    const u = await db.createUser("foto@example.com");
    await expectError(db.as(u, `select public.update_my_photo($1)`, [`https://otroproyecto.supabase.co/storage/v1/object/public/media/avatars/${u}/1.jpg`]), /desde la app/);
    await expectError(db.as(u, `select public.update_my_photo($1)`, [`https://fsftghnwjvztwakgaifk.supabase.co/storage/v1/object/public/media/avatars/${u}/1.svg`]), /desde la app/);
    await db.as(u, `select public.update_my_photo($1)`, [`https://fsftghnwjvztwakgaifk.supabase.co/storage/v1/object/public/media/avatars/${u}/1.webp`]);
  });

  it("avisos push: sólo servicios push reales y como mucho 10 por cuenta", async () => {
    const u = await db.createUser("push@example.com");
    const ins = (ep: string) => db.as(u, `insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values ($1,$2,'k','a')`, [u, ep]);
    await expectError(ins("https://169.254.169.254/x"), /push_endpoint_allowlist/);
    await expectError(ins("https://fcm.googleapis.com.evil.example/x"), /push_endpoint_allowlist/);
    await expectError(ins("http://fcm.googleapis.com/x"), /push_endpoint_allowlist/);
    for (let i = 0; i < 10; i++) await ins(`https://fcm.googleapis.com/fcm/send/${u}-${i}`);
    await expectError(ins(`https://web.push.apple.com/${u}-x`), /Demasiados dispositivos/);
  });

  it("simulaciones: tamaño limitado", async () => {
    const u = await db.createUser("sim@example.com");
    await expectError(db.as(u, `insert into public.simulation_runs (user_id, kind, input, output) values ($1, 'match', jsonb_build_object('x', repeat('a', 40000)), '{}')`, [u]), /simulation_size/);
  });

  it("límite de peticiones: dictado por voz 20 por hora", async () => {
    const u = await db.createUser("voz@example.com");
    for (let i = 0; i < 20; i++) expect((await db.as<{ consume_rate: boolean }>(u, `select public.consume_rate('voice')`))[0].consume_rate).toBe(true);
    expect((await db.as<{ consume_rate: boolean }>(u, `select public.consume_rate('voice')`))[0].consume_rate).toBe(false);
    await expectError(db.as(null, `select public.consume_rate('voice')`), /permission denied/);
    // sólo el admin lee el registro de seguridad
    expect((await db.as(u, `select * from public.security_events`)).length).toBe(0);
    expect((await db.as(admin, `select * from public.security_events where kind='rate_limit'`)).length).toBeGreaterThan(0);
  });
});
