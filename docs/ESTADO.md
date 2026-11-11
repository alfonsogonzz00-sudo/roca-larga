# Estado del proyecto

Última actualización: 11 de noviembre de 2026.

## Implementado y verificado con pruebas automáticas

- **Base de datos** (Supabase, aplicada): 22 tablas, RLS en todas, ~50 funciones de negocio, auditoría automática, cron por minuto.
- **Usuarios**: alta con email y contraseña (Google desactivado por decisión del grupo; el código OAuth sigue disponible), vinculación cuenta↔jugador con validación por organizador/admin, apodo editable, roles (admin único por configuración segura, máx. 2 organizadores por equipo), suspensión.
- **Partidos**: crear (pendiente/confirmado), local/visitante configurable, convocatoria con invitados y quién los trae, formación por equipo, previsión del tiempo, confirmar asistencia, aplazar con nueva fecha, cancelar, reactivar (admin), finalizar con 7+7 participantes, goles/asistencias/propia puerta, rotación de portería con atribución automática de encajados por minuto, editar resultado con recálculo, partidos históricos con datos parciales y MVP manual, eliminar (admin).
- **Estadísticas**: equipos (V/E/D, goles, diferencia, por estadio, por temporada, racha, evolución), jugadores (campo y portería separados, top 3, mejor estadio, evolución), destacados, rankings filtrables por equipo, temporada, estadio, mínimo de partidos y estadística.
- **Votación MVP**: dos votos por participante (mejor de su equipo + mejor del partido), anónima (HMAC), sin auto-voto, desempate configurable, modificable, ventana de 24 h desde el inicio programado, cierre automático por servidor, desempate configurable, recuento que descarta votos de no participantes tras correcciones, justificantes de participación.
- **Motor predictivo**: Poisson + factores ponderados + contracción; pronóstico del próximo partido, simulador de partido, simulador individual, explicación por factor, nivel de confianza, validación retrospectiva, configuraciones guardables y activables.
- **Push**: cola de avisos con deduplicación, descarte automático si el partido se aplaza/cancela, preferencias por usuario, envío VAPID, limpieza de suscripciones caducadas, guía de instalación para iOS.
- **PWA**: manifiesto, iconos, splash iOS, modo standalone, service worker con modo sin conexión y aviso de actualización.
- **Administración**: usuarios, jugadores, equipos (escudos), estadios, formaciones, partidos, votaciones (auditoría), estadísticas y ponderaciones, avisos, textos con variantes, ajustes, registro de actividad, recálculo y purga de datos de prueba.

Pruebas: `npm test` → 26 pruebas de reglas y seguridad sobre Postgres real con las migraciones + 12 del modelo/estadística.

## Requiere acción tuya

1. Repositorio de GitHub para el despliegue por Git (ver DESPLIEGUE.md).
2. ~~Claves VAPID~~ — ahora un botón en Administración → Notificaciones.
3. ~~Google OAuth~~ — descartado: solo email y contraseña.
4. Estadios y sedes reales; vocabulario del grupo.

## Pendiente de verificar en dispositivo real

- Instalación y push en iPhone (iOS 16.4+) y Android con la app ya desplegada.
- (Google OAuth descartado.)

## Decisiones técnicas documentadas

- Sin *service role key*: el despachador se autentica contra la BD con un secreto compartido.
- `cacheComponents` desactivado: la app es dinámica y depende de sesión.
- La formación se registra en simulaciones pero no altera el cálculo (no hay datos suficientes para medir su efecto sin sobreajustar).
- Temporada = agosto a julio.
- Fechas en UTC; se muestran en Europe/Madrid.
