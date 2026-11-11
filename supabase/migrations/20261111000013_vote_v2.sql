-- =====================================================================
-- 0013 · Nueva votación (sustituye al 3-2-1)
-- Cada participante emite UNA papeleta con dos elecciones:
--   · Mejor jugador de SU equipo (un compañero; no puede votarse a sí mismo)
--   · Mejor jugador del PARTIDO (MVP; cualquier participante salvo él mismo)
-- Puede elegir a la misma persona en ambas. Sigue siendo anónima
-- (voter_hash = HMAC), modificable hasta el cierre y con cierre automático
-- 24 h después del inicio programado.
-- Resultado: un MVP del partido y un «mejor del equipo» por cada equipo.
-- =====================================================================

-- 1) Papeletas
alter table public.mvp_ballots drop constraint if exists ballots_distinct;
alter table public.mvp_ballots drop column if exists second_id;
alter table public.mvp_ballots drop column if exists third_id;
alter table public.mvp_ballots rename column first_id to match_pick_id;
alter table public.mvp_ballots add column if not exists team_pick_id uuid references public.players(id) on delete cascade;
delete from public.mvp_ballots where team_pick_id is null;   -- (no había papeletas al migrar)
alter table public.mvp_ballots alter column team_pick_id set not null;

-- 2) Recuento publicado tras el cierre (dos categorías)
drop table if exists public.mvp_tallies;
create table public.mvp_tallies (
  match_id   uuid not null references public.matches(id) on delete cascade,
  category   text not null check (category in ('match', 'team')),
  team_id    uuid references public.teams(id) on delete cascade,      -- sólo en 'team'
  player_id  uuid not null references public.players(id) on delete cascade,
  votes      int not null,
  rank       int not null,
  ballots    int not null,
  primary key (match_id, category, player_id),
  constraint tallies_team_cat check ((category = 'team') = (team_id is not null))
);
alter table public.mvp_tallies enable row level security;
create policy "recuento tras cierre" on public.mvp_tallies for select to anon, authenticated
  using (exists (select 1 from public.matches m where m.id = match_id and m.vote_closed_at is not null));
revoke insert, update, delete on public.mvp_tallies from anon, authenticated;

-- 3) Mejor jugador de cada equipo (como match_mvps, pero por equipo)
create table if not exists public.match_team_bests (
  match_id   uuid not null references public.matches(id) on delete cascade,
  team_id    uuid not null references public.teams(id) on delete cascade,
  player_id  uuid not null references public.players(id) on delete restrict,
  source     text not null check (source in ('vote', 'manual')),
  votes      int,
  primary key (match_id, team_id, player_id)
);
alter table public.match_team_bests enable row level security;
create policy "lectura pública" on public.match_team_bests for select to anon, authenticated using (true);
revoke insert, update, delete on public.match_team_bests from anon, authenticated;

-- match_mvps.points pasa a significar «votos recibidos»
comment on column public.match_mvps.points is 'Votos recibidos como mejor del partido (null si es manual)';

-- 4) Ajustes: fuera los puntos 3-2-1; nuevo desempate y peso en la valoración
delete from public.app_settings where key = 'mvp_points';
insert into public.app_settings (key, value, description) values
  ('vote_tiebreak', '["other_votes","goal_contributions"]',
   'Desempate de la votación, en orden: other_votes = votos en la otra categoría (para el MVP, votos como mejor de su equipo; para el mejor del equipo, votos como MVP); goal_contributions = goles + asistencias en el partido. Si persiste el empate se aplica mvp_tie_fallback.')
on conflict (key) do update set value = excluded.value, description = excluded.description;
delete from public.app_settings where key = 'mvp_tiebreak';
update public.app_settings set description = 'Si el empate persiste: shared = premio compartido; none = queda desierto'
 where key = 'mvp_tie_fallback';
update public.app_settings
   set value = value || '{"team_best": 1}'::jsonb
 where key = 'performance_weights' and not (value ? 'team_best');

