-- =====================================================================
-- 0029 · Endurecimiento de seguridad (auditoría del 12-13 nov 2026)
--  1) El recuento de votos se congela al cerrar la votación (sin oráculo por diferencias).
--  2) El voto y las valoraciones pertenecen a la cuenta que votó, no al jugador.
--  3) La hora de un partido programado ya disputado no puede moverse (ni su ventana de votación).
--  4) Tras desvincular a una cuenta, no puede volver a reclamar el mismo jugador.
--  5) Foto de perfil: sólo URLs del Storage de este proyecto.
--  6) Avisos push: sólo servicios push reales y como mucho 10 dispositivos por cuenta.
--  7) Simulaciones: tamaño máximo y límite por hora.
--  8) Storage: sin SVG y 2 MB como máximo.
--  9) Límite de peticiones genérico (p. ej. dictado por voz).
-- 10) Registro de seguridad para el administrador (límites superados). Los accesos denegados
--     que abortan la transacción quedan en los registros de Postgres y se revisan cada semana.
-- =====================================================================

-- 0) Datos de configuración --------------------------------------------------
insert into public.app_settings (key, value, description) values
  ('storage_origin', '"https://fsftghnwjvztwakgaifk.supabase.co"', 'Origen del Storage de este proyecto (las fotos sólo pueden venir de aquí)')
on conflict (key) do nothing;

-- Registro de seguridad (sólo lo lee el admin) -----------------------------------
create table if not exists public.security_events (
  id         bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  user_id    uuid,
  kind       text not null,
  detail     text
);
alter table public.security_events enable row level security;
revoke all on public.security_events from anon, authenticated;
create policy "admin lee seguridad" on public.security_events for select to authenticated using (public.my_role() = 'admin');
grant select on public.security_events to authenticated;
create index if not exists security_events_created_idx on public.security_events (created_at desc);

create or replace function private.security_event(p_kind text, p_detail text)
returns void language plpgsql security definer
set search_path = ''
as $$
begin
  insert into public.security_events (user_id, kind, detail) values (auth.uid(), p_kind, left(p_detail, 500));
end $$;
revoke all on function private.security_event(text, text) from public;

-- 9) Límite de peticiones ------------------------------------------------------
create table if not exists private.rate_hits (
  bucket  text not null,
  user_id uuid not null,
  at      timestamptz not null default now()
);
create index if not exists rate_hits_idx on private.rate_hits (bucket, user_id, at);

-- Devuelve true si cabe otra petición y la apunta; false si se ha pasado del límite
create or replace function private.rate_ok(p_bucket text, p_max int, p_window interval)
returns boolean language plpgsql security definer
set search_path = ''
as $$
declare v_n int;
begin
  if auth.uid() is null then return false; end if;
  delete from private.rate_hits where at < now() - interval '1 day';
  select count(*) into v_n from private.rate_hits where bucket = p_bucket and user_id = auth.uid() and at > now() - p_window;
  if v_n >= p_max then
    perform private.security_event('rate_limit', p_bucket);
    return false;
  end if;
  insert into private.rate_hits (bucket, user_id) values (p_bucket, auth.uid());
  return true;
end $$;
revoke all on function private.rate_ok(text, int, interval) from public;

-- Para las acciones del servidor que no pasan por otra RPC (voz)
create or replace function public.consume_rate(p_bucket text)
returns boolean language plpgsql security definer
set search_path = ''
as $$
begin
  return case p_bucket
    when 'voice' then private.rate_ok('voice', 20, interval '1 hour')
    else false end;
end $$;
revoke all on function public.consume_rate(text) from public, anon;
grant execute on function public.consume_rate(text) to authenticated;

-- 1) Recuento congelado al cerrar ------------------------------------------------
-- close_due_votes cuenta con vote_closed_at aún vacío; cualquier llamada posterior
-- (p. ej. corregir la alineación) ya no cambia el recuento publicado.
create or replace function private.tally_votes(p_match uuid)
returns void language plpgsql security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.matches where id = p_match and vote_closed_at is not null) then
    return;
  end if;
  perform private.tally_ballots(p_match);
  delete from public.peer_rating_avgs where match_id = p_match;
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

