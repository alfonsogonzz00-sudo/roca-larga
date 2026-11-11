-- =====================================================================
-- 0002 · Funciones auxiliares, auditoría, autenticación y reglas de negocio
-- Todas las operaciones sensibles pasan por funciones SECURITY DEFINER que
-- comprueban rol + estado de la cuenta en el servidor (no en la interfaz).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Utilidades de configuración
-- ---------------------------------------------------------------------
create or replace function private.cfg(p_key text)
returns text language sql stable security definer
set search_path = ''
as $$ select value from private.config where key = p_key $$;

create or replace function public.setting(p_key text, p_default jsonb default null)
returns jsonb language sql stable security definer
set search_path = ''
as $$ select coalesce((select value from public.app_settings where key = p_key), p_default) $$;

-- ---------------------------------------------------------------------
-- Identidad y roles del usuario actual
-- ---------------------------------------------------------------------
create or replace function public.my_role()
returns public.app_role language sql stable security definer
set search_path = ''
as $$
  select p.role from public.profiles p
  where p.id = auth.uid() and p.status = 'active'
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer
set search_path = ''
as $$ select coalesce(public.my_role() = 'admin', false) $$;

create or replace function public.is_staff()
returns boolean language sql stable security definer
set search_path = ''
as $$ select coalesce(public.my_role() in ('admin', 'organizer'), false) $$;

create or replace function public.my_player_id()
returns uuid language sql stable security definer
set search_path = ''
as $$
  select p.player_id from public.profiles p
  where p.id = auth.uid() and p.status = 'active'
$$;

create or replace function public.my_team_id()
returns uuid language sql stable security definer
set search_path = ''
as $$
  select pl.team_id from public.profiles p
  join public.players pl on pl.id = p.player_id
  where p.id = auth.uid() and p.status = 'active'
$$;

create or replace function private.actor_name(p_user uuid)
returns text language sql stable security definer
set search_path = ''
as $$
  select coalesce(pl.full_name, p.display_name, p.email, 'Usuario')
  from public.profiles p
  left join public.players pl on pl.id = p.player_id
  where p.id = p_user
$$;

create or replace function private.player_label(p_player uuid)
returns text language sql stable security definer
set search_path = ''
as $$
  select case when nickname is not null and nickname <> '' then full_name || ' «' || nickname || '»' else full_name end
  from public.players where id = p_player
$$;

-- ---------------------------------------------------------------------
-- Registro de actividad
-- ---------------------------------------------------------------------
create or replace function private.log_activity(
  p_action text, p_entity_type text, p_entity_id text, p_summary text,
  p_changes jsonb default null, p_is_system boolean default false
) returns void language plpgsql security definer
set search_path = ''
as $$
declare
  v_actor uuid := case when p_is_system then null else auth.uid() end;
begin
  insert into public.activity_log (actor_id, actor_name, action, entity_type, entity_id, summary, changes, is_system)
  values (
    v_actor,
    case when v_actor is null then 'Sistema' else private.actor_name(v_actor) end,
    p_action, p_entity_type, p_entity_id, p_summary, p_changes, p_is_system or v_actor is null
  );
end $$;

-- Diferencias entre dos filas (sólo columnas modificadas)
create or replace function private.row_diff(p_old jsonb, p_new jsonb)
returns jsonb language sql immutable
set search_path = ''
as $$
  select coalesce(jsonb_object_agg(n.key, jsonb_build_object('antes', p_old -> n.key, 'despues', n.value)), '{}'::jsonb)
  from jsonb_each(p_new) n
  where n.key not in ('updated_at', 'created_at', 'last_seen_at')
    and (p_old -> n.key) is distinct from n.value
$$;

-- Auditoría genérica para tablas de configuración y maestros
create or replace function private.audit_trigger()
returns trigger language plpgsql security definer
set search_path = ''
as $$
declare
  v_id text;
  v_diff jsonb;
  v_label text;
begin
  if tg_op = 'DELETE' then
    v_id := coalesce(to_jsonb(old) ->> 'id', to_jsonb(old) ->> 'key', to_jsonb(old) ->> 'type');
    perform private.log_activity(tg_table_name || '.delete', tg_table_name, v_id,
      'Ha eliminado un registro de ' || tg_table_name, to_jsonb(old), auth.uid() is null);
    return old;
  elsif tg_op = 'INSERT' then
    v_id := coalesce(to_jsonb(new) ->> 'id', to_jsonb(new) ->> 'key', to_jsonb(new) ->> 'type');
    v_label := coalesce(to_jsonb(new) ->> 'full_name', to_jsonb(new) ->> 'name', v_id);
    perform private.log_activity(tg_table_name || '.create', tg_table_name, v_id,
      'Ha creado ' || v_label || ' (' || tg_table_name || ')', to_jsonb(new), auth.uid() is null);
    return new;
  else
    v_diff := private.row_diff(to_jsonb(old), to_jsonb(new));
    if v_diff = '{}'::jsonb then return new; end if;
    v_id := coalesce(to_jsonb(new) ->> 'id', to_jsonb(new) ->> 'key', to_jsonb(new) ->> 'type');
    v_label := coalesce(to_jsonb(new) ->> 'full_name', to_jsonb(new) ->> 'name', to_jsonb(new) ->> 'label', v_id);
    perform private.log_activity(tg_table_name || '.update', tg_table_name, v_id,
      'Ha modificado ' || v_label || ' (' || tg_table_name || ')', v_diff, auth.uid() is null);
    return new;
  end if;
end $$;

create or replace function private.touch_updated_at()
returns trigger language plpgsql
set search_path = ''
as $$ begin new.updated_at := now(); return new; end $$;

do $$
declare t text;
begin
  foreach t in array array['teams','venues','players','formations','app_settings','ui_texts','prediction_configs','notification_types']
  loop
    execute format('create trigger %I_audit after insert or update or delete on public.%I for each row execute function private.audit_trigger()', t, t);
  end loop;
  foreach t in array array['teams','venues','players','profiles','matches','app_settings','ui_texts','prediction_configs','notification_types']
  loop
    execute format('create trigger %I_touch before update on public.%I for each row execute function private.touch_updated_at()', t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Perfiles: alta automática + inicialización segura del administrador
-- El email del propietario vive en private.config('owner_email'), fuera
-- del alcance de la API. Sólo se concede si el email está verificado y
-- todavía no existe ningún administrador.
-- ---------------------------------------------------------------------
create or replace function private.maybe_bootstrap_admin(p_user uuid, p_email text, p_confirmed boolean)
returns void language plpgsql security definer
set search_path = ''
as $$
declare v_owner text := lower(trim(coalesce(private.cfg('owner_email'), '')));
begin
  if v_owner = '' or not p_confirmed or lower(coalesce(p_email, '')) <> v_owner then return; end if;
  if exists (select 1 from public.profiles where role = 'admin') then return; end if;
  update public.profiles set role = 'admin' where id = p_user;
  perform private.log_activity('user.bootstrap_admin', 'profile', p_user::text,
    'Se ha asignado el rol de administrador al propietario', null, true);
end $$;

create or replace function private.handle_new_user()
returns trigger language plpgsql security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, display_name, avatar_url, auth_provider)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', split_part(coalesce(new.email, ''), '@', 1)),
    new.raw_user_meta_data ->> 'avatar_url',
    coalesce(new.raw_app_meta_data ->> 'provider', 'email')
  )
  on conflict (id) do nothing;
  perform private.maybe_bootstrap_admin(new.id, new.email, new.email_confirmed_at is not null);
  return new;
end $$;

create or replace function private.handle_user_updated()
returns trigger language plpgsql security definer
set search_path = ''
as $$
begin
  update public.profiles
     set email = new.email,
         auth_provider = coalesce(new.raw_app_meta_data ->> 'provider', auth_provider)
   where id = new.id
     and (email is distinct from new.email or auth_provider is distinct from coalesce(new.raw_app_meta_data ->> 'provider', auth_provider));
  if new.email_confirmed_at is not null and old.email_confirmed_at is null then
    perform private.maybe_bootstrap_admin(new.id, new.email, true);
  end if;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();
create trigger on_auth_user_updated after update on auth.users
  for each row execute function private.handle_user_updated();

-- ---------------------------------------------------------------------
-- Ventana de votación: abre al inicio, cierra exactamente 24 h después
-- ---------------------------------------------------------------------
create or replace function private.set_vote_window()
returns trigger language plpgsql
set search_path = ''
as $$
begin
  if new.origin = 'historical' then
    new.vote_enabled := false;
  end if;
  if new.vote_closed_at is null then
    new.vote_opens_at := new.kickoff_at;
    new.vote_closes_at := new.kickoff_at + interval '24 hours';
  end if;
  return new;
end $$;

create trigger matches_vote_window before insert or update of kickoff_at, origin on public.matches
  for each row execute function private.set_vote_window();

