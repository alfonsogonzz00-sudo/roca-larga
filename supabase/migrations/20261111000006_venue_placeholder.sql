-- Texto de estadio pendiente en avisos: «en un campo por confirmar»
create or replace function private.match_vars(p_match uuid)
returns jsonb language sql stable security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'dia', private.fmt_day(m.kickoff_at),
    'hora', private.fmt_time(m.kickoff_at),
    'estadio', coalesce(v.name, 'un campo por confirmar'),
    'local', th.name,
    'visitante', ta.name,
    'partido', th.short_name || ' vs ' || ta.short_name,
    'cierre', private.fmt_day(m.vote_closes_at) || ' a las ' || private.fmt_time(m.vote_closes_at)
  )
  from public.matches m
  join public.teams th on th.id = m.home_team_id
  join public.teams ta on ta.id = m.away_team_id
  left join public.venues v on v.id = m.venue_id
  where m.id = p_match
$$;
revoke all on function private.match_vars(uuid) from public, anon, authenticated;
