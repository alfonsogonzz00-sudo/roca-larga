-- =====================================================================
-- 0017 · Avisos: no enviar los de partidos pasados; aviso de prueba
-- =====================================================================
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
  -- Nada de avisos a destiempo: ni convocatorias/recordatorios de partidos ya empezados
  -- ni aperturas de votación que ya han cerrado (p. ej., al dar de alta un partido pasado)
  if p_type in ('match_confirmed', 'match_reminder') and v_kick is not null and v_kick <= now() then return 0; end if;
  if p_type = 'vote_open' and exists (select 1 from public.matches m where m.id = p_match
       and (m.vote_closed_at is not null or m.vote_closes_at <= now())) then return 0; end if;
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

insert into public.notification_types (type, label, enabled, title_template, body_template, lead_minutes, description)
values ('test', 'Aviso de prueba', true, 'Roca Larga', 'Los avisos funcionan en este dispositivo. Ya no tienes excusa para faltar.', '{}',
        'Lo envía cada usuario desde Perfil para comprobar que le llegan los avisos.')
on conflict (type) do nothing;

-- Aviso de prueba para uno mismo (máx. 1 por minuto). Devuelve cuántos dispositivos tiene suscritos.
create or replace function public.send_test_notification()
returns int language plpgsql security definer
set search_path = ''
as $$
declare v_uid uuid := auth.uid(); v_t public.notification_types%rowtype;
begin
  if v_uid is null then raise exception 'Necesitas iniciar sesión' using errcode = '42501'; end if;
  select * into v_t from public.notification_types where type = 'test';
  insert into public.notifications (type, user_id, title, body, url, dedupe_key)
  values ('test', v_uid, v_t.title_template, v_t.body_template, '/perfil',
          'test:' || v_uid || ':' || to_char(date_trunc('minute', now()), 'YYYYMMDDHH24MI'))
  on conflict (dedupe_key) do nothing;
  return (select count(*) from public.push_subscriptions where user_id = v_uid)::int;
end $$;
revoke all on function public.send_test_notification() from public;
grant execute on function public.send_test_notification() to authenticated;
