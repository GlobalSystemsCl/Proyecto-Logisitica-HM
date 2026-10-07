# Brecha 010 — Condiciones de carrera y operaciones multi-paso sin transacción

## Estado
Pendiente

## Severidad
Medium

## Categoría
Bug / Database — Concurrency, Data Integrity

## Descripción
La capa de services hace "leer estado → validar → escribir" en llamadas HTTP separadas a PostgREST, sin transacción ni condición en el `UPDATE`:

1. **Transiciones de estado**: `aprobarSolicitud`, `rechazar`, `cancelar`, `calendarizar`, `despachar`, `recibir`, `finalizar`, `asignarEncargado`, etc. leen `actual.estado` y luego hacen `.update({...}).eq('id', id)` **sin** `.eq('estado', actual.estado)`. Dos usuarios simultáneos pueden aplicar transiciones incompatibles (por ejemplo, cancelar y despachar).
2. **Doble reserva de vehículo**: `createSolicitud` y `agregarVehiculo` consultan si el vehículo está reservado y luego insertan. No existe restricción en la BD que lo impida, así que dos solicitudes simultáneas pueden reservar el mismo vehículo. Hoy no hay duplicados (consulta verificada).
3. **Creación en varios pasos**: `createSolicitud` (insert solicitud → insert vehículos → si falla, borra la solicitud), `crearTraslado` (igual), `subirDocumentos` (storage + fila + auditoría, con borrado compensatorio). Si el proceso muere entre pasos, quedan datos parciales.
4. **Reescritura de la cola de prioridad**: `reescribirCola` pone NULL y luego hace N updates secuenciales. Una interrupción deja la cola parcialmente en NULL (documentado en el código como "reparable"). Dos reordenamientos simultáneos se intercalan.
5. **Contador de intentos de login**: lectura-incremento-escritura no atómica (ver brecha 012).

## Evidencia
- `src/services/solicitudes.service.ts`: `createSolicitud` (~590-700), `agregarVehiculo` (~1513-1560), `reescribirCola` (~962-982), transiciones en ~1002-1950 (todos `.eq('id', id)` solo).
- `src/services/traslado.service.ts`: `crearTraslado` (~119-250, borrado compensatorio ~224).
- BD: ninguna restricción ni índice único parcial sobre `solicitud_vehiculo(vehiculo_id) WHERE disponibilidad='reservado'`.
- `tests/documentacion_testing.md` caso INT-TRIG-04 ya lo había detectado.

## Impacto
Inconsistencias de datos con baja probabilidad hoy (pocos usuarios), creciente con el uso: vehículos en dos solicitudes, estados imposibles, colas con huecos o NULL, slots desajustados (brecha 011).

## Cómo reproducirlo
(No ejecutado.) Lanzar en paralelo dos `createSolicitudAction` con el mismo `vehiculo_id`.

## Causa raíz
PostgREST no ofrece transacciones multi-statement desde el cliente, y la lógica se escribió en TypeScript en lugar de funciones SQL.

## Solución propuesta
1. **Mínimo (cambio pequeño)**: en cada transición, `update(...).eq('id', id).eq('estado', actual.estado).select('id')` y tratar 0 filas como conflicto ("la solicitud cambió, recarga").
2. **Restricción de BD** contra doble reserva. No se puede con un índice parcial directo porque el estado está en otra tabla. Opciones: (a) trigger `BEFORE INSERT` en `solicitud_vehiculo` con `pg_advisory_xact_lock(hashtext(vehiculo_id))` que valide reservas activas; (b) desnormalizar un flag `activa` en `solicitud_vehiculo` mantenido por trigger + índice único parcial `(vehiculo_id) WHERE disponibilidad='reservado' AND activa`.
3. **Funciones RPC transaccionales** para crear solicitud + vehículos, crear traslado + vehículos y reordenar la cola (`UPDATE ... FROM unnest(ids) WITH ORDINALITY` en una sola sentencia, con las restricciones UNIQUE como `DEFERRABLE INITIALLY DEFERRED`).

## Riesgos de la solución
- Mover lógica a SQL cambia dónde se testea. Requiere tests de BD (brecha 017).
- La condición de estado puede generar más errores de "conflicto" visibles para el usuario: es el comportamiento correcto.

## Tests necesarios
- Doble reserva concurrente → solo una tiene éxito.
- Transición con estado cambiado entre lectura y escritura → error de conflicto.
- Reordenamiento atómico: fallo a mitad → cola intacta.

## Plan de implementación
1. Aplicar el paso 1 en todas las transiciones (bajo riesgo).
2. Trigger anti doble reserva.
3. RPCs transaccionales, empezando por `createSolicitud` y `reordenarCola`.

## Criterios de aceptación
- Imposible reservar un vehículo dos veces aun con concurrencia.
- Ninguna transición se aplica sobre un estado distinto del validado.
