# Despliegue y mantenimiento

## Infraestructura actual

- **Supabase**: proyecto `roca-larga` (`fsftghnwjvztwakgaifk`, región París). Migraciones 0001–0005 aplicadas. Cron `roca-larga-tick` activo cada minuto.
- **Vercel**: proyecto conectado al repositorio de GitHub; cada `git push` a `main` despliega a producción.

## Variables de entorno (Vercel → Settings → Environment Variables)

| Variable | Tipo | Valor |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | pública | `https://fsftghnwjvztwakgaifk.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | pública | clave `sb_publishable_…` (Supabase → Settings → API Keys) |
| `NEXT_PUBLIC_SITE_URL` | pública | URL de producción |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | pública | *opcional/obsoleta*: ahora vive en la BD (ver §1) |
| `VAPID_PRIVATE_KEY` | **secreta** | *opcional/obsoleta*: ahora vive en la BD (ver §1) |
| `VAPID_SUBJECT` | secreta | *opcional/obsoleta*: ahora vive en la BD (ver §1) |
| `NOTIFICATIONS_DISPATCH_SECRET` | **secreta** | *opcional/obsoleta*: ahora vive en la BD (ver §1) |

No se usa la *service role key* en ningún sitio.

## Pasos manuales (una sola vez)

### 1–2. Notificaciones push
Ya no hay que generar nada a mano ni tocar Vercel:
1. Entra como administrador → **Administración → Notificaciones** → **Activar notificaciones**.
   El servidor genera las claves VAPID y las guarda en `private.config` (nunca se muestran).
2. El secreto del despachador se generó al crear la BD y pg_cron lo envía al endpoint; la BD lo valida.
3. `app_url` ya apunta a `https://roca-larga.vercel.app` (cámbialo en `private.config` si usas otro dominio).

Cada usuario activa después los avisos en **Perfil → Notificaciones** (en iPhone, primero hay que instalar la app en la pantalla de inicio).
Las variables de entorno VAPID/secreto siguen aceptándose como respaldo, pero no hacen falta.

### 3. Autenticación (Supabase → Authentication)
- **URL Configuration**: *Site URL* = URL de producción; *Redirect URLs*: `https://TU-DOMINIO/**` y `http://localhost:3000/**`.
- **Google** (opcional, desactivado: el grupo usa solo email): crea un cliente OAuth en Google Cloud (tipo «Aplicación web»), con URI de redirección `https://fsftghnwjvztwakgaifk.supabase.co/auth/v1/callback`; pega *Client ID* y *Secret* en Providers → Google.
- **Email**: activado por defecto con confirmación. El SMTP integrado de Supabase está limitado (pocos correos/hora); para el grupo basta, pero puedes configurar SMTP propio en Settings → Auth.

### 4. Administrador
El email del propietario está en `private.config('owner_email')`. La primera cuenta con ese email **verificado** recibe el rol de administrador automáticamente (y sólo si no existe ya uno). Para cambiarlo:
```sql
update private.config set value = 'otro@email.com' where key = 'owner_email';
```

## Tareas programadas

`pg_cron` ejecuta `private.cron_tick()` cada minuto:
1. Cierra votaciones vencidas (24 h tras el inicio), hace el recuento y encola el aviso del MVP.
2. Genera recordatorios según la antelación configurada.
3. Si hay avisos pendientes y `app_url` está configurada, llama a `POST /api/notifications/dispatch`.

Las votaciones se cierran aunque nadie use la app; además la BD rechaza votos fuera de plazo con su propio reloj.

## Migraciones

Las migraciones viven en `supabase/migrations`. Para nuevos cambios: crea un archivo nuevo numerado (no edites los aplicados) y aplícalo con la CLI de Supabase (`supabase db push`) o el SQL Editor.

## Comprobaciones tras desplegar

- Abrir la web en el móvil → instalar (Android: menú → Instalar app; iPhone: Compartir → Añadir a pantalla de inicio).
- Perfil → Activar avisos. Administración → Notificaciones muestra el estado del servicio.
