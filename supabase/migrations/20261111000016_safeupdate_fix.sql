-- =====================================================================
-- 0016 · Supabase (pg_safeupdate) rechaza DELETE sin WHERE en peticiones de la API.
-- Afectaba al recuento de votos (al finalizar o corregir un partido) y a la
-- regeneración de claves push. Se añade «where true» explícito.
-- =====================================================================
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
  delete from _vote_cand where true;
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
  delete from _valid_ballots where true;
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
  if v_had then delete from public.push_subscriptions where true; end if;
  perform private.log_activity('push.vapid', 'config', 'vapid',
    case when v_had then 'Claves de notificaciones regeneradas (los dispositivos deben reactivar avisos)'
         else 'Notificaciones push activadas' end);
end $$;
