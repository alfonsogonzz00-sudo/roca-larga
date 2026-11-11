-- =====================================================================
-- 0009 · Nuevo menú (Clasificación · Partidos · Votación · Actividad · Perfil)
-- y muro de actividad para jugadores registrados.
-- El muro sólo muestra acciones deportivas (partidos, convocatorias,
-- participación en votaciones, MVP, altas de jugadores). Nunca el contenido
-- de un voto ni los cambios de configuración o usuarios.
-- =====================================================================
insert into public.ui_texts (key, value, default_value, category, description) values
  ('nav.ranking', 'Clasificación', 'Clasificación', 'navegación', 'Pestaña con equipos, histórico, rankings y El Despacho'),
  ('nav.activity', 'Actividad', 'Actividad', 'navegación', 'Muro de actividad del grupo'),
  ('activity.empty', 'Todavía no ha pasado nada. Esto se animará en cuanto se convoque el primer partido.', 'Todavía no ha pasado nada. Esto se animará en cuanto se convoque el primer partido.', 'actividad', 'Muro vacío')
on conflict (key) do nothing;

create or replace function public.public_activity(p_before bigint default null, p_limit int default 40)
returns table (id bigint, created_at timestamptz, actor_name text, action text, entity_type text, entity_id text, summary text, is_system boolean)
language sql stable security definer
set search_path = ''
as $$
  select a.id, a.created_at, a.actor_name, a.action, a.entity_type, a.entity_id, a.summary, a.is_system
  from public.activity_log a
  where auth.uid() is not null
    and a.action in ('match.create', 'match.historical', 'match.status', 'match.update', 'match.finalize',
                     'match.result_edit', 'match.attendance', 'match.delete',
                     'vote.cast', 'vote.update', 'vote.close', 'link.approve', 'link.admin')
    and (p_before is null or a.id < p_before)
  order by a.id desc
  limit least(greatest(coalesce(p_limit, 40), 1), 100)
$$;

revoke all on function public.public_activity(bigint, int) from public;
grant execute on function public.public_activity(bigint, int) to authenticated;