-- 2) El voto es de la cuenta que lo emitió ----------------------------------------
create or replace function public.my_mvp_ballot(p_match uuid)
returns table (team_pick_id uuid, match_pick_id uuid)
language sql stable security definer
set search_path = ''
as $$
  select b.team_pick_id, b.match_pick_id
  from public.mvp_ballots b
  where b.match_id = p_match
    and public.my_player_id() is not null
    and b.voter_hash = private.voter_hash(p_match, public.my_player_id())
    and exists (select 1 from public.mvp_vote_receipts r
                where r.match_id = p_match and r.player_id = public.my_player_id() and r.user_id = auth.uid())
$$;
revoke all on function public.my_mvp_ballot(uuid) from public, anon;
grant execute on function public.my_mvp_ballot(uuid) to authenticated;

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
    and exists (select 1 from public.mvp_vote_receipts v
                where v.match_id = p_match and v.player_id = public.my_player_id() and v.user_id = auth.uid())
$$;
revoke all on function public.my_peer_ratings(uuid) from public, anon;
grant execute on function public.my_peer_ratings(uuid) to authenticated;

-- El voto real pasa a private.cast_mvp_vote_core; la función pública, antes de votar,
-- descarta en silencio el voto que otra cuenta dejó para ese jugador (sin enseñarlo).
alter function public.cast_mvp_vote(uuid, uuid, uuid, jsonb) set schema private;
alter function private.cast_mvp_vote(uuid, uuid, uuid, jsonb) rename to cast_mvp_vote_core;
revoke all on function private.cast_mvp_vote_core(uuid, uuid, uuid, jsonb) from public, anon, authenticated;

create or replace function public.cast_mvp_vote(p_match uuid, p_team_pick uuid, p_match_pick uuid, p_ratings jsonb)
returns text language plpgsql security definer
set search_path = ''
as $$
declare v_player uuid := public.my_player_id();
begin
  if v_player is not null and exists (select 1 from public.mvp_vote_receipts r
      where r.match_id = p_match and r.player_id = v_player and r.user_id is distinct from auth.uid()) then
    delete from public.mvp_ballots where match_id = p_match and voter_hash = private.voter_hash(p_match, v_player);
    delete from public.mvp_vote_receipts where match_id = p_match and player_id = v_player;
  end if;
  return private.cast_mvp_vote_core(p_match, p_team_pick, p_match_pick, p_ratings);
end $$;
revoke all on function public.cast_mvp_vote(uuid, uuid, uuid, jsonb) from public, anon;
grant execute on function public.cast_mvp_vote(uuid, uuid, uuid, jsonb) to authenticated;

-- 3) Hora de partidos disputados -------------------------------------------------
alter function public.update_historical_meta(uuid, jsonb) set schema private;
alter function private.update_historical_meta(uuid, jsonb) rename to update_historical_meta_core;
revoke all on function private.update_historical_meta_core(uuid, jsonb) from public, anon, authenticated;

create or replace function public.update_historical_meta(p_id uuid, p jsonb)
returns void language plpgsql security definer
set search_path = ''
as $$
declare v_m public.matches%rowtype;
begin
  perform private.assert_staff();
  select * into v_m from public.matches where id = p_id;
  if found and v_m.origin = 'scheduled' and (p ? 'kickoff_at')
     and (p ->> 'kickoff_at')::timestamptz is distinct from v_m.kickoff_at then
    raise exception 'La hora de un partido ya disputado no se puede cambiar (afecta a la votación)' using errcode = 'P0001';
  end if;
  perform private.update_historical_meta_core(p_id, p);
end $$;
revoke all on function public.update_historical_meta(uuid, jsonb) from public, anon;
grant execute on function public.update_historical_meta(uuid, jsonb) to authenticated;

-- La ventana de votación de un partido programado ya disputado no se mueve
create or replace function private.set_vote_window()
returns trigger language plpgsql
set search_path = ''
as $$
begin
  if new.origin = 'historical' then
    new.vote_enabled := false;
  end if;
  if new.vote_closed_at is null
     and (tg_op = 'INSERT' or new.origin = 'historical' or old.status is distinct from 'played') then
    new.vote_opens_at := new.kickoff_at;
    new.vote_closes_at := private.vote_close_for(new.kickoff_at);
  end if;
  return new;
end $$;

