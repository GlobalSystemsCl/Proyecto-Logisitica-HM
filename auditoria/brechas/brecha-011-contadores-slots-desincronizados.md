# Brecha 011 — Contadores de slots desincronizados

## Estado
Pendiente

## Severidad
Medium

## Categoría
Bug / Database — Data Integrity

## Descripción
`sucursal.slots_ocupados` y `sucursal.slots_reservados` se mantienen con dos mecanismos que no son coherentes entre sí:
- Triggers **incrementales** (+1/−1): `fn_reservar_slots_solicitud_vehiculo`, `fn_liberar_slots_solicitud_vehiculo_eliminado`, `fn_liberar_slots_rechazo_cancelacion`, `fn_reservar_slots_traslado_vehiculo`.
- **Recálculo completo** de `slots_ocupados` (`fn_recalcular_slots_ocupados`) al mover vehículos o finalizar. No recalcula `slots_reservados`.

La lista de estados "activos" también difiere entre el código (`ESTADOS_ACTIVOS_RESERVA`, sin `despachada`) y el SQL (incluye `despachada`). La cancelación libera vehículos en dos triggers distintos (`disponibilidad()` y `fn_liberar_slots_rechazo_cancelacion`). Por orden alfabético, `tr_liberar_…` se ejecuta primero y descuenta slots, y `trigger_disponibilidad` llega cuando ya no quedan vehículos reservados. Hoy es redundante, no dañino, pero es frágil ante renombres. La causa exacta de cada desajuste observado es **No determinado** sin el historial de operaciones. Posibles orígenes: cambios de estado hechos fuera del flujo (brecha 005), operaciones parciales (brecha 010) o versiones anteriores de los triggers.

## Evidencia
Consulta de solo lectura (2026-10-07) comparando el valor guardado con el recálculo:

| Sucursal | ocupados guardado | ocupados calculado | reservados guardado | reservados calculado aprox. |
|---|---|---|---|---|
| 6 | 5 | 4 | 0 | 0 |
| 7 | 1 | 1 | 2 | 0 |
| 8 | 2 | 1 | 1 | 1 |
| 9 | 16 | 16 | 0 | 0 |
| 407 | 1 | 1 | 1 | 1 |
| 408 | 2 | 1 | 2 | 1 |

Además, sucursales con `slots=2` tienen 4-16 ocupados (capacidad excedida). La función solo emite `RAISE NOTICE`, por decisión documentada de "no bloquear".

## Impacto
Los indicadores de slots del dashboard, de `/logistica/slots` y del encabezado muestran ocupación incorrecta, lo que afecta decisiones operativas. No hay pérdida de datos.

## Cómo reproducirlo
Ejecutar la consulta de comparación (incluida arriba) en el SQL editor.

## Causa raíz
Mezcla de contadores incrementales y recálculo; triggers solapados en cancelación; lista de estados duplicada en dos lenguajes.

## Solución propuesta
1. Reemplazar los contadores almacenados por cálculo en lectura: una vista `v_sucursal_slots` o una función `fn_obtener_slots_disponibles` (ya existe una RPC con ese nombre) que calcule ocupados y reservados al vuelo. Con el volumen actual es barato.
2. Si se mantienen almacenados: un único trigger que siempre llame a un recálculo completo de ambos contadores para las sucursales afectadas, y eliminar los incrementales y el trigger `disponibilidad()` duplicado.
3. Unificar la lista de estados activos en una sola fuente (por ejemplo, una función SQL `fn_estados_reserva_activos()` usada por triggers y por el código vía RPC, o al menos un test que compare ambas listas).
4. Script de corrección única: recalcular las 6 sucursales.

## Riesgos de la solución
- Cambiar a cálculo en lectura requiere tocar los services que leen `slots_ocupados` (`SucursalesService`, `lib/slots.ts`).

## Tests necesarios
- Tras crear, cancelar, rechazar, finalizar, mover vehículo y traslado: contador = recálculo.
- Test que compare `ESTADOS_ACTIVOS_RESERVA` con la lista SQL.

## Plan de implementación
1. Script de recálculo (corrección de datos).
2. Unificar triggers.
3. Tests de BD.

## Criterios de aceptación
- La consulta de comparación devuelve diferencia 0 en todas las sucursales después de cualquier operación.
