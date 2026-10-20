# Datos de prueba: escenarios del ciclo de vida

Puebla la base con solicitudes y traslados internos en todas las etapas del flujo,
para probar cada rol desde el frontend sin crear los casos a mano.

| Archivo | Qué hace |
|---|---|
| `01_poblar_escenarios.sql` | Crea los escenarios. Idempotente: si ya existen, no hace nada |
| `02_limpiar_escenarios.sql` | Borra solo los datos de prueba y deja los vehículos y las colas como estaban |
| `03_validar_escenarios.sql` | Controles de integridad, historial, fechas, colas y RLS por usuario. Solo lectura (termina en `ROLLBACK`) |
| `04_poblar_100_solicitudes.sql` | Genera 100 solicitudes más (S1001–S1100) y 6 traslados (T1001–T1006) con el mismo motor, repartidas en todos los estados. Convive con el 01; el 02 y el 03 cubren ambos |
| `05_poblar_10_priorizadas.sql` | 10 solicitudes **priorizadas** creadas hoy (S1101–S1110) en Valparaíso, 15 Norte y Concón, para probar el módulo de Logística (zona 1). El 02 también las borra |
| `06_poblar_notificaciones.sql` | Crea las notificaciones de la campana de los últimos 14 días a partir de la historia de las solicitudes y traslados de prueba, con los mismos destinatarios y textos que la app (`lib/notificaciones-app.ts`). Las de más de 2 días quedan leídas. Ejecutar al final |
| `PROMPT_PRUEBA_FLUJOS.md` | Guion (prompt) para probar todos los flujos, roles, límites y notificaciones con estos datos |

## Cómo se ejecuta

En el SQL Editor de Supabase (o con la herramienta `execute_sql` del MCP), pegar el
archivo completo y ejecutarlo. Cada script es una sola transacción: si algo falla,
no queda nada a medias.

- **Poblar:** `01_poblar_escenarios.sql`.
- **Regenerar con fechas de hoy:** `02_limpiar_escenarios.sql` y después `01_poblar_escenarios.sql`.
  Las fechas son relativas al día de ejecución (hora de Chile).
- **Validar:** `03_validar_escenarios.sql`. Todas las filas deben tener `ok = true`.
- **Limpiar:** `02_limpiar_escenarios.sql` (también borra las notificaciones de prueba y las que la app haya creado sobre solicitudes de prueba).
- **Regenerar todo:** `02` → `01` → `04` → `05` → `06`.

> **Atención:** los usuarios son cuentas reales con correos reales. El poblamiento
> no envía correos porque escribe directo en la BD. Pero si se avanza una
> solicitud de prueba desde la app (aprobar, programar, despachar, recibir,
> etc.), Brevo enviará los correos de notificación a esas cuentas.

## Cómo funciona

- **No crea usuarios ni vehículos.**
  - Los actores son los usuarios existentes de cada rol: dos ejecutivos, dos jefes de local y Logística con la zona 1.
  - Las solicitudes usan vehículos del stock existente que no tienen ubicación ni historial.
  - Los traslados internos usan vehículos ubicados en 15 Norte o Valparaíso que estén libres.
- **Cada solicitud recorre sus transiciones reales.**
  - Se hacen los mismos `UPDATE … WHERE estado = <esperado>` que `SolicitudesService`.
  - Eso dispara los triggers reales de fechas, slots, reservas y movimiento de vehículos.
  - Cada paso deja su registro en `auditoria`, con el actor y la hora del evento.
  - Los eventos se ejecutan en orden cronológico global, así las colas de prioridad quedan como si cada acción hubiera ocurrido en su momento.
- **Las reglas de la app se validan antes de cada paso:**
  - rol y alcance del actor (sucursal o zona);
  - estado de origen de la transición;
  - fechas que no pueden quedar en el pasado al momento del evento;
  - motivos de al menos 5 caracteres;
  - delegación a un ejecutivo de la misma sucursal.

  Cualquier violación aborta todo.
- **No modifica el esquema.** Los helpers son funciones `pg_temp` que desaparecen al terminar la sesión.

### Marca de los datos de prueba

El id de cada fila creada empieza con `5eed`:

| Prefijo | Tabla |
|---|---|
| `5eed0001-0000-4000-8000-0000000000NN` | `solicitud` (NN = número de escenario) |
| `5eed0002` | `solicitud_vehiculo` |
| `5eed0003` | `observacion` |
| `5eed0004` | `auditoria` |
| `5eed0005` | `insistencia` |
| `5eed0006-0000-4000-8000-00000000000N` | `traslado_interno` |
| `5eed0007` | `traslado_interno_vehiculo` |
| `5eed0008` | `notificacion` (06) |

### Qué hace la limpieza

1. Borra lo marcado y todo lo que la app haya colgado de esas solicitudes durante
   las pruebas: observaciones, auditoría, vehículos agregados y documentos.
2. Devuelve los vehículos del stock a "sin ubicación", salvo que una solicitud o un
   traslado real los esté usando.
3. Devuelve el vehículo del traslado recepcionado a su sucursal de origen.
4. Descuenta las reservas de slots de los traslados que seguían abiertos (redundante desde la brecha 011: los triggers de borrado ya recalculan).
5. Compacta las colas de prioridad.
6. Recalcula ambos contadores de slots de las sucursales tocadas con `fn_recalcular_slots_ocupados`, que delega en `fn_recalcular_slots_sucursal`.

## Escenarios

Sucursales: 6 = 15 NORTE, 7 = CONCON, 8 = SANTIAGO CENTRO, 9 = VALPARAISO.
"D-n" = hace n días.

