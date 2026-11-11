# Guía para introducir los datos reales

Todo se hace desde la app (Administración), sin tocar código ni la base de datos.

| Qué | Dónde |
|---|---|
| Escudos, colores, sede, descripción | Administración → Equipos (sube PNG/SVG/WebP hasta 5 MB) |
| Jugadores, apodos, posiciones, fotos, dorsales, altas/bajas | Administración → Jugadores |
| Estadios (dirección, mapa, imagen) | Administración → Estadios |
| Formaciones (6 de campo) | Administración → Estadios → Formaciones |
| Vocabulario, bromas, nombres de secciones | Administración → Textos (admite variantes aleatorias) |
| Textos de los avisos push y antelación de recordatorios | Administración → Avisos |
| Nombre de la app | Administración → Ajustes |
| Partidos antiguos | Partidos → «Partido histórico» (lo desconocido se deja vacío) |
| Roles de organizador (2 por equipo) | Administración → Usuarios |

## Ya cargado

- Caravelle F.C. (15 jugadores) y S.D. Monecillo (8 jugadores) con los nombres reales facilitados. Apodos, posiciones y fotos vacíos: cada jugador pone su apodo al registrarse.
- Escudos provisionales en `public/crests/` (el de Caravelle es de baja resolución: conviene subir uno mejor).
- Formaciones 2-3-1 (por defecto), 2-2-2, 3-2-1, 3-1-2, 2-1-2-1 y 3-3.

## Flujo de alta de cada jugador

1. Entra con email y contraseña.
2. Elige equipo → su nombre real → escribe su apodo.
3. Un organizador de su equipo (o el administrador) aprueba la solicitud en Gestión.

## Invitados

Al crear o finalizar un partido: «Añadir invitado», escribe su nombre y quién lo trae. El invitado cuenta para los 7, puede marcar y ser MVP, y quien lo trae suma la bonificación configurada en su valoración.
