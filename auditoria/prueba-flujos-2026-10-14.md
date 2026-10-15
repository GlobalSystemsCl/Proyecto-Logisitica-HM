# Prueba de flujos con navegador — 2026-10-14

| Campo | Valor |
|---|---|
| Fecha | 2026-10-14 |
| Rama | `feature/requisitos-2026-10` |
| Entorno | `npm run dev` local (Next 16.4) contra la base Supabase `yaqbccvlenouqmtqrlrq` |
| Navegador | Chrome headless controlado con Playwright |
| Acceso | Login con enlace mágico generado con la service role (no cambia contraseñas ni envía correos) |
| Correos | Desactivados durante la prueba (`BREVO_API_KEY` vacío en un `.env.development.local` temporal, ya borrado) |
| Rol probado | Solo **Administrador** (Maic Hernández) |
| Datos | Poblamiento de prueba `5eed` (130 solicitudes, 10 traslados, 513 notificaciones) regenerado el mismo día. Ver `supabase/seed/README.md` |

## Alcance y bloqueo

El clasificador de permisos de Claude Code bloqueó iniciar sesión como los demás usuarios (motivo: "Production Reads"). Por eso **no se probaron** los roles Ejecutivo, Jefe de Local ni Logística.

Para completar esos roles hay que elegir una de estas opciones:

- **A.** Autorizar el login con enlace mágico, con una regla en `/permissions` o aprobándolo cuando se pida.
- **B.** Entregar contraseñas de cuentas de prueba.
- **C.** Crear usuarios QA desde Gestión de Usuarios. La app muestra la contraseña temporal si el correo no sale.

**Quedó pendiente de probar con esos roles:**

- permisos por URL;
- insistencia y su bloqueo de 24 h;
- programar y reprogramar arrastrando en el calendario (solo Logística);
- cancelar en tránsito;
- recepción por el jefe de local de destino;
- vista y campana de cada rol;
- logística sin zona.

## Lo que funcionó

| Área | Resultado |
|---|---|
| Activar cuenta (dashboard del administrador) | OSCAR PEREZ quedó como **Ejecutivo de CONCON**.<br>• El rol es obligatorio.<br>• La sucursal del registro viene precargada.<br>• El resumen "Así quedará la cuenta" refleja la elección y el botón exige confirmar.<br>• El guardado bloquea dar a un jefe de local una sucursal que ya tiene jefe. |
| Crear solicitud | #808C41B7 (Valparaíso) quedó "Pendiente de aprobación". La creación notificó al jefe de local. |
| Aprobar | Rechaza una fecha pasada ("no puede ser anterior al día de hoy"). Con la fecha modificada aprueba y notifica a Logística de la zona. |
| Priorizar | El arrastre desde "Por Priorizar" hasta la cola funciona. Ver el hallazgo H2 sobre la posición. |
| Asignarme (administrador) | La solicitud pasa a Asignada. |
| Calendario | • El clic sin arrastrar abre el detalle.<br>• Cada tarjeta muestra el N° de solicitud.<br>• El buscador filtra por N° (con o sin `#`).<br>• Las vistas mes, semana y día funcionan.<br>• Los eventos aparecen en fucsia con el distintivo EVENTO. |
| Despachar / deshacer despacho | Funciona y deja auditoría. Notifica al jefe de recepción. |
| Recepción con novedades | Exige describir la novedad, sube la foto y notifica al ejecutivo y al encargado de Logística ("Recibida con novedades"). |
| Entregar a cliente | Finaliza la solicitud y notifica al jefe de origen y a Logística. |
| Rechazar | Con 4 caracteres, o con 4 caracteres más espacios, el botón queda deshabilitado. Con un motivo válido rechaza. |
| Cancelar (priorizada) | El motivo exige 5 caracteres. La cola de Concón se renumeró a 1..2. |
| Documentos | El PNG se sube, se lista y se puede descargar o eliminar. El `.exe` se rechaza y no queda guardado. |
| Traslado interno | Crear → despachar → recibir. El vehículo quedó en 15 Norte con disponibilidad "liberado". |
| Vehículos | Alta (el chasis se limita a 17 caracteres), edición y eliminación con confirmación. |
| Usuarios | El modal muestra los campos según el rol y bloquea el conflicto de jefe de local. |
| Otras pantallas | Sucursales, historial (889 registros), reportería, slots, perfil y FAQ cargan sin errores de consola. |
| Móvil (375 px) | Dashboard, solicitudes y calendario sin desborde horizontal. |
| Enlace de notificación | `/solicitudes?solicitud=<id>` abre el detalle directamente. |
| Historial | Después de la corrección muestra:<br>• etiquetas legibles;<br>• el motivo de rechazo, cancelación y reprogramación;<br>• "Despacho revertido";<br>• la entrada de creación con su autor. |