-- 4) Sin re-reclamar tras desvincular ------------------------------------------------
alter function public.request_player_link(uuid, text, smallint, numeric, public.field_position) set schema private;
alter function private.request_player_link(uuid, text, smallint, numeric, public.field_position) rename to request_player_link_core;
revoke all on function private.request_player_link_core(uuid, text, smallint, numeric, public.field_position) from public, anon, authenticated;

create or replace function public.request_player_link(
  p_player uuid, p_nickname text,
  p_height smallint default null, p_weight numeric default null, p_position public.field_position default null)
returns uuid language plpgsql security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.player_links
             where user_id = auth.uid() and player_id = p_player and status = 'revoked' and reviewed_by is not null) then
    raise exception 'El administrador te desvinculó de este jugador. Pídele que te vuelva a vincular.' using errcode = '42501';
  end if;
  if not private.rate_ok('link', 10, interval '1 hour') then
    raise exception 'Demasiados intentos. Espera un rato.' using errcode = '54000';
  end if;
  return private.request_player_link_core(p_player, p_nickname, p_height, p_weight, p_position);
end $$;
revoke all on function public.request_player_link(uuid, text, smallint, numeric, public.field_position) from public, anon;
grant execute on function public.request_player_link(uuid, text, smallint, numeric, public.field_position) to authenticated;

-- 5) Foto de perfil sólo del Storage de este proyecto ---------------------------------
create or replace function public.update_my_photo(p_url text)
returns void language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_player uuid := public.my_player_id();
  v_url text := nullif(trim(p_url), '');
  v_origin text := coalesce(public.setting('storage_origin') #>> '{}', '');
begin
  if v_uid is null then raise exception 'Necesitas iniciar sesión' using errcode = '42501'; end if;
  if v_url is not null and (v_origin = '' or left(v_url, length(v_origin) + 1) <> v_origin || '/'
      or substr(v_url, length(v_origin) + 1) !~ ('^/storage/v1/object/public/media/avatars/' || v_uid::text || '/[A-Za-z0-9_-]+\.(jpg|jpeg|png|webp)$')) then
    raise exception 'La foto debe subirse desde la app' using errcode = '22023';
  end if;
  update public.profiles set avatar_url = v_url where id = v_uid;
  if v_player is not null then
    update public.players set photo_url = v_url where id = v_player;
  end if;
end $$;
revoke all on function public.update_my_photo(text) from public, anon;
grant execute on function public.update_my_photo(text) to authenticated;

-- 6) Avisos push: sólo servicios reales, 10 dispositivos por cuenta --------------------
alter table public.push_subscriptions drop constraint if exists push_endpoint_allowlist;
alter table public.push_subscriptions add constraint push_endpoint_allowlist check (
  length(endpoint) <= 2000 and endpoint ~ '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9.-]+\.push\.apple\.com|[a-z0-9.-]+\.notify\.windows\.com)/[^\s]*$'
  and length(p256dh) <= 200 and length(auth) <= 100);

create or replace function private.push_sub_guard()
returns trigger language plpgsql security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.push_subscriptions where user_id = new.user_id) >= 10 then
    raise exception 'Demasiados dispositivos con avisos. Quita alguno.' using errcode = '54000';
  end if;
  return new;
end $$;
drop trigger if exists push_sub_guard on public.push_subscriptions;
create trigger push_sub_guard before insert on public.push_subscriptions for each row execute function private.push_sub_guard();

-- 7) Simulaciones: tamaño y ritmo ------------------------------------------------------
alter table public.simulation_runs drop constraint if exists simulation_size;
alter table public.simulation_runs add constraint simulation_size
  check (pg_column_size(input) <= 16384 and pg_column_size(output) <= 65536);

create or replace function private.simulation_guard()
returns trigger language plpgsql security definer
set search_path = ''
as $$
begin
  if not private.rate_ok('simulation', 60, interval '1 hour') then
    raise exception 'Has hecho muchas simulaciones seguidas. Espera un rato.' using errcode = '54000';
  end if;
  return new;
end $$;
drop trigger if exists simulation_guard on public.simulation_runs;
create trigger simulation_guard before insert on public.simulation_runs for each row execute function private.simulation_guard();

-- 8) Storage: tipos y tamaño -------------------------------------------------------------
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'buckets') then
    update storage.buckets
       set allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp'],
           file_size_limit = 2097152
     where id = 'media';
  end if;
end $$;
