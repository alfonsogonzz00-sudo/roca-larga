-- =====================================================================
-- 0010 · Foto de perfil
-- Cada usuario sube su foto a media/avatars/<su uid>/… (y sólo ahí).
-- La URL se guarda con una RPC que comprueba que apunta a su carpeta.
-- =====================================================================
do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    execute $p$create policy "avatar propio sube" on storage.objects for insert to authenticated
      with check (bucket_id = 'media' and (storage.foldername(name))[1] = 'avatars' and (storage.foldername(name))[2] = (select auth.uid())::text
                  and lower(storage.extension(name)) in ('jpg', 'jpeg', 'png', 'webp'))$p$;
    execute $p$create policy "avatar propio elimina" on storage.objects for delete to authenticated
      using (bucket_id = 'media' and (storage.foldername(name))[1] = 'avatars' and (storage.foldername(name))[2] = (select auth.uid())::text)$p$;
  end if;
end $$;

create or replace function public.update_my_photo(p_url text)
returns void language plpgsql security definer
set search_path = ''
as $$
declare v_uid uuid := auth.uid(); v_player uuid := public.my_player_id(); v_url text := nullif(trim(p_url), '');
begin
  if v_uid is null then raise exception 'Necesitas iniciar sesión' using errcode = '42501'; end if;
  if v_url is not null and v_url !~ ('^https://[a-z0-9]+\.supabase\.co/storage/v1/object/public/media/avatars/' || v_uid::text || '/[A-Za-z0-9._-]+$') then
    raise exception 'La foto debe subirse desde la app' using errcode = '22023';
  end if;
  update public.profiles set avatar_url = v_url where id = v_uid;
  if v_player is not null then
    update public.players set photo_url = v_url where id = v_player;
  end if;
end $$;

revoke all on function public.update_my_photo(text) from public;
grant execute on function public.update_my_photo(text) to authenticated;
