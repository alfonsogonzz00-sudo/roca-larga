# Roca Larga · Caravelle F.C. vs S.D. Monecillo

PWA de fútbol 7 para dos equipos: partidos, convocatorias, rotación de portería, estadísticas, histórico, votación MVP anónima, pronósticos y simuladores («El Despacho»), notificaciones push y panel de administración.

## Stack

| Capa | Tecnología |
|---|---|
| Frontend | Next.js 16 (App Router, Server Components, Server Actions), React 19, TypeScript, Tailwind CSS 4 |
| Datos | Supabase: PostgreSQL 17, Auth (email y contraseña), Storage (bucket `media`), RLS, pg_cron, pg_net |
| Hosting | Vercel (despliegue por Git) |
| PWA | `app/manifest.ts`, `public/sw.js` (offline + push + actualizaciones), iconos y splash iOS |
| Push | Web Push con VAPID (`web-push`) |
| Tests | Vitest + PGlite (Postgres real en memoria con las migraciones) |

## Estructura

```
supabase/migrations/   Esquema, funciones (reglas de negocio), RLS, datos iniciales reales, cron
src/lib/stats/         engine.ts (estadísticas) · model.ts (motor predictivo de Poisson)
src/lib/data/          Acceso a datos en servidor (sesión, dataset, configuración)
src/app/actions/       Server Actions (validación con zod → RPC de Supabase)
src/app/               Pantallas: / (Partidos), /equipos, /votacion, /historico, /despacho, /perfil, /gestion, /admin
src/components/        UI, formularios, gráficos SVG, navegación
tests/                 tests/db (reglas y seguridad en Postgres) · tests/model.test.ts (estadística)
docs/                  Modelo, despliegue, carga de datos y estado del proyecto
```

## Principios de diseño

- **La seguridad vive en la base de datos.** Todas las escrituras deportivas pasan por funciones `SECURITY DEFINER` que comprueban rol y estado de la cuenta; RLS cubre cada tabla. Ocultar botones es sólo comodidad.
- **Nada de agregados que se desincronicen.** Las estadísticas se derivan siempre de partidos, participaciones, goles, turnos de portería y MVP. Corregir un partido = reemplazar sus filas; todo se recalcula solo y sin duplicados.
- **Voto secreto con trazabilidad.** Las papeletas no guardan votante: sólo una huella HMAC con sal privada. Los justificantes guardan quién y cuándo votó, nunca a quién.
- **Portería separada.** Los goles encajados se atribuyen al portero de ese turno y jamás restan en su valoración de campo.
- **Sin datos inventados.** Datos de prueba sólo en tests o marcados `is_demo` (y borrables desde Administración).

## Desarrollo local

```bash
npm install
cp .env.example .env.local   # rellena valores
npm run dev                  # http://localhost:3000
npm test                     # 38 pruebas (reglas de BD + modelo)
npm run build
```

Más detalle en [`docs/DESPLIEGUE.md`](docs/DESPLIEGUE.md), [`docs/MODELO.md`](docs/MODELO.md), [`docs/DATOS.md`](docs/DATOS.md) y [`docs/ESTADO.md`](docs/ESTADO.md).
