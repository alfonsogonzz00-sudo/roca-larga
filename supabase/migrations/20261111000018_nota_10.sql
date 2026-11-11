-- =====================================================================
-- 0018 · Nota del partido sobre 10 (independiente de las votaciones)
-- Parte de 6,0 · +0,5 por jugar · +2,5 por gol · +1,2 por asistencia ·
-- +0,8 por cada gol del equipo que no marca él · −1,0 por gol encajado
-- por el equipo · tope 10,0. La portería no cuenta y deja de ser posición.
-- =====================================================================
update public.app_settings
   set value = '{"base": 6, "played": 0.5, "goal": 2.5, "assist": 1.2, "team_goal": 0.8, "team_conceded": -1, "guest_bonus": 0.5, "max": 10, "min": 0}'::jsonb,
       description = 'Nota de cada partido sobre 10: base, played, goal, assist, team_goal (gol del equipo que no marca él), team_conceded (gol encajado por el equipo), guest_bonus, max, min'
 where key = 'performance_weights';

-- Posiciones: Central, Centrocampista y Delantero (sin portero)
update public.players set usual_position = null where usual_position = 'POR';
update public.match_players set lineup_position = null where lineup_position = 'POR';
