-- =====================================================================
-- 0027 · Recordatorio de pago: al día siguiente de cada partido a las 12:00,
--        «No seas moroso» / «Recuerda pagar el partido de ayer al capitán de tu equipo».
--        Lo reciben los que jugaron, menos quien pagó el campo.
-- =====================================================================
insert into public.app_settings (key, value, description) values
  ('payment_reminder_time', '"12:00"', 'Hora (de la app) del aviso de pago el día siguiente al partido')
on conflict (key) do nothing;

insert into public.notification_types (type, label, enabled, title_template, body_template, lead_minutes, description) values
  ('payment_reminder', 'Recordatorio: pagar el partido', true, 'No seas moroso',
   'Recuerda pagar el partido de ayer al capitán de tu equipo.',
   '{}', 'Al día siguiente de cada partido, a las 12:00, a los que jugaron (menos quien pagó el campo).')
on conflict (type) do nothing;

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
  v_pref text := case when p_type in ('reminder_confirm', 'reminder_kickoff', 'payment_reminder') then 'match_reminder'
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
         private.render_template(v_type.title_template, v_vars),
         private.render_template(v_type.body_template, v_vars),
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
  -- Recordatorio de votación (por defecto 2 h antes del cierre) sólo a participantes que aún no han votado
  foreach v_lead in array coalesce((select lead_minutes from public.notification_types where type = 'vote_reminder' and enabled), '{}') loop
    for r in select m.id, m.vote_closes_at from public.matches m
             where m.vote_enabled and m.status in ('confirmed', 'played') and m.vote_closed_at is null
               and now() >= m.vote_closes_at - make_interval(mins => v_lead)
               and now() < m.vote_closes_at - make_interval(mins => v_lead) + interval '15 minutes'
               and now() >= m.vote_opens_at loop
      select array_agg(mp.player_id) into v_ids from public.match_players mp
       where mp.match_id = r.id and mp.participated
         and not exists (select 1 from public.mvp_vote_receipts v where v.match_id = r.id and v.player_id = mp.player_id);
      v_total := v_total + private.enqueue_for_players('vote_reminder', r.id, coalesce(v_ids, '{}'),
        jsonb_build_object('antelacion', case when v_lead % 60 = 0 then (v_lead / 60) || 'h' else v_lead || ' min' end), now(), ':' || v_lead);
    end loop;
  end loop;
  -- Al día siguiente del partido, a la hora configurada (12:00), «No seas moroso»
  -- a quien jugó, salvo a quien pagó el campo
  if exists (select 1 from public.notification_types where type = 'payment_reminder' and enabled)
     and (now() at time zone private.app_tz())::time >= coalesce((public.setting('payment_reminder_time') #>> '{}')::time, time '12:00')
     and (now() at time zone private.app_tz())::time < coalesce((public.setting('payment_reminder_time') #>> '{}')::time, time '12:00') + interval '15 minutes' then
    for r in select m.id, m.paid_by_id from public.matches m
             where m.status = 'played' and m.origin = 'scheduled'
               and (m.kickoff_at at time zone private.app_tz())::date = (now() at time zone private.app_tz())::date - 1 loop
      select array_agg(mp.player_id) into v_ids from public.match_players mp
       where mp.match_id = r.id and mp.participated and mp.player_id is distinct from r.paid_by_id;
      v_total := v_total + private.enqueue_for_players('payment_reminder', r.id, coalesce(v_ids, '{}'), '{}'::jsonb, now(), '');
    end loop;
  end if;
  return v_total;
end $$;

