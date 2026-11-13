<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Testing (obligatorio)

Vitest está configurado (`vitest.config.mts`, alias `@` → `src`).

**Regla: TODA función, método o helper nuevo debe venir acompañado de su test unitario en el mismo cambio.** Si la función toca la BD, el test se mockea `@/lib/supabase/admin` (o `@/lib/supabase/server`) y se ubica en `tests/unitarios/`. Si es pura, va sin mocks.

Comandos:
```bash
npm run test              # suite completa
npm run test:unit         # solo tests/unitarios
npm run test:coverage     # con reporte de coverage
npm run typecheck         # tsc --noEmit
npm run lint
```

Convenciones de test (ver `tests/plan_maestro_testing.md`):
- Nombre: `should_<resultado>_when_<condición>`
- Un `describe` por función/método, casos positivo, negativo y edge cases
- `vi.clearAllMocks()` en `beforeEach`
- Sin `test.only` / `test.skip`
- Funciones puras (`lib/fechas.ts`, parsers CSV, helpers de `types/`) NO se mockean
- Para fechas fijas usar `vi.setSystemTime(...)` + `vi.useRealTimers()` en `afterEach`

## Solicitudes en la UI

- El número visible de una solicitud es `<código de sucursal de origen>-<correlativo>` (101-15) y se arma solo con `codigoSolicitud` (`src/lib/codigoSolicitud.ts`), que necesita `sucursal` y `numero`; los traslados internos usan `codigoTraslado(t)` ("T-15", `traslado_interno.numero`, lo asigna la BD): pasarle el traslado, no solo el id. No usar `id.slice(0, 8)` en código nuevo.
- El código de sucursal ES `sucursal.id` (los del Excel de concesionarios). Para filtrar solicitudes por sucursal se usa `solicitud.sucursal`; no crear otra relación ni columna de código. La BD asigna `solicitud.numero` (trigger `tr_asignar_numero_solicitud`): la app nunca lo escribe.
- Para que una solicitud se pueda abrir desde cualquier lista, envolver su número en `AbrirSolicitudDetalle` (`src/components/`).
- Despachar exige el número de guía de cada vehículo (`validarGuias`, `lib/guiaDespacho.ts`): todo camino que pase a `en_transito` debe recibir y guardar las guías.
- Una venta cuyos vehículos ya están todos en la sucursal de destino es `sin_traslado` (`lib/ventaSucursal.ts`): al aprobarse queda `entregada`, sin Logística ni slots reservados. No se mezclan vehículos del destino con otros en una solicitud.
- Slots: `sucursal.slots_ocupados` YA incluye los reservados (vehículos en la sucursal + reservas). Todo cálculo de uso, libres o estado pasa por `lib/slots.ts` (`usoSlots`, `enSucursal`, `slotsLibres`); nunca sumar `slots_ocupados + slots_reservados`.
- Para saber si un vehículo está libre (pedirlo o trasladarlo) se usa `ESTADOS_BLOQUEAN_VEHICULO` (reserva + `entregada`); `ESTADOS_ACTIVOS_RESERVA` es solo para los slots. Ambas listas tienen su contraparte en SQL y un test que las compara.
- Solo se piden vehículos con sucursal de origen (`tieneUbicacion`, `lib/vehiculo.ts`): todo camino que reserve vehículos valida en el servidor con `SolicitudesService.validarVehiculosConUbicacion`. Los tipos de documento permitidos viven en `TIPOS_DOCUMENTO` (`lib/archivos.ts`) y deben coincidir con el bucket `solicitud-documentos`.
- El enlace de cada notificación sale de `rutaAccion` (`lib/notificaciones-app.ts`, tabla `RUTA_ACCION`) según el evento y el papel del destinatario. Una pantalla que sea destino de un aviso debe abrir el detalle con `?solicitud=` (o `?traslado=`): su propio modal si la solicitud está en la lista, o `AbrirSolicitudDesdeUrl` si no.

- Inventario: solo Logística y el administrador importan, registran, editan y mueven vehículos (`ROLES_GESTION_VEHICULOS` / `puedeGestionarVehiculos`, `lib/vehiculo.ts`); el jefe de local y Operaciones solo consultan. La importación NO omite los chasis con "ELIMINAR": son vehículos válidos (decisión 2026-11-13).
- Una sucursal sin zona no la ve ningún usuario de Logística: `/admin/sucursales` lo avisa con `resumenSinZona` (`lib/sucursalesSinZona.ts`).

