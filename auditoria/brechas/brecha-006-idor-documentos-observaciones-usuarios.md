# Brecha 006 — IDOR en documentos, observaciones, insistencias y datos de usuarios

## Estado
Corregida

## Severidad
High

## Categoría
Security — Insecure Direct Object Reference, Broken Access Control

## Descripción
Varias Server Actions solo exigen "usuario autenticado y activo" y luego operan con service_role sobre el ID recibido, sin verificar que el usuario participe en la solicitud:

| Action | Archivo / línea aprox. | Efecto con un ID ajeno |
|---|---|---|
| `getDocumentosSolicitudAction(solicitudId)` | solicitudes.actions.ts ~794 | Lista los documentos de cualquier solicitud (nombre, ruta, autor) |
| `descargarDocumentoSolicitudAction(documentoId)` | ~814 | URL firmada de descarga de cualquier documento |
| `subirDocumentosSolicitudAction(solicitudId, …)` | ~768 | Sube archivos a cualquier solicitud |
| `agregarObservacionAction(solicitudId, texto)` | ~467 | Comenta en cualquier solicitud |
| `getInsistenciasAction(solicitudId)` | ~759 | Lee las insistencias de cualquier solicitud |
| `getUsuarioDetalleAction(usuarioId)` | ~498 | Email, teléfono, rol, sucursales y zonas de cualquier usuario |
| `eliminarDocumentoSolicitudAction` | ~803 | Logística puede borrar cualquier documento (regla de rol, sin alcance) |

## Evidencia
- Las actions citadas llaman a `getProfileOrThrow()` y no hacen nada más antes del service.
- Services: `SolicitudesService.getDocumentos`, `getURLDescarga`, `subirDocumentos` (solo verifica que la solicitud exista), `agregarObservacion`, `getInsistencias`, `UsersService.getUsuarioDetalleById`, todos con `createAdminClient()`.
- Contraste: la RLS `observacion_insert_participantes` sí exige ser participante. La app la salta con service_role.

## Impacto
Un usuario de cualquier rol (incluido un autoregistrado, ver brechas 002/003) que obtenga UUIDs de solicitudes puede descargar documentos de otras sucursales: contratos, documentos de clientes. Los UUIDs aparecen en el historial de auditoría, en notificaciones, en enlaces compartidos y en la cola de prioridades. También puede contaminar solicitudes con comentarios o archivos y obtener datos de contacto de todo el personal.

## Cómo reproducirlo
(No ejecutado.)
1. Como ejecutivo de la sucursal A, invocar `getDocumentosSolicitudAction('<uuid de solicitud de sucursal B>')`.
2. Con el `id` devuelto, invocar `descargarDocumentoSolicitudAction` → URL firmada válida 5 minutos.

## Causa raíz
Falta un control de acceso a nivel de objeto reutilizable. Solo se verifica el rol, no la relación usuario-solicitud.

## Solución propuesta
1. Implementar `requireSolicitudAccess(profile, solicitudId, modo: 'leer' | 'escribir')` (ver brecha 004) con la misma regla de visibilidad que `getSolicitudesFiltradas`.
2. Para acciones sobre documentos por `documentoId`, resolver primero `solicitud_id` y aplicar el mismo guard.
3. `getUsuarioDetalleAction`: permitir solo si el usuario consultado participa en una solicitud visible para quien consulta, si es él mismo, o si quien consulta es admin. Como mínimo, no devolver teléfono y email a roles que no lo necesiten.
4. `eliminarDocumento`: además del rol, exigir alcance (logística en su zona).

## Riesgos de la solución
- Regla demasiado estricta → usuarios legítimos (JL destino, logística asignada) pierden acceso. Cubrir con tests por rol y por relación.

## Tests necesarios
- Matriz rol × relación (propio, misma sucursal, otra sucursal, zona, sin relación) para cada action listada.
- Descarga de documento ajeno → error.

## Plan de implementación
1. Helper de guard con tests.
2. Aplicarlo action por action.
3. Prueba manual con dos usuarios de sucursales distintas.

## Criterios de aceptación
- Ninguna action devuelve ni modifica datos de una solicitud fuera del alcance del usuario.

## Solución aplicada (2026-10-07)

**Rama:** `fix/brechas-auditoria-2026-10-07`

### Cambios
| Action | Control agregado |
|---|---|
| `getDocumentosSolicitudAction`, `subirDocumentosSolicitudAction`, `agregarObservacionAction`, `getInsistenciasAction` | `requireSolicitudAccess` |
| `descargarDocumentoSolicitudAction`, `eliminarDocumentoSolicitudAction` | `requireDocumentoAccess`: resuelve la solicitud del documento y aplica el mismo alcance |
| `getUsuarioDetalleAction` | Email y teléfono solo con relación de trabajo (ver abajo) |

- Contacto de usuarios (`src/lib/auth/contacto.ts`): nombre, rol y sucursal siguen visibles para cualquier usuario activo, porque se usan en historial y listados. El email y el teléfono solo se entregan si quien consulta es administrador o el propio usuario, si el consultado participa en una solicitud a la que quien consulta tiene acceso (`SolicitudDetalleModal` ahora envía el `solicitudId`), si comparten sucursal o zona, o si el consultado es administrador, jefe de local o logística (roles de coordinación). En los demás casos la UI muestra "No disponible".

### Archivos
- `src/app/actions/solicitudes.actions.ts`, `src/lib/auth/guards.ts`, `src/lib/auth/contacto.ts`
- `src/components/SolicitudDetalleModal.tsx`, `src/components/usuario-info-modal.tsx`, `src/types/auth.types.ts` (`contacto_oculto`)
- `src/services/solicitudes.service.ts`: `getSolicitudIdDeDocumento`, `getSolicitudIdDeReserva`

### Tests
- `tests/unitarios/solicitudes.actions.test.ts` (descarga, listado y comentarios sobre solicitudes ajenas; contacto oculto).
- `tests/unitarios/contacto.test.ts`, `tests/unitarios/guards.test.ts`.

### Decisión tomada por defecto (confirmar)
- La regla de contacto descrita arriba. Si el negocio prefiere un directorio abierto entre empleados, basta con devolver siempre `detalle` en `getUsuarioDetalleAction`.
