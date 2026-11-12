-- Modelos 3D, foto de ficha y datos físicos de los jugadores.
--  · players.model_url / card_photo_url: públicos (se ven en la ficha).
--  · player_physical: altura y peso, sólo visibles para usuarios registrados.
--  · Se piden al registrarse (en la solicitud de vinculación) y se editan desde el perfil.

alter table public.players
  add column if not exists model_url text
    check (model_url is null or model_url ~ '^(/players/[a-z0-9-]+\.glb|https://[a-z0-9]+\.supabase\.co/storage/v1/object/public/media/models/[^?]+\.glb)(\?v=[0-9]+)?$'),
  add column if not exists card_photo_url text
    check (card_photo_url is null or card_photo_url ~ '^(/players/[a-z0-9-]+\.(webp|jpg|png)|https://[a-z0-9]+\.supabase\.co/storage/v1/object/public/media/[^?]+)(\?v=[0-9]+)?$'),
  add column if not exists model_updated_at timestamptz;

create table if not exists public.player_physical (
  player_id   uuid primary key references public.players(id) on delete cascade,
  height_cm   smallint check (height_cm between 140 and 220),
  weight_kg   numeric(4,1) check (weight_kg between 40 and 160),
  updated_at  timestamptz not null default now(),
  updated_by  uuid references public.profiles(id) on delete set null
);
alter table public.player_physical enable row level security;
revoke all on public.player_physical from public, anon, authenticated;
grant select on public.player_physical to authenticated;
drop policy if exists "fisico visible a registrados" on public.player_physical;
create policy "fisico visible a registrados" on public.player_physical for select to authenticated using (true);

alter table public.player_links
  add column if not exists requested_height_cm smallint check (requested_height_cm between 140 and 220),
  add column if not exists requested_weight_kg numeric(4,1) check (requested_weight_kg between 40 and 160),
  add column if not exists requested_position public.field_position check (requested_position is distinct from 'POR');

-- Solicitud de vinculación con datos físicos (opcionales en BD, obligatorios en el formulario)
drop function if exists public.request_player_link(uuid, text);
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
  if not exists (select 1 from public.players where id = p_player and kind = 'member' and active) then
    raise exception 'Jugador no disponible' using errcode = 'P0001';
  end if;
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
  insert into public.player_links (user_id, player_id, requested_nickname, requested_height_cm, requested_weight_kg, requested_position)
  values (auth.uid(), p_player, v_nick, p_height, round(p_weight, 1), p_position) returning id into v_id;
  perform private.log_activity('link.request', 'player', p_player::text,
    'Ha solicitado vincularse a ' || private.player_label(p_player), jsonb_build_object('apodo', v_nick));
  return v_id;
end $$;

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
    update public.players set
      nickname = coalesce(v_l.requested_nickname, nickname),
      usual_position = coalesce(v_l.requested_position, usual_position)
    where id = v_l.player_id;
    if v_l.requested_height_cm is not null or v_l.requested_weight_kg is not null then
      insert into public.player_physical (player_id, height_cm, weight_kg, updated_by)
      values (v_l.player_id, v_l.requested_height_cm, v_l.requested_weight_kg, v_l.user_id)
      on conflict (player_id) do update set
        height_cm = coalesce(excluded.height_cm, public.player_physical.height_cm),
        weight_kg = coalesce(excluded.weight_kg, public.player_physical.weight_kg),
        updated_at = now(), updated_by = excluded.updated_by;
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

-- El propio jugador actualiza su altura, peso y posición
create or replace function public.set_my_physical(p_height smallint, p_weight numeric, p_position public.field_position)
returns void language plpgsql security definer
set search_path = ''
as $$
declare v_player uuid;
begin
  select player_id into v_player from public.profiles where id = auth.uid() and status = 'active';
  if v_player is null then raise exception 'Tu cuenta aún no está vinculada a un jugador' using errcode = '42501'; end if;
  if p_height is null or p_height not between 140 and 220 then
    raise exception 'La altura debe estar entre 140 y 220 cm' using errcode = 'P0001';
  end if;
  if p_weight is null or p_weight not between 40 and 160 then
    raise exception 'El peso debe estar entre 40 y 160 kg' using errcode = 'P0001';
  end if;
  if p_position is null or p_position = 'POR' then
    raise exception 'Elige Central, Centrocampista o Delantero' using errcode = 'P0001';
  end if;
  insert into public.player_physical (player_id, height_cm, weight_kg, updated_by)
  values (v_player, p_height, round(p_weight, 1), auth.uid())
  on conflict (player_id) do update set height_cm = excluded.height_cm, weight_kg = excluded.weight_kg,
    updated_at = now(), updated_by = excluded.updated_by;
  update public.players set usual_position = p_position, updated_at = now() where id = v_player;
  -- La actividad no incluye las cifras (altura y peso no son públicos)
  perform private.log_activity('player.physical', 'player', v_player::text,
    'Ha actualizado sus datos físicos', '{}'::jsonb);
end $$;

-- Administrador: modelo 3D y foto de ficha
create or replace function public.admin_set_player_media(p_player uuid, p_model_url text, p_card_photo_url text)
returns void language plpgsql security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'Sólo el administrador' using errcode = '42501'; end if;
  update public.players set
    model_url = nullif(trim(p_model_url), ''),
    card_photo_url = nullif(trim(p_card_photo_url), ''),
    model_updated_at = case when nullif(trim(p_model_url), '') is distinct from model_url then now() else model_updated_at end,
    updated_at = now()
  where id = p_player;
  if not found then raise exception 'Jugador no encontrado' using errcode = 'P0002'; end if;
  perform private.log_activity('player.media', 'player', p_player::text,
    'Ha actualizado el modelo 3D de ' || private.player_label(p_player), '{}'::jsonb);
end $$;

revoke all on function public.request_player_link(uuid, text, smallint, numeric, public.field_position) from public, anon;
revoke all on function public.set_my_physical(smallint, numeric, public.field_position) from public, anon;
revoke all on function public.admin_set_player_media(uuid, text, text) from public, anon;
grant execute on function public.request_player_link(uuid, text, smallint, numeric, public.field_position) to authenticated;
grant execute on function public.set_my_physical(smallint, numeric, public.field_position) to authenticated;
grant execute on function public.admin_set_player_media(uuid, text, text) to authenticated;
