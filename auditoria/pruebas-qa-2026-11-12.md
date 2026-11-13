# Prueba integral del sistema (QA) — 2026-11-12

Recorrido en el navegador (local, contra la BD única) por los roles Ejecutivo, Jefe de Local, Logística y Administrador, más revisión del código de cada pantalla. Flujo completo probado con la solicitud de prueba **135-23** (Amarok `8AWJW62H3TA000414`): crear → aprobar → priorizar → programar con camión `QAQA-99` → despachar con guía `QA-0001` → recibir → entregar. Funcionó de punta a punta.

Severidad: 🔴 bug grave · 🟠 bug · 🟡 usabilidad · ⚖️ decisión pendiente.

## Bugs graves

| # | Hallazgo | Dónde |
|---|---|---|
| 1 | ✅ **Corregido** (migración `20261112140000` + `ESTADOS_BLOQUEAN_VEHICULO`). El formulario de solicitud ofrecía vehículos que la BD rechaza: la lista no considera reservados los de solicitudes `entregada` (recepcionadas, falta entregar al cliente) y el trigger sí. Hoy los 4 "disponibles" eran de ese tipo. | `ESTADOS_ACTIVOS_RESERVA` (`solicitudes.service.ts:40`) vs `fn_validar_reserva_unica_vehiculo` |
| 2 | ✅ **Corregido** (`getCooldownsInsistenciaAction`: 1 llamada en vez de N; el detalle abre en <2 s). Mis Solicitudes hacía una server action por solicitud para el cooldown de "Insistir" (66 llamadas de ~1 s en serie): todo lo demás espera detrás (abrir detalle ~5 s, crear ~12 s). | `SolicitudesClient.tsx:466` |
| 3 | ✅ **Corregido** (usa `ACEPTA_DOCUMENTOS`; `revisarArchivoElegido` descarta al elegir formatos no permitidos o de más de 10 MB, antes de crear la solicitud). El selector de archivos de "Nueva solicitud" quedaba con la lista antigua (Word, PPT, TXT, CSV, ZIP; sin `.xls`) y su texto de ayuda también. | `SolicitudesClient.tsx:1400` y `:1429` → `ACEPTA_DOCUMENTOS` / `TEXTO_FORMATOS_DOCUMENTO` |
| 32 | ✅ **Corregido** (`lib/slots.ts`: en uso = `slots_ocupados`; columna "En la sucursal"). Los slots contaban dos veces las reservas en todas las pantallas: `slots_ocupados` ya incluye reservados y `lib/slots.ts` vuelve a sumarlos. 3 ORIENTE BAIC se ve "23/20 excedida" con 12/20 real. Solo el formulario de solicitud calcula bien. | `slotsLibres`, `usoSlots`, `resumenSlots` (`lib/slots.ts`), `SucursalesTableClient.tsx:303` |
| 25 | ✅ **Corregido** (`UsersService.updateUser` exige `traspasarA` y traspasa; desactivar se bloquea si tiene trabajo abierto). Al cambiar el rol de un usuario de Logística, sus solicitudes abiertas quedan asignadas a él: nadie las atiende y Reportes las muestra como "Usuario sin nombre". | `UsersService.updateUser`, `reporteLogistica.ts:178` |
| 44 | ✅ **Corregido** (trigger `tr_validar_vehiculo_trasladable` + búsqueda de traslados). Un traslado interno podía llevarse un vehículo reservado para entregar a un cliente (probado con el TUCSON de la 135-4): misma causa que el #1 y sin trigger en la BD que lo frene. | `traslado.service.ts` (usa `ESTADOS_ACTIVOS_RESERVA`) |
| 45 | ⚖️ **Decidido (2026-11-13): no es bug.** Los chasis "…ELIMINARVIT" son vehículos válidos; la importación no los omite y no se borran (se revirtió el filtro). 17 vehículos con chasis "…ELIMINARVIT" (filas que el Excel marca para eliminar) se importaron como reales; 2 están en solicitudes. La importación debe saltarlas o marcarlas. | importación de stock |
| 26 | ✅ **Corregido** (aviso en `/admin/sucursales` con las que tienen solicitudes esperando y filtro "Sin zona"; `lib/sucursalesSinZona.ts`). Asignar las zonas sigue siendo configuración. 40 de 42 sucursales sin zona (incluidas 101 y 102 con solicitudes abiertas): ningún usuario de Logística las ve. Es configuración, pero falta un aviso en Sucursales. | `/admin/sucursales` |

