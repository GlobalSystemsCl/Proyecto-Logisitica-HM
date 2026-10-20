# Prueba manual del flujo completo por rol — 2026-10-14

| Campo | Valor |
|---|---|
| Tipo | Prueba manual, recorriendo el sistema como lo harían los usuarios (no tests automáticos) |
| Entorno | `npm run dev` local contra la base Supabase `yaqbccvlenouqmtqrlrq`, Chrome headless |
| Correos | Desactivados durante la prueba (archivo temporal, ya borrado). Las notificaciones de la campana sí se generaron |
| Solicitudes creadas | **#BCA10027** (venta, ciclo completo) y **#8E92901A** (evento, rechazado) |

## Usuarios

| Rol | Usuario | Sucursal / alcance |
|---|---|---|
| Ejecutivo | OSCAR PEREZ | CONCON |
| Jefe de Local | maickol concon | CONCON |
| Logística | joaquin logistica | Zona 1 (15 Norte, Concón, Valparaíso) |

## Recorrido 1 — Venta de punta a punta (#BCA10027)

| # | Rol | Acción | Resultado |
|---|---|---|---|
| 1 | Ejecutivo | Entra al sistema | Llega directo a "Mis Solicitudes" con sus 4 paneles (pendientes, en curso, por entregar, rechazadas), vacíos |
| 2 | Ejecutivo | Nueva Solicitud: venta, fecha límite 21/10, 1 vehículo (HY Creta), observación | Creada como "Pendiente de aprobación". El destino viene fijo en CONCON y muestra los slots disponibles (42/55) |
| 3 | Ejecutivo | Insistir | Funciona. El botón pasa a "Insistir (24h)", deshabilitado, con el aviso "Podrás insistir de nuevo en 24h" |
| 4 | Jefe de Local | Entra al sistema | La campana muestra "Nueva solicitud por aprobar". El dashboard la muestra en "Pendientes de aprobar" |
| 5 | Jefe de Local | Clic en la notificación | Abre el detalle de la solicitud directamente |
| 6 | Jefe de Local | Aprobaciones → Aprobar → Aceptar fecha | "Solicitud aprobada exitosamente." |
| 7 | Jefe de Local | Prioridades → arrastrar a la cola de Concón | Quedó en la posición 2, igual en pantalla y en la base ("priorizada en la posición #2") |
| 8 | Logística | Entra al sistema | El panel "Por programar" muestra #BCA10027 |
| 9 | Logística | Solicitudes → Asignarme | Queda "Asignada" con él como responsable |
| 10 | Logística | "Ver" desde el dashboard | Abre el calendario con la solicitud ya buscada, sola en "Por programar" |
| 11 | Logística | Arrastrar al viernes 16 | Queda "Programada" para el 16/10 y sale de la cola |
| 12 | Logística | Arrastrar al sábado 17 | Pide fecha y motivo. Queda reprogramada al 17/10 con el chip "Reprogramada 1 vez" |
| 13 | Logística | Clic en la tarjeta (sin arrastrar) | Abre el detalle |
| 14 | Logística | Despachar (vista día) | Queda "En tránsito" |
| 15 | Jefe de Local | Campana | Ve: por aprobar, programada, reprogramada (con fecha anterior y motivo) y despachada |
| 16 | Jefe de Local | Dashboard → Recepciones pendientes → Recibir (sin novedades, con observación) | "Recepción registrada." La solicitud queda Recepcionada |
| 17 | Ejecutivo | Campana | Recibió 7 avisos: aprobada, en la cola, con responsable, programada, reprogramada, despachada y recibida |
| 18 | Ejecutivo | Panel "Por entregar al cliente" → Entregar | Queda Finalizada. El vehículo pasa a "vendido" y sale del inventario |
| 19 | Ejecutivo | Detalle → Historial | Muestra el recorrido completo, con actor, rol y motivo en cada paso (después de la corrección C1) |

## Recorrido 2 — Evento rechazado (#8E92901A)

| # | Rol | Acción | Resultado |
|---|---|---|---|
| 1 | Ejecutivo | Nueva Solicitud: evento, título, dirección, 1 vehículo | Creado. El distintivo EVENTO se ve en la lista y en aprobaciones |
| 2 | Jefe de Local | Rechazar con motivo | "Solicitud rechazada." |
| 3 | Ejecutivo | Panel "Rechazadas" → ver motivo | Aparece en "Rechazadas" con "+ Crear nueva solicitud". El detalle muestra el motivo arriba, en rojo (ver H3) |

