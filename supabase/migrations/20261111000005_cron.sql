-- =====================================================================
-- 0005 · Tareas programadas (pg_cron + pg_net)
-- Cada minuto: cierra votaciones vencidas, genera recordatorios y, si hay
-- avisos pendientes, despierta al despachador de notificaciones push.
-- La URL de la app y el secreto viven en private.config:
--   app_url          → https://<tu-dominio>
--   dispatch_secret  → generado automáticamente (cópialo a NOTIFICATIONS_DISPATCH_SECRET)
-- =====================================================================
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

create or replace function private.cron_tick()
returns void language plpgsql security definer
set search_path = ''
as $$
declare v jsonb; v_url text := private.cfg('app_url');
begin
  v := public.run_scheduled_jobs();
  if (v ->> 'pending')::int > 0 and coalesce(v_url, '') <> '' then
    perform net.http_post(
      url := rtrim(v_url, '/') || '/api/notifications/dispatch',
      headers := jsonb_build_object('Content-Type', 'application/json',
                                    'Authorization', 'Bearer ' || private.cfg('dispatch_secret')),
      body := '{}'::jsonb,
      timeout_milliseconds := 20000);
  end if;
end $$;

select cron.schedule('roca-larga-tick', '* * * * *', $$select private.cron_tick()$$);
