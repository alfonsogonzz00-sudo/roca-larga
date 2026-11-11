-- =====================================================================
-- 0004 · Datos iniciales REALES (equipos, plantillas, formaciones,
-- configuración, textos y avisos). Nada de esto es de demostración.
-- =====================================================================

-- Secretos privados (se generan una sola vez)
insert into private.config (key, value) values
  ('vote_salt', encode(extensions.gen_random_bytes(32), 'hex')),
  ('dispatch_secret', encode(extensions.gen_random_bytes(24), 'hex'))
on conflict (key) do nothing;

-- Equipos ------------------------------------------------------------------
insert into public.teams (slug, name, short_name, full_name, crest_url, primary_color, secondary_color, sort_order) values
  ('caravelle', 'Caravelle F.C.', 'Caravelle', 'Caravelle Fútbol Club', '/crests/caravelle.png', '#1f7a3c', '#f2efe3', 1),
  ('monecillo', 'S.D. Monecillo', 'Monecillo', 'Sociedad Deportiva Monecillo', '/crests/monecillo.png', '#151515', '#b8963e', 2)
on conflict (slug) do nothing;

-- Plantillas ---------------------------------------------------------------
insert into public.players (team_id, full_name)
select t.id, n
from public.teams t,
     unnest(array[
       'José Manuel Maqueda', 'Manuel Pineda', 'Rafael Soler', 'Carlos Zurera', 'José Vargas',
       'Rafael Cañas', 'Alberto Córdoba', 'Juan Gálvez', 'Manuel Baquero', 'Enrique Fernández',
       'Miguel Orzáez', 'Ignacio Sierra', 'Ismael Torres', 'David Liébanas', 'Miguel Ángel Romero']) n
where t.slug = 'caravelle';

insert into public.players (team_id, full_name)
select t.id, n
from public.teams t,
     unnest(array[
       'Ángel Núñez', 'Javier Núñez', 'Mario Núñez', 'Alfonso González', 'Kalabe Adane',
       'Juan Moreno', 'Raúl de la Fuente', 'Miguel Aceña']) n
where t.slug = 'monecillo';

-- Formaciones (6 de campo + portero rotatorio) ---------------------------------
insert into public.formations (name, lines, is_default, sort_order) values
  ('2-3-1', '{2,3,1}', true, 1),
  ('2-2-2', '{2,2,2}', false, 2),
  ('3-2-1', '{3,2,1}', false, 3),
  ('3-1-2', '{3,1,2}', false, 4),
  ('2-1-2-1', '{2,1,2,1}', false, 5),
  ('3-3', '{3,3}', false, 6);

-- Configuración general -----------------------------------------------------
insert into public.app_settings (key, value, description) values
  ('app_name', '"Roca Larga"', 'Nombre de la aplicación'),
  ('app_tagline', '"Caravelle F.C. · S.D. Monecillo"', 'Subtítulo'),
  ('timezone', '"Europe/Madrid"', 'Zona horaria en la que se muestran las horas'),
  ('players_per_side', '7', 'Jugadores por equipo en un partido disputado'),
  ('organizers_per_team', '2', 'Máximo de organizadores por equipo'),
  ('mvp_points', '[3,2,1]', 'Puntos para 1º, 2º y 3º puesto en la votación MVP'),
  ('mvp_tiebreak', '["firsts","seconds","thirds","goal_contributions"]',
     'Criterios de desempate en orden: más primeros puestos, más segundos, más terceros, más goles+asistencias en el partido'),
  ('mvp_tie_fallback', '"shared"', 'Si persiste el empate: "shared" (MVP compartido) o "none" (sin MVP)'),
  ('performance_weights', '{"goal":1,"assist":0.75,"mvp":2,"win":0.5,"draw":0.2,"guest_bonus":0.5}',
     'Valoración de actuaciones. guest_bonus = puntos extra por cada invitado que trae el jugador'),
  ('model_params', '{"k_team":4,"k_venue":4,"k_recent":2,"k_context":5,"k_pair":3,"k_player":4,"min_matches":3}',
     'Parámetros de contracción (tamaño de muestra) del motor predictivo'),
  ('demo_mode', 'false', 'Mostrar datos marcados como demostración');

