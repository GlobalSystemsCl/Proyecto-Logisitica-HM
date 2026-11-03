# Plan: requisitos del cliente (2026-11-03)

Análisis de los 17 pedidos de la reunión, contrastados con el código de la rama `joaco-ciclo-2` (commit `e5584d8`). Para cada uno: qué se pide, qué existe hoy, la propuesta, los cambios de BD y el tamaño (S: menos de un día; M: 1–3 días; L: más de 3 días).

Reglas que se mantienen: cada fase se implementa, se verifica (`npm run test`, `typecheck`, `lint`, build) y se muestra antes de pasar a la siguiente; las migraciones las aplica el equipo en el SQL Editor, cada una con rollback y test de contrato; al cerrar una fase se actualizan los contextos (documentación del sistema, READMEs de Supabase, `AGENTS.md`, `src/config/faq.ts`).

---

## Resumen

| # | Requisito | Tamaño | BD | Estado |
|---|---|---|---|---|
| R1 | Venta de un vehículo que ya está en la sucursal | M | Sí | Definir casos mixtos |
| R2 | Notificación con enlace directo a la acción | S | No | Listo para implementar |
| R3 | Logística con varias zonas | M | Sí | Listo para implementar |
| R4 | Ver los vehículos de cada sucursal desde Slots | S | No | Listo para implementar |
| R5 | Vehículos en tránsito con estado manual | M | Sí | Aclarar qué estados |
| R6 | Vehículo sin ubicación no se puede pedir | S | No | Listo (ver impacto en el stock importado) |
| R7 | Torquemada Acopio / Torquemada Vitrina | S | Datos | Bloqueado: falta el Excel |
| R8 | Nuevas sucursales y sus códigos | S | Datos | Bloqueado: falta el Excel |
| R9 | Congelar cuenta de Logística y sustituto | L | Sí | Depende de R3 |
| R10 | Gestión de transportistas y patente | M | Sí | Aclarar modelo de patente |
| R11 | Documentos permitidos en la subida | S | No | Confirmar lista con el cliente |
| R12 | Traslados internos con selección múltiple | M | No | Listo para implementar |
| R13 | "Al volver atrás en algunas veces" | ? | ? | Falta la descripción |
| R14 | Logística modifica el chasis | S | No | Ya existe en parte |
| R15 | Número de guía obligatorio al despachar | M | Sí | Listo para implementar |
| R16 | Reportería y trackeo de transportistas | L | No | Depende de R10, R15 (y R5) |
| R17 | Todos entran como ejecutivo, con mensaje | S | No | Contradice la decisión del 20-10 |

---

## R1. Venta de un vehículo que ya está en la sucursal

**Pedido.** Si el vehículo ya está en la sucursal del vendedor, no hay traslado ni pasa por Logística: el ejecutivo crea la solicitud, el jefe de local la aprueba y el paso siguiente es la entrega al cliente.

**Hoy.** Toda solicitud recorre `pendiente_aprobacion → aprobada → priorizada → calendarizada → en_transito → entregada (Recepcionada) → finalizada (Entregado a cliente)`. `aprobarSolicitud` (`solicitudes.service.ts:1260`) siempre deja `aprobada`, y `finalizarSolicitud` (`:2236`) exige `entregada`. La sucursal donde se entrega es `sucursalDeRecepcion` (`:280`: destino o, en eventos, la sucursal de la solicitud). La ubicación del vehículo es `vehiculo.ubicacion`.

**Propuesta.**
- Al aprobar, si **todos** los vehículos tienen `ubicacion = sucursalDeRecepcion`, la solicitud pasa directo a `entregada` ("Lista para entregar"), sin cola de Logística ni calendario, y queda disponible "Entregar a cliente" para el ejecutivo y el jefe de local.
- Se marca la solicitud (`solicitud.sin_traslado boolean`, calculado al aprobar) para que reportes, prioridades y el calendario la excluyan y el detalle lo explique ("Venta desde la sucursal: no requiere traslado").
- Al crear, el formulario avisa "Este vehículo ya está en tu sucursal: no requiere traslado".
- Revisar los triggers de slots: `fn_reservar_slots_solicitud_vehiculo` reserva un slot en el destino; si el vehículo ya está ahí no debe reservarse otro.
- Notificaciones: aprobación → aviso al ejecutivo "lista para entregar"; Logística no recibe nada.

**BD.** Columna `sin_traslado`, ajuste de `fn_reservar_slots_solicitud_vehiculo` y del trigger `tr_registrar_fechas_flujo` (fechas de un salto `aprobada → entregada`).

**Preguntas.** ¿Qué pasa si una solicitud mezcla vehículos que están en la sucursal y otros que no? Propuesta: no permitirlo (se crean dos solicitudes). ¿Aplica también a eventos?