-- ---------------------------------------------------------------------
-- Fechas en español (zona horaria de la aplicación)
-- ---------------------------------------------------------------------
create or replace function private.app_tz()
returns text language sql stable security definer
set search_path = ''
as $$ select coalesce(public.setting('timezone') #>> '{}', 'Europe/Madrid') $$;

create or replace function private.fmt_day(p_ts timestamptz)
returns text language sql stable security definer
set search_path = ''
as $$
  select (array['lunes','martes','miércoles','jueves','viernes','sábado','domingo'])[extract(isodow from p_ts at time zone private.app_tz())::int]
      || ' ' || extract(day from p_ts at time zone private.app_tz())::int
      || ' de ' || (array['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'])[extract(month from p_ts at time zone private.app_tz())::int]
$$;

create or replace function private.fmt_time(p_ts timestamptz)
returns text language sql stable security definer
set search_path = ''
as $$ select to_char(p_ts at time zone private.app_tz(), 'HH24:MI') $$;

-- ---------------------------------------------------------------------
-- Cola de notificaciones (outbox). El envío real lo hace /api/notifications/dispatch
-- ---------------------------------------------------------------------
create or replace function private.render_template(p_tpl text, p_vars jsonb)
returns text language plpgsql immutable
set search_path = ''
as $$
declare k text; v text; r text := p_tpl;
begin
  for k, v in select key, value from jsonb_each_text(p_vars) loop
    r := replace(r, '{{' || k || '}}', coalesce(v, ''));
  end loop;
  return r;
end $$;

create or replace function private.match_vars(p_match uuid)
returns jsonb language sql stable security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'dia', private.fmt_day(m.kickoff_at),
    'hora', private.fmt_time(m.kickoff_at),
    'estadio', coalesce(v.name, 'por confirmar'),
    'local', th.name,
    'visitante', ta.name,
    'partido', th.short_name || ' vs ' || ta.short_name,
    'cierre', private.fmt_day(m.vote_closes_at) || ' a las ' || private.fmt_time(m.vote_closes_at)
  )
  from public.matches m
  join public.teams th on th.id = m.home_team_id
  join public.teams ta on ta.id = m.away_team_id
  left join public.venues v on v.id = m.venue_id
  where m.id = p_match
$$;

-- Encola una notificación para los usuarios vinculados a los jugadores indicados.
create or replace function private.enqueue_for_players(
  p_type text, p_match uuid, p_players uuid[], p_extra jsonb default '{}'::jsonb,
  p_scheduled timestamptz default now(), p_dedupe_suffix text default ''
) returns int language plpgsql security definer
set search_path = ''
as $$
declare
  v_type public.notification_types%rowtype;
  v_vars jsonb;
  v_kick timestamptz;
  v_count int;
begin
  select * into v_type from public.notification_types where type = p_type;
  if not found or not v_type.enabled then return 0; end if;
  select kickoff_at into v_kick from public.matches where id = p_match;
  v_vars := coalesce(private.match_vars(p_match), '{}'::jsonb) || coalesce(p_extra, '{}'::jsonb);

  insert into public.notifications (type, user_id, match_id, kickoff_snapshot, title, body, url, dedupe_key, scheduled_for)
  select p_type, pr.id, p_match, v_kick,
         private.render_template(v_type.title_template, v_vars),
         private.render_template(v_type.body_template, v_vars),
         case when p_type in ('vote_open', 'mvp_result') then '/votacion/' || p_match else '/partidos/' || p_match end,
         p_type || ':' || p_match || ':' || pr.id || ':' || extract(epoch from v_kick)::bigint || p_dedupe_suffix,
         p_scheduled
  from public.profiles pr
  where pr.player_id = any(p_players)
    and pr.status = 'active'
    and coalesce((pr.notification_prefs ->> p_type)::boolean, true)
  on conflict (dedupe_key) do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end $$;

create or replace function private.enqueue_match_confirmed(p_match uuid)
returns void language plpgsql security definer
set search_path = ''
as $$
declare v_called uuid[]; v_part uuid[]; v_kick timestamptz;
begin
  select array_agg(player_id) filter (where called), array_agg(player_id) filter (where participated)
    into v_called, v_part
  from public.match_players where match_id = p_match;
  select kickoff_at into v_kick from public.matches where id = p_match;
  perform private.enqueue_for_players('match_confirmed', p_match, coalesce(v_called, '{}'));
  perform private.enqueue_for_players('vote_open', p_match, coalesce(v_part, '{}'), '{}'::jsonb, v_kick);
end $$;

-- Al aplazar/cancelar: descartar avisos pendientes de ese partido
create or replace function private.skip_match_notifications(p_match uuid)
returns void language sql security definer
set search_path = ''
as $$
  update public.notifications set status = 'skipped', error = 'Partido aplazado o cancelado'
  where match_id = p_match and status = 'pending' and type in ('match_confirmed', 'match_reminder', 'vote_open')
$$;

-- ---------------------------------------------------------------------
-- Validación de convocatorias
-- ---------------------------------------------------------------------
create or replace function private.assert_players_for_team(p_players uuid[], p_team uuid, p_label text)
returns void language plpgsql stable security definer
set search_path = ''
as $$
declare v_bad int;
begin
  if p_players is null then return; end if;
  if (select count(*) from unnest(p_players)) <> (select count(distinct x) from unnest(p_players) x) then
    raise exception 'Hay jugadores repetidos en %', p_label using errcode = 'P0001';
  end if;
  select count(*) into v_bad
  from unnest(p_players) x
  left join public.players pl on pl.id = x
  where pl.id is null or not pl.active or (pl.kind = 'member' and pl.team_id <> p_team);
  if v_bad > 0 then
    raise exception '% contiene jugadores que no pertenecen al equipo o están inactivos', p_label using errcode = 'P0001';
  end if;
end $$;

create or replace function private.uuid_array(p jsonb)
returns uuid[] language sql immutable
set search_path = ''
as $$ select coalesce(array(select (jsonb_array_elements_text(coalesce(p, '[]'::jsonb)))::uuid), '{}') $$;

-- Guarda la convocatoria (jugadores + invitados con quién los trae)
-- p_side: { "players": [uuid], "guests": [{"player_id": uuid, "brought_by_id": uuid}], "positions": {uuid: "DEF"} }
create or replace function private.save_callup(p_match uuid, p_team uuid, p_side jsonb, p_label text)
returns int language plpgsql security definer
set search_path = ''
as $$
declare
  v_players uuid[] := private.uuid_array(p_side -> 'players');
  v_guest jsonb;
  v_all uuid[];
  v_count int;
begin
  perform private.assert_players_for_team(v_players, p_team, p_label);
  v_all := v_players;
  for v_guest in select * from jsonb_array_elements(coalesce(p_side -> 'guests', '[]'::jsonb)) loop
    if not exists (select 1 from public.players where id = (v_guest ->> 'player_id')::uuid and kind = 'guest' and active) then
      raise exception 'Invitado no válido en %', p_label using errcode = 'P0001';
    end if;
    if v_guest ->> 'brought_by_id' is not null and not exists (
      select 1 from public.players where id = (v_guest ->> 'brought_by_id')::uuid and kind = 'member') then
      raise exception 'Quien trae al invitado debe ser integrante de una plantilla' using errcode = 'P0001';
    end if;
    v_all := v_all || (v_guest ->> 'player_id')::uuid;
  end loop;

  if exists (select 1 from public.match_players mp where mp.match_id = p_match and mp.team_id <> p_team and mp.player_id = any(v_all)) then
    raise exception 'Un jugador no puede estar en los dos equipos' using errcode = 'P0001';
  end if;

  delete from public.match_players where match_id = p_match and team_id = p_team and not (player_id = any(v_all));

  insert into public.match_players (match_id, player_id, team_id, called, participated, lineup_position, brought_by_id)
  select p_match, x, p_team, true, true,
         nullif(p_side -> 'positions' ->> x::text, '')::public.field_position,
         (select (g ->> 'brought_by_id')::uuid from jsonb_array_elements(coalesce(p_side -> 'guests', '[]'::jsonb)) g
           where (g ->> 'player_id')::uuid = x)
  from unnest(v_all) x
  on conflict (match_id, player_id) do update
    set called = true, participated = true, team_id = excluded.team_id,
        lineup_position = excluded.lineup_position, brought_by_id = excluded.brought_by_id;

  select count(*) into v_count from public.match_players where match_id = p_match and team_id = p_team and called;
  return v_count;
end $$;

-- ---------------------------------------------------------------------
-- Partidos: crear / editar / cambiar estado
-- ---------------------------------------------------------------------
create or replace function private.assert_staff()
returns void language plpgsql stable security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Necesitas iniciar sesión' using errcode = '42501';
  end if;
  if not public.is_staff() then
    raise exception 'Sólo el administrador o los organizadores pueden hacer esto' using errcode = '42501';
  end if;
end $$;

create or replace function private.assert_two_teams(p_home uuid, p_away uuid)
returns void language plpgsql stable security definer
set search_path = ''
as $$
begin
  if p_home is null or p_away is null or p_home = p_away
     or (select count(*) from public.teams where id in (p_home, p_away)) <> 2 then
    raise exception 'Debes elegir equipo local y visitante distintos' using errcode = 'P0001';
  end if;
end $$;

