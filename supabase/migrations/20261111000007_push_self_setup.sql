-- =====================================================================
-- 0007 · Notificaciones push autoconfiguradas
-- Las claves VAPID se generan en el servidor (acción de administrador) y se
-- guardan en private.config. El despachador ya no necesita variables de entorno:
-- reenvía a la BD el secreto que le manda pg_cron y la BD lo valida.
-- =====================================================================

-- Clave pública: es pública por definición (la necesita el navegador para suscribirse)
create or replace function public.vapid_public_key()
returns text language sql stable security definer
set search_path = ''
as $$ select nullif(private.cfg('vapid_public'), '') $$;

-- Estado de la configuración (sin revelar valores)
create or replace function public.push_config_status()
returns jsonb language plpgsql stable security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'Sólo el administrador' using errcode = '42501'; end if;
  return jsonb_build_object(
    'vapid', coalesce(private.cfg('vapid_public'), '') <> '' and coalesce(private.cfg('vapid_private'), '') <> '',
    'secret', coalesce(private.cfg('dispatch_secret'), '') <> '',
    'app_url', coalesce(private.cfg('app_url'), '') <> '',
    'cron', exists (select 1 from cron.job where jobname = 'roca-larga-tick' and active)
  );
end $$;

-- Guardar claves VAPID (sólo admin). Cambiar las claves invalida las suscripciones existentes.
create or replace function public.admin_set_vapid_keys(p_public text, p_private text)
returns void language plpgsql security definer
set search_path = ''
as $$
declare v_had boolean := coalesce(private.cfg('vapid_public'), '') <> '';
begin
  if not public.is_admin() then raise exception 'Sólo el administrador' using errcode = '42501'; end if;
  if p_public !~ '^[A-Za-z0-9_-]{80,100}$' or p_private !~ '^[A-Za-z0-9_-]{40,50}$' then
    raise exception 'Claves VAPID no válidas' using errcode = '22023';
  end if;
  insert into private.config (key, value) values ('vapid_public', p_public), ('vapid_private', p_private)
    on conflict (key) do update set value = excluded.value;
  if v_had then delete from public.push_subscriptions; end if;
  perform private.log_activity('push.vapid', 'config', 'vapid',
    case when v_had then 'Claves de notificaciones regeneradas (los dispositivos deben reactivar avisos)'
         else 'Notificaciones push activadas' end);
end $$;

-- Credenciales para el despachador, protegidas por el secreto compartido con pg_cron
create or replace function public.dispatch_credentials(p_secret text)
returns table (vapid_public text, vapid_private text, subject text)
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if p_secret is null or p_secret <> private.cfg('dispatch_secret') then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  return query select private.cfg('vapid_public'), private.cfg('vapid_private'),
                      'mailto:' || coalesce(private.cfg('owner_email'), 'admin@example.com');
end $$;

revoke all on function public.vapid_public_key() from public;
revoke all on function public.push_config_status() from public;
revoke all on function public.admin_set_vapid_keys(text, text) from public;
revoke all on function public.dispatch_credentials(text) from public;
grant execute on function public.vapid_public_key() to anon, authenticated;
grant execute on function public.push_config_status() to authenticated;
grant execute on function public.admin_set_vapid_keys(text, text) to authenticated;
grant execute on function public.dispatch_credentials(text) to anon, authenticated;
