-- Editar un partido ya disputado fallaba con «match_players_some_flag» cuando
-- había participantes que no estaban convocados (called=false).
create or replace function private.apply_result(p_id uuid, p jsonb)
returns void language plpgsql security definer
set search_path = ''
as $$
declare
  v_m public.matches%rowtype;
  v_size int := coalesce((public.setting('players_per_side') #>> '{}')::int, 7);
  v_home_ids uuid[];
  v_away_ids uuid[];
  v_side text;
  v_team uuid;
  v_ids uuid[];
  v_guest jsonb;
  v_goal jsonb;
  v_spell jsonb;
  v_seq int := 0;
  v_hg int := 0;
  v_ag int := 0;
  v_scorer uuid; v_assist uuid; v_gk uuid; v_gteam uuid; v_own boolean;
  v_opp uuid;
  v_hist boolean;
  v_known boolean;
begin
  select * into v_m from public.matches where id = p_id for update;
  v_hist := v_m.origin = 'historical';

  if (p ->> 'home_score') is null or (p ->> 'away_score') is null then
    raise exception 'El resultado final es obligatorio' using errcode = 'P0001';
  end if;
  if (p ->> 'home_score')::int < 0 or (p ->> 'away_score')::int < 0 then
    raise exception 'El resultado no puede ser negativo' using errcode = 'P0001';
  end if;

  -- Participantes ------------------------------------------------------
  foreach v_side in array array['home', 'away'] loop
    v_team := case when v_side = 'home' then v_m.home_team_id else v_m.away_team_id end;
    v_ids := private.uuid_array(p -> v_side -> 'players');
    -- jugadores de plantilla del equipo (o que ya jugaron con él en este partido)
    if exists (
      select 1 from unnest(v_ids) x join public.players pl on pl.id = x
      where pl.kind = 'member' and pl.team_id <> v_team
        and not exists (select 1 from public.match_players mp where mp.match_id = p_id and mp.player_id = x and mp.team_id = v_team)
    ) or exists (select 1 from unnest(v_ids) x left join public.players pl on pl.id = x where pl.id is null) then
      raise exception 'Hay participantes que no pertenecen a %', case when v_side = 'home' then 'el equipo local' else 'el equipo visitante' end
        using errcode = 'P0001';
    end if;
    for v_guest in select * from jsonb_array_elements(coalesce(p -> v_side -> 'guests', '[]'::jsonb)) loop
      if not exists (select 1 from public.players where id = (v_guest ->> 'player_id')::uuid and kind = 'guest') then
        raise exception 'Invitado no válido' using errcode = 'P0001';
      end if;
      v_ids := v_ids || (v_guest ->> 'player_id')::uuid;
    end loop;
    if (select count(*) from unnest(v_ids)) <> (select count(distinct x) from unnest(v_ids) x) then
      raise exception 'Hay participantes repetidos' using errcode = 'P0001';
    end if;
    if v_side = 'home' then v_home_ids := v_ids; else v_away_ids := v_ids; end if;
  end loop;

  if v_home_ids && v_away_ids then
    raise exception 'Un jugador no puede participar en los dos equipos' using errcode = 'P0001';
  end if;

  if not v_m.exceptional_lineup then
    if v_hist then
      if cardinality(v_home_ids) > v_size or cardinality(v_away_ids) > v_size then
        raise exception 'Máximo % participantes por equipo', v_size using errcode = 'P0001';
      end if;
    elsif cardinality(v_home_ids) <> v_size or cardinality(v_away_ids) <> v_size then
      raise exception 'Un partido disputado debe tener exactamente % participantes por equipo (ahora % y %)',
        v_size, cardinality(v_home_ids), cardinality(v_away_ids) using errcode = 'P0001';
    end if;
  end if;

  -- Guardar participación conservando la convocatoria
  -- A los convocados se les quita la participación y se vuelve a marcar abajo.
  -- Los no convocados no pueden quedar sin ninguna marca: se tratan tras el upsert.
  update public.match_players set participated = false where match_id = p_id and called;
  foreach v_side in array array['home', 'away'] loop
    v_team := case when v_side = 'home' then v_m.home_team_id else v_m.away_team_id end;
    v_ids := case when v_side = 'home' then v_home_ids else v_away_ids end;
    insert into public.match_players (match_id, player_id, team_id, called, participated, lineup_position, brought_by_id)
    select p_id, x, v_team, false, true,
           nullif(p -> v_side -> 'positions' ->> x::text, '')::public.field_position,
           (select (g ->> 'brought_by_id')::uuid from jsonb_array_elements(coalesce(p -> v_side -> 'guests', '[]'::jsonb)) g
             where (g ->> 'player_id')::uuid = x)
    from unnest(v_ids) x
    on conflict (match_id, player_id) do update
      set participated = true, team_id = excluded.team_id,
          lineup_position = coalesce(excluded.lineup_position, public.match_players.lineup_position),
          brought_by_id = coalesce(excluded.brought_by_id, public.match_players.brought_by_id);
  end loop;
  delete from public.match_players
   where match_id = p_id and not called
     and not (player_id = any(v_home_ids || v_away_ids));
  delete from public.match_players where match_id = p_id and not called and not participated;

  -- Rotación de portería -------------------------------------------------
  delete from public.goalkeeper_spells where match_id = p_id;
  for v_spell in select * from jsonb_array_elements(coalesce(p -> 'gk_spells', '[]'::jsonb)) loop
    v_team := (v_spell ->> 'team_id')::uuid;
    if v_team not in (v_m.home_team_id, v_m.away_team_id) then
      raise exception 'Periodo de portería con equipo no válido' using errcode = 'P0001';
    end if;
    if not ((v_spell ->> 'player_id')::uuid = any(case when v_team = v_m.home_team_id then v_home_ids else v_away_ids end)) then
      raise exception 'El portero de cada periodo debe ser participante de su equipo' using errcode = 'P0001';
    end if;
    insert into public.goalkeeper_spells (match_id, team_id, player_id, seq, start_minute, end_minute)
    values (p_id, v_team, (v_spell ->> 'player_id')::uuid,
      (select count(*) + 1 from public.goalkeeper_spells where match_id = p_id and team_id = v_team),
      nullif(v_spell ->> 'start_minute', '')::smallint, nullif(v_spell ->> 'end_minute', '')::smallint);
  end loop;

  -- Goles --------------------------------------------------------------
  delete from public.goals where match_id = p_id;
  for v_goal in select * from jsonb_array_elements(coalesce(p -> 'goals', '[]'::jsonb)) loop
    v_seq := v_seq + 1;
    v_gteam := (v_goal ->> 'team_id')::uuid;
    v_scorer := nullif(v_goal ->> 'scorer_id', '')::uuid;
    v_assist := nullif(v_goal ->> 'assist_id', '')::uuid;
    v_gk := nullif(v_goal ->> 'conceded_gk_id', '')::uuid;
    v_own := coalesce((v_goal ->> 'is_own_goal')::boolean, false);
    if v_gteam = v_m.home_team_id then v_hg := v_hg + 1; v_opp := v_m.away_team_id;
    elsif v_gteam = v_m.away_team_id then v_ag := v_ag + 1; v_opp := v_m.home_team_id;
    else raise exception 'Gol con equipo no válido' using errcode = 'P0001'; end if;

    v_known := cardinality(case when v_gteam = v_m.home_team_id then v_home_ids else v_away_ids end) > 0;
    if v_scorer is not null then
      if v_own then
        if not (v_scorer = any(case when v_opp = v_m.home_team_id then v_home_ids else v_away_ids end)) then
          raise exception 'El autor de un gol en propia puerta debe ser del equipo rival' using errcode = 'P0001';
        end if;
      elsif v_known and not (v_scorer = any(case when v_gteam = v_m.home_team_id then v_home_ids else v_away_ids end)) then
        raise exception 'Cada goleador debe ser participante de su equipo' using errcode = 'P0001';
      end if;
    end if;
    if v_assist is not null and v_known and not (v_assist = any(case when v_gteam = v_m.home_team_id then v_home_ids else v_away_ids end)) then
      raise exception 'Cada asistente debe ser participante de su equipo' using errcode = 'P0001';
    end if;
    if v_assist is not null and v_assist = v_scorer then
      raise exception 'Nadie se da una asistencia a sí mismo' using errcode = 'P0001';
    end if;
    if v_gk is not null and not (v_gk = any(case when v_opp = v_m.home_team_id then v_home_ids else v_away_ids end)) then
      raise exception 'El portero que encaja el gol debe ser participante del equipo rival' using errcode = 'P0001';
    end if;

    insert into public.goals (match_id, team_id, seq, scorer_id, assist_id, conceded_gk_id, minute, is_own_goal)
    values (p_id, v_gteam, v_seq, v_scorer, case when v_own then null else v_assist end, v_gk,
            nullif(v_goal ->> 'minute', '')::smallint, v_own);
  end loop;

  if v_hg <> (p ->> 'home_score')::int or v_ag <> (p ->> 'away_score')::int then
    raise exception 'Los goles registrados (% - %) no cuadran con el resultado (% - %)',
      v_hg, v_ag, p ->> 'home_score', p ->> 'away_score' using errcode = 'P0001';
  end if;

  -- MVP manual (sólo históricos) ----------------------------------------
  if v_hist then
    delete from public.match_mvps where match_id = p_id;
    insert into public.match_mvps (match_id, player_id, source)
    select p_id, x, 'manual' from unnest(private.uuid_array(p -> 'manual_mvp_ids')) x
    where x = any(v_home_ids || v_away_ids) or cardinality(v_home_ids || v_away_ids) = 0;
  end if;

  update public.matches set
    home_score = (p ->> 'home_score')::smallint,
    away_score = (p ->> 'away_score')::smallint,
    actual_weather = nullif(p ->> 'actual_weather', '')::public.weather_kind,
    actual_temp_c = nullif(p ->> 'actual_temp_c', '')::numeric,
    incidents = nullif(p ->> 'incidents', ''),
    final_notes = nullif(p ->> 'final_notes', ''),
    status = 'played',
    finalized_at = coalesce(finalized_at, now()),
    finalized_by = coalesce(finalized_by, auth.uid()),
    updated_by = auth.uid()
  where id = p_id;

  -- Si la votación ya se cerró, el recuento se rehace con los participantes corregidos
  if v_m.vote_closed_at is not null then
    perform private.tally_votes(p_id);
  end if;
end $$;
