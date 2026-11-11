-- =====================================================================
-- 0003 · Row Level Security y permisos
-- Lectura deportiva pública; escritura sólo vía RLS por rol o RPC.
-- =====================================================================

-- Activar RLS en todas las tablas públicas
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Información deportiva pública (lectura anónima)
-- ---------------------------------------------------------------------
create policy "lectura pública" on public.teams for select to anon, authenticated using (true);
create policy "lectura pública" on public.venues for select to anon, authenticated using (true);
create policy "lectura pública" on public.players for select to anon, authenticated using (true);
create policy "lectura pública" on public.formations for select to anon, authenticated using (true);
create policy "lectura pública" on public.matches for select to anon, authenticated using (true);
create policy "lectura pública" on public.match_players for select to anon, authenticated using (true);
create policy "lectura pública" on public.goalkeeper_spells for select to anon, authenticated using (true);
create policy "lectura pública" on public.goals for select to anon, authenticated using (true);
create policy "lectura pública" on public.match_mvps for select to anon, authenticated using (true);
-- El recuento sólo existe tras el cierre; aun así se exige el cierre
create policy "recuento tras cierre" on public.mvp_tallies for select to anon, authenticated
  using (exists (select 1 from public.matches m where m.id = match_id and m.vote_closed_at is not null));
create policy "lectura pública" on public.ui_texts for select to anon, authenticated using (true);
create policy "lectura pública" on public.app_settings for select to anon, authenticated using (true);
create policy "lectura pública" on public.prediction_configs for select to anon, authenticated using (true);
create policy "lectura pública" on public.notification_types for select to anon, authenticated using (true);

-- ---------------------------------------------------------------------
-- Escritura de maestros: sólo administrador
-- ---------------------------------------------------------------------
create policy "admin actualiza" on public.teams for update to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "admin inserta" on public.venues for insert to authenticated with check (public.is_admin());
create policy "admin actualiza" on public.venues for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin elimina" on public.venues for delete to authenticated using (public.is_admin());

create policy "admin inserta" on public.players for insert to authenticated with check (public.is_admin());
create policy "admin actualiza" on public.players for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin elimina" on public.players for delete to authenticated using (public.is_admin());

create policy "admin inserta" on public.formations for insert to authenticated with check (public.is_admin());
create policy "admin actualiza" on public.formations for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin elimina" on public.formations for delete to authenticated using (public.is_admin());

create policy "admin actualiza" on public.ui_texts for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin inserta" on public.ui_texts for insert to authenticated with check (public.is_admin());

create policy "admin actualiza" on public.app_settings for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin inserta" on public.app_settings for insert to authenticated with check (public.is_admin());

create policy "admin actualiza" on public.notification_types for update to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "admin elimina" on public.prediction_configs for delete to authenticated using (public.is_admin() and not is_system and not is_active);

-- Partidos, convocatorias, goles, porteros y MVP: SÓLO mediante RPC
-- (create_match, update_match, set_match_status, finalize_match, ...).
-- No se crean políticas de escritura → denegado por defecto.

-- ---------------------------------------------------------------------
-- Datos personales
-- ---------------------------------------------------------------------
create policy "perfil propio o admin" on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin());
-- Sin políticas de UPDATE: el usuario modifica su perfil sólo con RPC.

create policy "solicitudes propias o gestión" on public.player_links for select to authenticated
  using (user_id = auth.uid() or public.is_admin()
         or (public.my_role() = 'organizer' and exists (select 1 from public.players p where p.id = player_id and p.team_id = public.my_team_id())));

create policy "suscripción propia (select)" on public.push_subscriptions for select to authenticated using (user_id = auth.uid());
create policy "suscripción propia (insert)" on public.push_subscriptions for insert to authenticated with check (user_id = auth.uid());
create policy "suscripción propia (update)" on public.push_subscriptions for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "suscripción propia (delete)" on public.push_subscriptions for delete to authenticated using (user_id = auth.uid());