## Hallazgos

| # | Sev. | Pantalla / acción | Esperado | Obtenido |
|---|---|---|---|---|
| H1 | Alta | Subir documento de entre 10 y 15 MB (detalle → Documentos) | Mensaje "máximo 10 MB" | Error 500 y error en la página ("Unexpected end of form") |
| H2 | Media | Prioridades: soltar una solicitud de "Por Priorizar" en una posición intermedia | Se guarda donde se soltó | La UI la muestra en la 10, pero se guarda en la 11 (al final) |
| H3 | Media | Traslado interno: elegir vehículo | Solo vehículos ubicados en el origen | Se ofrecen vehículos sin ubicación o de otras sucursales, y el servidor no valida la ubicación |
| H4 | Media | Aprobaciones: fecha límite | Igual que en la lista (20-10-2026) | Muestra 19-10-2026 y usa otro formato (guiones) |
| H5 | Media | Fechas con hora (creado, despacho, documentos, historial) | Fecha de Chile | Después de las 21:00 muestran el día siguiente (un traslado creado el 14/10 a las 21:05 aparece "15/10") |
| H6 | Media | Cancelar una solicitud Asignada | Poder cancelarla antes del despacho | No aparece "Cancelar". Solo se cancelan pendientes, aprobadas y priorizadas (decisión de negocio) |
| H7 | Media | "Entregar a cliente" | Pedir confirmación (es irreversible) | Finaliza con un clic |
| H8 | Media | Encabezado en móvil | Botón de cerrar sesión | No existe en móvil (`hidden sm:block`) |
| H9 | Media (conocido) | "Asignarme" desde Priorizada | La posición de la cola se limpia | Queda Asignada con chip #11 y "Prioridad 11" en el detalle |
| H10 | Baja | Errores dentro de modales (aprobar con fecha pasada, archivo no permitido) | Error visible dentro del modal | Se muestra arriba de la página, detrás del modal |
| H11 | Baja | Detalle de solicitud | Indicador de carga | Historial, observaciones y documentos tardan ~15 s en desarrollo (4 server actions en serie) sin indicador |
| H12 | Baja | Detalle: administrador asignado como encargado | Rol "Administrador" | Muestra "Logística" |
| H13 | Baja | Aprobaciones: vehículos | Chasis o modelo si no hay patente | Chips vacíos (solo el ícono) |
| H14 | Baja | Calendario: buscador | Placeholder completo | Texto cortado ("…patente o chi") |
| H15 | Baja | Prioridades | Sin errores de consola | Aviso de hidratación de React (probablemente los ids de dnd-kit) |
| H16 | Baja | Activar cuenta: cambiar a Jefe de Local con una sucursal ya elegida que tiene otro jefe | No poder elegirla | Queda seleccionada (el guardado sí lo bloquea) |
| H17 | Baja | Traslados: despachar | La tarjeta se actualiza junto con el mensaje | El mensaje de éxito aparece segundos antes de que cambie la tarjeta (posible lentitud del modo desarrollo) |
| H18 | Info | Campana (tiempo real) | Conexión al websocket | "WebSocket opening handshake timed out" en una carga (puede ser la red) |
| H19 | Info | Datos de prueba | Códigos distinguibles | Las 130 solicitudes de prueba muestran el mismo código `#5EED0001`, así que la búsqueda por N° no las distingue |

