# Brecha 005 — RLS permisivo en `solicitud`, `solicitud_vehiculo` y `vehiculo`

## Estado
Corregida en código; migración lista, **pendiente de aplicar en producción**

## Severidad
High

## Categoría
Security / Database (RLS) — Broken Access Control, Business Logic Bypass

## Descripción
Las policies de escritura de tres tablas permiten, vía la API REST con la clave pública, modificaciones que la aplicación nunca permitiría:

1. **`solicitud` UPDATE** (`solicitud_update_participantes`): `USING` admite admin, `ejecutivo_id`, `jefe_local_id`, `logistica_id` o JL de la sucursal principal. `WITH CHECK` es **solo `usuario_activo()`**. Un ejecutivo puede cambiar cualquier columna de su solicitud: `estado` (por ejemplo, a `finalizada`, lo que dispara el trigger que marca los vehículos como `vendido` y los saca del inventario), `posicion_prioridad`, `logistica_id`, `jefe_local_id`, fechas, e incluso reasignar `ejecutivo_id` a otro usuario.
2. **`solicitud_vehiculo` INSERT/UPDATE** (`sv_insert_logistica`, `sv_update_logistica`): cualquier usuario con rol `logistica` (sin exigir `usuario_activo()`) puede insertar o cambiar reservas de **cualquier** solicitud y vehículo, saltando la validación de doble reserva del service.
3. **`vehiculo` UPDATE/INSERT** (`vehiculo_update_gestores`): cualquier `jefe_local` o `logistica` puede modificar cualquier vehículo (precio, ubicación, chasis), incluso reservados o vendidos, cosa que `VehiculoService.updateVehiculo` sí impide. Cambiar `ubicacion` dispara el recálculo de slots.

Además, la policy SELECT de `solicitud` para JL usa solo `usuario.sucursal_id` y estados `pendiente/priorizada`, distinta de la regla de la app (principal + encargadas, todos los estados). Es una inconsistencia, no una fuga.

## Evidencia
- `pg_policies`: `solicitud_update_participantes` (`with_check = usuario_activo()`), `sv_insert_logistica`, `sv_update_logistica`, `vehiculo_update_gestores`, `vehiculo_insert_gestores`.
- Grants: `authenticated` tiene `UPDATE`/`INSERT` en todas las columnas de `solicitud`.
- Triggers que amplifican el efecto: `tr_finalizar_solicitud_vehiculos`, `tr_entregar_solicitud_vehiculos`, `tr_recalcular_slots_vehiculo`.
- Reglas de la app que se saltan: `SolicitudesService.finalizarSolicitud` (~1880), `agregarVehiculo` (~1513), `VehiculoService.updateVehiculo` (~287).

## Impacto
Manipulación de información y corrupción de datos: marcar vehículos como vendidos, sacarlos del inventario, alterar la cola de prioridad de otras solicitudes, reasignar responsables, falsear fechas de entrega. Todo queda fuera de la auditoría de la app, que solo registra lo que pasa por los services.

## Cómo reproducirlo
(No ejecutado.)
1. Iniciar sesión como ejecutivo con `supabase-js`.
2. `supabase.from('solicitud').update({ estado: 'finalizada' }).eq('id', <solicitud propia en estado aprobada>)`.
3. Los vehículos de la solicitud quedan `vendido` con `ubicacion = NULL`.

## Causa raíz
Policies pensadas para un cliente que escribe directo, que la app ya no usa (todo pasa por service_role). Quedaron abiertas y sin restricción de columnas ni de transiciones.

## Solución propuesta
Como la aplicación no escribe estas tablas con el cliente anon (No encontrado en el código analizado ningún uso), la opción más segura y simple es:
1. Eliminar las policies `UPDATE`/`INSERT` para `authenticated` en `solicitud`, `solicitud_vehiculo` y `vehiculo` (dejar solo admin, o ninguna) y hacer `REVOKE INSERT, UPDATE, DELETE` sobre esas tablas para `anon` y `authenticated`.
2. Mantener las policies `SELECT`, alineadas con la regla de visibilidad de la app (usar `usuario_tiene_sucursal` para JL y añadir la logística por zona).
3. A futuro (brecha 010), mover las transiciones de estado a funciones SQL `SECURITY DEFINER` que validen rol, alcance y transición en una sola transacción.
4. Aplicar el mismo criterio a `observacion` UPDATE/DELETE y `traslado_*` si no hay uso directo.

## Riesgos de la solución
- Si alguna parte del frontend usara el cliente anon para escribir, dejaría de funcionar. No se encontró ninguna; verificar con búsqueda de `createClient` en `src/components` y `src/app/**/*Client.tsx` antes de aplicar.

## Tests necesarios
- Con JWT de ejecutivo: `UPDATE solicitud SET estado='finalizada'` → 0 filas o error.
- Con JWT de logística: `INSERT solicitud_vehiculo` → error.
- Con JWT de JL: `UPDATE vehiculo SET precio=...` → error.
- Regresión: todas las actions de solicitudes y vehículos siguen funcionando (usan service_role).

## Plan de implementación
1. Confirmar por búsqueda que no hay escrituras con el cliente anon.
2. Migración de policies y grants.
3. Tests SQL por rol.
4. Prueba manual del flujo completo de una solicitud.

## Criterios de aceptación
- Ningún rol no administrador puede escribir en `solicitud`, `solicitud_vehiculo` o `vehiculo` vía REST.
- La aplicación funciona igual que antes.

## Solución aplicada (2026-10-07)

**Rama:** `fix/brechas-auditoria-2026-10-07`

### Cambios
- Resuelto con la misma migración que la 001: `authenticated` ya no tiene INSERT, UPDATE ni DELETE en ninguna tabla de `public`. Ningún rol puede escribir `solicitud`, `solicitud_vehiculo` ni `vehiculo` por la API REST.
- Defensa en profundidad: `solicitud_update_participantes`, `sv_insert_logistica`, `sv_update_logistica`, `vehiculo_update_gestores` y `vehiculo_insert_gestores` pasan a exigir `es_administrador()` en `USING` y `WITH CHECK`. Si una policy no existe con ese nombre, se informa con NOTICE y la migración continúa.
- Además, el trigger `tr_validar_reserva_unica_vehiculo` (brecha 010) valida en la BD que no se reserve un vehículo vendido ni uno ya reservado.

### Archivos
- `projecto_logistica_hm/supabase/migrations/20261007120000_brecha_001_005_permisos_escritura.sql` (+ rollback)

### Pendiente
- Alinear la policy SELECT de `solicitud` para Jefe de Local con la regla de la app (principal + encargadas, todos los estados). Es una inconsistencia de lectura, no una fuga, y requiere la definición actual de la policy (ver respaldo).
- Tests RLS por rol con Supabase local (brecha 017).