---

## R2. Notificación con enlace directo a la acción

**Hoy.** `rutaNotificacion` (`lib/notificaciones-app.ts:208`) lleva siempre a `/solicitudes?solicitud=<id>` o a `/solicitudes/traslados`, sin importar qué tiene que hacer el usuario.

**Propuesta.** Ruta según el evento y el rol del destinatario, abriendo el detalle de esa solicitud en la pantalla donde se hace la acción:

| Evento | Destinatario | Enlace |
|---|---|---|
| Solicitud creada | Jefe de local | `/solicitudes/aprobaciones?solicitud=<id>` |
| Aprobada | Logística | `/solicitudes/prioridades?solicitud=<id>` |
| Priorizada | Logística | `/logistica/calendarizaciones?solicitud=<id>` |
| En tránsito | Jefe de local destino | `/solicitudes/recepciones?solicitud=<id>` |
| Recepcionada / lista para entregar | Ejecutivo | `/solicitudes?solicitud=<id>` (botón "Entregar a cliente") |
| Traslado interno | Origen / destino | `/solicitudes/traslados?traslado=<id>` |

Cada pantalla destino lee el parámetro y abre el detalle (Aprobaciones y el calendario ya lo hacen en parte). Función pura `rutaAccion(evento, rol, entidadId)` con tests; las notificaciones ya guardadas conservan su enlace.

**BD.** No.

---

## R3. Logística con varias zonas

**Hoy.** La migración `20261013155000` creó el índice único `usuario_zona_una_por_usuario`, y `lib/asignaciones.ts:55` exige exactamente una zona para Logística. Las lecturas (`getSucursalIdsDeZonasUsuario`, notificaciones por zona) ya trabajan con listas.

**Propuesta.** Migración que elimina el índice único; `asignaciones.ts` acepta una o más zonas; el formulario de usuarios y la activación masiva pasan a selección múltiple de zonas; revisar las pantallas que muestran "la zona" del usuario. Tests de asignación y de notificaciones con varias zonas.

**BD.** `drop index usuario_zona_una_por_usuario` (rollback: falla si ya hay usuarios con varias zonas; se documenta).

---

## R4. Ver los vehículos de cada sucursal desde Slots

**Hoy.** `/logistica/slots` muestra capacidad, ocupados y reservados por sucursal, sin el detalle.

**Propuesta.** Al hacer clic en una sucursal se abre un panel con los vehículos cuya `ubicacion` es esa sucursal (chasis, marca, modelo, color, estado) y, aparte, los que van en camino hacia ella. Reutiliza `getVehiculos` filtrado por sucursal en el servidor, con exporte a Excel.

**BD.** No.

---

## R5. Vehículos en tránsito con estado manual

**Pedido.** "Visualizar vehículos en tránsito; cambio manual del usuario según el estado en que va el vehículo."

**Hoy.** El inventario ya marca "En camino a X" (`en_transito_hacia`) y tiene el filtro "En tránsito". El estado lo cambia el flujo (despachar, recibir), no hay hitos intermedios.

**Propuesta (a confirmar).** Una vista "En tránsito" para Logística con todas las solicitudes y traslados despachados, y hitos que el usuario marca a mano con fecha y hora: *Retirado en origen → En ruta → Llegó a destino*; la recepción sigue siendo del jefe de local. Los hitos alimentan los tiempos del reporte de transportistas (R16).

**BD.** Tabla `hito_transporte(entidad, entidad_id, hito, fecha, usuario_id)` o columnas de fecha por hito.

**Preguntas.** ¿Qué estados quieren ver exactamente? ¿Quién los marca (Logística, el jefe de local)?

---

## R6. Vehículo sin ubicación no se puede pedir

**Hoy.** El selector de vehículos de la solicitud muestra los que no tienen ubicación como "Sin sucursal" y deja elegirlos (`SolicitudesClient.tsx:1326`); `createSolicitud` no valida la ubicación.

**Propuesta.** Excluirlos del selector (solicitudes y traslados internos), validar en el servidor (`createSolicitud`, `crearTraslado`, RPC `fn_vehiculos_disponibles_traslado`) y mostrar en el inventario por qué no se puede pedir.

**Impacto importante.** Los Excel de STOCK y COMPRAS vienen con la columna Ubicación vacía: los ~2.470 vehículos importados quedarían "En viaje" y **nadie podría pedirlos** hasta asignarles sucursal. Antes de activar esta regla se necesita el Excel con ubicación o asignarla con el cambio de ubicación masivo (fase G).

**BD.** No (se actualiza la RPC si se filtra ahí).

---

## R7 y R8. Nuevas sucursales y Torquemada

**Pedido.** Torquemada se divide en "Torquemada Acopio" y "Torquemada Vitrina", con IDs nuevos que enviará la empresa; se espera el Excel con las sucursales nuevas y sus IDs.

