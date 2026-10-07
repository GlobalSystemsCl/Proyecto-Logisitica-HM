# Brecha 024 — Consultas sin paginación, filtrado en memoria y RLS no optimizado

## Estado
Parcial

## Severidad
Low

## Categoría
Performance / Scalability

## Descripción
1. `SolicitudesService.getSolicitudes()` (admin) y `getSolicitudesPorZonas()` (logística) traen **todas** las solicitudes con joins. La segunda filtra por zona en memoria.
2. `AuditoriaService.getAuditoria()` trae toda la tabla `auditoria` (228 filas hoy, crecimiento lineal) más consultas adicionales para resolver entidades.
3. `AuthService.getCurrentUserProfile()` hace 3 consultas por llamada (perfil, sucursales, zonas) y se invoca en cada página y en cada Server Action. Algunas actions hacen además `getSolicitudById` y `usuarioTieneSucursal`, con varias idas y vueltas por operación.
4. `reescribirCola`: N updates secuenciales.
5. `importVehiculosCSV`: descarga todos los chasis existentes (paginado de 1000 en 1000) en cada importación y resuelve marcas una a una.
6. BD: 19 policies con `auth.uid()` sin envolver en `(select auth.uid())` (advisor `auth_rls_initplan`), 12 FKs sin índice (incluidas `solicitud.ejecutivo_id`, `jefe_local_id`, `logistica_id`, `observacion.solicitud_id`, `solicitud_vehiculo.vehiculo_id`, `usuario.sucursal_id`), 9 índices sin uso y políticas permisivas múltiples.
7. Componentes cliente de 50-77 KB que reciben listas completas como props: el payload RSC crece con los datos.

## Evidencia
- `src/services/solicitudes.service.ts` ~306-330, ~477-498.
- `src/services/auditoria.service.ts` ~70-110.
- `src/services/auth.service.ts` ~63-150.
- Advisors de rendimiento de Supabase (2026-10-07).

## Impacto
Con los volúmenes actuales (13 solicitudes) es imperceptible. Con miles de solicitudes o auditorías, el tiempo de carga del dashboard, del historial y de logística crecerá linealmente.

## Cómo reproducirlo
No aplica (volumen insuficiente).

## Causa raíz
Diseño inicial sin paginación; filtros que no se pueden expresar fácilmente con PostgREST (zona vía join), resueltos en JS.

## Solución propuesta
1. Paginación (`range`) y filtros server-side en listados y en el historial.
2. Filtro de zona en BD: `.in('sucursal', idsDeSucursalesDeMisZonas)` (calculando las sucursales de las zonas primero) o una vista o RPC.
3. Cachear el perfil por request con `React.cache()` en `getCurrentUserProfile`.
4. Índices en las FKs señaladas; `(select auth.uid())` en las policies; eliminar índices sin uso tras observarlo en producción.
5. Reordenar la cola en una sola sentencia (ver brecha 010).

## Riesgos de la solución
- La paginación cambia la UX de las tablas (filtros cliente que hoy operan sobre toda la lista).

## Tests necesarios
- Unit: `getSolicitudesPorZonas` construye el filtro en la consulta.
- Prueba de carga simple con datos sintéticos (Supabase local).

## Plan de implementación
1. Índices + policies (migración rápida, bajo riesgo).
2. `React.cache` del perfil.
3. Paginación del historial y de los listados.

## Criterios de aceptación
- Advisors de rendimiento sin WARN.
- Listados con tiempo constante respecto al total de registros.

## Solución aplicada (2026-10-07)

**Rama:** `fix/brechas-auditoria-2026-10-07`

### Cambios
- `AuthService.getCurrentUserProfile` envuelto en `React.cache`: en una misma petición, páginas, layouts y actions reutilizan el perfil en lugar de repetir 3 consultas cada vez.
- `getSolicitudesPorZonas` (logística): el filtro por zona se hace en la BD (`sucursal.zona_id IN … → solicitud.sucursal IN …`) en lugar de traer todas las solicitudes y filtrarlas en memoria.
- Migración con índices para las FKs más usadas en filtros: `solicitud(ejecutivo_id)`, `(jefe_local_id)`, `(logistica_id)`, `observacion(solicitud_id)`, `solicitud_vehiculo(vehiculo_id)`, `usuario(sucursal_id)`.

### Archivos
- `src/services/auth.service.ts`, `src/services/solicitudes.service.ts`
- `projecto_logistica_hm/supabase/migrations/20261007120500_brecha_024_indices_fk.sql` (+ rollback)

### Tests
- `solicitudes.brechas.test.ts`: `should_filter_by_zone_branches_in_the_database` y casos borde.

### Pendiente
- Paginación del historial (`AuditoriaService.getAuditoria`) y de los listados (cambia la UX de las tablas).
- `(select auth.uid())` en las 19 policies del advisor `auth_rls_initplan`, y las 6 FKs restantes sin índice. Requiere la definición actual de cada policy (ver respaldo).
- Reordenar la cola en una sola sentencia (brecha 010, paso 3).
