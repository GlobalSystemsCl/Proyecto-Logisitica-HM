# Brecha 018 — Auditoría best-effort y sistema de notificaciones sin implementar

## Estado
Pendiente

## Severidad
Low

## Categoría
Bug / Architecture — Logging, Traceability

## Descripción
1. La auditoría la escribe la aplicación (`SolicitudesService.registrarAuditoria`) **después** del cambio y en un `try/catch` que solo hace `console.error`. Si falla, el cambio queda sin rastro. Los cambios hechos por la API REST directa (brecha 005) o en el dashboard de Supabase no se auditan.
2. Existen funciones SQL de auditoría (`cambio_estado_auditoria`, `auditoria_disponibilidad`) y de notificación (`notificar_solicitud`, `notificar_solicitud_vehiculo`, `notificar_observacion`), pero **ninguna está conectada a un trigger**. La tabla `notificacion` tiene 0 filas y no se lee en el frontend (No encontrado en el código analizado).
3. La auditoría no registra varias acciones administrativas: creación, edición, desactivación, aprobación y reset de contraseña de usuarios; CRUD de sucursales, zonas y marcas; eliminación física de solicitudes (`eliminarSolicitud` no audita).
4. `auditoria.entidad_id` es `uuid`, pero `reordenarCola` registra `sucursal_${id}` (no es UUID). Ese insert falla siempre y en silencio.
5. `auditoria.usuario_id` es NOT NULL con FK: los cambios de triggers con `auth.uid()` null (service_role) fallarían si se conectaran tal cual.

## Evidencia
- `src/services/solicitudes.service.ts` `registrarAuditoria` (~1415-1436), `reordenarCola` (~820-826, entidad_id `sucursal_${sucursalId}`), `eliminarSolicitud` (~1036, sin auditoría).
- Lista de triggers (sección 8 de la documentación): las funciones citadas no aparecen.
- Columnas de `auditoria`: `entidad_id uuid NOT NULL`, `usuario_id uuid NOT NULL`.
- Conteo por acción en `auditoria` (2026-10-07): 0 registros `reorden_cola` y 0 de acciones de usuarios o sucursales, frente a 46 `priorizacion`. Es coherente con el fallo silencioso, aunque también podría ser que la función no se haya usado (No determinado).

## Impacto
Trazabilidad incompleta para investigar incidentes (por ejemplo, las brechas 001/005) y para el módulo de historial. Las notificaciones prometidas por el enum no existen.

## Cómo reproducirlo
Reordenar una cola y revisar `auditoria`: no aparece el registro `reorden_cola` (No ejecutado; deducido del tipo de columna).

## Causa raíz
Auditoría implementada en dos lugares a medias; desajuste de tipos.

## Solución propuesta
1. Decidir una sola fuente: triggers en BD (recomendado para estados y vehículos), usando `auth.uid()` o un parámetro de sesión `set_config('app.usuario_id', ...)` que fije el service antes de escribir.
2. Permitir `usuario_id` NULL (acción de sistema) o pasar el actor explícitamente.
3. Corregir `reordenarCola`: usar una entidad `sucursal` con un ID numérico en `valor_nuevo`, o cambiar `entidad_id` a `text`.
4. Auditar acciones administrativas y eliminaciones.
5. Notificaciones: implementarlas (conectar triggers y UI) o eliminar las funciones, la tabla y el enum.

## Riesgos de la solución
- Doble registro durante la transición (app + trigger). Eliminar el registro de la app al activar los triggers.

## Tests necesarios
- Cada transición genera exactamente 1 registro.
- `reordenarCola` audita correctamente.

## Plan de implementación
1. Decidir el diseño. 2. Migración. 3. Retirar la auditoría duplicada de la app. 4. Tests.

## Criterios de aceptación
- Todo cambio de estado, sea cual sea su origen, queda auditado con su actor.
