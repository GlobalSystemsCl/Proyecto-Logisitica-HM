# Brecha 001 — Escalamiento a administrador por la policy UPDATE de `usuario`

## Estado
Pendiente

## Severidad
Critical

## Categoría
Security / Database (RLS) — Privilege Escalation, Broken Access Control

## Descripción
La policy RLS `"Administradores pueden actualizar usuarios"` de `public.usuario` permite `UPDATE` cuando `es_administrador() OR auth.uid() = id`. No tiene `WITH CHECK` ni restricción de columnas, y los roles `anon` y `authenticated` tienen privilegio `UPDATE` sobre las 13 columnas de la tabla. Por lo tanto, cualquier usuario autenticado puede modificar **su propia fila completa**, incluidas `rol`, `activo`, `requiere_cambio_clave`, `intentos_fallidos`, `bloqueado_hasta` y `sucursal_id`.

Las funciones `tiene_rol()`, `es_administrador()` y `usuario_activo()`, que sostienen todas las demás policies, y `AuthService.getCurrentUserProfile()`, que usan todas las Server Actions, leen el rol desde esta misma fila. Cambiarla convierte al usuario en administrador en toda la aplicación y en toda la RLS.

## Evidencia
- Tabla: `public.usuario`
- Policy: `Administradores pueden actualizar usuarios` — `cmd=UPDATE`, `roles={public}`, `qual=(es_administrador() OR (auth.uid() = id))`, `with_check=NULL` (consulta a `pg_policies`).
- Grants: `information_schema.column_privileges` → `authenticated` tiene `UPDATE` en 13 columnas de `usuario`.
- No existe trigger en `usuario` que impida cambiar `rol` (solo `tr_usuario_updated_at`).
- La clave anon/publishable es pública (`NEXT_PUBLIC_SUPABASE_ANON_KEY` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `src/lib/supabase/client.ts`).
- Lectura del rol: `src/services/auth.service.ts` `getCurrentUserProfile()` (~línea 63) y funciones SQL `tiene_rol`, `es_administrador`.

## Impacto
Compromiso total del sistema. Un usuario de cualquier rol, o cualquier persona que se registre por `/registro` (ver brecha 002/003), puede volverse `administrador` y desde ahí:
- Crear, borrar y desactivar usuarios; resetear contraseñas.
- Ver y modificar todas las solicitudes, vehículos y sucursales, y borrar sucursales con sus solicitudes en cascada.
- Leer el historial de auditoría completo.

## Cómo reproducirlo
(No ejecutado. Descripción para verificación controlada en un entorno de prueba.)
1. Iniciar sesión con cualquier usuario usando `supabase-js` y la clave pública.
2. Ejecutar `supabase.from('usuario').update({ rol: 'administrador' }).eq('id', <propio uid>)`.
3. Recargar la app: el dashboard muestra todos los módulos de administrador.

## Causa raíz
La policy se diseñó para que el usuario editara su perfil (nombre, teléfono), pero no limita columnas. El modelo de permisos guarda el rol en una fila que el propio usuario puede escribir. Además, la app no necesita esa policy: `updateProfile` ya usa service_role.

## Solución propuesta
1. Eliminar la rama `auth.uid() = id` de la policy UPDATE (dejar solo `es_administrador()`), ya que la edición de perfil se hace por el servidor con service_role.
2. Defensa en profundidad: `REVOKE UPDATE ON public.usuario FROM anon, authenticated;` y, si se quiere conservar la autoedición directa, `GRANT UPDATE (nombre, apellido, telefono) ON public.usuario TO authenticated;`.
3. Trigger `BEFORE UPDATE` que rechace cambios de `rol`, `activo`, `requiere_cambio_clave`, `intentos_fallidos`, `bloqueado_hasta` y `sucursal_id` cuando `auth.uid()` no sea null y no sea administrador.
4. Revisar la policy INSERT (`es_administrador() OR auth.uid() = id`): un usuario cuya fila no existe podría insertarse con `rol='administrador'`. Dejar solo `es_administrador()`.
5. Cambiar `roles={public}` a `{authenticated}` en las 5 policies de `usuario`.
6. Auditoría post-incidente: revisar `auth.audit_log_entries` y los logs de PostgREST para detectar PATCH a `/rest/v1/usuario`, y confirmar que los 2 administradores actuales son legítimos.

## Riesgos de la solución
- Si algún componente cliente escribiera `usuario` directamente, dejaría de funcionar. No se encontró ninguno: todas las escrituras pasan por service_role.
- El trigger debe permitir operaciones del service_role (`auth.uid()` es null en ese contexto).

## Tests necesarios
- Test SQL (pgTAP o script con JWT de usuario no admin): `UPDATE usuario SET rol='administrador' WHERE id=auth.uid()` → 0 filas o error.
- Mismo test para `activo`, `sucursal_id` e `INSERT` de fila propia con rol admin.
- Test: un admin sigue pudiendo actualizar usuarios vía service_role (`UsersService.updateUser`).
- Test de regresión: `updateProfileAction` sigue funcionando.

## Plan de implementación
1. Crear la migración `supabase/migrations/<fecha>_fix_rls_usuario.sql` con los pasos 1-5.
2. Aplicarla en producción (decisión del usuario: producción directa) fuera de horario y con respaldo previo (`pg_dump` de `public.usuario` y de las policies).
3. Ejecutar los tests SQL con un JWT de ejecutivo de prueba.
4. Probar manualmente: editar perfil, crear y editar usuario como admin.
5. Ejecutar la auditoría post-incidente (paso 6).

## Criterios de aceptación
- Un usuario no administrador no puede modificar ninguna columna sensible de su fila por la API REST.
- `get_advisors` no reporta nuevos problemas.
- Los flujos de perfil y gestión de usuarios siguen funcionando.
