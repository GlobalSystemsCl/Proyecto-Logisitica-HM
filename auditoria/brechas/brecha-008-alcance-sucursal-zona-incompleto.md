# Brecha 008 — Alcance por sucursal o zona incompleto en acciones de Jefe de Local y Logística

## Estado
Pendiente

## Severidad
Medium

## Categoría
Security — Broken Access Control (horizontal), Business Logic

## Descripción
Las listas de solicitudes se filtran por alcance (JL: sus sucursales; Logística: sus zonas), pero varias acciones de escritura solo verifican el **rol** y no el alcance. Un usuario puede operar sobre solicitudes que no ve en su lista si conoce el UUID.

| Action | Rol que pasa | Falta verificar |
|---|---|---|
| `reordenarColaAction(sucursalId, orden)` | JL | Valida que el JL tenga `sucursalId`, pero **no que los IDs de `orden` pertenezcan a esa sucursal**. Puede reescribir posiciones de solicitudes de otra sucursal |
| `agregarVehiculoAction` / `quitarVehiculoAction` | JL, logística | Que la solicitud sea de su sucursal o zona. `agregarVehiculo` tampoco valida que el vehículo no esté vendido ni su ubicación |
| `calendarizarSolicitudAction` / `descalendarizarSolicitudAction` | JL, logística | Alcance. Además, calendarizar asigna `logistica_id = usuario actual` aunque sea JL |
| `despacharSolicitudAction` / `cancelarDespachoSolicitudAction` | logística | Zona |
| `asignarEncargadoAction` | logística | Zona de la solicitud y del encargado |
| `cancelarSolicitudAction` | logística | Cualquier logística cancela cualquier solicitud pre-despacho |
| `priorizarEnPosicionAction` | JL | Sí valida la sucursal (correcto) |

## Evidencia
- `src/app/actions/solicitudes.actions.ts`: `reordenarColaAction` (~313), `cancelarSolicitudAction` (~368, `|| profile.rol === 'logistica'`), `agregarVehiculoAction` (~429), `quitarVehiculoAction` (~448), `calendarizarSolicitudAction` (~540), `descalendarizarSolicitudAction` (~566), `despacharSolicitudAction` (~585), `asignarEncargadoAction` (~671).
- `src/services/solicitudes.service.ts`: `reordenarCola` (~776) solo valida que los IDs estén `priorizada`; `calendarizarSolicitud` (~1615, ~1642 `logistica_id: usuarioId`); `agregarVehiculo` (~1513).

## Impacto
Manipulación limitada entre sucursales: alterar prioridades ajenas, cancelar, despachar o calendarizar solicitudes de otras zonas, reservar vehículos vendidos o de otra ubicación. Requiere una cuenta legítima del rol y conocer UUIDs.

## Cómo reproducirlo
(No ejecutado.) JL de la sucursal A: `reordenarColaAction(A, ['<uuid priorizada de B>'])` → la solicitud de B pasa a la posición 1. Por la UNIQUE `(sucursal, posicion_prioridad)` podría fallar o quedar en una posición inconsistente de la cola de B.

## Causa raíz
Verificaciones de rol copiadas action por action, sin un guard de alcance común. La regla de visibilidad (lectura) no se reutiliza para escritura.

## Solución propuesta
1. Usar `requireSolicitudAccess(profile, id, 'escribir')` (brechas 004/006) en todas las actions mutantes.
2. `reordenarCola`: filtrar `.eq('sucursal', sucursalId)` al validar los IDs y exigir que `orden` sea exactamente la cola actual de esa sucursal.
3. `agregarVehiculo`: rechazar vehículos vendidos (`solicitud_vehiculo.disponibilidad='vendido'` o `ubicacion IS NULL`) y validar la ubicación coherente con el tipo de solicitud.
4. Calendarizar: no sobrescribir `logistica_id` si el actor no es logística, o restringir calendarizar a logística o admin según la regla de negocio (confirmar con el negocio).
5. Logística: validar la zona de la sucursal origen.

## Riesgos de la solución
- Puede cambiar el comportamiento esperado por los usuarios (por ejemplo, si el negocio quiere que cualquier logística cancele). Confirmar reglas antes de implementar.

## Tests necesarios
- Por cada action: actor dentro del alcance → OK; fuera → error.
- `reordenarCola` con IDs de otra sucursal → error.
- `agregarVehiculo` con vehículo vendido → error.

## Plan de implementación
1. Validar las reglas con el negocio (tabla de la sección 12 de la documentación).
2. Implementar el guard y aplicarlo.
3. Tests.

## Criterios de aceptación
- Ninguna acción mutante opera fuera del alcance definido para el rol.
