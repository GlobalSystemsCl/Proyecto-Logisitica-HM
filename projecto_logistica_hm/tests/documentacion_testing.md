# Documentación de Testing — Sistema H.Motores

> Fecha de ejecución: 2026-09-07
> Base: `plan_testing_hm.md` · Comando: `npm run test` (Vitest 5)
> Alcance: validar el cumplimiento del plan contra el comportamiento real del sistema. **No se corrigió código de la aplicación**: los fallos quedan documentados como brechas.

---

## 1. Resumen ejecutivo

| Métrica | Valor |
|---|---|
| Archivos de test | 7 |
| Tests totales | 42 |
| Tests que pasan | 38 (90.5 %) |
| Tests que fallan | 4 (9.5 %) |
| Duración total | ~52 s |
| Residuos en BD | Ninguno (la suite crea y limpia sus propios datos) |

Los 4 fallos corresponden a brechas reales entre lo que asume el plan y lo que el sistema implementa:

1. `SLOT-08` — Finalizar una solicitud no libera `sucursal.slots_ocupados` ni la disponibilidad de los vehículos.(revisar si lo resuelve next js no la base de datos.)
2. `E2E-03` — La cola de prioridad deja huecos al cancelar una solicitud priorizada.(revisar si lo resuelve nexdt js en la capa de service)
3. `INT-TRIG-03` — No existe auditoría automática por trigger en cambios de estado.(revisar si lo resuelve next js en la capa de service)
4. `INT-TRIG-04` — La BD permite que el mismo vehículo quede reservado en dos solicitudes a la vez.(el service layer si lo previene)

---

## 2. Infraestructura creada

- `vitest.config.mts` — configuración de Vitest (alias `@` → `src`).
- `tests/setup-env.ts` — carga de `.env.local` en el entorno de test.
- `tests/helpers.ts` — helpers de integración: `crearSucursal`, `crearVehiculo`, `crearSolicitud`, `agregarVehiculos`, `crearUsuario`, `autenticar`, `leerSucursal`, `limpiarSucursal`, `limpiarVehiculo`, `eliminarUsuario`, `tag`, etc.
- `package.json` — scripts `test` y `test:watch`; devDependencies `vitest` y `vite`.

**Notas de diseño**
- Los datos de prueba son identificables (`TEST-SUC-*`, `test.*@hmotores.test`, marca `TEST-MARCA`) y se eliminan en `afterEach`. La limpieza está ordenada por dependencias de FK (solicitudes/auditoría → usuarios → sucursales) para no dejar residuos.
- Los tests de integración usan el service role (`createAdminClient`): **bypassan RLS pero disparan los triggers de la BD**, lo que permite validar slots, liberación y auditoría a nivel de base.
- Los tests unitarios mockean `@/lib/supabase/admin` y `@/lib/supabase/server`, por lo que no tocan la BD.

---

## 3. Resultados por suite

### 3.1 `tests/integracion/slots.test.ts` — SLOT-01..08 (7/8)

| ID | Descripción | Resultado |
|---|---|---|
| SLOT-01 | Creación con slots disponibles (2 → 4) | ✔ |
| SLOT-02 | Aumento de slots_ocupados en origen y destino | ✔ |
| SLOT-03 | Rebote por slots insuficientes (rollback atómico) | ✔ |
| SLOT-04 | Descuento de slots_ocupados al cancelar | ✔ |
| SLOT-05 | Liberación al rechazar | ✔ |
| SLOT-06 | RPC `fn_obtener_slots_disponibles` | ✔ |
| SLOT-07 | `SolicitudesService` valida slots antes de crear | ✔ |
| SLOT-08 | **Fallido** — Finalizar no libera slots | ✘ |

**SLOT-08 (fallo)**: tras `entregada → finalizada`, `slots_ocupados` de la sucursal destino queda en `2` en vez de `0`, y los vehículos conservan `disponibilidad = reservado`. Causa: el trigger `tr_liberar_slots_rechazo_cancelacion` (y su función) solo cubre `rechazada` y `cancelada`; no hay trigger de liberación para la finalización.

### 3.2 `tests/integracion/flujo-estados.test.ts` — UT-SOL-01..02, E2E-01..03 (7/8)

| ID | Descripción | Resultado |
|---|---|---|
| UT-SOL-01 | Creación por ejecutivo → `pendiente_aprobacion` | ✔ |
| UT-SOL-02 | Creación con fecha de entrega por jefe → `aprobada` | ✔ |
| E2E-01 | Aprobación (jefe local + logística + destino) | ✔ |
| E2E-02 | Rechazo y liberación de slots/vehículos | ✔ |
| E2E-03 | **Fallido** — Cancelación priorizada deja hueco en la cola | ✘ |

**E2E-03 (fallo)**: al cancelar una solicitud priorizada en posición 3, una nueva priorización recibe `posicion_prioridad = 4` en lugar de rellenar la posición 3. La cola (columna `solicitud.posicion_prioridad`) **no se compacta al cancelar**: queda el hueco. El plan espera reorden sin huecos.

### 3.3 `tests/integracion/sucursales.test.ts` — UT-SUC-01..04 (4/4)

| ID | Descripción | Resultado |
|---|---|---|
| UT-SUC-01 | 10 slots / 7 ocupados → 3 disponibles | ✔ |
| UT-SUC-02 | Slots completos → 0 disponibles | ✔ |
| UT-SUC-03 | Subir límite 5 → 8 recalcula disponibles | ✔ |
| UT-SUC-04 | Bajar límite por debajo de ocupados recalcula (saturación) | ✔ |

### 3.4 `tests/integracion/seguridad-rls.test.ts` — SEC-RLS-01..03 (8/8)

