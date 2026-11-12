-- =====================================================================
-- 0023 · Aviso 2 h antes según la asistencia del convocado
--   · Convocado sin responder → «confirma si vas»
--   · Convocado que va        → «quedan 2 horas para que ruede el balón en …»
--   · Convocado que no va     → nada
-- El recordatorio genérico se queda sólo con la antelación de 24 h.
-- =====================================================================
insert into public.notification_types (type, label, enabled, title_template, body_template, lead_minutes, description) values
  ('reminder_confirm', 'Recordatorio: confirma asistencia', true, '¿Vienes o no vienes?',
   'Estás convocado para {{partido}} hoy a las {{hora}} en {{estadio}} y aún no has dicho si vas. Entra y confírmalo.',
   '{120}', 'A los convocados que aún no han confirmado si van, con la antelación indicada (minutos).'),
  ('reminder_kickoff', 'Recordatorio: hoy juegas', true, 'Hoy hay partido ⚽',
   'Quedan {{antelacion}} para que ruede el balón en {{estadio}}. Que no se te olviden las botas.',
   '{120}', 'A los convocados que han confirmado que van, con la antelación indicada (minutos).')
on conflict (type) do nothing;

update public.notification_types set lead_minutes = array_remove(lead_minutes, 120) where type = 'match_reminder';

create or replace function private.fmt_lead(p_min int)
returns text language sql immutable set search_path = ''
as $$ select case when p_min % 60 = 0 then (p_min / 60) || case when p_min = 60 then ' hora' else ' horas' end
                  else p_min || ' minutos' end $$;
revoke all on function private.fmt_lead(int) from public, anon, authenticated;

-- Preferencias: estos dos avisos se rigen por la casilla «Recordatorios antes del partido»
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
  v_pref text := case when p_type in ('reminder_confirm', 'reminder_kickoff') then 'match_reminder' else p_type end;
begin
  select * into v_type from public.notification_types where type = p_type;
  if not found or not v_type.enabled then return 0; end if;
  select kickoff_at into v_kick from public.matches where id = p_match;
  if p_type in ('match_confirmed', 'match_reminder', 'reminder_confirm', 'reminder_kickoff') and v_kick is not null and v_kick <= now() then return 0; end if;
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
    and coalesce((pr.notification_prefs ->> v_pref)::boolean, true)
  on conflict (dedupe_key) do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end $$;

create or replace function private.enqueue_due_reminders()
returns int language plpgsql security definer
set search_path = ''
as $$
declare r record; v_lead int; v_total int := 0; v_ids uuid[];
begin
  for r in select id, kickoff_at from public.matches where status = 'confirmed' and kickoff_at > now() and kickoff_at < now() + interval '8 days' loop
    -- Recordatorio genérico (todas las antelaciones configuradas)
    if exists (select 1 from public.notification_types where type = 'match_reminder' and enabled) then
      foreach v_lead in array (select lead_minutes from public.notification_types where type = 'match_reminder') loop
        if now() >= r.kickoff_at - make_interval(mins => v_lead) then
          select array_agg(player_id) into v_ids from public.match_players where match_id = r.id and called;
          v_total := v_total + private.enqueue_for_players('match_reminder', r.id, coalesce(v_ids, '{}'),
            jsonb_build_object('antelacion', case when v_lead >= 60 then (v_lead / 60) || ' h' else v_lead || ' min' end),
            now(), ':' || v_lead);
        end if;
      end loop;
    end if;
    -- Según asistencia: sólo dentro de los 15 min siguientes al momento del aviso
    -- (quien confirma más tarde no recibe un «quedan 2 horas» que ya no es verdad)
    foreach v_lead in array coalesce((select lead_minutes from public.notification_types where type = 'reminder_confirm' and enabled), '{}') loop
      if now() >= r.kickoff_at - make_interval(mins => v_lead) and now() < r.kickoff_at - make_interval(mins => v_lead) + interval '15 minutes' then
        select array_agg(player_id) into v_ids from public.match_players where match_id = r.id and called and attendance = 'pending';
        v_total := v_total + private.enqueue_for_players('reminder_confirm', r.id, coalesce(v_ids, '{}'),
          jsonb_build_object('antelacion', private.fmt_lead(v_lead)), now(), ':' || v_lead);
      end if;
    end loop;
    foreach v_lead in array coalesce((select lead_minutes from public.notification_types where type = 'reminder_kickoff' and enabled), '{}') loop
      if now() >= r.kickoff_at - make_interval(mins => v_lead) and now() < r.kickoff_at - make_interval(mins => v_lead) + interval '15 minutes' then
        select array_agg(player_id) into v_ids from public.match_players where match_id = r.id and called and attendance = 'yes';
        v_total := v_total + private.enqueue_for_players('reminder_kickoff', r.id, coalesce(v_ids, '{}'),
          jsonb_build_object('antelacion', private.fmt_lead(v_lead)), now(), ':' || v_lead);
      end if;
    end loop;
  end loop;
  return v_total;
end $$;