| # | Estado final | Historia |
|---|---|---|
| S01 | pendiente_aprobacion | Creada hoy por el ejecutivo de Valparaíso |
| S02 | pendiente_aprobacion | Flota de 2 unidades (15 Norte) con insistencia de hoy (cooldown activo) |
| S03 | pendiente_aprobacion | Evento de 2 unidades esperando hace 3 días |
| S04 | aprobada | Aprobada por el jefe de local, por priorizar |
| S05 | aprobada | Creada por el jefe de local de Concón (aprobada de inmediato) |
| S06, S07 | priorizada | Cola de Valparaíso, posiciones 1 y 2. S07 con insistencia |
| S08 | priorizada | Creada por el jefe de local y delegada al ejecutivo; posición 1 en 15 Norte |
| S29 | priorizada | Estuvo calendarizada y Logística la devolvió a la cola (posición 2) |
| S09 | priorizada | 2 unidades en la cola de Concón hace una semana |
| S10, S11 | asignada | Con encargado de Logística, sin programar |
| S12 | calendarizada | Despachada por error, despacho revertido y reprogramada para mañana |
| S13 | calendarizada | Reprogramada a pedido del cliente |
| S14 | calendarizada | De 15 Norte a Santiago Centro, programada para hoy |
| S15 | en_transito | Despachada ayer, por recibir en Valparaíso |
| S16 | en_transito | Atrasada: la fecha límite pasó hace 2 días |
| S17 | en_transito | Evento en curso |
| S18 | entregada | Recibida sin novedades, por entregar al cliente |
| S19 | entregada | Recibida con novedades (rayón) |
| S20, S30 | finalizada | La entrega el ejecutivo creador |
| S21 | finalizada | La entrega el jefe de local de Concón |
| S22 | finalizada | 2 unidades, reprogramada y recibida fuera de plazo |
| S23 | finalizada | Evento terminado (las unidades vuelven al stock) |
| S24, S25 | rechazada | Con motivo (`[RECHAZO]` en observaciones) |
| S26 | cancelada | La cancela el ejecutivo antes de la aprobación |
| S27 | cancelada | Cancelada estando en la cola de Concón |
| S28 | cancelada | Cancelada en tránsito por falla del camión |
| T1 | recepcionado | Traslado interno Valparaíso → Concón |
| T2 | en_transito | Valparaíso → 15 Norte (en la bandeja de recepciones) |
| T3 | pendiente | 15 Norte → Valparaíso, por despachar |
| T4 | cancelado | Valparaíso → Concón, cancelado en tránsito; la unidad vuelve a Valparaíso |

## Qué ve cada usuario

| Usuario | En la app | Por la API REST (RLS) |
|---|---|---|
| Ejecutivo Valparaíso | 12 propias | 12 |
| Ejecutivo 15 Norte | 10 propias (incluida la delegada) | 10 |
| Jefe de local 15 Norte (encargado de todas las sucursales) | 30 | 24 |
| Jefe de local Concón | 6 | 6 |
| Logística zona 1 | 30 (origen en 6, 7 o 9) | 16 (solo donde es encargado) |
| Logística sin zona | 0 | 0 |
| Administrador | 30 | 30 |

## Limitaciones y hallazgos

1. **Las solicitudes creadas por un jefe de local no tienen `fecha_confirmacion`.**
   - `createSolicitud` no la guarda y el trigger solo la sella en un `UPDATE`.
   - Afecta a S05, S08, S09, S11, S14, S16, S21, S23 y S27. El poblamiento reproduce este comportamiento real.
   - Consecuencia: la reportería de Logística no puede medir para ellas el tiempo de respuesta ni la antigüedad.
2. ~~**Slots desfasados (brecha 011).**~~ **Resuelto el 2026-10-13.**
   - Antes, el trigger de reserva de traslados sumaba a `slots_ocupados` sin que `fn_recalcular_slots_ocupados` contara esas reservas, y `fn_cancelar_traslado_interno` no descontaba los ocupados.
   - Ahora `fn_recalcular_slots_sucursal` es la única fuente de verdad (incluye los traslados) y el control informativo de slots del `03` debe quedar en `ok = true`.
3. **La RLS de `solicitud` es más estrecha que la regla de la app para el jefe de local y Logística** (brecha 005, pendiente). No afecta a la app, que lee con service_role.
4. **Logística por zonas:**
   - Solo 1 de los 3 usuarios de Logística tiene zona asignada.
   - Santiago Centro y una sucursal de prueba no tienen zona.
   - Por eso ningún usuario de Logística ve las solicitudes con origen en esas sucursales.
   - Los escenarios usan 15 Norte, Concón y Valparaíso (zona 1) como origen.
5. **Ningún vehículo del inventario tiene patente:** la UI muestra el chasis.
6. **Comportamientos reales reproducidos tal cual:**
   - revertir un despacho dejaba `fecha_inicio_transito` (S12). Desde el 2026-10-20 la app lo limpia; los datos de S12 lo conservan;
   - `fecha_actualizacion` no se actualiza en las transiciones.
7. **Asignar un encargado desde `priorizada` no limpia `posicion_prioridad`.**
   - La solicitud queda con un número de cola huérfano hasta la siguiente renumeración.
   - Los escenarios asignan desde `aprobada` para no dejar la cola en ese estado intermedio.
8. **No se generan documentos** (requieren archivos en Storage). Las notificaciones de la campana las crea `06`; no se envían correos.
9. **Todas las solicitudes de prueba muestran el mismo código `#5EED0001`**: la app muestra los 8 primeros caracteres del id y todas comparten el prefijo `5eed0001-`.