-- 5) Votar
drop function if exists public.cast_mvp_vote(uuid, uuid, uuid, uuid);
create or replace function public.cast_mvp_vote(p_match uuid, p_team_pick uuid, p_match_pick uuid)
returns text language plpgsql security definer
set search_path = ''
as $$
declare
  v_player uuid := public.my_player_id();
  v_m public.matches%rowtype;
  v_team uuid;
  v_hash text;
  v_existing boolean;
begin
  if auth.uid() is null then raise exception 'Necesitas iniciar sesión para votar' using errcode = '42501'; end if;
  if v_player is null then raise exception 'Tu cuenta aún no está vinculada a un jugador' using errcode = '42501'; end if;
  select * into v_m from public.matches where id = p_match;
  if not found then raise exception 'Partido no encontrado' using errcode = 'P0002'; end if;
  if not v_m.vote_enabled or v_m.status not in ('confirmed', 'played') then
    raise exception 'Este partido no tiene votación' using errcode = 'P0001';
  end if;
  if now() < v_m.vote_opens_at then raise exception 'La votación se abre al empezar el partido' using errcode = 'P0001'; end if;
  if now() >= v_m.vote_closes_at or v_m.vote_closed_at is not null then
    raise exception 'La votación está cerrada' using errcode = 'P0001';
  end if;
  select team_id into v_team from public.match_players where match_id = p_match and player_id = v_player and participated;
  if v_team is null then
    raise exception 'Sólo votan los jugadores que han participado en el partido' using errcode = '42501';
  end if;
  if p_team_pick is null or p_match_pick is null then
    raise exception 'Elige al mejor de tu equipo y al mejor del partido' using errcode = 'P0001';
  end if;
  if v_player in (p_team_pick, p_match_pick) then
    raise exception 'No puedes votarte a ti mismo' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.match_players where match_id = p_match and player_id = p_team_pick and participated and team_id = v_team) then
    raise exception 'El mejor de tu equipo tiene que ser un compañero que haya jugado' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.match_players where match_id = p_match and player_id = p_match_pick and participated) then
    raise exception 'Sólo puedes votar a jugadores que han participado' using errcode = 'P0001';
  end if;

  v_hash := private.voter_hash(p_match, v_player);
  select exists (select 1 from public.mvp_ballots where match_id = p_match and voter_hash = v_hash) into v_existing;

  insert into public.mvp_ballots (match_id, voter_hash, team_pick_id, match_pick_id)
  values (p_match, v_hash, p_team_pick, p_match_pick)
  on conflict (match_id, voter_hash) do update
    set team_pick_id = excluded.team_pick_id, match_pick_id = excluded.match_pick_id;

  insert into public.mvp_vote_receipts (match_id, player_id, user_id)
  values (p_match, v_player, auth.uid())
  on conflict (match_id, player_id) do update
    set last_voted_at = now(), changes = public.mvp_vote_receipts.changes + 1, user_id = excluded.user_id;

  perform private.log_activity(case when v_existing then 'vote.update' else 'vote.cast' end, 'match', p_match::text,
    case when v_existing then 'Ha modificado su voto' else 'Ha votado' end, null);
  return case when v_existing then 'updated' else 'created' end;
end $$;
revoke all on function public.cast_mvp_vote(uuid, uuid, uuid) from public;
grant execute on function public.cast_mvp_vote(uuid, uuid, uuid) to authenticated;

-- La papeleta propia (sólo la ve quien la emitió)
drop function if exists public.my_mvp_ballot(uuid);
create or replace function public.my_mvp_ballot(p_match uuid)
returns table (team_pick_id uuid, match_pick_id uuid)
language sql stable security definer
set search_path = ''
as $$
  select b.team_pick_id, b.match_pick_id
  from public.mvp_ballots b
  where b.match_id = p_match
    and public.my_player_id() is not null
    and b.voter_hash = private.voter_hash(p_match, public.my_player_id())
