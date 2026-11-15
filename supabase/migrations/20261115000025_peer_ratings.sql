-- =====================================================================
-- 0025 · Cierre de votación y valoración entre jugadores
--  1) La votación cierra 2 h después de que acabe el partido
--     (inicio + duración del partido + margen; por defecto 60 + 120 min).
--  2) Al votar, cada participante valora a todos los demás (de los dos
--     equipos) con 0, 1, 2 o 3 puntos extra. Es anónimo, como la papeleta.
--     Al cerrar se publica la media por jugador. La nota final del partido es
--     70 % de la nota estadística + la media de valoraciones (0-3).
-- =====================================================================

-- 1) Cierre de la votación ---------------------------------------------
insert into public.app_settings (key, value, description) values
  ('match_duration_minutes', '60', 'Duración de un partido en minutos (para calcular cuándo termina)'),
  ('vote_margin_minutes', '120', 'Minutos que sigue abierta la votación después de terminar el partido')
on conflict (key) do nothing;

create or replace function private.vote_close_for(p_kickoff timestamptz)
returns timestamptz language sql stable security definer
set search_path = ''
as $$
  select p_kickoff
       + make_interval(mins => coalesce((public.setting('match_duration_minutes') #>> '{}')::int, 60))
       + make_interval(mins => coalesce((public.setting('vote_margin_minutes') #>> '{}')::int, 120))
$$;
revoke all on function private.vote_close_for(timestamptz) from public;

update public.matches
   set vote_closes_at = private.vote_close_for(kickoff_at)
 where vote_closed_at is null and kickoff_at is not null;

-- 2) Valoraciones (secretas) ---------------------------------------------
create table if not exists public.peer_ratings (
  match_id    uuid not null references public.matches(id) on delete cascade,
  voter_hash  text not null,
  player_id   uuid not null references public.players(id) on delete cascade,
  points      smallint not null check (points between 0 and 3),
  primary key (match_id, voter_hash, player_id)
);
alter table public.peer_ratings enable row level security;
revoke all on public.peer_ratings from anon, authenticated;

-- Media publicada al cerrar la votación
create table if not exists public.peer_rating_avgs (
  match_id  uuid not null references public.matches(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  avg       numeric(4,2) not null,
  raters    int not null,
  primary key (match_id, player_id)
);
alter table public.peer_rating_avgs enable row level security;
create policy "medias tras cierre" on public.peer_rating_avgs for select to anon, authenticated
  using (exists (select 1 from public.matches m where m.id = match_id and m.vote_closed_at is not null));
revoke insert, update, delete on public.peer_rating_avgs from anon, authenticated;

-- Aplazar o cancelar borra papeletas: también las valoraciones
create or replace function private.clear_peer_ratings()
returns trigger language plpgsql security definer
set search_path = ''
as $$
begin
  delete from public.peer_ratings where match_id = old.match_id and voter_hash = old.voter_hash;
  return old;
end $$;
drop trigger if exists ballots_clear_ratings on public.mvp_ballots;
create trigger ballots_clear_ratings after delete on public.mvp_ballots
  for each row execute function private.clear_peer_ratings();

-- 3) Votar: papeleta + valoración de todos los demás ----------------------
drop function if exists public.cast_mvp_vote(uuid, uuid, uuid);
create or replace function public.cast_mvp_vote(p_match uuid, p_team_pick uuid, p_match_pick uuid, p_ratings jsonb)
returns text language plpgsql security definer
set search_path = ''
as $$
declare
  v_player uuid := public.my_player_id();
  v_m public.matches%rowtype;
  v_team uuid;
  v_hash text;
  v_existing boolean;
  v_expected int;
  v_given int;
begin
  if auth.uid() is null then raise exception 'Necesitas iniciar sesión para votar' using errcode = '42501'; end if;
  if v_player is null then raise exception 'Tu cuenta aún no está vinculada a un jugador' using errcode = '42501'; end if;
  select * into v_m from public.matches where id = p_match;
  if not found then raise exception 'Partido no encontrado' using errcode = 'P0002'; end if;
  if not v_m.vote_enabled or v_m.status not in ('confirmed', 'played') then
    raise exception 'Este partido no tiene votación' using errcode = 'P0001';
  end if;
  if now() < v_m.vote_opens_at then raise exception 'La votación se abre al empezar el partido' using errcode = 'P0001'; end if;
  if now() >= v_m.vote_closes_at or v_m.vote_closed_at is not null then
    raise exception 'La votación está cerrada' using errcode = 'P0001';
  end if;
  select team_id into v_team from public.match_players where match_id = p_match and player_id = v_player and participated;
  if v_team is null then
    raise exception 'Sólo votan los jugadores que han participado en el partido' using errcode = '42501';
  end if;
  if p_team_pick is null or p_match_pick is null then
    raise exception 'Elige al mejor de tu equipo y al mejor del partido' using errcode = 'P0001';
  end if;
  if v_player in (p_team_pick, p_match_pick) then
    raise exception 'No puedes votarte a ti mismo' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.match_players where match_id = p_match and player_id = p_team_pick and participated and team_id = v_team) then
    raise exception 'El mejor de tu equipo tiene que ser un compañero que haya jugado' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.match_players where match_id = p_match and player_id = p_match_pick and participated) then
    raise exception 'Sólo puedes votar a jugadores que han participado' using errcode = 'P0001';
  end if;

  -- Valoraciones: un valor 0-3 para cada participante salvo él mismo
  if p_ratings is null or jsonb_typeof(p_ratings) <> 'object' then
    raise exception 'Valora a cada jugador con 0, 1, 2 o 3 puntos' using errcode = 'P0001';
  end if;
  if exists (select 1 from jsonb_each(p_ratings) e
             where jsonb_typeof(e.value) <> 'number' or (e.value #>> '{}') !~ '^[0-3]$') then
    raise exception 'Las valoraciones van de 0 a 3 puntos' using errcode = 'P0001';
  end if;
  if p_ratings ? v_player::text then
    raise exception 'No puedes valorarte a ti mismo' using errcode = 'P0001';
  end if;
  select count(*) into v_expected from public.match_players where match_id = p_match and participated and player_id <> v_player;
  select count(*) into v_given from jsonb_each(p_ratings) e
   where exists (select 1 from public.match_players mp where mp.match_id = p_match and mp.participated
                   and mp.player_id <> v_player and mp.player_id::text = e.key);
  if v_given <> v_expected or (select count(*) from jsonb_object_keys(p_ratings)) <> v_expected then
    raise exception 'Valora a todos los jugadores del partido, y sólo a ellos, con 0 a 3 puntos' using errcode = 'P0001';
  end if;

  v_hash := private.voter_hash(p_match, v_player);
  select exists (select 1 from public.mvp_ballots where match_id = p_match and voter_hash = v_hash) into v_existing;

  insert into public.mvp_ballots (match_id, voter_hash, team_pick_id, match_pick_id)
  values (p_match, v_hash, p_team_pick, p_match_pick)
  on conflict (match_id, voter_hash) do update
    set team_pick_id = excluded.team_pick_id, match_pick_id = excluded.match_pick_id;

  delete from public.peer_ratings where match_id = p_match and voter_hash = v_hash;
  insert into public.peer_ratings (match_id, voter_hash, player_id, points)
  select p_match, v_hash, e.key::uuid, (e.value #>> '{}')::smallint from jsonb_each(p_ratings) e;

  insert into public.mvp_vote_receipts (match_id, player_id, user_id)
  values (p_match, v_player, auth.uid())
  on conflict (match_id, player_id) do update
    set last_voted_at = now(), changes = public.mvp_vote_receipts.changes + 1, user_id = excluded.user_id;

  perform private.log_activity(case when v_existing then 'vote.update' else 'vote.cast' end, 'match', p_match::text,
    case when v_existing then 'Ha modificado su voto' else 'Ha votado' end, null);
  return case when v_existing then 'updated' else 'created' end;
end $$;
revoke all on function public.cast_mvp_vote(uuid, uuid, uuid, jsonb) from public, anon;
grant execute on function public.cast_mvp_vote(uuid, uuid, uuid, jsonb) to authenticated;

-- Mis valoraciones (sólo las ve quien las hizo)
create or replace function public.my_peer_ratings(p_match uuid)
returns table (player_id uuid, points smallint)
language sql stable security definer
set search_path = ''
as $$
  select r.player_id, r.points
  from public.peer_ratings r
  where r.match_id = p_match
    and public.my_player_id() is not null
    and r.voter_hash = private.voter_hash(p_match, public.my_player_id())
$$;
revoke all on function public.my_peer_ratings(uuid) from public, anon;
grant execute on function public.my_peer_ratings(uuid) to authenticated;

-- 4) Recuento: además del MVP, la media de valoraciones -------------------
alter function private.tally_votes(uuid) rename to tally_ballots;

create or replace function private.tally_votes(p_match uuid)
returns void language plpgsql security definer
set search_path = ''
as $$
begin
  perform private.tally_ballots(p_match);
  delete from public.peer_rating_avgs where match_id = p_match;
  -- Sólo valoraciones de participantes hacia participantes
  insert into public.peer_rating_avgs (match_id, player_id, avg, raters)
  select p_match, r.player_id, round(avg(r.points)::numeric, 2), count(*)::int
  from public.peer_ratings r
  join public.match_players v on v.match_id = p_match and v.participated
       and r.voter_hash = private.voter_hash(p_match, v.player_id)
  join public.match_players t on t.match_id = p_match and t.participated and t.player_id = r.player_id
  where r.match_id = p_match and v.player_id <> r.player_id
  group by r.player_id;
end $$;
revoke all on function private.tally_votes(uuid) from public;

-- 5) Peso de cada parte en la nota final ------------------------------------
update public.app_settings
   set value = value || '{"stat_share": 0.7, "peer_max": 3}'::jsonb,
       description = 'Nota de cada partido sobre 10. Parte estadística: base, played, goal, assist, team_goal, team_conceded, guest_bonus, max, min. Nota final = stat_share × nota estadística + media de valoraciones de los compañeros y rivales (0 a peer_max). Sin valoraciones, cuenta sólo la estadística.'
 where key = 'performance_weights';

-- 6) Quién pagó el campo y quién reservó la pista (+0,2 cada uno) ----------
alter table public.matches
  add column if not exists paid_by_id   uuid references public.players(id) on delete set null,
  add column if not exists booked_by_id uuid references public.players(id) on delete set null;

create or replace function public.set_match_payers(p_match uuid, p_paid_by uuid, p_booked_by uuid)
returns void language plpgsql security definer
set search_path = ''
as $$
declare v_old public.matches%rowtype;
begin
  perform private.assert_staff();
  select * into v_old from public.matches where id = p_match for update;
  if not found then raise exception 'Partido no encontrado' using errcode = 'P0002'; end if;
  if p_paid_by is not null and not exists (select 1 from public.players where id = p_paid_by and kind = 'member') then
    raise exception 'Quien pagó el campo tiene que ser un jugador de la plantilla' using errcode = 'P0001';
  end if;
  if p_booked_by is not null and not exists (select 1 from public.players where id = p_booked_by and kind = 'member') then
    raise exception 'Quien reservó la pista tiene que ser un jugador de la plantilla' using errcode = 'P0001';
  end if;
  if v_old.paid_by_id is not distinct from p_paid_by and v_old.booked_by_id is not distinct from p_booked_by then return; end if;
  update public.matches set paid_by_id = p_paid_by, booked_by_id = p_booked_by where id = p_match;
  perform private.log_activity('match.payers', 'match', p_match::text, 'Ha marcado quién pagó el campo y quién reservó la pista', null);
end $$;
revoke all on function public.set_match_payers(uuid, uuid, uuid) from public, anon;
grant execute on function public.set_match_payers(uuid, uuid, uuid) to authenticated;

-- Bonus fuera del tope: invitado, pagar el campo y reservar la pista (+0,2 cada uno)
update public.app_settings
   set value = value || '{"guest_bonus": 0.2, "paid_bonus": 0.2, "booked_bonus": 0.2}'::jsonb
 where key = 'performance_weights';
