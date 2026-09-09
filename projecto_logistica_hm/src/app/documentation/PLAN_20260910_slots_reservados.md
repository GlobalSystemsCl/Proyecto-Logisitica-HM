# PLAN — Slots por ubicación + slots_reservados + estado `vendido`

> **Fecha:** 2026-09-10
> **Estado:** EN_PROGRESO (aprobado — guardado de la sesión)
> **Módulos afectados:** Sucursales, Vehículos, Solicitudes (reserva/entrega), Logística, Base de datos

---

## 1. Contexto y conceptos

| Concepto | Significado |
|---|---|
| `sucursal` (origen de la solicitud) | Sucursal donde **se inicia la solicitud** (la que pide el vehículo) |
| `vehiculo.ubicacion` | Ubicación **física actual** del vehículo (independiente de la solicitud); no cambia al crear la solicitud |
| `sucursal_destino` (destino de la solicitud) | Hacia dónde se **mueve el vehículo al entregarse**; la ocupación de slots se aplica SIEMPRE a esta sucursal |
| `solicitud_vehiculo.disponibilidad` | enum `reservado` / `liberado` / **`vendido`** (nuevo) |

### Por qué `slots_reservados` y `slots_ocupados` hacen la misma operación

Al crear la solicitud, los autos **aún no han cambiado de `ubicacion`** (siguen en su sucursal actual). El count físico de la sucursal **destino** es 0 aunque lleguen vehículos. Para validar capacidad ANTES de aceptar la solicitud, se **simula** la ocupación:

- `slots_reservados += N` (vehículos por llegar al destino)
- `slots_ocupados += N` (espacio comprometido desde ya en el destino)
- **Validación inmediata**: `slots_ocupados ≤ slots` evaluada en el mismo acto de reservar. Si excede → la solicitud NO se crea.

`slots_reservados` existe para **sumar la cantidad de autos de la solicitud antes de que la ubicación/destino cambie** y así validar la disponibilidad de slots al hacer la solicitud.

---

## 2. Modelo de slots (validado)

| Momento / disparador | `slots_reservados` (destino) | `slots_ocupados` (destino) |
|---|---|---|
| Crear solicitud / reservar (`INSERT solicitud_vehiculo`) | `+= N` | `+= N` → **validación INMEDIATA `ocupados ≤ slots`** (si excede → rechazo de creación) |
| Cancelar / rechazar (`UPDATE solicitud` → `rechazada`/`cancelada`) | `-= N` | `-= N` + `disponibilidad = 'liberado'` + recount |
| Entregar (`UPDATE solicitud` → `entregada`) | `-= N` | `-= N`, `vehiculo.ubicacion = sucursal_destino`, `disponibilidad = 'vendido'` + **recount** origen y destino |
| Finalizar (`entregada` → `finalizada`) | sin cambios | sin cambios (resuelve bug `SLOT-08`) |
| Crear / editar vehículo | — | recount (si `ubicacion` = sucursal) |
| Eliminar vehículo | — | recount |

**Fuente de verdad:** `slots_ocupados` definitivo = `COUNT(vehiculo WHERE ubicacion = sucursal.id)`, garantizado por `fn_recalcular_slots_ocupados` tras cada operación.

**Caso borde venta interna (destino = origen):** mismo tratamiento (`+N` al reservar, `-N` + recount al entregar, en la misma sucursal). El neto queda consistente por el recount.

---

## 3. Cambios de base de datos (migración `20260910_slots_reservados_v2.sql`)

1. `ALTER TABLE public.sucursal ADD COLUMN slots_reservados BIGINT DEFAULT 0;`
2. `ALTER TYPE public.disponibilidad ADD VALUE 'vendido';`
3. Eliminar columna `public.vehiculo.vendido` (boolean; existe solo en `esquema-completo-sql.sql`, sin migración ni documentación).
4. Función `fn_recalcular_slots_ocupados(p_sucursal_id bigint)`:
   - Hace `UPDATE public.sucursal SET slots_ocupados = COUNT(vehiculo WHERE ubicacion = p_sucursal_id)`.
   - **Validación**: si `slots_ocupados > slots` → `RAISE EXCEPTION` (inquebrantable a nivel BD, no solo en Server Actions).
5. Reemplazar triggers de `20260902_validar_slots_sucursal.sql`:
   - `tr_validar_slots_solicitud_vehiculo` → **validación inmediata** + `slots_reservados += 1` y `slots_ocupados += 1` en destino; `evento` sin destino → no aplica.
   - `tr_liberar_slots_rechazo_cancelacion` → `disponibilidad = 'liberado'`, `slots_reservados -= N`, `slots_ocupados -= N`, recount.
   - **Nuevo** `tr_entregar_solicitud_vehiculos` (AFTER UPDATE `solicitud` → `entregada`): `vehiculo.ubicacion = NEW.sucursal_destino`, `disponibilidad = 'vendido'`, `slots_reservados -= N`, `slots_ocupados -= N`, recount origen + destino.
   - `DROP` `tr_incrementar_slots_ocupados` y `tr_decrementar_slots_ocupados` (sustituidos por recount).
   - Revisar `fn_obtener_slots_disponibles` para usar slots disponibles = `slots - slots_ocupados` donde `slots_ocupados` ya incluye reservas pendientes.