create policy "avisos propios" on public.notifications for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy "marcar leído" on public.notifications for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "simulaciones propias" on public.simulation_runs for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy "simulaciones propias (insert)" on public.simulation_runs for insert to authenticated with check (user_id = auth.uid());

create policy "justificante propio o gestión" on public.mvp_vote_receipts for select to authenticated
  using (user_id = auth.uid() or public.is_staff());

create policy "gestión consulta actividad" on public.activity_log for select to authenticated using (public.is_staff());

-- mvp_ballots: SIN políticas → nadie lee ni escribe por la API.

-- ---------------------------------------------------------------------
-- Privilegios a nivel de tabla (defensa en profundidad)
-- ---------------------------------------------------------------------
revoke all on public.mvp_ballots from anon, authenticated;
revoke all on public.activity_log from anon;
revoke insert, update, delete on public.activity_log from authenticated;
revoke insert, update, delete on public.matches, public.match_players, public.goals, public.goalkeeper_spells,
  public.match_mvps, public.mvp_tallies, public.mvp_vote_receipts, public.player_links from anon, authenticated;
revoke all on public.profiles, public.push_subscriptions, public.notifications, public.simulation_runs from anon;
revoke insert, update, delete on public.profiles from authenticated;
-- notificaciones: el usuario sólo puede tocar read_at
revoke update on public.notifications from authenticated;
grant update (read_at) on public.notifications to authenticated;

-- Esquema privado inaccesible
revoke all on all tables in schema private from public, anon, authenticated;
revoke all on all functions in schema private from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Funciones: sólo se exponen las necesarias
-- ---------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon, authenticated;

grant execute on function
  public.my_role(), public.is_admin(), public.is_staff(), public.my_player_id(), public.my_team_id(),
  public.setting(text, jsonb), public.int_array_sum(smallint[]), public.int_array_all_positive(smallint[]),
  public.vote_status(uuid), public.close_due_votes(),
  public.claim_notifications(text, int), public.report_notifications(text, jsonb)
to anon, authenticated;

grant execute on function
  public.create_match(jsonb), public.update_match(uuid, jsonb),
  public.set_match_status(uuid, public.match_status, text, timestamptz),
  public.finalize_match(uuid, jsonb), public.create_historical_match(jsonb), public.update_historical_meta(uuid, jsonb),
  public.delete_match(uuid), public.create_guest(text),
  public.cast_mvp_vote(uuid, uuid, uuid, uuid), public.my_mvp_ballot(uuid),
  public.link_candidates(uuid), public.request_player_link(uuid, text), public.cancel_my_link_request(),
  public.review_player_link(uuid, boolean, text), public.pending_link_requests(),
  public.admin_unlink_player(uuid), public.admin_link_player(uuid, uuid),
  public.update_my_nickname(text), public.update_my_notification_prefs(jsonb), public.touch_last_seen(),
  public.admin_list_users(), public.set_user_role(uuid, public.app_role), public.set_user_status(uuid, public.account_status),
  public.vote_receipts(uuid), public.save_prediction_config(uuid, text, text, jsonb, jsonb, boolean, text),
  public.activate_prediction_config(uuid), public.admin_recalculate(), public.admin_purge_demo_data(),
  public.set_my_attendance(uuid, boolean)
to authenticated;

-- run_scheduled_jobs sólo para el propietario de la BD (pg_cron)
revoke execute on function public.run_scheduled_jobs() from public, anon, authenticated;

alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Storage: bucket público de lectura para escudos, fotos e imágenes
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('media', 'media', true, 5242880, array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'])
    on conflict (id) do nothing;

    execute $p$create policy "media lectura" on storage.objects for select to anon, authenticated using (bucket_id = 'media')$p$;
    execute $p$create policy "media admin sube" on storage.objects for insert to authenticated with check (bucket_id = 'media' and public.is_admin())$p$;
    execute $p$create policy "media admin actualiza" on storage.objects for update to authenticated using (bucket_id = 'media' and public.is_admin())$p$;
    execute $p$create policy "media admin elimina" on storage.objects for delete to authenticated using (bucket_id = 'media' and public.is_admin())$p$;
  end if;
end $$;