### Causas identificadas

- **H1:** Next 16 copia en memoria el cuerpo de las peticiones que pasan por el proxy (`src/middleware.ts`) con un límite de 10 MB (`experimental.proxyClientMaxBodySize`). Las server actions aceptan 15 MB (`serverActions.bodySizeLimit`). Opciones: validar el tamaño en el navegador antes de enviar, y/o subir `proxyClientMaxBodySize` a `'15mb'`.
- **H2:** la auditoría registró la vía `priorizarSolicitudAction` (que agrega al final) en lugar de `priorizarEnPosicionAction`. En `priorizarOptimista` (`PrioridadesClient.tsx`) la posición calculada llegó como `null`.
- **H3:** `TrasladoService.crearTraslado` valida estado y disponibilidad, pero no `vehiculo.ubicacion = origen_id`.
- **H4:** `AprobacionesClient.tsx` define su propio `formatFecha` con `toLocaleDateString('es-CL')` (hora local) en vez de `lib/fechas`.
- **H5:** `lib/fechas.formatFecha` usa UTC para todo. Sirve para las fechas sin hora (fecha límite), pero adelanta un día los timestamps.

## Correcciones aplicadas en esta sesión (solo visual)

| Archivo | Cambio |
|---|---|
| `src/components/SolicitudDetalleModal.tsx` | • El historial mostraba códigos internos (`aprobacion`, `priorizacion`, `asignacion_logistica`); ahora muestra etiquetas legibles.<br>• Distingue "Despacho revertido".<br>• Muestra el motivo en rechazos, cancelaciones y reprogramaciones.<br>• La entrada de creación ya no muestra "Usuario no disponible" ni "creada por el Jefe de Local" en las solicitudes creadas por un administrador: sin autor conocido muestra solo "Solicitud creada". |
| `src/components/DashboardJefeLocal.tsx` | Distintivo EVENTO en los paneles "Pendientes de aprobar" y "Priorizaciones pendientes" |

Ambos cambios se verificaron en el navegador. No se corrieron typecheck ni tests, y quedan sin commitear.

## Datos modificados durante la prueba

| Dato | Estado final | ¿Lo borra `02_limpiar`? |
|---|---|---|
| OSCAR PEREZ | Ejecutivo de CONCON, activo y aprobado | No (es un usuario real) |
| Solicitud #808C41B7 | Asignada (encargado: administrador). Tiene un documento PNG | **No** (no tiene prefijo `5eed`) |
| Traslado #0e6c4361 | Recepcionado. El vehículo `LNBMCUAK0TD248118` quedó en 15 Norte | **No** |
| S14 (`5eed…0014`) | Despachada y revertida: sigue Programada | Sí |
| Solicitud de prueba en tránsito (15 Norte) | Recepcionada con novedades + foto | Sí |
| S1034 | Finalizada por el administrador | Sí |
| Una pendiente de Valparaíso (`5eed`) | Rechazada ("QA: falta la orden de compra firmada.") | Sí |
| S1110 | Cancelada ("QA: el cliente desistió de la compra.") | Sí |
| Vehículo `TESTQA00000000000` | Creado y eliminado | — |
| Notificaciones | Las generadas por cada acción | Sí, las de solicitudes `5eed` |

Las solicitudes S1101–S1110 (prefijo `5eed`) las volvió a crear otra persona el mismo día; no las crearon los scripts de esta prueba.

## Siguientes pasos sugeridos

1. Decidir el acceso para los roles pendientes (opción A, B o C) y completar la prueba.
2. Corregir H1, H2 y H3 (afectan datos o rompen una acción).
3. Unificar el formato de fechas (H4, H5): fecha sin hora en UTC, timestamps en hora de Chile.
4. Decisiones de negocio: cancelar Asignadas (H6) y confirmar "Entregar a cliente" (H7).
5. UX: botón de cerrar sesión en móvil (H8), errores dentro de los modales (H10), indicador de carga en el detalle (H11).
6. Datos de prueba: generar ids cuyos 8 primeros caracteres varíen (H19).