-- Ponderaciones del motor predictivo ----------------------------------------------
insert into public.prediction_configs (name, scope, weights, enabled, is_active, is_system, notes) values
  ('Original · próximo partido', 'next_match',
   '{"composition_teammates":30,"composition_rivals":20,"venue_history":20,"recent_form":10,"recent_venue":10,"weather":7.5,"time_slot":2.5}',
   '{"composition_teammates":true,"composition_rivals":true,"venue_history":true,"recent_form":true,"recent_venue":true,"weather":true,"time_slot":true}',
   true, true, 'Valores iniciales definidos en el proyecto (7.1)'),
  ('Original · simulaciones', 'simulation',
   '{"composition_teammates":30,"composition_rivals":20,"venue_history":20,"recent_form":12.5,"recent_venue":7.5,"weather":7.5,"time_slot":2.5}',
   '{"composition_teammates":true,"composition_rivals":true,"venue_history":true,"recent_form":true,"recent_venue":true,"weather":true,"time_slot":true}',
   true, true, 'Valores iniciales definidos en el proyecto (7.2)');

-- Tipos de aviso push -----------------------------------------------------
insert into public.notification_types (type, label, title_template, body_template, lead_minutes, description) values
  ('match_confirmed', 'Partido confirmado', '¡Hay partido!',
   'El {{dia}} a las {{hora}} en {{estadio}}. Estás convocado. No hay excusas.', '{}',
   'Se envía a los convocados cuando el partido se confirma (y a los nuevos convocados si cambia la lista).'),
  ('match_reminder', 'Recordatorio', 'Recordatorio: {{partido}}',
   'Faltan {{antelacion}}. {{dia}} a las {{hora}} en {{estadio}}.', '{1440,120}',
   'Se envía a los convocados con la antelación indicada (minutos).'),
  ('vote_open', 'Votación abierta', 'Urnas abiertas',
   'Ya puedes votar al MVP de {{partido}}. Tienes hasta el {{cierre}}.', '{}',
   'Se envía a los participantes cuando empieza el partido.'),
  ('mvp_result', 'Resultado MVP', 'MVP del partido',
   '{{mvp}} se lleva el MVP de {{partido}}.', '{}',
   'Se envía a los participantes al cerrarse la votación.');