- La ruta de una solicitud se muestra con `rutaSolicitud` / `origenVehiculo` (`lib/origenSolicitud.ts`): el origen es la sucursal desde la que sale el vehículo (`solicitud_vehiculo.sucursal_origen`), no `solicitud.sucursal` (la que pide). No armar `sucursal_nombre → destino` a mano.
- Confirmaciones y avisos: `useConfirmacion` (`components/Confirmacion.tsx`). No usar `window.confirm` ni `alert` (bloquean el navegador). Con un modal abierto, los errores van con `avisar`, encima del modal.

- Fechas en pantalla con `formatFecha` (dd/mm/aaaa) o `formatFechaLarga`; tipo de solicitud con `etiquetaTipoSolicitud` (`lib/textos.ts`). Un modal nuevo usa una capa `fixed inset-0` con fondo `bg-black/..` (o `aria-modal="true"`): así `AtraparFocoModales` (layout raíz) mantiene el foco dentro. Una fila que abre una solicitud usa `abrirDetalleDeFila` o `esClicEnControl` (`components/FilaAbreDetalle.tsx`).
- El rechazo guarda el motivo en `solicitud.motivo_cancelacion` además de la observación `[RECHAZO]`.

- Ver documentos en el navegador solo para `TIPOS_VISTA_PREVIA` (`lib/archivos.ts`: PNG, JPG, WEBP, PDF), con `getURLsVistaPrevia`. Descargar sigue forzando adjunto (`getURLDescarga`). Nunca abrir en línea HTML ni SVG.

- Fotos y documentos de traslados: `traslado_documento` (mismo bucket, prefijo `traslados/`), con `TrasladoService.subirDocumentos` y el acceso de `puedeAccederTraslado` (`lib/accesoTraslado.ts`).

## Transporte

- `public.transportista` es la **empresa** de transporte (nombre y RUT); sus camiones están en `camion`. Las patentes se guardan con `normalizarPatente` y se muestran con `formatearPatente` (`lib/patente.ts`). Empresas y camiones no se borran: se desactivan.
- Programar, reprogramar y crear traslados reciben `AsignacionTransporte` (patente + transportista) y el servidor la resuelve con `TransportistaService.resolverTransporte`; no recibir `transportista_id` directo desde la UI.

## Cuentas

- Toda creación de cuentas valida el dominio con `validarDominioCorreo` (`src/lib/dominios.ts`, variable `DOMINIOS_CORREO_PERMITIDOS`). El login nunca se restringe por dominio.
- El registro crea la cuenta **activa** como ejecutivo (decisión del 2026-11-03): no volver a dejarla pendiente de aprobación. El administrador solo corrige rol o sucursal.
- El administrador solo recibe la notificación `NUEVO_USUARIO` (campana, sin correo); no agregarlo a los destinatarios del flujo de solicitudes.
- Los correos de Auth (recuperación de clave) se envían con Brevo usando `auth.admin.generateLink` y un enlace `token_hash` al callback. No usar `resetPasswordForEmail`: el SMTP por defecto de Supabase no entrega a los usuarios.
- Un usuario de Logística con solicitudes o traslados sin cerrar no pierde el rol ni se desactiva sin traspasarlos: `updateUser(..., { traspasarA })` (QA #25). Los estados que cuentan son los de `lib/ausencias.ts`.
- Ausencias de Logística (`AusenciaService`, `/admin/ausencias`): las zonas temporales del sustituto se guardan en `usuario_zona` con `ausencia_id`. Toda lectura de las zonas **propias** de un usuario filtra `.is('ausencia_id', null)`; el alcance de Logística (qué ve el sustituto) sí las incluye. Las rutas `/api/cron/*` se autorizan con `autorizadoCron` y quedan fuera del middleware.
- El middleware nunca cierra la sesión por un error al leer la cuenta, y cuando la cierra usa `signOut({ scope: 'local' })`.

## Ayuda

- Las preguntas frecuentes están en `src/config/faq.ts`, por rol y por vista. Si un cambio modifica lo que el usuario ve o una regla de negocio, actualizar ahí la respuesta que lo explica. Una ruta nueva se agrega a `RUTAS_VISTA` para que el botón de ayuda la reconozca.
