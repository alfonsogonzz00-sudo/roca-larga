-- Personalización del jugador 3D: color de botas y medias, nombre y dorsal.
-- Pública (se ve en la ficha); cada jugador sólo modifica la suya.

alter table public.players
  add column if not exists kit jsonb not null default '{}'::jsonb,
  add column if not exists model_map_url text
    check (model_map_url is null or model_map_url ~ '^/players/[a-z0-9-]+-map\.png(\?v=[0-9]+)?$');

create or replace function private.valid_kit_color(p text)
returns boolean language sql immutable
set search_path = ''
as $$ select p is null or p in ('negro','blanco','rojo','azul','verde','amarillo','naranja','rosa','morado','gris') $$;

alter table public.players drop constraint if exists players_kit_shape;
alter table public.players add constraint players_kit_shape check (
  jsonb_typeof(kit) = 'object'
  and private.valid_kit_color(kit ->> 'boots')
  and private.valid_kit_color(kit ->> 'socks')
  and (kit ->> 'back_name' is null or kit ->> 'back_name' ~ '^[A-ZÁÉÍÓÚÜÑ][A-ZÁÉÍÓÚÜÑ .''-]{0,11}$')
  and (kit - 'boots' - 'socks' - 'back_name') = '{}'::jsonb
);

create or replace function public.set_my_kit(p_boots text, p_socks text, p_back_name text, p_number smallint)
returns void language plpgsql security definer
set search_path = ''
as $$
declare v_player uuid; v_name text := nullif(upper(trim(p_back_name)), '');
begin
  select player_id into v_player from public.profiles where id = auth.uid() and status = 'active';
  if v_player is null then raise exception 'Tu cuenta aún no está vinculada a un jugador' using errcode = '42501'; end if;
  if not private.valid_kit_color(p_boots) or not private.valid_kit_color(p_socks) then
    raise exception 'Color no disponible' using errcode = 'P0001';
  end if;
  if v_name is not null and v_name !~ '^[A-ZÁÉÍÓÚÜÑ][A-ZÁÉÍÓÚÜÑ .''-]{0,11}$' then
    raise exception 'El nombre de la espalda admite hasta 12 letras' using errcode = 'P0001';
  end if;
  if p_number is not null and p_number not between 0 and 99 then
    raise exception 'El dorsal va del 0 al 99' using errcode = 'P0001';
  end if;
  update public.players set
    kit = jsonb_strip_nulls(jsonb_build_object('boots', p_boots, 'socks', p_socks, 'back_name', v_name)),
    shirt_number = p_number,
    updated_at = now()
  where id = v_player;
  perform private.log_activity('player.kit', 'player', v_player::text,
    'Ha personalizado su jugador', '{}'::jsonb);
end $$;

revoke all on function public.set_my_kit(text, text, text, smallint) from public, anon;
grant execute on function public.set_my_kit(text, text, text, smallint) to authenticated;