**Hoy.** `sucursal.id` es el código del Excel de concesionarios (101–145) y forma el número de solicitud (`101-15`). `vehiculo.ubicacion` y las solicitudes la referencian con RESTRICT.

**Propuesta.** Cuando llegue el Excel: script de datos (`supabase/scripts/`) que inserta las sucursales nuevas, mueve los vehículos y usuarios de Torquemada a la que corresponda y solo entonces da de baja la antigua (sin `DROP` ni `CASCADE`). Ensayo previo con lecturas.

**Bloqueado** hasta recibir el Excel.

---

## R9. Congelar una cuenta de Logística y usar un sustituto

**Hoy.** Solo existe activar o desactivar la cuenta (`toggleUserStatus`, `users.service.ts:384`), lo que además bloquea el inicio de sesión. Las solicitudes y traslados guardan `logistica_id`.

**Propuesta.** "Ausencia programada" desde Usuarios: titular, sustituto, desde y hasta.
- Durante la ausencia el sustituto ve y gestiona las zonas del titular (se suman a las suyas: depende de R3) y recibe sus notificaciones.
- El titular queda congelado (no inicia sesión) si así se decide.
- Al terminar, todo vuelve solo, sin intervención del administrador; queda en la auditoría.

**BD.** Tabla `ausencia_usuario(titular_id, sustituto_id, desde, hasta, creada_por)` y ajuste de las funciones que calculan las zonas efectivas.

**Preguntas.** ¿Las solicitudes en curso del titular se reasignan al sustituto o solo se comparten? ¿Aplica solo a Logística o también a jefes de local?

---

## R10. Gestión de transportistas y patente

**Pedido.** Logística administra los transportistas; al calendarizar solo ingresa la patente; filtrar por RUT o patente.

**Hoy.** Tabla `transportista(nombre, rut, activo)` (fase C). Se crea desde el modal de calendarización y el formulario de traslado; no hay pantalla de gestión ni patente.

**Propuesta.**
- Pantalla `/logistica/transportistas` (Logística y admin): crear, editar, activar/desactivar, con sus patentes.
- Al calendarizar o crear un traslado se escribe la patente: autocompleta transportista y RUT; si no existe, ofrece crearla.
- La patente usada queda en la solicitud/traslado (`patente_transporte`), aunque luego el camión cambie de dueño.
- Filtros por RUT o patente en el calendario, en movimientos y en el reporte.

**BD.** Tabla `transportista_patente(patente unique, transportista_id, activo)` y columna `patente_transporte` en `solicitud` y `traslado_interno`.

**Pregunta.** ¿La patente es del camión y un transportista puede tener varios camiones? (El modelo propuesto lo permite.)

---

## R11. Documentos permitidos en la subida

**Hoy** (`lib/archivos.ts`): PDF, PNG, JPG/JPEG, WEBP, DOCX, XLSX, PPTX, TXT, CSV y ZIP; máximo 10 MB; se valida MIME, extensión y firma del archivo.

**Propuesta.** Revisar la lista con el cliente según los documentos reales (factura, guía, fotos de daños). Sugerencias: quitar ZIP (no se puede revisar el contenido) y agregar HEIC (fotos de iPhone). Mostrar los formatos permitidos junto al botón de subir y en las preguntas frecuentes.

---

## R12. Traslados internos con selección múltiple

**Hoy.** El formulario exige un solo vehículo (`TrasladosClient.tsx:129`, `seleccionados.length === 1`) y la BD lo fuerza (`fn_validar_un_vehiculo_por_traslado`: "Cada traslado interno lleva un solo vehículo"). El transportista ya se pide al crear.

**Propuesta.** Casillas para elegir uno o muchos vehículos (con "seleccionar todos los del filtro", como el cambio de ubicación masivo). Al confirmar se crea **un traslado por vehículo** con el mismo origen, destino, fecha y transportista (y patente, R10), en una sola acción con resumen de creados y omitidos. Así se mantiene la regla de la BD, la recepción y la cancelación por vehículo. Opcional: un "lote" común para verlos agrupados.

**BD.** No (opcional: `traslado_interno.lote_id`).

---

## R13. "Al volver atrás en algunas veces"

El texto está incompleto. Hay que pedir al cliente qué pasa (¿se pierde un formulario?, ¿muestra datos viejos?, ¿da error?), en qué pantalla y con qué rol.

---

## R14. Logística modifica el chasis

**Hoy.** Logística ya entra al inventario y puede editar el chasis (`verifyVehiculoPermission` incluye logística; el formulario no lo bloquea). La edición se rechaza si el vehículo está reservado en una solicitud activa o ya se entregó (`updateVehiculo`).