-- Textos personalizables (humor configurable) ----------------------------------
insert into public.ui_texts (key, value, default_value, category, description) values
  ('nav.matches', 'Partidos', 'Partidos', 'navegación', 'Pestaña principal'),
  ('nav.teams', 'Equipos', 'Equipos', 'navegación', null),
  ('nav.vote', 'Votación', 'Votación', 'navegación', null),
  ('nav.history', 'Histórico', 'Histórico', 'navegación', null),
  ('nav.office', 'El Despacho', 'El Despacho', 'navegación', null),
  ('nav.profile', 'Perfil', 'Perfil', 'navegación', null),
  ('home.next_match', 'Próximo partido', 'Próximo partido', 'partidos', 'Título de la tarjeta principal'),
  ('home.no_next_match', 'No hay ningún partido a la vista. Alguien tendrá que mover el grupo.', 'No hay ningún partido a la vista. Alguien tendrá que mover el grupo.', 'partidos', 'Cuando no hay próximo partido'),
  ('home.past_matches', 'Partidos anteriores', 'Partidos anteriores', 'partidos', null),
  ('match.created', 'Partido creado. Ya no hay excusas.', 'Partido creado. Ya no hay excusas.', 'partidos', 'Confirmación al crear'),
  ('match.updated', 'Cambios guardados.', 'Cambios guardados.', 'partidos', null),
  ('match.finalized', 'Resultado guardado. Que empiece el debate en el bar.', 'Resultado guardado. Que empiece el debate en el bar.', 'partidos', 'Confirmación al finalizar'),
  ('match.cancelled', 'Partido cancelado.', 'Partido cancelado.', 'partidos', null),
  ('match.postponed', 'Partido aplazado.', 'Partido aplazado.', 'partidos', null),
  ('match.attendance_yes', 'Apuntado. Ahora toca cumplir.', 'Apuntado. Ahora toca cumplir.', 'partidos', 'Al confirmar asistencia'),
  ('match.attendance_no', 'Anotado. Se te echará de menos (o no).', 'Anotado. Se te echará de menos (o no).', 'partidos', 'Al rechazar asistencia'),
  ('vote.title', 'Votación MVP', 'Votación MVP', 'votación', null),
  ('vote.cast', 'Voto guardado. Lo que pasa en la urna se queda en la urna.', 'Voto guardado. Lo que pasa en la urna se queda en la urna.', 'votación', 'Confirmación de voto'),
  ('vote.updated', 'Voto cambiado. Nadie sabrá que dudaste.', 'Voto cambiado. Nadie sabrá que dudaste.', 'votación', null),
  ('vote.closed', 'Urnas cerradas.', 'Urnas cerradas.', 'votación', null),
  ('vote.none_open', 'Ahora mismo no hay ninguna votación abierta.', 'Ahora mismo no hay ninguna votación abierta.', 'votación', null),
  ('vote.anonymous_note', 'Tu voto es secreto: nadie, ni el administrador, puede ver a quién has votado.', 'Tu voto es secreto: nadie, ni el administrador, puede ver a quién has votado.', 'votación', null),
  ('history.empty', 'Aún no hay historia que contar. Toca jugar.', 'Aún no hay historia que contar. Toca jugar.', 'histórico', null),
  ('office.subtitle', 'Aquí se cocinan los pronósticos. Con datos, sin garantías.', 'Aquí se cocinan los pronósticos. Con datos, sin garantías.', 'despacho', null),
  ('office.low_confidence', 'Con tan pocos partidos, esto es más charla de bar que estadística.', 'Con tan pocos partidos, esto es más charla de bar que estadística.', 'despacho', 'Aviso de confianza baja'),
  ('profile.pending_link', 'Tu solicitud está en el despacho de los organizadores.', 'Tu solicitud está en el despacho de los organizadores.', 'perfil', null),
  ('profile.nickname_saved', 'Apodo actualizado.', 'Apodo actualizado.', 'perfil', null),
  ('onboarding.title', '¿Quién eres en el campo?', '¿Quién eres en el campo?', 'registro', null),
  ('onboarding.sent', 'Solicitud enviada. Un organizador la validará en breve.', 'Solicitud enviada. Un organizador la validará en breve.', 'registro', null),
  ('generic.error', 'Algo ha fallado. Inténtalo de nuevo en unos segundos.', 'Algo ha fallado. Inténtalo de nuevo en unos segundos.', 'general', null),
  ('generic.offline', 'Sin conexión. Te enseñamos lo último que teníamos guardado.', 'Sin conexión. Te enseñamos lo último que teníamos guardado.', 'general', null),
  ('badge.star', 'Jugador estrella', 'Jugador estrella', 'equipos', null),
  ('badge.top_scorer', 'Pichichi', 'Pichichi', 'equipos', 'Máximo goleador'),
  ('badge.top_assist', 'El asistente', 'El asistente', 'equipos', 'Máximo asistente'),
  ('badge.top_mvp', 'Más MVP', 'Más MVP', 'equipos', null),
  ('badge.guest_bringer', 'Captador de talentos', 'Captador de talentos', 'equipos', 'Quien más invitados ha traído');

-- Los registros generados durante la carga inicial no son actividad de usuarios
delete from public.activity_log;