## Bugs

| # | Hallazgo |
|---|---|
| 4 | ✅ **Corregido** (el middleware no redirige las server actions: `redirigeEnMiddleware`; `VigilanteSesion` lleva al login una vez al cerrarse la sesión). Con la sesión cerrada, las server actions en cola fallan con "An unexpected response was received from the server" (decenas de `POST /login`) en vez de redirigir una vez. |
| 5 | ✅ **Corregido** (`etiquetaTipoSolicitud` en `lib/textos.ts`: "Sala de venta" en todas las pantallas). El detalle llama "Traslado entre locales" a las de tipo venta (`SolicitudDetalleModal.tsx:539` y `:982`). |
| 6 | ✅ **Corregido** (Escape cierra el detalle si no hay otro modal encima). El detalle de solicitud no se cierra con Escape. |
| 16 | ✅ **Corregido** (si la fecha propuesta ya pasó, el modal pide elegir otra). Aprobar propone una fecha límite ya vencida y deja "Aceptar fecha"; el servidor la rechaza y el error queda detrás del modal (y fijo después). |
| 17 | ✅ **Corregido** (`aprobarSolicitud` valida con `validarVehiculosConUbicacion`). Aprobar no revalida que los vehículos tengan sucursal de origen (afecta a solicitudes antiguas pendientes). |
| 18 | ✅ **Corregido** (enlaza con `?solicitud=`). "Revisar" del dashboard del jefe lleva a la lista de Aprobaciones, no a la solicitud elegida. |
| 37 | ✅ **Corregido** (`posicionEnColaSucursal`: la tarjeta se contaba a sí misma). Prioridades no respeta la posición donde se suelta: queda al final aunque se vea en otra. |
| 38 | ✅ **Corregido** (migración `20261113100000`: `solicitud_vehiculo.sucursal_origen`; `rutaSolicitud`/`origenVehiculo` en `lib/origenSolicitud.ts`; el detalle muestra "Sale de"). El "origen" que muestran tarjetas, Movimientos y En tránsito es la sucursal que pide, no la sucursal desde la que sale el vehículo: "Por tramo" agrupa mal para revisar la factura del transportista. |
| 27 | ✅ **Corregido** (aviso en el dashboard). Un usuario de Logística sin zonas ve su dashboard en 0 sin aviso (Tránsito y Movimientos sí avisan). |
| 42 | ✅ **Corregido** (pide confirmación con el diálogo propio). "Entregar a cliente" no pide confirmación en la lista de solicitudes (sí en el panel del ejecutivo). Es irreversible. |
| 46 | ✅ **Corregido** (con un modal abierto, los errores salen en un aviso encima: `useConfirmacion().avisar`). Los errores de acciones dentro de un modal (subir documento inválido, aprobar con fecha vencida) se muestran en la página, detrás del modal, y se borran solos: el usuario nunca los ve. |
| 47 | ⚖️ **Decidido (2026-11-13): no es bug.** El administrador no cancela traslados (decisión del 2026-10-13, confirmada; se revirtió el cambio). El administrador puede crear, despachar y recibir traslados internos, pero no cancelarlos (`cancelarTrasladoAction` exige `logistica`). |

## Decisión pendiente

| # | Hallazgo |
|---|---|
| 15 | ✅ **Corregido** (`puedeGestionarVehiculos` en `lib/vehiculo.ts`: el servidor y la pantalla de inventario solo dejan importar, registrar, editar y mover a Logística y al administrador; el jefe de local y Operaciones consultan). El Jefe de Local puede importar el stock completo y mover en bloque cualquier vehículo de cualquier sucursal (`verifyVehiculoPermission` incluye `jefe_local`). ¿Solo Logística y admin, o el jefe solo los de sus sucursales? |

