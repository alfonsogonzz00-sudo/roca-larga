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
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | pública | clave pública VAPID |
| `VAPID_PRIVATE_KEY` | **secreta** | clave privada VAPID |
| `VAPID_SUBJECT` | secreta | `mailto:tu-email` |
| `NOTIFICATIONS_DISPATCH_SECRET` | **secreta** | el mismo valor que `private.config('dispatch_secret')` |

No se usa la *service role key* en ningún sitio.

## Pasos manuales (una sola vez)

### 1. Claves VAPID (push)
```bash
npx web-push generate-vapid-keys
```
Copia la pública a `NEXT_PUBLIC_VAPID_PUBLIC_KEY` y la privada a `VAPID_PRIVATE_KEY`.

### 2. Secreto del despachador y URL de la app
Genera un secreto (p. ej. `openssl rand -hex 24`) y en Supabase → SQL Editor:
```sql
update private.config set value = 'TU_SECRETO' where key = 'dispatch_secret';
insert into private.config (key, value) values ('app_url', 'https://TU-DOMINIO')
  on conflict (key) do update set value = excluded.value;
```
Pon el mismo secreto en `NOTIFICATIONS_DISPATCH_SECRET` en Vercel y vuelve a desplegar.

### 3. Autenticación (Supabase → Authentication)
- **URL Configuration**: *Site URL* = URL de producción; *Redirect URLs*: `https://TU-DOMINIO/**` y `http://localhost:3000/**`.
- **Google**: crea un cliente OAuth en Google Cloud (tipo «Aplicación web»), con URI de redirección `https://fsftghnwjvztwakgaifk.supabase.co/auth/v1/callback`; pega *Client ID* y *Secret* en Providers → Google.
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
- Perfil → Activar avisos. Administración → Resumen muestra el estado de VAPID y del secreto.
