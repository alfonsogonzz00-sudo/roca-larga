-- La votación abre al inicio del partido y cierra sola a las 12:00 (hora de la app,
-- Europe/Madrid) del día siguiente a la fecha local del partido.
-- Ej.: martes 21:00 → cierra el miércoles a las 12:00.

create or replace function private.vote_close_for(p_kickoff timestamptz)
returns timestamptz language sql stable security definer
set search_path = ''
as $$
  select (((p_kickoff at time zone private.app_tz())::date + 1) + time '12:00')
         at time zone private.app_tz()
$$;
revoke all on function private.vote_close_for(timestamptz) from public;

create or replace function private.set_vote_window()
returns trigger language plpgsql
set search_path = ''
as $$
begin
  if new.origin = 'historical' then
    new.vote_enabled := false;
  end if;
  if new.vote_closed_at is null then
    new.vote_opens_at := new.kickoff_at;
    new.vote_closes_at := private.vote_close_for(new.kickoff_at);
  end if;
  return new;
end $$;

-- Recalcula las votaciones aún abiertas con la nueva regla.
update public.matches
   set vote_closes_at = private.vote_close_for(kickoff_at)
 where vote_closed_at is null and kickoff_at is not null;

-- Aviso de cierre: texto fijado por el propietario (editable luego en Administración).
update public.notification_types
   set title_template = 'La votación ha terminado.',
       body_template  = 'Entra y revisa quién fue el MVP de anoche',
       description    = 'Se envía a los participantes cuando la votación cierra (12:00 del día siguiente). Variables disponibles: {{mvp}}, {{mejores}}, {{partido}}.',
       updated_at     = now()
 where type = 'mvp_result';