## Usabilidad

| # | Hallazgo |
|---|---|
| 7 | ✅ **Corregido** con el #38. Tarjetas "15 NORTE → 15 NORTE". |
| 8 | ✅ **Corregido** (clic en toda la fila o tarjeta abre el detalle: dashboards, Solicitudes, Aprobaciones, Prioridades, Recepciones, Tránsito, Reportes y Sucursales; `FilaAbreDetalle`). En las tarjetas solo el número abre el detalle; el resto de la tarjeta no responde. |
| 9 | ✅ **Corregido** (los avisos van bajo la lista). Al marcar un vehículo aparece un aviso sobre la lista y la desplaza: el siguiente clic cae en otro vehículo. |
| 10 | ✅ **Corregido**. El formulario se titula "Nueva Solicitud de Traslado" aunque sea una venta. |
| 11 | ✅ **Corregido** ("Recepcionada" y "Entregado al cliente"; tipo "Sala de venta" en todas partes). Mismo estado como "Recibida", "Recepcionada" y (al entregar) "Solicitud finalizada"; el tipo como "Venta", "Sala de venta" y "Traslado entre locales". Unificar vocabulario. |
| 12 | ✅ **Corregido** (el rechazo guarda el motivo en `motivo_cancelacion`; se ve en la lista y en el panel). Las rechazadas no muestran el motivo en la tarjeta. |
| 13 | ✅ **Corregido** (franja ajustable, `formatFecha` con día de 2 dígitos, sin la fecha duplicada). Detalle: barra horizontal en la franja de resumen, fechas con formatos distintos (`formatFecha` no rellena el día), "Entrega a cliente" duplicado con "Fecha de entrega". |
| 14 | ✅ **Corregido** (texto, placeholder y buscador de sucursal: `filtrarSucursales`). Registro dice "solicitar acceso"; el login sugiere gmail; la lista de 42 sucursales no tiene buscador. |
| 19 | ✅ **Corregido**. Aprobaciones muestra los vehículos solo como íconos, sin modelo ni chasis. |
| 20 | ✅ **Corregido** (`RecepcionModal` muestra código y vehículos: `lineasVehiculos`). El modal "Recibir" no muestra el número de solicitud ni el chasis. |
| 21 | ✅ **Corregido**. El dashboard usa voseo ("Desde acá entrás… tenés"); el resto del sistema usa tú. |
| 23 | ✅ **Corregido**. La tarjeta Traslados dice "Traslada aquí…" al jefe, que solo puede verlos; el calendario se llama "Gestión Logística" también para él. |
| 24 | ✅ **Corregido** (la tarjeta indica cuántos no tienen sucursal). "Disponibles 2.421" cuenta los que no tienen sucursal y no se pueden pedir. |
| 28 | ✅ **Corregido** (solo aparecen si hay cuentas pendientes). "Pendientes de autorización" y el filtro "Pendientes" de Usuarios sobran desde R17. |
| 29 | ✅ **Corregido** en el editor (`etiquetaZonaConSucursales`); renombrar las zonas es configuración. Las zonas se llaman "zona 1/2/3" y el editor de usuario no muestra qué sucursales cubren. |
| 30 | Slots y dashboard de Logística listan las 42 sucursales (pendiente). ✅ Corregido: una con capacidad 0 y vehículos ya sale "Sin capacidad declarada". |
| 31 | ✅ **Corregido** (se quitó). "Vehículos reservados" en Historial no corresponde a esa pantalla. |
| 33 | ✅ **Corregido** (`useConfirmacion`, `components/Confirmacion.tsx`: reemplaza los `window.confirm` y los `alert` que quedaban). 14 `window.confirm` nativos en 7 archivos (Usuarios 5, Calendarización 4, Vehículos, Ausencias, Panel ejecutivo, Detalle, Consulta): reemplazar por un modal propio. |
| 34 | ✅ **Corregido** (con más de 8 sucursales, un selector). Prioridades (admin): 42 botones de sucursal ocupan media pantalla. |
| 35 | ✅ **Corregido** (botón "Priorizar" y flechas: `moverEnColaSucursal`). Priorizar solo se puede arrastrando (sin alternativa por botón; difícil en celular). |
| 36 | ✅ **Corregido**. Al administrador el calendario muestra "Sin programar" sin explicar que solo Logística programa. |
| 39 | ✅ **Corregido** (`ordenarPorPrioridad`). "Por programar" no se ordena por prioridad. |
| 40 | ✅ **Corregido** (el detalle del día se desplaza a la vista). Al hacer clic en un día del calendario el detalle aparece fuera de la vista. |
| 41 | ✅ **Corregido** (aviso de éxito al programar y reprogramar; el modal ya mostraba el spinner). Programar tarda ~6 s y no muestra "guardando" ni confirmación. |
| 43 | ✅ **Corregido** (se quitó la franja repetida). Perfil: la franja y "Datos de la cuenta" repiten lo mismo; "27 de octubre d…" cortado. |
| 48 | ✅ **Corregido** (la tarjeta muestra los vehículos y el número es "T-15": migración `20261113110000`, `codigoTraslado(t)`). Traslados identificados como `#529ACF6B` (fragmento del uuid); la tarjeta no muestra qué vehículo lleva. |
| 49 | ✅ **Corregido** (tabla `traslado_documento`; fotos al recibir y sección "Fotos y documentos" en el detalle). Recibir un traslado no permite fotos; recibir una solicitud sí. |
| 50 | ✅ **Corregido**. Ausencias: si no hay otro usuario de Logística activo, el selector de sustituto queda vacío sin explicar por qué. |
| 51 | ✅ **Corregido**. Traslados usa la sigla "JL" en el subtítulo. |
| 52 | ✅ **Corregido** (`getVistasPreviasDocumentosAction`: miniatura y visor para imágenes, "Ver" para PDF; solo tipos validados por firma). Los documentos subidos no muestran miniatura ni vista previa. |
| 54 | ✅ **Corregido** (el panel solo aparece si hay cuentas pendientes). El dashboard del admin sigue mostrando "Cuentas por activar… esperan que les asignes rol y sucursal" (obsoleto desde R17; ver #28). |
| 56 | ✅ **Mejorado** (el perfil se lee en una consulta en vez de tres; el middleware sigue leyendo la cuenta). Cada server action tarda ~0,7–1,2 s aunque la consulta sea simple: el middleware (~0,4 s) y `requireProfile` leen la cuenta en cada llamada. Revisar si se puede cachear el perfil por petición. |
| 55 | ✅ **Corregido** en todos los modales (`AtraparFocoModales` en el layout raíz). Los modales no atrapan el foco: con el detalle abierto, los controles de la página siguen accesibles por teclado. |

## Configuración detectada

- Producción (Vercel, `main` en `f40584d`) no tiene el arreglo E2 de recuperación de clave; `.env.local` usaba un remitente de Brevo no verificado (corregido a `logistica@hmotores.cl`). Falta revisar `BREVO_SENDER_EMAIL` en Vercel y crear `CRON_SECRET` y `DOMINIOS_CORREO_PERMITIDOS`.

- Brevo: un correo a `@hmotores.cl` quedó "deferred" con "421 4.3.2 maximum number of concurrent server connections" (Microsoft 365 de la empresa). Si se repite, revisarlo con TI.

## Probado y correcto

Flujo completo de solicitud (crear → entregar), traslados internos en lote (crear 3, despachar con guía, recepcionar), validación de guía obligatoria, subida de documentos (PDF/PNG) y rechazo de formatos y de archivos falsos, vista previa de la carga masiva de usuarios (dominio, duplicados, rol, sucursal, zona, correo existente, filas vacías), recepción con novedades, modal de rechazo, editor de usuario con zonas, camiones y transportistas.

## No probado

Flujo real de ausencias (hace falta un segundo usuario de Logística; lo cubren 19 tests unitarios), borrar documentos (usa `window.confirm`), exportes a Excel (descargan archivos) y vista en celular (la ventana de prueba no se pudo achicar; probar desde el teléfono en `http://<IP del PC>:3000`).