$$;
revoke all on function public.my_mvp_ballot(uuid) from public;
grant execute on function public.my_mvp_ballot(uuid) to authenticated;

-- 6) Recuento
-- Ganador de un grupo de candidatos empatados aplicando el desempate configurado.
create or replace function private.vote_winners(p_match uuid, p_category text, p_team uuid)
returns setof uuid language plpgsql security definer
set search_path = ''
as $$
declare
  v_criteria jsonb := coalesce(public.setting('vote_tiebreak'), '["other_votes","goal_contributions"]'::jsonb);
  v_fallback text := coalesce(public.setting('mvp_tie_fallback') #>> '{}', 'shared');
  v_crit text; v_left int;
begin
  create temp table if not exists _vote_cand (player_id uuid primary key, other_votes int, goal_contributions int) on commit drop;
  delete from _vote_cand;
  insert into _vote_cand
  select t.player_id,
         coalesce((select o.votes from public.mvp_tallies o where o.match_id = p_match and o.category <> p_category and o.player_id = t.player_id), 0),
         (select count(*) from public.goals g where g.match_id = p_match
            and ((g.scorer_id = t.player_id and not g.is_own_goal) or g.assist_id = t.player_id))::int
  from public.mvp_tallies t
  where t.match_id = p_match and t.category = p_category and t.team_id is not distinct from p_team
    and t.votes = (select max(votes) from public.mvp_tallies x
                   where x.match_id = p_match and x.category = p_category and x.team_id is not distinct from p_team);

  for v_crit in select jsonb_array_elements_text(v_criteria) loop
    select count(*) into v_left from _vote_cand;
    exit when v_left <= 1;
    if v_crit = 'other_votes' then delete from _vote_cand where other_votes < (select max(other_votes) from _vote_cand);
    elsif v_crit = 'goal_contributions' then delete from _vote_cand where goal_contributions < (select max(goal_contributions) from _vote_cand);
    end if;
  end loop;

  select count(*) into v_left from _vote_cand;
  if v_left = 1 or v_fallback = 'shared' then
    return query select player_id from _vote_cand;
  end if;
end $$;

create or replace function private.tally_votes(p_match uuid)
returns void language plpgsql security definer
set search_path = ''
as $$
declare r record;
begin
  delete from public.mvp_tallies where match_id = p_match;
  delete from public.match_mvps where match_id = p_match and source = 'vote';
  delete from public.match_team_bests where match_id = p_match and source = 'vote';

  -- Sólo cuentan papeletas de participantes y candidatos participantes
  create temp table if not exists _valid_ballots (team_pick_id uuid, match_pick_id uuid, voter_team uuid) on commit drop;
  delete from _valid_ballots;
  insert into _valid_ballots
  select b.team_pick_id, b.match_pick_id, mp.team_id
  from public.mvp_ballots b
  join public.match_players mp on mp.match_id = p_match and mp.participated
       and b.voter_hash = private.voter_hash(p_match, mp.player_id)
  where b.match_id = p_match;

  -- MVP del partido
  insert into public.mvp_tallies (match_id, category, team_id, player_id, votes, rank, ballots)
  select p_match, 'match', null, v.match_pick_id, count(*)::int,
         rank() over (order by count(*) desc), (select count(*) from _valid_ballots)::int
  from _valid_ballots v
  where exists (select 1 from public.match_players mp where mp.match_id = p_match and mp.player_id = v.match_pick_id and mp.participated)
  group by v.match_pick_id;

  -- Mejor de cada equipo (sólo votos de sus compañeros a jugadores de ese equipo)
  insert into public.mvp_tallies (match_id, category, team_id, player_id, votes, rank, ballots)
  select p_match, 'team', v.voter_team, v.team_pick_id, count(*)::int,
         rank() over (partition by v.voter_team order by count(*) desc),
         (select count(*) from _valid_ballots w where w.voter_team = v.voter_team)::int
  from _valid_ballots v
  where exists (select 1 from public.match_players mp where mp.match_id = p_match and mp.player_id = v.team_pick_id
                and mp.participated and mp.team_id = v.voter_team)
  group by v.voter_team, v.team_pick_id;

  insert into public.match_mvps (match_id, player_id, source, points)
  select p_match, w, 'vote', (select votes from public.mvp_tallies where match_id = p_match and category = 'match' and player_id = w)
  from private.vote_winners(p_match, 'match', null) as w
  on conflict (match_id, player_id) do update set source = 'vote', points = excluded.points;

  for r in select distinct team_id from public.mvp_tallies where match_id = p_match and category = 'team' loop
    insert into public.match_team_bests (match_id, team_id, player_id, source, votes)
    select p_match, r.team_id, w, 'vote',
           (select votes from public.mvp_tallies where match_id = p_match and category = 'team' and player_id = w)
    from private.vote_winners(p_match, 'team', r.team_id) as w
    on conflict (match_id, team_id, player_id) do update set source = 'vote', votes = excluded.votes;
  end loop;
end $$;

-- 7) Cierre automático: el aviso anuncia MVP y mejores de cada equipo
create or replace function public.close_due_votes()
returns int language plpgsql security definer
set search_path = ''
as $$
declare
  r record;
  v_n int := 0;
  v_mvp text;
  v_best text;
  v_parts uuid[];
