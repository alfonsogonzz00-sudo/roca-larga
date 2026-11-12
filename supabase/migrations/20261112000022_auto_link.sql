-- Registro directo: al completar la ficha (equipo, nombre, apodo, datos físicos) la cuenta queda
-- vinculada al momento, sin esperar validación. Sigue sin poder elegirse un jugador ya vinculado
-- y el administrador puede desvincular o reasignar desde el panel (queda en la actividad).
create or replace function public.request_player_link(
  p_player uuid, p_nickname text,
  p_height smallint default null, p_weight numeric default null, p_position public.field_position default null)
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
  -- bloquea el jugador para que dos cuentas no lo elijan a la vez
  perform 1 from public.players where id = p_player and kind = 'member' and active for update;
  if not found then raise exception 'Jugador no disponible' using errcode = 'P0001'; end if;
  if exists (select 1 from public.profiles where player_id = p_player) then
    raise exception 'Ese jugador ya está vinculado a otra cuenta' using errcode = 'P0001';
  end if;
  if v_nick is null or length(v_nick) > 30 then
    raise exception 'Escribe un apodo de hasta 30 caracteres' using errcode = 'P0001';
  end if;
  if p_height is not null and p_height not between 140 and 220 then
    raise exception 'La altura debe estar entre 140 y 220 cm' using errcode = 'P0001';
  end if;
  if p_weight is not null and p_weight not between 40 and 160 then
    raise exception 'El peso debe estar entre 40 y 160 kg' using errcode = 'P0001';
  end if;
  if p_position = 'POR' then
    raise exception 'Elige Central, Centrocampista o Delantero' using errcode = 'P0001';
  end if;

  update public.player_links set status = 'revoked', review_note = 'Sustituida por otra solicitud'
  where user_id = auth.uid() and status = 'pending';
  insert into public.player_links (user_id, player_id, requested_nickname, requested_height_cm, requested_weight_kg, requested_position,
                                   status, reviewed_at, review_note)
  values (auth.uid(), p_player, v_nick, p_height, round(p_weight, 1), p_position, 'approved', now(), 'Registro directo')
  returning id into v_id;
  update public.player_links set status = 'rejected', reviewed_at = now(), review_note = 'Jugador asignado a otra cuenta'
  where player_id = p_player and status = 'pending';

  update public.profiles set player_id = p_player where id = auth.uid();
  update public.players set nickname = v_nick, usual_position = coalesce(p_position, usual_position) where id = p_player;
  if p_height is not null or p_weight is not null then
    insert into public.player_physical (player_id, height_cm, weight_kg, updated_by)
    values (p_player, p_height, round(p_weight, 1), auth.uid())
    on conflict (player_id) do update set
      height_cm = coalesce(excluded.height_cm, public.player_physical.height_cm),
      weight_kg = coalesce(excluded.weight_kg, public.player_physical.weight_kg),
      updated_at = now(), updated_by = excluded.updated_by;
  end if;

  perform private.log_activity('link.auto', 'player', p_player::text,
    'Se ha registrado como ' || private.player_label(p_player), jsonb_build_object('apodo', v_nick));
  return v_id;
end $$;

update public.ui_texts set value = '¡Dentro! Ya eres parte de la plantilla.', default_value = '¡Dentro! Ya eres parte de la plantilla.'
where key = 'onboarding.sent';
