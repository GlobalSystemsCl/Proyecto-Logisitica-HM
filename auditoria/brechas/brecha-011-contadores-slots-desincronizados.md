# Brecha 011 — Contadores de slots desincronizados

## Estado
Corregida y **aplicada en producción** el 2026-10-13 (0 diferencias entre contadores guardados y calculados en todas las sucursales)

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

## Solución aplicada (2026-10-07)

**Rama:** `fix/brechas-auditoria-2026-10-07`

### Motivo
La corrección necesita la definición exacta de `fn_recalcular_slots_ocupados` y de los triggers incrementales, que no están versionados (brecha 015). Desde este entorno no se pudo leer la base de producción, porque el acceso fue bloqueado por permisos. Escribir triggers a ciegas sobre contadores en producción es riesgoso.

### Avance indirecto
- El cierre de la escritura directa (brecha 005) y las transiciones condicionadas (brecha 010) eliminan dos de las causas probables de desajuste.

### Próximos pasos
1. Con el respaldo (`00_respaldo_antes_de_migrar.sql`, consulta 2), versionar las funciones de slots.
2. Script de recálculo único de `slots_ocupados` y `slots_reservados` para las 6 sucursales.
3. Unificar en un solo trigger de recálculo completo y eliminar el `disponibilidad()` duplicado.
4. Test que compare `ESTADOS_ACTIVOS_RESERVA` con la lista SQL.

## Solución aplicada (2026-10-13)

**Rama:** `joaco-ciclo-2` (commits `a260122` y `9861f15`). **Aplicada en producción** y verificada el mismo día.

### Diagnóstico en producción
Con acceso de lectura a la base se obtuvieron las definiciones reales de las funciones y triggers de slots. Causas confirmadas:
1. Mezcla de triggers incrementales (+1/−1) con `fn_recalcular_slots_ocupados`, que recalculaba solo `slots_ocupados` y **no contaba las reservas de traslados internos**: cada recálculo (entregar, finalizar, recibir traslado) borraba del contador las reservas de traslados pendientes.
2. `slots_reservados` nunca se recalculaba.
3. `tr_recalcular_slots_vehiculo` estaba **desactivado** desde el 2026-09-15 (`20260915_desactivar_trigger_slots_vehiculo.sql`, de forma "temporal" para la importación masiva de stock). Crear, editar, importar, borrar o mover vehículos no actualizaba los slots.
4. Fugas no detectadas en la auditoría: al **borrar una solicitud** o un **traslado interno** sus reservas se borraban en cascada pero los contadores nunca bajaban.
5. `fn_cancelar_traslado_interno` (requisito R8) descontaba solo `slots_reservados`, aunque la creación del traslado suma ambos contadores.
6. Liberación duplicada al cancelar (`trigger_disponibilidad` y `fn_liberar_slots_rechazo_cancelacion`) y lista de estados distinta entre el código y el SQL (`despachada`).

### Cambios
| Migración | Qué hace |
|---|---|
| `20261013120000_fix_cancelar_traslado_slots_ocupados` | La cancelación de un traslado interno descuenta ambos contadores (corrección de R8) |
| `20261013130000_brecha_011_recalculo_slots_unificado` | `fn_recalcular_slots_sucursal(id)`: fuente de verdad única. `reservados` = reservas de solicitudes activas + reservas de traslados pendientes o en tránsito; `ocupados` = vehículos con `ubicacion` = sucursal + `reservados`. Bloquea la fila de la sucursal para serializar recálculos concurrentes. `fn_estados_reserva_activos()` unifica la lista de estados. `fn_recalcular_slots_ocupados` delega en la nueva |
| `20261013140000_brecha_011_triggers_recalculo` | Los triggers de reservas (solicitudes y traslados), rechazo, cancelación, entrega, recepción y la RPC de cancelación de traslados recalculan en lugar de sumar/restar. Nuevos triggers `AFTER DELETE` en `solicitud`, `traslado_interno` y `traslado_interno_vehiculo`. Se elimina `trigger_disponibilidad` |
| `20261013150000_brecha_011_trigger_vehiculos` | Reemplaza el trigger por fila desactivado por 3 triggers **por sentencia** (alta, edición y borrado de vehículos): una importación masiva recalcula una vez cada sucursal afectada. Editar el precio no recalcula |
| `20261013160000_brecha_011_recalculo_global` | Recálculo único de todas las sucursales (repetible) |

Cada migración tiene su rollback en `supabase/rollback/` con las definiciones exactas de producción previas.

**Marcha blanca:** los límites de capacidad están desactivados a propósito (capacidades bajas como `slots = 2` son intencionales). Superar la capacidad solo emite un `RAISE NOTICE`; nunca bloquea una operación. Un test lo verifica.

Código: `ESTADOS_ACTIVOS_RESERVA` incluye `despachada` (sin efecto práctico: el flujo actual no la usa) y un test la compara con `fn_estados_reserva_activos()`.

### Verificación
- **Ensayos en producción** dentro de transacciones revertidas antes de aplicar: después de recalcular, cancelar, entregar, cancelar en tránsito, cancelar un traslado, borrar una solicitud, mover, crear y borrar vehículos y una actualización masiva, los contadores de todas las sucursales coincidieron con el cálculo.
- **Después de aplicar:** 0 diferencias en todas las sucursales. Corregidas: CONCON (ocupados 5→6, reservados 3→2), VALPARAISO (ocupados 41→40) y 408 (ocupados 2→1, reservados 2→1).
- Tests de contrato de cada migración y su rollback (`tests/unitarios/migracion-*.test.ts`, helper `tests/mocks/sql.ts`). Suite: 932 tests en verde, `tsc` y ESLint sin errores.

### Pendiente
- `fn_incrementar_slots_ocupados` y `fn_decrementar_slots_ocupados` siguen en la base sin trigger ni uso; se pueden eliminar.
- Tests de triggers contra un Postgres real (brecha 017).