6. Backfill de datos:
   - `slots_reservados`: desde solicitudes activas pre-entrega (`pendiente_aprobacion`, `aprobada`, `pendiente`, `priorizada`, `asignada`, `calendarizada`, `en_transito`) con `sucursal_destino` y vehículos `reservado`.
   - `slots_ocupados`: desde `COUNT(vehiculo.ubicacion)` **más** las reservas pendientes (mientras no haya entregas, se mantiene la lógica provisoria).
7. Trigger de inmutabilidad (opcional recomendado): `BEFORE UPDATE` sobre `solicitud.sucursal_destino` que impide cambiar el destino una vez asignado (invarible).

### Migración de datos: prebackup

Antes del backfill, respaldar `public.sucursal`, `public.vehiculo` y `public.solicitud_vehiculo` (export/`CREATE TABLE ... AS SELECT`).

---

## 4. Cambios de código

### Tipos
- `src/types/sucursal.types.ts`: agregar `slots_reservados: number | null`.
- `src/types/vehiculo.types.ts`: agregar `ubicacion: number | null`, y `estado_disponibilidad: 'reservado' | 'liberado' | 'vendido'`.
- `src/types/solicitud.types.ts` / `src/types/sucursal.types.ts`: `DisponibilidadVehiculo` incluye `'vendido'`.

### Vehículos
- `src/services/vehiculo.service.ts`:
  - `getVehiculos`: retornar `ubicacion` (+ nombre de sucursal si aplica).
  - **`ubicacion` obligatorio al crear/editar** para vehículos "estáticos"; opción especial "en viaje / container" → `NULL` (excepción explícita).
  - Bloqueo de edición/borrado debe también respetar reserva activa y estado `vendido`.
- `src/app/actions/vehiculo.actions.ts`: pass-through de `ubicacion` + validación de obligatoriedad.
- `src/app/admin/vehiculos/VehiculosTableClient.tsx`: campo sucursal de ubicación con hint "en viaje/container puede quedar sin asignar"; badge `vendido` (vehículo vendido no tiene ubicación).

### Sucursales
- `src/app/admin/sucursales/SucursalesTableClient.tsx` y `src/types/sucursal.types.ts`: `slots_ocupados` y `slots_reservados` **solo lectura** (dejan de editarse manualmente); mostrar métricas `Reservados / Ocupados / Slots`.

### Solicitudes
- `src/services/solicitudes.service.ts`:
  - `createSolicitud` / `agregarVehiculo`: validación de capacidad contra `destino.slots - destino.slots_ocupados` (incluyendo reservas pendientes).
  - `recibirSolicitud` (`en_transito → entregada`): mover `ubicacion` de los vehículos al destino, `disponibilidad = 'vendido'`, liberar `slots_reservados`/`slots_ocupados` del destino + recount.
  - `rechazarSolicitud` / `cancelarSolicitud`: `disponibilidad = 'liberado'`, liberar `slots_reservados`/`slots_ocupados` + recount.
- UI `SolicitudesClient.tsx`: slots disponibles del destino mostrando reservas pendientes; badge `vendido` en pantalla de vehículos de la solicitud.

---

## 5. Orden de ejecución seguro

1. Resolver **merge conflict** en `src/app/documentation/RequisitosModulos.md` (líneas 404-412, marcadores `<<<<<<< HEAD` / `origin/LOGISTICA`).
2. Escribir y aplicar migración `20260910_slots_reservados_v2.sql` en SQL Editor.
3. Backfill de datos + verificación vía API (consulta `catalogo_auditoria` / REST).
4. Actualizar tipos TS.
5. Service/UI de vehículos (ubicación obligatoria).
6. Service/UI de solicitudes (reserva, entregar, cancelar) y sucursales (solo lectura).
7. `tsc --noEmit` + ESLint sin errores.
8. Actualizar documentación (misma tarea).
9. Prueba funcional por el usuario.

---

## 6. Documentación a actualizar (misma tarea)

- `src/app/documentation/DatabaseSchema.md`: tablas `sucursal` (slots_reservados), `vehiculo` (ubicación, sin vendido), `solicitud_vehiculo` (enum `vendido`), enum `disponibilidad`.
- `esquema-completo-sql.sql`: mantener 1:1 (skill `sincronizar-esquema-sql`).
- `src/app/documentation/RequisitosModulos.md`: reescribir `R-SUC.5–8`, `R-SOL-CRE.8–9`; nuevos requisitos de reserva/entrega/vendido.
- `src/app/documentation/Brain.md`, `ProjectStatus.md`, `ImplementationPlan.md`.

---

## 7. Recomendaciones

1. **Validación inmediata en BD** (`RAISE EXCEPTION`), NO solo en Server Actions: cualquier escritura debe fallar igual si excede capacidad.
2. **Recount como fuente de verdad**: `slots_ocupados`/`slots_reservados` no deben editarse manualmente; solo lectura en UI.
3. **`ubicacion` nullable en BD** (viaje/container/vendido): la obligatoriedad se gobierna en el service layer para vehículos "estáticos".
4. **Reutilizar `sucursal_destino`** como destino inmutable (trigger `BEFORE UPDATE`) en vez de crear columna `destino` nueva.
5. **Backup previo** del estado de `sucursal`/`vehiculo`/`solicitud_vehiculo` antes del backfill.
6. **Resolver el merge conflict de `RequisitosModulos.md`** antes de tocar requisitos, para no mezclar cambios con conflicto pendiente.
7. **Cuidado con el orden de triggers**: en `entregada`, el recount debe ejecutarse después del UPDATE de `vehiculo.ubicacion` para que el conteo refleje el movimiento.