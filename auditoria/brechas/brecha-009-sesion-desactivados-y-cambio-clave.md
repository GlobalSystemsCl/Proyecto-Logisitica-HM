# Brecha 009 — Usuarios desactivados conservan la sesión; el cambio de clave obligatorio no se impone

## Estado
Corregida

## Severidad
Medium

## Categoría
Security — Session Management

## Descripción
1. `UsersService.toggleUserStatus` solo hace `usuario.activo = false`. No revoca las sesiones ni banea al usuario en Supabase Auth. El middleware no comprueba `activo`. Las Server Actions y páginas sí lo comprueban (`getProfileOrThrow`, `profile.activo`), y la RLS también (`usuario_activo()`). Pero:
   - El refresh token sigue válido y el usuario conserva un JWT válido para Auth (por ejemplo, `auth.updateUser`, cambio de email o contraseña).
   - Las policies que **no** llaman `usuario_activo()` (`sv_insert_logistica`, `sv_update_logistica`, `vehiculo_*_gestores`) usan `tiene_rol()`, que sí filtra por activo; aun así, cualquier policy futura que omita la verificación quedaría abierta.
2. `requiere_cambio_clave` (usuarios creados o reseteados por el admin con contraseña temporal) solo redirige en `/dashboard`. El usuario puede navegar directamente a `/solicitudes`, `/admin/*`, etc., o llamar Server Actions, y seguir usando la contraseña temporal indefinidamente.

## Evidencia
- `src/services/users.service.ts` `toggleUserStatus` (~326-365): solo `update({ activo })`.
- `src/lib/supabase/middleware.ts`: no lee `public.usuario`.
- `src/app/dashboard/page.tsx` (~27): única verificación de `requiere_cambio_clave` (búsqueda en `src/app`).

## Impacto
- Un empleado desactivado mantiene un token válido hasta que expire o se cierre la sesión. Su capacidad real sobre datos queda limitada por los guards, pero puede seguir operando contra Auth.
- Las contraseñas temporales, que viajan por correo y se muestran en pantalla al admin, pueden quedar como definitivas.

## Cómo reproducirlo
(No ejecutado.) Crear un usuario, iniciar sesión, navegar a `/solicitudes` directamente: no se fuerza el cambio de clave.

## Causa raíz
El estado de la cuenta vive en `public.usuario` y no se refleja en Auth. Las verificaciones están repartidas por página en lugar de estar en un punto común.

## Solución propuesta
1. Al desactivar: `admin.auth.admin.updateUserById(id, { ban_duration: '876000h' })` (y quitar el ban al reactivar), además de `admin.auth.admin.signOut(id)` o el equivalente para revocar refresh tokens.
2. Middleware: leer `activo`, `aprobado` y `requiere_cambio_clave` (desde `app_metadata` sincronizado, o con una consulta ligera) y redirigir a `/login` o `/establecer-clave` en todas las rutas no públicas.
3. En `getProfileOrThrow()`, rechazar también si `requiere_cambio_clave`, salvo en `updatePasswordAction`.

## Riesgos de la solución
- Un ban mal revertido bloquea a usuarios reactivados: cubrirlo con un test.
- Una consulta en el middleware añade latencia; usar `app_metadata`.

## Tests necesarios
- Desactivar → el siguiente request redirige a `/login` y el refresh falla.
- Reactivar → el login funciona.
- Usuario con `requiere_cambio_clave` → cualquier ruta redirige a `/establecer-clave`; las actions devuelven error.

## Plan de implementación
1. Modificar `toggleUserStatus` y `resetUserPassword` (sincronizar `app_metadata`).
2. Ampliar el middleware.
3. Tests unitarios del middleware (función pura con mocks).

## Criterios de aceptación
- Un usuario desactivado pierde el acceso en el siguiente request.
- Nadie usa el sistema con una contraseña temporal.

## Solución aplicada (2026-10-07)

**Rama:** `fix/brechas-auditoria-2026-10-07`

### Cambios
- **Desactivación:** `UsersService.toggleUserStatus` bloquea al usuario en Supabase Auth (`ban_duration: '876000h'`), lo que impide renovar la sesión y operar contra Auth. Al reactivar, quita el bloqueo (`'none'`).
- **Middleware:** en cada petición lee `activo`, `aprobado` y `requiere_cambio_clave` desde `public.usuario`. Una cuenta desactivada pierde el acceso en el siguiente request: se cierra la sesión y se redirige a `/login?error=account_deactivated`. Esto además corrige un bucle de redirección que ya existía (dashboard → `/login` → dashboard con la sesión viva).
- **Contraseña temporal:** con `requiere_cambio_clave` cualquier ruta redirige a `/establecer-clave`. `requireProfile` rechaza todas las Server Actions hasta que se cambie la clave.

### Archivos
- `src/lib/auth/acceso.ts`, `src/lib/supabase/middleware.ts`, `src/lib/auth/guards.ts`, `src/services/users.service.ts`

### Tests
- `acceso.test.ts` (desactivado, no aprobado, sin perfil, cambio de clave, sin bucle en `/login`).
- `users.service.test.ts`: bloqueo y desbloqueo en Auth.
- `guards.test.ts`: `should_throw_when_temporary_password_must_be_changed`.

### Nota
- El middleware hace una consulta indexada por PK en cada petición autenticada. Con el volumen actual es despreciable. Si crece, se puede sincronizar el estado en `app_metadata`.