create or replace function private.check_confirmable(p_match uuid)
returns void language plpgsql stable security definer
set search_path = ''
as $$
declare v_home int; v_away int; v_m public.matches%rowtype; v_size int := coalesce((public.setting('players_per_side') #>> '{}')::int, 7);
begin
  select * into v_m from public.matches where id = p_match;
  select count(*) filter (where team_id = v_m.home_team_id and called),
         count(*) filter (where team_id = v_m.away_team_id and called)
    into v_home, v_away
  from public.match_players where match_id = p_match;
  if not v_m.exceptional_lineup and (v_home <> v_size or v_away <> v_size) then
    raise exception 'Para confirmar el partido hacen falta % convocados por equipo (ahora % y %)', v_size, v_home, v_away
      using errcode = 'P0001';
  end if;
end $$;

create or replace function public.create_match(p jsonb)
returns uuid language plpgsql security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_status public.match_status := coalesce(nullif(p ->> 'status', ''), 'pending')::public.match_status;
  v_home uuid := (p ->> 'home_team_id')::uuid;
  v_away uuid := (p ->> 'away_team_id')::uuid;
  v_exc boolean := coalesce((p ->> 'exceptional_lineup')::boolean, false);
begin
  perform private.assert_staff();
  perform private.assert_two_teams(v_home, v_away);
  if v_status not in ('pending', 'confirmed') then
    raise exception 'Un partido nuevo sólo puede estar pendiente o confirmado' using errcode = 'P0001';
  end if;
  if (p ->> 'kickoff_at') is null then
    raise exception 'Fecha y hora obligatorias' using errcode = 'P0001';
  end if;
  if v_exc and not public.is_admin() then
    raise exception 'Sólo el administrador puede registrar una incidencia de alineación' using errcode = '42501';
  end if;

  insert into public.matches (kickoff_at, venue_id, home_team_id, away_team_id, status, origin,
    home_formation_id, away_formation_id, forecast_weather, forecast_temp_c, notes,
    exceptional_lineup, exceptional_reason, created_by, updated_by)
  values ((p ->> 'kickoff_at')::timestamptz, nullif(p ->> 'venue_id', '')::uuid, v_home, v_away, 'pending', 'scheduled',
    nullif(p ->> 'home_formation_id', '')::uuid, nullif(p ->> 'away_formation_id', '')::uuid,
    nullif(p ->> 'forecast_weather', '')::public.weather_kind, nullif(p ->> 'forecast_temp_c', '')::numeric,
    nullif(p ->> 'notes', ''), v_exc, nullif(p ->> 'exceptional_reason', ''), auth.uid(), auth.uid())
  returning id into v_id;

  perform private.save_callup(v_id, v_home, coalesce(p -> 'home', '{}'::jsonb), 'la convocatoria local');
  perform private.save_callup(v_id, v_away, coalesce(p -> 'away', '{}'::jsonb), 'la convocatoria visitante');

  perform private.log_activity('match.create', 'match', v_id::text,
    'Ha creado un partido para el ' || private.fmt_day((p ->> 'kickoff_at')::timestamptz) || ' a las ' || private.fmt_time((p ->> 'kickoff_at')::timestamptz),
    p - 'home' - 'away');

  if v_status = 'confirmed' then
    perform private.check_confirmable(v_id);
    update public.matches set status = 'confirmed' where id = v_id;
    perform private.log_activity('match.status', 'match', v_id::text, 'Ha confirmado el partido', jsonb_build_object('estado', 'confirmed'));
    perform private.enqueue_match_confirmed(v_id);
  end if;
  return v_id;
end $$;

create or replace function public.update_match(p_id uuid, p jsonb)
returns void language plpgsql security definer
set search_path = ''
as $$
declare
  v_old public.matches%rowtype;
  v_new public.matches%rowtype;
  v_before uuid[];
  v_after uuid[];
  v_exc boolean;
begin
  perform private.assert_staff();
  select * into v_old from public.matches where id = p_id for update;
  if not found then raise exception 'Partido no encontrado' using errcode = 'P0002'; end if;
  if v_old.status = 'played' then
    raise exception 'El partido ya está disputado: corrígelo desde «Editar resultado»' using errcode = 'P0001';
  end if;
  perform private.assert_two_teams((p ->> 'home_team_id')::uuid, (p ->> 'away_team_id')::uuid);
  v_exc := coalesce((p ->> 'exceptional_lineup')::boolean, v_old.exceptional_lineup);
  if v_exc is distinct from v_old.exceptional_lineup and not public.is_admin() then
    raise exception 'Sólo el administrador puede registrar una incidencia de alineación' using errcode = '42501';
  end if;

  select array_agg(player_id order by player_id) into v_before from public.match_players where match_id = p_id and called;

  -- Si cambian los equipos, se rehace la convocatoria completa
  if (p ->> 'home_team_id')::uuid <> v_old.home_team_id or (p ->> 'away_team_id')::uuid <> v_old.away_team_id then
    delete from public.match_players where match_id = p_id;
  end if;

  update public.matches set
    kickoff_at = (p ->> 'kickoff_at')::timestamptz,
    venue_id = nullif(p ->> 'venue_id', '')::uuid,
    home_team_id = (p ->> 'home_team_id')::uuid,
    away_team_id = (p ->> 'away_team_id')::uuid,
    home_formation_id = nullif(p ->> 'home_formation_id', '')::uuid,
    away_formation_id = nullif(p ->> 'away_formation_id', '')::uuid,
    forecast_weather = nullif(p ->> 'forecast_weather', '')::public.weather_kind,
    forecast_temp_c = nullif(p ->> 'forecast_temp_c', '')::numeric,
    notes = nullif(p ->> 'notes', ''),
    exceptional_lineup = v_exc,
    exceptional_reason = nullif(p ->> 'exceptional_reason', ''),
    updated_by = auth.uid()
  where id = p_id
  returning * into v_new;

  perform private.save_callup(p_id, v_new.home_team_id, coalesce(p -> 'home', '{}'::jsonb), 'la convocatoria local');
  perform private.save_callup(p_id, v_new.away_team_id, coalesce(p -> 'away', '{}'::jsonb), 'la convocatoria visitante');
  select array_agg(player_id order by player_id) into v_after from public.match_players where match_id = p_id and called;

  if v_new.status = 'confirmed' then
    perform private.check_confirmable(p_id);
    if v_new.kickoff_at <> v_old.kickoff_at then
      perform private.skip_match_notifications(p_id);
    end if;
    perform private.enqueue_match_confirmed(p_id);   -- idempotente; sólo avisa a los nuevos
  end if;

  perform private.log_activity('match.update', 'match', p_id::text,
    case when v_before is distinct from v_after then 'Ha modificado la convocatoria y los datos del partido'
         else 'Ha modificado los datos del partido' end,
    private.row_diff(to_jsonb(v_old), to_jsonb(v_new)));
end $$;

create or replace function public.set_match_status(p_id uuid, p_status public.match_status, p_reason text default null, p_new_kickoff timestamptz default null)
returns void language plpgsql security definer
set search_path = ''
as $$
declare
  v_m public.matches%rowtype;
  v_labels jsonb := '{"pending":"pendiente de organizar","confirmed":"confirmado","played":"disputado","postponed":"aplazado","cancelled":"cancelado"}';
begin
  perform private.assert_staff();
  select * into v_m from public.matches where id = p_id for update;
  if not found then raise exception 'Partido no encontrado' using errcode = 'P0002'; end if;
  if p_status = 'played' then
    raise exception 'Para marcar el partido como disputado usa «Finalizar partido»' using errcode = 'P0001';
  end if;
  if v_m.status = 'played' then
    raise exception 'Un partido disputado no puede cambiar de estado' using errcode = 'P0001';
  end if;
  if v_m.status = p_status and p_new_kickoff is null then return; end if;
  if v_m.status = 'cancelled' and not public.is_admin() then
    raise exception 'Sólo el administrador puede reactivar un partido cancelado' using errcode = '42501';
  end if;

  if p_new_kickoff is not null then
    update public.matches set kickoff_at = p_new_kickoff where id = p_id;
  end if;

  if p_status = 'confirmed' then
    perform private.check_confirmable(p_id);
  end if;

  if p_status in ('postponed', 'cancelled') then
    perform private.skip_match_notifications(p_id);
    -- Cualquier voto emitido para una fecha que ya no vale se descarta
    delete from public.mvp_ballots where match_id = p_id;
    delete from public.mvp_vote_receipts where match_id = p_id;
  end if;

  update public.matches set status = p_status, status_reason = nullif(p_reason, ''), updated_by = auth.uid() where id = p_id;

  if p_status = 'confirmed' then
    perform private.enqueue_match_confirmed(p_id);
  end if;

  perform private.log_activity('match.status', 'match', p_id::text,
    'Ha marcado el partido como ' || (v_labels ->> p_status::text) || coalesce(' (' || nullif(p_reason, '') || ')', ''),
    jsonb_build_object('antes', v_m.status, 'despues', p_status, 'motivo', p_reason, 'nueva_fecha', p_new_kickoff));
end $$;

-- ---------------------------------------------------------------------
-- Resultado: núcleo transaccional compartido por «Finalizar partido»,
-- «Editar resultado» y «Partido histórico».
-- p = {
--   home_score, away_score,
--   home: {players:[uuid], guests:[{player_id, brought_by_id}], positions:{}},   -- participantes
--   away: {...},
--   goals: [{team_id, scorer_id, assist_id, conceded_gk_id, minute, is_own_goal}],
--   gk_spells: [{team_id, player_id, start_minute, end_minute}],
--   actual_weather, actual_temp_c, incidents, final_notes,
--   manual_mvp_ids: [uuid]      -- sólo partidos históricos
-- }
-- ---------------------------------------------------------------------
create or replace function private.apply_result(p_id uuid, p jsonb)
returns void language plpgsql security definer
set search_path = ''
as $$
declare
  v_m public.matches%rowtype;
  v_size int := coalesce((public.setting('players_per_side') #>> '{}')::int, 7);
  v_home_ids uuid[];
  v_away_ids uuid[];
  v_side text;
  v_team uuid;
  v_ids uuid[];
  v_guest jsonb;
  v_goal jsonb;
  v_spell jsonb;
  v_seq int := 0;
  v_hg int := 0;
  v_ag int := 0;
  v_scorer uuid; v_assist uuid; v_gk uuid; v_gteam uuid; v_own boolean;
  v_opp uuid;
  v_hist boolean;
  v_known boolean;
begin
  select * into v_m from public.matches where id = p_id for update;
  v_hist := v_m.origin = 'historical';

  if (p ->> 'home_score') is null or (p ->> 'away_score') is null then
    raise exception 'El resultado final es obligatorio' using errcode = 'P0001';
  end if;
  if (p ->> 'home_score')::int < 0 or (p ->> 'away_score')::int < 0 then
    raise exception 'El resultado no puede ser negativo' using errcode = 'P0001';
  end if;

  -- Participantes ------------------------------------------------------
  foreach v_side in array array['home', 'away'] loop
    v_team := case when v_side = 'home' then v_m.home_team_id else v_m.away_team_id end;
    v_ids := private.uuid_array(p -> v_side -> 'players');
    -- jugadores de plantilla del equipo (o que ya jugaron con él en este partido)
    if exists (
      select 1 from unnest(v_ids) x join public.players pl on pl.id = x
      where pl.kind = 'member' and pl.team_id <> v_team
        and not exists (select 1 from public.match_players mp where mp.match_id = p_id and mp.player_id = x and mp.team_id = v_team)
    ) or exists (select 1 from unnest(v_ids) x left join public.players pl on pl.id = x where pl.id is null) then
      raise exception 'Hay participantes que no pertenecen a %', case when v_side = 'home' then 'el equipo local' else 'el equipo visitante' end
        using errcode = 'P0001';
    end if;
    for v_guest in select * from jsonb_array_elements(coalesce(p -> v_side -> 'guests', '[]'::jsonb)) loop
      if not exists (select 1 from public.players where id = (v_guest ->> 'player_id')::uuid and kind = 'guest') then
        raise exception 'Invitado no válido' using errcode = 'P0001';
      end if;
      v_ids := v_ids || (v_guest ->> 'player_id')::uuid;
    end loop;
    if (select count(*) from unnest(v_ids)) <> (select count(distinct x) from unnest(v_ids) x) then
      raise exception 'Hay participantes repetidos' using errcode = 'P0001';
    end if;
    if v_side = 'home' then v_home_ids := v_ids; else v_away_ids := v_ids; end if;
  end loop;

  if v_home_ids && v_away_ids then
    raise exception 'Un jugador no puede participar en los dos equipos' using errcode = 'P0001';
  end if;

  if not v_m.exceptional_lineup then
    if v_hist then
      if cardinality(v_home_ids) > v_size or cardinality(v_away_ids) > v_size then
        raise exception 'Máximo % participantes por equipo', v_size using errcode = 'P0001';
      end if;
    elsif cardinality(v_home_ids) <> v_size or cardinality(v_away_ids) <> v_size then
      raise exception 'Un partido disputado debe tener exactamente % participantes por equipo (ahora % y %)',
        v_size, cardinality(v_home_ids), cardinality(v_away_ids) using errcode = 'P0001';
    end if;
  end if;

  -- Guardar participación conservando la convocatoria
  update public.match_players set participated = false where match_id = p_id;
  foreach v_side in array array['home', 'away'] loop
    v_team := case when v_side = 'home' then v_m.home_team_id else v_m.away_team_id end;
    v_ids := case when v_side = 'home' then v_home_ids else v_away_ids end;
    insert into public.match_players (match_id, player_id, team_id, called, participated, lineup_position, brought_by_id)
    select p_id, x, v_team, false, true,
           nullif(p -> v_side -> 'positions' ->> x::text, '')::public.field_position,
           (select (g ->> 'brought_by_id')::uuid from jsonb_array_elements(coalesce(p -> v_side -> 'guests', '[]'::jsonb)) g
             where (g ->> 'player_id')::uuid = x)
    from unnest(v_ids) x
    on conflict (match_id, player_id) do update
      set participated = true, team_id = excluded.team_id,
          lineup_position = coalesce(excluded.lineup_position, public.match_players.lineup_position),
          brought_by_id = coalesce(excluded.brought_by_id, public.match_players.brought_by_id);
  end loop;
  delete from public.match_players where match_id = p_id and not called and not participated;

  -- Rotación de portería -------------------------------------------------
  delete from public.goalkeeper_spells where match_id = p_id;
  for v_spell in select * from jsonb_array_elements(coalesce(p -> 'gk_spells', '[]'::jsonb)) loop
    v_team := (v_spell ->> 'team_id')::uuid;
    if v_team not in (v_m.home_team_id, v_m.away_team_id) then
      raise exception 'Periodo de portería con equipo no válido' using errcode = 'P0001';
    end if;
    if not ((v_spell ->> 'player_id')::uuid = any(case when v_team = v_m.home_team_id then v_home_ids else v_away_ids end)) then
      raise exception 'El portero de cada periodo debe ser participante de su equipo' using errcode = 'P0001';
    end if;
    insert into public.goalkeeper_spells (match_id, team_id, player_id, seq, start_minute, end_minute)
    values (p_id, v_team, (v_spell ->> 'player_id')::uuid,
      (select count(*) + 1 from public.goalkeeper_spells where match_id = p_id and team_id = v_team),
      nullif(v_spell ->> 'start_minute', '')::smallint, nullif(v_spell ->> 'end_minute', '')::smallint);
  end loop;

  -- Goles --------------------------------------------------------------
  delete from public.goals where match_id = p_id;
  for v_goal in select * from jsonb_array_elements(coalesce(p -> 'goals', '[]'::jsonb)) loop
    v_seq := v_seq + 1;
    v_gteam := (v_goal ->> 'team_id')::uuid;
    v_scorer := nullif(v_goal ->> 'scorer_id', '')::uuid;
    v_assist := nullif(v_goal ->> 'assist_id', '')::uuid;
    v_gk := nullif(v_goal ->> 'conceded_gk_id', '')::uuid;
    v_own := coalesce((v_goal ->> 'is_own_goal')::boolean, false);
    if v_gteam = v_m.home_team_id then v_hg := v_hg + 1; v_opp := v_m.away_team_id;
    elsif v_gteam = v_m.away_team_id then v_ag := v_ag + 1; v_opp := v_m.home_team_id;
    else raise exception 'Gol con equipo no válido' using errcode = 'P0001'; end if;

    v_known := cardinality(case when v_gteam = v_m.home_team_id then v_home_ids else v_away_ids end) > 0;
    if v_scorer is not null then
      if v_own then
        if not (v_scorer = any(case when v_opp = v_m.home_team_id then v_home_ids else v_away_ids end)) then
          raise exception 'El autor de un gol en propia puerta debe ser del equipo rival' using errcode = 'P0001';
        end if;
      elsif v_known and not (v_scorer = any(case when v_gteam = v_m.home_team_id then v_home_ids else v_away_ids end)) then
        raise exception 'Cada goleador debe ser participante de su equipo' using errcode = 'P0001';
      end if;
    end if;
    if v_assist is not null and v_known and not (v_assist = any(case when v_gteam = v_m.home_team_id then v_home_ids else v_away_ids end)) then
      raise exception 'Cada asistente debe ser participante de su equipo' using errcode = 'P0001';
    end if;
    if v_assist is not null and v_assist = v_scorer then
      raise exception 'Nadie se da una asistencia a sí mismo' using errcode = 'P0001';
    end if;
    if v_gk is not null and not (v_gk = any(case when v_opp = v_m.home_team_id then v_home_ids else v_away_ids end)) then
      raise exception 'El portero que encaja el gol debe ser participante del equipo rival' using errcode = 'P0001';
    end if;

    insert into public.goals (match_id, team_id, seq, scorer_id, assist_id, conceded_gk_id, minute, is_own_goal)
    values (p_id, v_gteam, v_seq, v_scorer, case when v_own then null else v_assist end, v_gk,
            nullif(v_goal ->> 'minute', '')::smallint, v_own);
  end loop;

  if v_hg <> (p ->> 'home_score')::int or v_ag <> (p ->> 'away_score')::int then
    raise exception 'Los goles registrados (% - %) no cuadran con el resultado (% - %)',
      v_hg, v_ag, p ->> 'home_score', p ->> 'away_score' using errcode = 'P0001';
  end if;

  -- MVP manual (sólo históricos) ----------------------------------------
  if v_hist then
    delete from public.match_mvps where match_id = p_id;
    insert into public.match_mvps (match_id, player_id, source)
    select p_id, x, 'manual' from unnest(private.uuid_array(p -> 'manual_mvp_ids')) x
    where x = any(v_home_ids || v_away_ids) or cardinality(v_home_ids || v_away_ids) = 0;
  end if;

  update public.matches set
    home_score = (p ->> 'home_score')::smallint,
    away_score = (p ->> 'away_score')::smallint,
    actual_weather = nullif(p ->> 'actual_weather', '')::public.weather_kind,
    actual_temp_c = nullif(p ->> 'actual_temp_c', '')::numeric,
    incidents = nullif(p ->> 'incidents', ''),
    final_notes = nullif(p ->> 'final_notes', ''),
    status = 'played',
    finalized_at = coalesce(finalized_at, now()),
    finalized_by = coalesce(finalized_by, auth.uid()),
    updated_by = auth.uid()
  where id = p_id;

  -- Si la votación ya se cerró, el recuento se rehace con los participantes corregidos
  if v_m.vote_closed_at is not null then
    perform private.tally_votes(p_id);
  end if;
end $$;

create or replace function public.finalize_match(p_id uuid, p jsonb)
returns void language plpgsql security definer
set search_path = ''
as $$
declare v_m public.matches%rowtype; v_was_played boolean;
begin
  perform private.assert_staff();
  select * into v_m from public.matches where id = p_id for update;
  if not found then raise exception 'Partido no encontrado' using errcode = 'P0002'; end if;
  if v_m.status in ('cancelled', 'postponed') then
    raise exception 'No se puede finalizar un partido aplazado o cancelado' using errcode = 'P0001';
  end if;
  if v_m.origin = 'scheduled' and v_m.kickoff_at > now() then
    raise exception 'El partido todavía no ha empezado' using errcode = 'P0001';
  end if;
  v_was_played := v_m.status = 'played';
  perform private.apply_result(p_id, p);
  perform private.log_activity(
    case when v_was_played then 'match.result_edit' else 'match.finalize' end, 'match', p_id::text,
    case when v_was_played then 'Ha corregido el resultado: ' else 'Ha introducido el resultado: ' end
      || (p ->> 'home_score') || '-' || (p ->> 'away_score'),
    jsonb_build_object(
      'antes', case when v_was_played then jsonb_build_object('local', v_m.home_score, 'visitante', v_m.away_score) end,
      'despues', jsonb_build_object('local', (p ->> 'home_score')::int, 'visitante', (p ->> 'away_score')::int),
      'goles', jsonb_array_length(coalesce(p -> 'goals', '[]'::jsonb)),
      'periodos_porteria', jsonb_array_length(coalesce(p -> 'gk_spells', '[]'::jsonb))));
end $$;

create or replace function public.create_historical_match(p jsonb)
returns uuid language plpgsql security definer
set search_path = ''
as $$
declare v_id uuid; v_home uuid := (p ->> 'home_team_id')::uuid; v_away uuid := (p ->> 'away_team_id')::uuid;
begin
  perform private.assert_staff();
  perform private.assert_two_teams(v_home, v_away);
  if (p ->> 'kickoff_at') is null or (p ->> 'kickoff_at')::timestamptz > now() then
    raise exception 'Un partido histórico necesita una fecha pasada' using errcode = 'P0001';
  end if;
  insert into public.matches (kickoff_at, venue_id, home_team_id, away_team_id, status, origin,
    home_formation_id, away_formation_id, notes, vote_enabled, created_by, updated_by, home_score, away_score)
  values ((p ->> 'kickoff_at')::timestamptz, nullif(p ->> 'venue_id', '')::uuid, v_home, v_away, 'played', 'historical',
    nullif(p ->> 'home_formation_id', '')::uuid, nullif(p ->> 'away_formation_id', '')::uuid,
    nullif(p ->> 'notes', ''), false, auth.uid(), auth.uid(), (p ->> 'home_score')::smallint, (p ->> 'away_score')::smallint)
  returning id into v_id;
  perform private.apply_result(v_id, p);
  perform private.log_activity('match.historical', 'match', v_id::text,
    'Ha registrado un partido histórico del ' || private.fmt_day((p ->> 'kickoff_at')::timestamptz) || ': ' || (p ->> 'home_score') || '-' || (p ->> 'away_score'),
    p - 'goals' - 'gk_spells' - 'home' - 'away');
  return v_id;
end $$;

create or replace function public.update_historical_meta(p_id uuid, p jsonb)
returns void language plpgsql security definer
set search_path = ''
as $$
declare v_old public.matches%rowtype; v_new public.matches%rowtype;
begin
  perform private.assert_staff();
  select * into v_old from public.matches where id = p_id for update;
  if not found or v_old.status <> 'played' then raise exception 'Partido no encontrado o no disputado' using errcode = 'P0002'; end if;
  update public.matches set
    kickoff_at = coalesce((p ->> 'kickoff_at')::timestamptz, kickoff_at),
    venue_id = case when p ? 'venue_id' then nullif(p ->> 'venue_id', '')::uuid else venue_id end,
    home_formation_id = case when p ? 'home_formation_id' then nullif(p ->> 'home_formation_id', '')::uuid else home_formation_id end,
    away_formation_id = case when p ? 'away_formation_id' then nullif(p ->> 'away_formation_id', '')::uuid else away_formation_id end,
    notes = case when p ? 'notes' then nullif(p ->> 'notes', '') else notes end,
    updated_by = auth.uid()
  where id = p_id returning * into v_new;
  perform private.log_activity('match.update', 'match', p_id::text, 'Ha corregido los datos generales de un partido disputado',
    private.row_diff(to_jsonb(v_old), to_jsonb(v_new)));
end $$;

create or replace function public.delete_match(p_id uuid)
returns void language plpgsql security definer
set search_path = ''
as $$
declare v_m public.matches%rowtype;
begin
  if not public.is_admin() then raise exception 'Sólo el administrador puede eliminar partidos' using errcode = '42501'; end if;
  select * into v_m from public.matches where id = p_id;
  if not found then return; end if;
  delete from public.matches where id = p_id;
  perform private.log_activity('match.delete', 'match', p_id::text,
    'Ha eliminado el partido del ' || private.fmt_day(v_m.kickoff_at), to_jsonb(v_m));
end $$;

-- ---------------------------------------------------------------------
-- Invitados
-- ---------------------------------------------------------------------
create or replace function public.create_guest(p_name text)
returns uuid language plpgsql security definer
set search_path = ''
as $$
declare v_id uuid; v_name text := trim(p_name);
begin
  perform private.assert_staff();
  if v_name is null or length(v_name) < 2 or length(v_name) > 80 then
    raise exception 'Escribe el nombre del invitado' using errcode = 'P0001';
  end if;
  select id into v_id from public.players where kind = 'guest' and lower(full_name) = lower(v_name) limit 1;
  if v_id is not null then
    update public.players set active = true where id = v_id;
    return v_id;
  end if;
  insert into public.players (kind, full_name) values ('guest', v_name) returning id into v_id;
  return v_id;
end $$;

-- ---------------------------------------------------------------------
-- Votación MVP
-- ---------------------------------------------------------------------
create or replace function private.voter_hash(p_match uuid, p_player uuid)
returns text language sql stable security definer
set search_path = ''
as $$
  select encode(extensions.hmac(p_match::text || ':' || p_player::text, private.cfg('vote_salt'), 'sha256'), 'hex')
$$;

create or replace function public.cast_mvp_vote(p_match uuid, p_first uuid, p_second uuid, p_third uuid)
returns text language plpgsql security definer
set search_path = ''
as $$
declare
  v_player uuid := public.my_player_id();
  v_m public.matches%rowtype;
  v_hash text;
  v_existing boolean;
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
  if not exists (select 1 from public.match_players where match_id = p_match and player_id = v_player and participated) then
    raise exception 'Sólo votan los jugadores que han participado en el partido' using errcode = '42501';
  end if;
  if p_first is null or p_second is null or p_third is null then
    raise exception 'Elige tres jugadores' using errcode = 'P0001';
  end if;
  if p_first = p_second or p_first = p_third or p_second = p_third then
    raise exception 'No puedes repetir jugador' using errcode = 'P0001';
  end if;
  if v_player in (p_first, p_second, p_third) then
    raise exception 'No puedes votarte a ti mismo' using errcode = 'P0001';
  end if;
  if (select count(*) from public.match_players where match_id = p_match and participated and player_id in (p_first, p_second, p_third)) <> 3 then
    raise exception 'Sólo puedes votar a jugadores que han participado' using errcode = 'P0001';
  end if;

  v_hash := private.voter_hash(p_match, v_player);
  select exists (select 1 from public.mvp_ballots where match_id = p_match and voter_hash = v_hash) into v_existing;

  insert into public.mvp_ballots (match_id, voter_hash, first_id, second_id, third_id)
  values (p_match, v_hash, p_first, p_second, p_third)
  on conflict (match_id, voter_hash) do update
    set first_id = excluded.first_id, second_id = excluded.second_id, third_id = excluded.third_id;

  insert into public.mvp_vote_receipts (match_id, player_id, user_id)
  values (p_match, v_player, auth.uid())
  on conflict (match_id, player_id) do update
    set last_voted_at = now(), changes = public.mvp_vote_receipts.changes + 1, user_id = excluded.user_id;

  perform private.log_activity(case when v_existing then 'vote.update' else 'vote.cast' end, 'match', p_match::text,
    case when v_existing then 'Ha modificado su voto MVP' else 'Ha realizado su votación MVP' end, null);
  return case when v_existing then 'updated' else 'created' end;
end $$;

-- Devuelve sólo la papeleta del propio usuario (para que pueda revisarla)
create or replace function public.my_mvp_ballot(p_match uuid)
returns table (first_id uuid, second_id uuid, third_id uuid)
language sql stable security definer
set search_path = ''
as $$
  select b.first_id, b.second_id, b.third_id
  from public.mvp_ballots b
  where b.match_id = p_match
    and public.my_player_id() is not null
    and b.voter_hash = private.voter_hash(p_match, public.my_player_id())
$$;

-- Estado público de la votación (sin revelar contenido)
create or replace function public.vote_status(p_match uuid)
returns table (eligible int, voted int, opens_at timestamptz, closes_at timestamptz, closed_at timestamptz, is_open boolean)
language sql stable security definer
set search_path = ''
as $$
  select
    (select count(*) from public.match_players mp where mp.match_id = m.id and mp.participated)::int,
    (select count(*) from public.mvp_vote_receipts r where r.match_id = m.id)::int,
    m.vote_opens_at, m.vote_closes_at, m.vote_closed_at,
    (m.vote_enabled and m.status in ('confirmed', 'played') and m.vote_closed_at is null
      and now() >= m.vote_opens_at and now() < m.vote_closes_at)
  from public.matches m where m.id = p_match
$$;

-- Recuento: sólo cuenta papeletas de participantes y candidatos participantes.
create or replace function private.tally_votes(p_match uuid)
returns void language plpgsql security definer
set search_path = ''
as $$
declare
  v_pts jsonb := coalesce(public.setting('mvp_points'), '[3,2,1]'::jsonb);
  v_criteria jsonb := coalesce(public.setting('mvp_tiebreak'), '["firsts","seconds","thirds","goal_contributions"]'::jsonb);
  v_fallback text := coalesce(public.setting('mvp_tie_fallback') #>> '{}', 'shared');
  v_crit text;
  v_left int;
begin
  delete from public.mvp_tallies where match_id = p_match;
  delete from public.match_mvps where match_id = p_match and source = 'vote';

  with participants as (
    select player_id from public.match_players where match_id = p_match and participated
  ), valid as (
    select b.* from public.mvp_ballots b
    where b.match_id = p_match
      and b.voter_hash in (select private.voter_hash(p_match, player_id) from participants)
  ), picks as (
    select first_id as player_id, 1 as pos from valid
    union all select second_id, 2 from valid
    union all select third_id, 3 from valid
  ), agg as (
    select p.player_id,
           sum(case pos when 1 then (v_pts ->> 0)::int when 2 then (v_pts ->> 1)::int else (v_pts ->> 2)::int end)::int as points,
           count(*) filter (where pos = 1)::int as firsts,
           count(*) filter (where pos = 2)::int as seconds,
           count(*) filter (where pos = 3)::int as thirds
    from picks p
    where p.player_id in (select player_id from participants)
    group by p.player_id
  )
  insert into public.mvp_tallies (match_id, player_id, points, firsts, seconds, thirds, rank, ballots)
  select p_match, a.player_id, a.points, a.firsts, a.seconds, a.thirds,
         rank() over (order by a.points desc, a.firsts desc, a.seconds desc, a.thirds desc),
         (select count(*) from valid)::int
  from agg a;

  if not exists (select 1 from public.mvp_tallies where match_id = p_match) then return; end if;

  -- Candidatos empatados en puntos y aplicación ordenada de criterios
  create temp table if not exists _mvp_cand (player_id uuid primary key, firsts int, seconds int, thirds int, goal_contributions int) on commit drop;
  delete from _mvp_cand;
  insert into _mvp_cand
  select t.player_id, t.firsts, t.seconds, t.thirds,
         (select count(*) from public.goals g where g.match_id = p_match and ((g.scorer_id = t.player_id and not g.is_own_goal) or g.assist_id = t.player_id))::int
  from public.mvp_tallies t
  where t.match_id = p_match and t.points = (select max(points) from public.mvp_tallies where match_id = p_match);

  for v_crit in select jsonb_array_elements_text(v_criteria) loop
    select count(*) into v_left from _mvp_cand;
    exit when v_left <= 1;
    if v_crit = 'firsts' then delete from _mvp_cand where firsts < (select max(firsts) from _mvp_cand);
    elsif v_crit = 'seconds' then delete from _mvp_cand where seconds < (select max(seconds) from _mvp_cand);
    elsif v_crit = 'thirds' then delete from _mvp_cand where thirds < (select max(thirds) from _mvp_cand);
    elsif v_crit = 'goal_contributions' then delete from _mvp_cand where goal_contributions < (select max(goal_contributions) from _mvp_cand);
    end if;
  end loop;

  select count(*) into v_left from _mvp_cand;
  if v_left = 1 or v_fallback = 'shared' then
    insert into public.match_mvps (match_id, player_id, source, points)
    select p_match, c.player_id, 'vote', t.points
    from _mvp_cand c join public.mvp_tallies t on t.match_id = p_match and t.player_id = c.player_id
    on conflict (match_id, player_id) do update set source = 'vote', points = excluded.points;
  end if;
end $$;

-- Cierre automático. La ejecuta pg_cron cada minuto; también es seguro
-- invocarla desde la app (sólo cierra lo que ya ha vencido).
create or replace function public.close_due_votes()
returns int language plpgsql security definer
set search_path = ''
as $$
declare
  r record;
  v_n int := 0;
  v_mvp text;
  v_parts uuid[];
begin
  for r in
    select id from public.matches
    where vote_enabled and vote_closed_at is null and vote_closes_at <= now()
      and status in ('confirmed', 'played')
    for update skip locked
  loop
    perform private.tally_votes(r.id);
    update public.matches set vote_closed_at = now() where id = r.id;
    v_n := v_n + 1;

    select string_agg(private.player_label(player_id), ' y ') into v_mvp from public.match_mvps where match_id = r.id and source = 'vote';
    perform private.log_activity('vote.close', 'match', r.id::text,
      'Se ha cerrado automáticamente la votación MVP' || coalesce(' · MVP: ' || v_mvp, ' · sin MVP'),
      jsonb_build_object('papeletas', (select count(*) from public.mvp_vote_receipts where match_id = r.id)), true);

    if v_mvp is not null then
      select array_agg(player_id) into v_parts from public.match_players where match_id = r.id and participated;
      perform private.enqueue_for_players('mvp_result', r.id, coalesce(v_parts, '{}'), jsonb_build_object('mvp', v_mvp));
    end if;
  end loop;
  return v_n;
end $$;

-- Recordatorios configurables (antelación en minutos)
create or replace function private.enqueue_due_reminders()
returns int language plpgsql security definer
set search_path = ''
as $$
declare r record; v_lead int; v_total int := 0; v_called uuid[];
begin
  if not exists (select 1 from public.notification_types where type = 'match_reminder' and enabled) then return 0; end if;
  for r in select id, kickoff_at from public.matches where status = 'confirmed' and kickoff_at > now() and kickoff_at < now() + interval '8 days' loop
    foreach v_lead in array (select lead_minutes from public.notification_types where type = 'match_reminder') loop
      if now() >= r.kickoff_at - make_interval(mins => v_lead) then
        select array_agg(player_id) into v_called from public.match_players where match_id = r.id and called;
        v_total := v_total + private.enqueue_for_players('match_reminder', r.id, coalesce(v_called, '{}'),
          jsonb_build_object('antelacion', case when v_lead >= 60 then (v_lead / 60) || ' h' else v_lead || ' min' end),
          now(), ':' || v_lead);
      end if;
    end loop;
  end loop;
  return v_total;
end $$;

-- ---------------------------------------------------------------------
-- Despachador de notificaciones (lo llama /api/notifications/dispatch
-- con el secreto compartido; no requiere service role key).
-- ---------------------------------------------------------------------
create or replace function public.claim_notifications(p_secret text, p_limit int default 100)
returns table (notification_id uuid, user_id uuid, title text, body text, url text, type text,
               subscription_id uuid, endpoint text, p256dh text, auth text)
language plpgsql security definer
set search_path = ''
as $$
begin
  if p_secret is null or p_secret <> private.cfg('dispatch_secret') then
    raise exception 'No autorizado' using errcode = '42501';
  end if;

  -- Descartar avisos cuyo partido ya no está en un estado válido
  update public.notifications n set status = 'skipped', error = 'Estado del partido no válido para este aviso'
  where n.status = 'pending' and n.scheduled_for <= now() and n.match_id is not null
    and exists (select 1 from public.matches m where m.id = n.match_id and (
      m.status in ('cancelled', 'postponed')
      or (n.type in ('match_confirmed', 'match_reminder', 'vote_open') and m.kickoff_at is distinct from n.kickoff_snapshot)
      or (n.type = 'match_reminder' and m.kickoff_at <= now())
      or (n.type = 'match_confirmed' and m.status not in ('confirmed', 'played'))));

  return query
  with claimed as (
    update public.notifications n set status = 'sending', attempts = n.attempts + 1
    where n.id in (
      select id from public.notifications
      where status = 'pending' and scheduled_for <= now()
      order by scheduled_for limit p_limit for update skip locked)
    returning n.*
  )
  select c.id, c.user_id, c.title, c.body, c.url, c.type, s.id, s.endpoint, s.p256dh, s.auth
  from claimed c
  left join public.push_subscriptions s on s.user_id = c.user_id;
end $$;

-- p_results: [{notification_id, ok, error, dead_subscription_ids:[uuid]}]
create or replace function public.report_notifications(p_secret text, p_results jsonb)
returns void language plpgsql security definer
set search_path = ''
as $$
declare r jsonb;
begin
  if p_secret is null or p_secret <> private.cfg('dispatch_secret') then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  for r in select * from jsonb_array_elements(p_results) loop
    update public.notifications set
      status = case when (r ->> 'ok')::boolean then 'sent' when attempts >= 3 then 'failed' else 'pending' end,
      sent_at = case when (r ->> 'ok')::boolean then now() end,
      error = r ->> 'error'
    where id = (r ->> 'notification_id')::uuid;
    delete from public.push_subscriptions where id = any(private.uuid_array(r -> 'dead_subscription_ids'));
    update public.push_subscriptions set last_used_at = now()
    where id = any(private.uuid_array(r -> 'ok_subscription_ids'));
  end loop;
end $$;

create or replace function public.run_scheduled_jobs()
returns jsonb language plpgsql security definer
set search_path = ''
as $$
declare v_closed int; v_rem int;
begin
  v_closed := public.close_due_votes();
  v_rem := private.enqueue_due_reminders();
  return jsonb_build_object('closed_votes', v_closed, 'reminders', v_rem,
    'pending', (select count(*) from public.notifications where status = 'pending' and scheduled_for <= now()));
end $$;

-- ---------------------------------------------------------------------
-- Registro y vinculación de cuentas
-- ---------------------------------------------------------------------
create or replace function public.link_candidates(p_team uuid)
returns table (id uuid, full_name text, nickname text, usual_position public.field_position, pending_requests int)
language sql stable security definer
set search_path = ''
as $$
  select pl.id, pl.full_name, pl.nickname, pl.usual_position,
         (select count(*) from public.player_links l where l.player_id = pl.id and l.status = 'pending')::int
  from public.players pl
  where pl.team_id = p_team and pl.kind = 'member' and pl.active
    and not exists (select 1 from public.profiles pr where pr.player_id = pl.id)
    and auth.uid() is not null
  order by pl.full_name
$$;

create or replace function public.request_player_link(p_player uuid, p_nickname text)
returns uuid language plpgsql security definer
set search_path = ''
as $$
declare v_id uuid; v_nick text := nullif(trim(p_nickname), '');
begin
  if auth.uid() is null then raise exception 'Necesitas iniciar sesión' using errcode = '42501'; end if;
  if exists (select 1 from public.profiles where id = auth.uid() and status = 'suspended') then
    raise exception 'Tu cuenta está suspendida' using errcode = '42501';
  end if;
  if exists (select 1 from public.profiles where id = auth.uid() and player_id is not null) then
    raise exception 'Tu cuenta ya está vinculada a un jugador' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.players where id = p_player and kind = 'member' and active) then
    raise exception 'Jugador no disponible' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.profiles where player_id = p_player) then
    raise exception 'Ese jugador ya está vinculado a otra cuenta' using errcode = 'P0001';
  end if;
  if v_nick is null or length(v_nick) > 30 then
    raise exception 'Escribe un apodo de hasta 30 caracteres' using errcode = 'P0001';
  end if;
  update public.player_links set status = 'revoked', review_note = 'Sustituida por otra solicitud'
  where user_id = auth.uid() and status = 'pending';
  insert into public.player_links (user_id, player_id, requested_nickname) values (auth.uid(), p_player, v_nick) returning id into v_id;
  perform private.log_activity('link.request', 'player', p_player::text,
    'Ha solicitado vincularse a ' || private.player_label(p_player), jsonb_build_object('apodo', v_nick));
  return v_id;
end $$;

create or replace function public.cancel_my_link_request()
returns void language sql security definer
set search_path = ''
as $$
  update public.player_links set status = 'revoked', review_note = 'Cancelada por el usuario'
  where user_id = auth.uid() and status = 'pending'
$$;

create or replace function public.review_player_link(p_link uuid, p_approve boolean, p_note text default null)
returns void language plpgsql security definer
set search_path = ''
as $$
declare v_l public.player_links%rowtype; v_team uuid;
begin
  select * into v_l from public.player_links where id = p_link for update;
  if not found or v_l.status <> 'pending' then raise exception 'Solicitud no encontrada o ya revisada' using errcode = 'P0002'; end if;
  select team_id into v_team from public.players where id = v_l.player_id;
  if not (public.is_admin() or (public.my_role() = 'organizer' and public.my_team_id() = v_team)) then
    raise exception 'Sólo el administrador o un organizador del equipo puede validar esta solicitud' using errcode = '42501';
  end if;
  if p_approve then
    if exists (select 1 from public.profiles where player_id = v_l.player_id) then
      raise exception 'Ese jugador ya está vinculado a otra cuenta' using errcode = 'P0001';
    end if;
    update public.profiles set player_id = v_l.player_id where id = v_l.user_id;
    if v_l.requested_nickname is not null then
      update public.players set nickname = v_l.requested_nickname where id = v_l.player_id;
    end if;
    update public.player_links set status = 'approved', reviewed_by = auth.uid(), reviewed_at = now(), review_note = p_note where id = p_link;
    update public.player_links set status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now(), review_note = 'Jugador asignado a otra cuenta'
      where player_id = v_l.player_id and status = 'pending';
  else
    update public.player_links set status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now(), review_note = p_note where id = p_link;
  end if;
  perform private.log_activity(case when p_approve then 'link.approve' else 'link.reject' end, 'player', v_l.player_id::text,
    case when p_approve then 'Ha aprobado' else 'Ha rechazado' end || ' la vinculación de ' || private.player_label(v_l.player_id),
    jsonb_build_object('usuario', v_l.user_id, 'nota', p_note));
end $$;

create or replace function public.pending_link_requests()
returns table (link_id uuid, user_id uuid, display_name text, email text, auth_provider text,
               player_id uuid, player_name text, team_id uuid, requested_nickname text, created_at timestamptz)
language sql stable security definer
set search_path = ''
as $$
  select l.id, l.user_id, pr.display_name, pr.email, pr.auth_provider, l.player_id, pl.full_name, pl.team_id, l.requested_nickname, l.created_at
  from public.player_links l
  join public.profiles pr on pr.id = l.user_id
  join public.players pl on pl.id = l.player_id
  where l.status = 'pending'
    and (public.is_admin() or (public.my_role() = 'organizer' and pl.team_id = public.my_team_id()))
  order by l.created_at
$$;

create or replace function public.admin_unlink_player(p_user uuid)
returns void language plpgsql security definer
set search_path = ''
as $$
declare v_player uuid;
begin
  if not public.is_admin() then raise exception 'Sólo el administrador' using errcode = '42501'; end if;
  select player_id into v_player from public.profiles where id = p_user;
  if exists (select 1 from public.profiles where id = p_user and role = 'organizer') then
    update public.profiles set role = 'player' where id = p_user;
  end if;
  update public.profiles set player_id = null where id = p_user;
  update public.player_links set status = 'revoked', reviewed_by = auth.uid(), reviewed_at = now()
    where user_id = p_user and status = 'approved';
  perform private.log_activity('link.revoke', 'profile', p_user::text, 'Ha desvinculado una cuenta de su jugador',
    jsonb_build_object('jugador', v_player));
end $$;

create or replace function public.admin_link_player(p_user uuid, p_player uuid)
returns void language plpgsql security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'Sólo el administrador' using errcode = '42501'; end if;
  if exists (select 1 from public.profiles where player_id = p_player and id <> p_user) then
    raise exception 'Ese jugador ya está vinculado a otra cuenta' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.players where id = p_player and kind = 'member') then
    raise exception 'Jugador no válido' using errcode = 'P0001';
  end if;
  update public.player_links set status = 'revoked' where user_id = p_user and status in ('pending', 'approved');
  update public.profiles set player_id = p_player where id = p_user;
  insert into public.player_links (user_id, player_id, status, reviewed_by, reviewed_at, review_note)
  values (p_user, p_player, 'approved', auth.uid(), now(), 'Asociada por el administrador');
  update public.player_links set status = 'rejected', review_note = 'Jugador asignado a otra cuenta'
    where player_id = p_player and status = 'pending';
  perform private.log_activity('link.admin', 'player', p_player::text,
    'Ha asociado una cuenta a ' || private.player_label(p_player), jsonb_build_object('usuario', p_user));
end $$;

-- ---------------------------------------------------------------------
-- Perfil propio
-- ---------------------------------------------------------------------
create or replace function public.update_my_nickname(p_nickname text)
returns void language plpgsql security definer
set search_path = ''
as $$
declare v_player uuid := public.my_player_id(); v_nick text := nullif(trim(p_nickname), ''); v_old text;
begin
  if v_player is null then raise exception 'Tu cuenta aún no está vinculada a un jugador' using errcode = '42501'; end if;
  if v_nick is not null and length(v_nick) > 30 then raise exception 'Máximo 30 caracteres' using errcode = 'P0001'; end if;
  select nickname into v_old from public.players where id = v_player;
  update public.players set nickname = v_nick where id = v_player;
  -- (el trigger de auditoría ya registra el cambio con antes/después)
end $$;

create or replace function public.update_my_notification_prefs(p_prefs jsonb)
returns void language plpgsql security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Necesitas iniciar sesión' using errcode = '42501'; end if;
  update public.profiles
     set notification_prefs = (
       select jsonb_object_agg(k, coalesce((p_prefs ->> k)::boolean, (notification_prefs ->> k)::boolean, true))
       from unnest(array['match_confirmed', 'match_reminder', 'vote_open', 'mvp_result']) k)
   where id = auth.uid();
end $$;

create or replace function public.touch_last_seen()
returns void language sql security definer
set search_path = ''
as $$ update public.profiles set last_seen_at = now() where id = auth.uid() and (last_seen_at is null or last_seen_at < now() - interval '10 minutes') $$;

-- ---------------------------------------------------------------------
-- Administración de usuarios y permisos
-- ---------------------------------------------------------------------
create or replace function public.admin_list_users()
returns table (id uuid, email text, display_name text, auth_provider text, role public.app_role, status public.account_status,
               player_id uuid, player_name text, team_id uuid, created_at timestamptz, last_seen_at timestamptz)
language sql stable security definer
set search_path = ''
as $$
  select p.id, p.email, p.display_name, p.auth_provider, p.role, p.status, p.player_id, pl.full_name, pl.team_id, p.created_at, p.last_seen_at
  from public.profiles p left join public.players pl on pl.id = p.player_id
  where public.is_admin()
  order by p.created_at desc
$$;

create or replace function public.set_user_role(p_user uuid, p_role public.app_role)
returns void language plpgsql security definer
set search_path = ''
as $$
declare v_old public.app_role; v_team uuid; v_count int;
begin
  if not public.is_admin() then raise exception 'Sólo el administrador puede gestionar permisos' using errcode = '42501'; end if;
  if p_user = auth.uid() then raise exception 'No puedes cambiar tu propio rol' using errcode = 'P0001'; end if;
  if p_role = 'admin' then raise exception 'Sólo existe un administrador principal' using errcode = 'P0001'; end if;
  select role into v_old from public.profiles where id = p_user;
  if not found then raise exception 'Usuario no encontrado' using errcode = 'P0002'; end if;
  if p_role = 'organizer' then
    select pl.team_id into v_team from public.profiles p join public.players pl on pl.id = p.player_id where p.id = p_user;
    if v_team is null then raise exception 'Un organizador debe estar vinculado a un jugador de su equipo' using errcode = 'P0001'; end if;
    select count(*) into v_count from public.profiles p join public.players pl on pl.id = p.player_id
      where p.role = 'organizer' and pl.team_id = v_team and p.id <> p_user;
    if v_count >= coalesce((public.setting('organizers_per_team') #>> '{}')::int, 2) then
      raise exception 'Ese equipo ya tiene el máximo de organizadores' using errcode = 'P0001';
    end if;
  end if;
  update public.profiles set role = p_role where id = p_user;
  perform private.log_activity('user.role', 'profile', p_user::text,
    'Ha cambiado el rol de ' || coalesce(private.actor_name(p_user), 'un usuario') || ' a ' || p_role::text,
    jsonb_build_object('antes', v_old, 'despues', p_role));
end $$;

create or replace function public.set_user_status(p_user uuid, p_status public.account_status)
returns void language plpgsql security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'Sólo el administrador' using errcode = '42501'; end if;
  if p_user = auth.uid() then raise exception 'No puedes suspender tu propia cuenta' using errcode = 'P0001'; end if;
  update public.profiles set status = p_status where id = p_user;
  perform private.log_activity('user.status', 'profile', p_user::text,
    case when p_status = 'suspended' then 'Ha suspendido a ' else 'Ha reactivado a ' end || coalesce(private.actor_name(p_user), 'un usuario'), null);
end $$;

-- Auditoría de votación sin contenido de papeletas
create or replace function public.vote_receipts(p_match uuid)
returns table (player_id uuid, player_name text, first_voted_at timestamptz, last_voted_at timestamptz, changes int)
language sql stable security definer
set search_path = ''
as $$
  select r.player_id, private.player_label(r.player_id), r.first_voted_at, r.last_voted_at, r.changes
  from public.mvp_vote_receipts r
  where r.match_id = p_match and public.is_staff()
  order by r.first_voted_at
$$;

-- ---------------------------------------------------------------------
-- Ponderaciones del modelo
-- ---------------------------------------------------------------------
create or replace function private.validate_weights(p_weights jsonb, p_enabled jsonb)
returns void language plpgsql immutable
set search_path = ''
as $$
declare v_sum numeric; v_keys text[] := array['composition_teammates','composition_rivals','venue_history','recent_form','recent_venue','weather','time_slot'];
begin
  if exists (select 1 from unnest(v_keys) k where not (p_weights ? k) or (p_weights ->> k)::numeric < 0) then
    raise exception 'Faltan pesos o hay valores negativos' using errcode = 'P0001';
  end if;
  select coalesce(sum((p_weights ->> k)::numeric), 0) into v_sum
  from unnest(v_keys) k where coalesce((p_enabled ->> k)::boolean, true);
  if abs(v_sum - 100) > 0.001 then
    raise exception 'Los pesos activos deben sumar 100 %% (ahora suman % %%)', round(v_sum, 2) using errcode = 'P0001';
  end if;
end $$;

create or replace function public.save_prediction_config(p_id uuid, p_name text, p_scope text, p_weights jsonb, p_enabled jsonb, p_activate boolean, p_notes text default null)
returns uuid language plpgsql security definer
set search_path = ''
as $$
declare v_id uuid := p_id;
begin
  if not public.is_admin() then raise exception 'Sólo el administrador' using errcode = '42501'; end if;
  perform private.validate_weights(p_weights, p_enabled);
  if v_id is null then
    insert into public.prediction_configs (name, scope, weights, enabled, notes, created_by)
    values (coalesce(nullif(trim(p_name), ''), 'Configuración'), p_scope, p_weights, p_enabled, p_notes, auth.uid())
    returning id into v_id;
  else
    if exists (select 1 from public.prediction_configs where id = v_id and is_system) then
      raise exception 'Los valores originales no se modifican: guarda una copia' using errcode = 'P0001';
    end if;
    update public.prediction_configs set name = coalesce(nullif(trim(p_name), ''), name), weights = p_weights,
      enabled = p_enabled, notes = p_notes where id = v_id;
  end if;
  if p_activate then perform public.activate_prediction_config(v_id); end if;
  return v_id;
end $$;

create or replace function public.activate_prediction_config(p_id uuid)
returns void language plpgsql security definer
set search_path = ''
as $$
declare v_scope text;
begin
  if not public.is_admin() then raise exception 'Sólo el administrador' using errcode = '42501'; end if;
  select scope into v_scope from public.prediction_configs where id = p_id;
  if v_scope is null then raise exception 'Configuración no encontrada' using errcode = 'P0002'; end if;
  update public.prediction_configs set is_active = false where scope = v_scope and is_active and id <> p_id;
  update public.prediction_configs set is_active = true where id = p_id;
end $$;

-- Recalcular: rehace los recuentos de todas las votaciones cerradas
create or replace function public.admin_recalculate()
returns jsonb language plpgsql security definer
set search_path = ''
as $$
declare r record; v_n int := 0;
begin
  if not public.is_admin() then raise exception 'Sólo el administrador' using errcode = '42501'; end if;
  for r in select id from public.matches where vote_closed_at is not null loop
    perform private.tally_votes(r.id); v_n := v_n + 1;
  end loop;
  perform private.log_activity('stats.recalculate', 'system', null, 'Ha recalculado estadísticas y recuentos MVP', jsonb_build_object('votaciones', v_n));
  return jsonb_build_object('votaciones_recontadas', v_n);
end $$;

-- Elimina todos los datos de demostración
create or replace function public.admin_purge_demo_data()
returns jsonb language plpgsql security definer
set search_path = ''
as $$
declare v_m int; v_p int; v_v int;
begin
  if not public.is_admin() then raise exception 'Sólo el administrador' using errcode = '42501'; end if;
  delete from public.matches where is_demo; get diagnostics v_m = row_count;
  update public.profiles set player_id = null where player_id in (select id from public.players where is_demo);
  delete from public.players where is_demo; get diagnostics v_p = row_count;
  delete from public.venues where is_demo; get diagnostics v_v = row_count;
  perform private.log_activity('demo.purge', 'system', null, 'Ha eliminado los datos de demostración',
    jsonb_build_object('partidos', v_m, 'jugadores', v_p, 'estadios', v_v));
  return jsonb_build_object('partidos', v_m, 'jugadores', v_p, 'estadios', v_v);
end $$;

-- ---------------------------------------------------------------------
-- Confirmación de asistencia por parte del convocado
-- ---------------------------------------------------------------------
create or replace function public.set_my_attendance(p_match uuid, p_going boolean)
returns void language plpgsql security definer
set search_path = ''
as $$
declare v_player uuid := public.my_player_id(); v_m public.matches%rowtype;
begin
  if v_player is null then raise exception 'Tu cuenta aún no está vinculada a un jugador' using errcode = '42501'; end if;
  select * into v_m from public.matches where id = p_match;
  if not found or v_m.status not in ('pending', 'confirmed') or v_m.kickoff_at <= now() then
    raise exception 'Ya no se puede confirmar asistencia a este partido' using errcode = 'P0001';
  end if;
  update public.match_players set attendance = case when p_going then 'yes' else 'no' end, attendance_at = now()
  where match_id = p_match and player_id = v_player and called;
  if not found then raise exception 'No estás convocado a este partido' using errcode = 'P0001'; end if;
  perform private.log_activity('match.attendance', 'match', p_match::text,
    case when p_going then 'Ha confirmado su participación' else 'Ha avisado de que no puede ir' end, null);
end $$;