| ID | Descripción | Resultado |
|---|---|---|
| SEC-RLS-01 | Ejecutivo de sucursal A no ve solicitudes de sucursal B | ✔ |
| SEC-RLS-02a | Ejecutivo externo no modifica solicitud ajena (RLS filtra, sin error) | ✔ |
| SEC-RLS-02b | **Gap documentado**: un ejecutivo SÍ modifica el estado de su propia solicitud vía RLS (`estado → aprobada`) | ✔ |
| SEC-RLS-03 | Logística solo ve solicitudes en las que participa | ✔ |

Hallazgo: la matriz de roles (quién puede aprobar/transicionar) **no está aplicada en RLS**. La política permite a `ejecutivo_id` hacer `UPDATE` de cualquier columna de su solicitud, incluido `estado`. La regla "el ejecutivo no aprueba" vive solo en la capa de aplicación (`solicitudes.actions.ts`).

### 3.5 `tests/integracion/auditoria-triggers.test.ts` — INT-TRIG-01..04 (2/4)

| ID | Descripción | Resultado |
|---|---|---|
| INT-TRIG-01 | El estado de reserva vive en `solicitud_vehiculo.disponibilidad`; `vehiculo` no tiene columna `estado` (discrepancia del plan) | ✔ (documenta esquema) |
| INT-TRIG-02 | Rechazo libera disponibilidad por trigger | ✔ |
| INT-TRIG-03 | **Fallido** — No hay registro automático en `auditoria` al cambiar estado por la BD | ✘ |
| INT-TRIG-04 | **Fallido** — La BD permite reservar el mismo vehículo en dos solicitudes | ✘ |

**INT-TRIG-03 (fallo)**: el plan espera auditoría automática por trigger. Los triggers de auditoría fueron deshabilitados (`20260826_deshabilitar_auditoria_service_role.sql`) y el registro se hace desde la capa de servicio; un `UPDATE` directo a `solicitud` no audita nada.

**INT-TRIG-04 (fallo)**: no existe restricción/trigger que impida que un vehículo ya reservado (`solicitud_vehiculo.disponibilidad = 'reservado'`) se inserte en una segunda solicitud. La protección de "no doble reserva" solo existe en la capa de aplicación; a nivel BD el insert de la segunda solicitud **tiene éxito**.

### 3.6 Tests unitarios con mocks (10/10)

| Archivo | Descripción | Resultado |
|---|---|---|
| `tests/unitarios/vehiculo.service.test.ts` | chasis 17 caracteres, formato patente `XXXX-XX`, rango de año, normalización a mayúsculas, bloqueo de modificación de vehículo reservado | ✔ (5/5) |
| `tests/unitarios/auth.service.test.ts` | cuenta desactivada, bloqueo 15 min tras 5 intentos (con mensaje de intentos restantes), cuenta bloqueada temporalmente, login exitoso con reset de contador | ✔ (5/5) |

---

## 4. Brechas detectadas (plan vs. realidad)

1. **Liberación de slots al finalizar** — ausente en trigger (`SLOT-08`).
2. **Compactación de la cola de prioridad** — al cancelar queda el hueco (`E2E-03`).
3. **Auditoría automática deshabilitada** — el registro solo ocurre desde los servicios (`INT-TRIG-03`).
4. **Doble reserva de vehículos permitida a nivel BD** — solo la capa de aplicación la impide (`INT-TRIG-04`).
5. **Matriz de roles no aplicada en RLS** — un ejecutivo puede cambiar el estado de su propia solicitud a `aprobada` (`SEC-RLS-02b`).
6. **El plan asume columnas/tablas que no existen**:
   - `vehiculo.estado` no existe (la disponibilidad se deriva de `solicitud_vehiculo.disponibilidad`).
   - `vehiculo.sucursal_id` no existe (la asignación es indirecta vía `solicitud_vehiculo`).
   - `AuthService.login()` no existe (el método real es `AuthService.signIn()`).

---

## 5. Mejoras sugeridas (para una futura iteración)

> Sin implementar por alcance de esta tarea.

- **Trigger de liberación de slots/vehículos al finalizar**: ampliar `fn_liberar_slots_rechazo_cancelacion` (o crear uno equivalente) para cubrir la transición `entregada → finalizada`, descontando `slots_ocupados` y marcando `disponibilidad = 'liberado'`.
- **Compacitación de cola**: al cancelar/rechazar una solicitud priorizada, reasignar `posicion_prioridad` de las siguientes (decremento en 1) para que la cola quede `1..N` sin huecos (o aplicar `reordenarCola` al cancelar).
- **Reactivar auditoría por trigger** o considerar el registro vía servicio como el diseño definitivo (y ajustar el plan). Si se reactiva, respetar la restricción de 23502 con service-role.
- **Garantizar no doble reserva en BD**: constraint/exclusion o trigger que impida insertar un vehículo `reservado` en otra solicitud activa (a nivel de aplicación ya existe la validación).
- **Reforzar RLS según matriz de roles**: evitar que `ejecutivo_id` pueda actualizar `estado` (p. ej. política de UPDATE restringida a transiciones permitidas del rol, dejando la máquina de estados en un trigger `BEFORE UPDATE` con función validadora).
- **Ajustar `plan_testing_hm.md`** a los nombres reales (`signIn`, sin `vehiculo.estado`, sin `vehiculo.sucursal_id`) para que los IDs y pasos reflejen el sistema.

---

## 6. Cómo ejecutar

```bash
npm run test          # suite completa (con reporte de fallos)
npm run test:watch    # modo watch
npx vitest run tests/integracion/slots.test.ts   # un archivo
```

Requisitos: `.env.local` con `NEXT_PUBLIC_SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_SECRET_KEY` válidos, con acceso al proyecto `yaqbccvlenouqmtqrlrq`.