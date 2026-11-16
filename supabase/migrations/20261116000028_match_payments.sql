-- =====================================================================
-- 0028 · Pagos del partido
--   · Cada jugador marca si ha pagado su parte (el organizador, el admin y
--     quien pagó el campo pueden marcar a cualquiera de ese partido).
--   · Quien pagó el campo cuenta como pagado.
--   · El aviso de las 12:00 ya no va a quien ha pagado.
--   · 24 h después del inicio, segundo aviso a quien sigue sin pagar.
-- =====================================================================
create table if not exists public.match_payments (
  match_id  uuid not null references public.matches(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  marked_by uuid references auth.users(id) on delete set null,
  marked_at timestamptz not null default now(),
  primary key (match_id, player_id)
);
alter table public.match_payments enable row level security;
create policy "pagos visibles" on public.match_payments for select to anon, authenticated using (true);
revoke insert, update, delete on public.match_payments from anon, authenticated;

create or replace function public.set_payment(p_match uuid, p_player uuid, p_paid boolean)
returns void language plpgsql security definer
set search_path = ''
as $$
declare
  v_me uuid := public.my_player_id();
  v_m public.matches%rowtype;
  v_staff boolean := public.my_role() in ('admin', 'organizer');
begin
  if auth.uid() is null then raise exception 'Necesitas iniciar sesión' using errcode = '42501'; end if;
  select * into v_m from public.matches where id = p_match;
  if not found then raise exception 'Partido no encontrado' using errcode = 'P0002'; end if;
  if v_m.status not in ('confirmed', 'played') then raise exception 'Este partido no tiene pagos' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.match_players where match_id = p_match and player_id = p_player and participated) then
    raise exception 'Ese jugador no ha jugado este partido' using errcode = 'P0001';
  end if;
  if not (v_staff or (v_me is not null and (v_me = p_player or v_me = v_m.paid_by_id))) then
    raise exception 'Sólo puedes marcar tu propio pago' using errcode = '42501';
  end if;
  if p_paid then
    insert into public.match_payments (match_id, player_id, marked_by) values (p_match, p_player, auth.uid())
    on conflict (match_id, player_id) do nothing;
  else
    delete from public.match_payments where match_id = p_match and player_id = p_player;
  end if;
  perform private.log_activity(case when p_paid then 'payment.mark' else 'payment.unmark' end, 'match', p_match::text,
    case when p_paid then 'Ha marcado un pago' else 'Ha desmarcado un pago' end,
    jsonb_build_object('player_id', p_player));
end $$;
revoke all on function public.set_payment(uuid, uuid, boolean) from public, anon;
grant execute on function public.set_payment(uuid, uuid, boolean) to authenticated;

insert into public.notification_types (type, label, enabled, title_template, body_template, lead_minutes, description) values
  ('payment_overdue', 'Recordatorio: sigues sin pagar', true, 'No seas moroso',
   'Paga de una vez al capitán de tu equipo o tendrás problemas.',
   '{}', '24 horas después del inicio del partido, a los que jugaron y aún no han marcado el pago.')
on conflict (type) do nothing;
update public.notification_types set description = 'Al día siguiente de cada partido, a las 12:00, a los que jugaron y aún no han marcado el pago (menos quien pagó el campo).'
 where type = 'payment_reminder';

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
       where mp.match_id = r.id and mp.participated and mp.player_id is distinct from r.paid_by_id
         and not exists (select 1 from public.match_payments x where x.match_id = r.id and x.player_id = mp.player_id);
      v_total := v_total + private.enqueue_for_players('payment_reminder', r.id, coalesce(v_ids, '{}'), '{}'::jsonb, now(), '');
    end loop;
  end if;
  -- 24 h después del inicio: segundo aviso a quien aún no ha marcado el pago
  if exists (select 1 from public.notification_types where type = 'payment_overdue' and enabled) then
    for r in select m.id, m.paid_by_id from public.matches m
             where m.status = 'played' and m.origin = 'scheduled'
               and now() >= m.kickoff_at + interval '24 hours'
               and now() <  m.kickoff_at + interval '24 hours' + interval '15 minutes' loop
      select array_agg(mp.player_id) into v_ids from public.match_players mp
       where mp.match_id = r.id and mp.participated and mp.player_id is distinct from r.paid_by_id
         and not exists (select 1 from public.match_payments x where x.match_id = r.id and x.player_id = mp.player_id);
      v_total := v_total + private.enqueue_for_players('payment_overdue', r.id, coalesce(v_ids, '{}'), '{}'::jsonb, now(), '');
    end loop;
  end if;
  return v_total;
end $$;