**Propuesta.** Confirmar si el caso real es corregir el chasis de un vehículo **reservado** (error de digitación detectado durante el traslado). En ese caso, permitir a Logística y admin editar solo el chasis aunque esté reservado, con motivo obligatorio y registro en la auditoría.

---

## R15. Número de guía obligatorio al despachar

**Pedido.** Antes de despachar, Logística ingresa el número de guía; sin él no se despacha. La guía se asocia al chasis y se puede repetir en varios vehículos.

**Hoy.** `despacharSolicitud` (`:1951`) y `despacharTraslado` solo validan el estado.

**Propuesta.** Al despachar se abre un modal con un campo de guía por vehículo y "usar la misma guía para todos". El servidor rechaza el despacho si falta alguna. La guía se ve en el detalle, en recepciones, en el Excel del calendario, en movimientos y en el reporte de transportistas, y se puede buscar por ella. "Revertir despacho" la conserva para el historial.

**BD.** `numero_guia text` en `solicitud_vehiculo` y en `traslado_interno_vehiculo` (no única) e índice para buscar.

---

## R16. Reportería y trackeo de transportistas

**Hoy.** Hay reportería de Logística por usuario (`lib/reporteLogistica.ts`: tiempos de respuesta, pendientes, SLA) y el reporte de movimientos (fase D2) con filtro por transportista y exporte a Excel.

**Propuesta.** Sección "Transportistas" en reportería, con el mismo enfoque que el reporte de Logística:
- Filtro por rango de fechas, transportista, RUT o patente.
- Por transportista: viajes y vehículos movidos, tramos (origen → destino), tiempo promedio de despacho a recepción (y por hito si se hace R5), porcentaje a tiempo contra la fecha límite, atrasados.
- Detalle por viaje: fecha, origen, destino, chasis, guía, patente, tiempos.
- Exporte a Excel con los mismos filtros.
- Lógica pura en `lib/reporteTransportistas.ts` con tests.

**BD.** No (si hace falta, una vista o RPC para no traer todo a la app).

---

## R17. Todos entran como ejecutivo, con mensaje

**Hoy.** El registro ya crea la cuenta como ejecutivo, pero **inactiva y pendiente de aprobación** (decisión del 2026-10-20), y muestra "Usted ha sido registrado como perfil vendedor en la sucursal X… contacte al administrador" (`mensajeRegistroPendiente`). El administrador recibe la notificación `NUEVO_USUARIO`.

**Pregunta.** ¿Ahora quieren que la cuenta quede **activa** de inmediato como ejecutivo? Si es así: con el dominio restringido a `@hmotores.cl` el riesgo es bajo; el administrador corrige rol y sucursal después y se mantiene la notificación. Si no, lo pedido ya está implementado y solo hay que revisar el texto del mensaje.

---

## Orden propuesto

| Fase | Contenido | Por qué en este orden |
|---|---|---|
| 1 | R2 enlaces, R6 sin ubicación (cuando el stock tenga ubicación), R11 documentos, R14 chasis | Cambios chicos, sin decisiones pendientes grandes |
| 2 | R15 guía de despacho, R12 traslados múltiples | Operación diaria de Logística |
| 3 | R1 venta desde la sucursal | Cambia el flujo principal; necesita la respuesta sobre casos mixtos |
| 4 | R10 transportistas y patente, R16 reportería | R16 usa la patente y la guía |
| 5 | R3 multizona, R9 ausencias | R9 se apoya en R3 |
| 6 | R4 vehículos por sucursal, R5 tránsito | Visualización; R5 según lo que se defina |
| 7 | R7–R8 sucursales nuevas | Cuando llegue el Excel |
| — | R13, R17 | Al recibir las respuestas |

Migraciones previstas: `sin_traslado` y ajuste de slots (R1), índice de zonas (R3), hitos de transporte (R5), ausencias (R9), patentes y `patente_transporte` (R10), `numero_guia` (R15).

## Preguntas para el cliente

1. R1: ¿se permiten solicitudes con vehículos en la sucursal y otros que no? ¿Aplica a eventos?
2. R5: ¿qué estados intermedios quieren y quién los marca?
3. R9: ¿las solicitudes del titular se reasignan o se comparten con el sustituto? ¿Solo Logística?
4. R10: ¿la patente es del camión y un transportista tiene varios?
5. R11: ¿qué documentos suben realmente? ¿Se puede quitar ZIP?
6. R13: ¿qué pasa al volver atrás, en qué pantalla y con qué rol?
7. R14: ¿el caso es corregir el chasis de un vehículo ya reservado?
8. R17: ¿la cuenta debe quedar activa al registrarse?
9. R6/R7/R8: Excel del stock con ubicación y Excel de sucursales nuevas (incluida la división de Torquemada).
