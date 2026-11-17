-- =====================================================================
-- 0030 · Color de camiseta de cada equipo en cada partido
--   · matches.home_shirt / away_shirt (texto libre: «blanco», «peto naranja»…)
--   · El aviso de 2 h antes dice a cada jugador de qué color va: {{color}} / {{color_linea}}
-- =====================================================================
alter table public.matches
  add column if not exists home_shirt text check (home_shirt is null or char_length(home_shirt) between 1 and 30),
  add column if not exists away_shirt text check (away_shirt is null or char_length(away_shirt) between 1 and 30);

create or replace function public.set_match_shirts(p_match uuid, p_home text, p_away text)
returns void language plpgsql security definer
set search_path = ''
as $$
declare v_old public.matches%rowtype; v_home text := nullif(trim(p_home), ''); v_away text := nullif(trim(p_away), '');
begin
  perform private.assert_staff();
  select * into v_old from public.matches where id = p_match for update;
  if not found then raise exception 'Partido no encontrado' using errcode = 'P0002'; end if;
  if char_length(v_home) > 30 or char_length(v_away) > 30 then
    raise exception 'El color es demasiado largo' using errcode = 'P0001';
  end if;
  if v_old.home_shirt is not distinct from v_home and v_old.away_shirt is not distinct from v_away then return; end if;
  update public.matches set home_shirt = v_home, away_shirt = v_away where id = p_match;
  perform private.log_activity('match.shirts', 'match', p_match::text, 'Ha puesto el color de cada equipo',
    jsonb_build_object('local', v_home, 'visitante', v_away));
end $$;
revoke all on function public.set_match_shirts(uuid, text, text) from public, anon;
grant execute on function public.set_match_shirts(uuid, text, text) to authenticated;

-- Variables propias de cada destinatario: el color con el que juega su equipo
create or replace function private.player_vars(p_match uuid, p_player uuid)
returns jsonb language sql stable security definer
set search_path = ''
as $$
  select coalesce((
    select jsonb_build_object(
      'color', coalesce(c, ''),
      'color_linea', case when c is null then '' else 'Hoy vas de ' || lower(c) || '. ' end)
    from (
      select case when mp.team_id = m.home_team_id then m.home_shirt else m.away_shirt end c
      from public.matches m join public.match_players mp on mp.match_id = m.id and mp.player_id = p_player
      where m.id = p_match
    ) x
  ), '{"color": "", "color_linea": ""}'::jsonb)
$$;
revoke all on function private.player_vars(uuid, uuid) from public;

update public.notification_types
   set body_template = 'Quedan {{antelacion}} para que ruede el balón en {{estadio}}. {{color_linea}}Que no se te olviden las botas.',
       description = coalesce(description, '') || ' Variables: {{color}}, {{color_linea}} («Hoy vas de blanco. »).'
 where type = 'reminder_kickoff';
update public.notification_types
   set body_template = 'Estás convocado para {{partido}} hoy a las {{hora}} en {{estadio}} y aún no has dicho si vas. {{color_linea}}Entra y confírmalo.',
       description = coalesce(description, '') || ' Variables: {{color}}, {{color_linea}} («Hoy vas de blanco. »).'
 where type = 'reminder_confirm';

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
  v_pref text := case when p_type in ('reminder_confirm', 'reminder_kickoff', 'payment_reminder', 'payment_overdue') then 'match_reminder'
                       when p_type = 'vote_reminder' then 'vote_open' else p_type end;
begin
  select * into v_type from public.notification_types where type = p_type;
  if not found or not v_type.enabled then return 0; end if;
  select kickoff_at into v_kick from public.matches where id = p_match;
  if p_type in ('match_confirmed', 'match_reminder', 'reminder_confirm', 'reminder_kickoff') and v_kick is not null and v_kick <= now() then return 0; end if;
  if p_type in ('vote_open', 'vote_reminder') and exists (select 1 from public.matches m where m.id = p_match
       and (m.vote_closed_at is not null or m.vote_closes_at <= now())) then return 0; end if;
  v_vars := coalesce(private.match_vars(p_match), '{}'::jsonb) || coalesce(p_extra, '{}'::jsonb);

  insert into public.notifications (type, user_id, match_id, kickoff_snapshot, title, body, url, dedupe_key, scheduled_for)
  select p_type, pr.id, p_match, v_kick,
         private.render_template(v_type.title_template, v_vars || private.player_vars(p_match, pr.player_id)),
         private.render_template(v_type.body_template, v_vars || private.player_vars(p_match, pr.player_id)),
         case when p_type in ('vote_open', 'vote_reminder', 'mvp_result') then '/votacion/' || p_match else '/partidos/' || p_match end,
         p_type || ':' || p_match || ':' || pr.id || ':' || extract(epoch from v_kick)::bigint || p_dedupe_suffix,
         p_scheduled
  from public.profiles pr
  where pr.player_id = any(p_players)
    and pr.status = 'active'
    and coalesce((pr.notification_prefs ->> v_pref)::boolean, true)
  on conflict (dedupe_key) do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end $$;