begin
  for r in
    select id from public.matches
    where vote_enabled and vote_closed_at is null and vote_closes_at <= now()
      and status in ('confirmed', 'played')
    for update skip locked
  loop
    perform private.tally_votes(r.id);
    update public.matches set vote_closed_at = now() where id = r.id;
    v_n := v_n + 1;

    select string_agg(private.player_label(player_id), ' y ') into v_mvp from public.match_mvps where match_id = r.id and source = 'vote';
    select string_agg(t.short_name || ': ' || private.player_label(b.player_id), ' · ' order by t.short_name)
      into v_best
      from public.match_team_bests b join public.teams t on t.id = b.team_id
     where b.match_id = r.id and b.source = 'vote';
    perform private.log_activity('vote.close', 'match', r.id::text,
      'Se ha cerrado la votación' || coalesce(' · MVP: ' || v_mvp, ' · sin MVP') || coalesce(' · Mejores: ' || v_best, ''),
      jsonb_build_object('papeletas', (select count(*) from public.mvp_vote_receipts where match_id = r.id)), true);

    if v_mvp is not null then
      select array_agg(player_id) into v_parts from public.match_players where match_id = r.id and participated;
      perform private.enqueue_for_players('mvp_result', r.id, coalesce(v_parts, '{}'),
        jsonb_build_object('mvp', v_mvp, 'mejores', coalesce(v_best, '')));
    end if;
  end loop;
  return v_n;
end $$;

-- 8) Textos de la votación
insert into public.ui_texts (key, value, default_value, category, description) values
  ('vote.team_pick', 'El mejor de tu equipo', 'El mejor de tu equipo', 'votación', 'Título de la primera elección'),
  ('vote.match_pick', 'El mejor del partido', 'El mejor del partido', 'votación', 'Título de la segunda elección (MVP)'),
  ('vote.saved', 'Tu voto está guardado. Que no se entere nadie.', 'Tu voto está guardado. Que no se entere nadie.', 'votación', 'Confirmación al votar'),
  ('vote.team_best_label', 'Mejor de su equipo', 'Mejor de su equipo', 'votación', 'Distintivo del mejor de cada equipo')
on conflict (key) do nothing;

-- 9) Aviso de resultado: MVP + mejores de cada equipo
update public.notification_types
   set title_template = 'MVP y mejores del partido',
       body_template  = '{{mvp}} es el MVP de {{partido}}. Mejores de cada equipo: {{mejores}}.',
       description    = 'Se envía a los participantes al cerrarse la votación. Variables: {{mvp}}, {{mejores}}, {{partido}}.'
 where type = 'mvp_result';
update public.ui_texts set value = 'Votación', default_value = 'Votación' where key = 'vote.title';