## Hallazgos

| # | Sev. | Rol | Dónde | Qué pasa |
|---|---|---|---|---|
| H1 | Media | Jefe de Local | Aprobaciones | La fecha límite aparece un día antes: 20-10 cuando el ejecutivo pidió el 21/10, y 23-10 en vez de 24/10. "Creada" aparece como 14-10 mientras el resto del sistema dice 15/10. La pantalla usa la hora local en vez de UTC para la fecha límite |
| H2 | Media | Todos | Fechas con hora (creada, recibida, historial) | Después de las 21:00 de Chile muestran el día siguiente: todo lo creado esta noche (14/10) aparece como 15/10 |
| H3 | Media | Ejecutivo | Detalle de una solicitud rechazada | Mientras cargan las observaciones (~10 s en desarrollo) dice "el motivo no quedó registrado en el sistema". Después aparece el motivo correcto. Debería decir "Cargando…" |
| H4 | Media (conocido) | Logística | Asignarme desde Priorizada | Queda "Asignada" con el chip "#2" de la cola. Se limpia recién al programarla |
| H5 | Baja | Logística | Despachar | Permite despachar antes de la fecha programada (programada para el 17, despachada el 14) sin aviso. Confirmar si es lo esperado |
| H6 | Baja | Jefe de Local | Dashboard → Recepciones pendientes | Las filas no muestran el N° de solicitud ni si están atrasadas: hay una con fecha límite 12/10 que no se distingue de las demás |
| H7 | Baja | Ejecutivo | Nueva Solicitud → buscador de vehículos | Busca solo por patente o chasis, no por marca ni modelo. Escribir "HY" no encuentra nada aunque existe el filtro de marca |
| H8 | Baja | Logística | Calendario abierto desde "Ver" | Abre también el panel de filtros completo (la búsqueda cuenta como filtro); solo hacía falta el buscador |
| H9 | Baja | Todos | Primera visita de cada pantalla en desarrollo | Tarda varios segundos en compilar. El detalle de una solicitud demora ~10–15 s en cargar historial y observaciones, sin indicador de carga |
| H10 | Media (corregido en la vista) | Ejecutivo | Historial | Mostraba una falsa "Delegada" hecha por el propio ejecutivo y decía "creada por el Jefe de Local y asignada a OSCAR PEREZ". Ver C1 |

## Correcciones aplicadas

| # | Archivo | Cambio |
|---|---|---|
| C1 | `src/components/SolicitudDetalleModal.tsx` | El historial ignora las "delegaciones" que el propio ejecutivo registra al crear su solicitud. La creación ahora dice "Solicitud creada y enviada a aprobación del Jefe de Local" |

**Causa de H10** (lógica, no se tocó): `SolicitudesService.createSolicitud` registra la auditoría `delegacion` siempre que hay `ejecutivo_id`, también cuando el ejecutivo crea para sí mismo. Debería registrarla solo cuando crea un jefe de local y delega.

Cambios del día sin commitear: este reporte, C1, el contador de slots del encabezado (`SlotsResumen.tsx`) y el dashboard del administrador sin "Tus pendientes" (`dashboard/page.tsx`).

## Lo que funcionó bien

- **Paneles por rol:** cada rol ve sus pendientes en el dashboard y llega con un clic a la acción.
- **Notificaciones de la campana:**
  - llegan a quien corresponde en cada paso, con textos claros (incluido el motivo de la reprogramación);
  - al hacer clic abren la solicitud.
- **Validaciones y mensajes:**
  - el destino del ejecutivo viene fijo y muestra los slots disponibles;
  - el cooldown de insistencia funciona;
  - el arrastre para priorizar, programar y reprogramar funciona;
  - la reprogramación pide motivo.
- **Cierre del ciclo:** el vehículo vendido sale del inventario y la solicitud queda finalizada con historial completo.
- **Rechazo:** el ejecutivo ve el motivo, la solicitud queda en "Rechazadas" y se le ofrece crear una nueva.

## Datos que quedaron en la base

| Dato | Estado | ¿Lo borra `02_limpiar`? |
|---|---|---|
| #BCA10027 | Finalizada. El vehículo `MF3PB812ETJ210218` quedó vendido | No (no tiene prefijo `5eed`) |
| #8E92901A | Rechazada | No |
| Insistencia sobre #BCA10027 | Registrada | No |
| Notificaciones de ambas solicitudes | En las campanas de OSCAR, maickol concon y joaquin logistica | No |
