# Brecha 004 — Server Actions sin verificación de autenticación

## Estado
Corregida

## Severidad
High

## Categoría
Security — Broken Access Control, Information Exposure

## Descripción
En `src/app/actions/solicitudes.actions.ts`, dos Server Actions exportadas no verifican sesión ni rol y llaman a services que usan service_role:

```ts
export async function getObservacionesAction(solicitudId: string) {
  return SolicitudesService.getObservaciones(solicitudId);
}
export async function getAuditoriaAction(solicitudId: string) {
  return SolicitudesService.getAuditoria(solicitudId);
}
```

Las Server Actions son endpoints POST públicos. Se invocan con el header `Next-Action: <id>` desde **cualquier ruta**, incluidas las públicas (`/`, `/login`) que el middleware deja pasar sin sesión. Los IDs de las actions aparecen en los bundles JavaScript de `/_next/static`, que el middleware excluye y son descargables sin autenticación.

## Evidencia
- `src/app/actions/solicitudes.actions.ts` líneas ~486-492.
- `src/services/solicitudes.service.ts` `getObservaciones()` (~1180) y `getAuditoria()` (~1212): `createAdminClient()`, sin filtro por usuario.
- `src/middleware.ts`: matcher excluye `_next/static`. `lib/supabase/middleware.ts`: `/` y `/login` son accesibles sin sesión.

## Impacto
Una persona **no autenticada** que conozca el UUID de una solicitud puede leer todas sus observaciones (texto libre que puede incluir datos de clientes) y su historial de auditoría (nombres de usuarios, estados, fechas, motivos de rechazo o cancelación, IDs de vehículos). Los UUID no son enumerables, lo que limita el impacto, pero aparecen en URLs, auditoría y otros datos que cualquier autenticado ve.

## Cómo reproducirlo
(No ejecutado.)
1. Obtener el ID de la action desde los chunks JS de `/solicitudes`.
2. `POST /login` con headers `Next-Action: <id>`, `Content-Type: text/plain;charset=UTF-8` y body `["<uuid-solicitud>"]`.
3. La respuesta RSC contiene las observaciones.

## Causa raíz
No hay un guard centralizado: cada action implementa (o no) su verificación. Estas dos se escribieron como simples "pass-through".

## Solución propuesta
1. Añadir `getProfileOrThrow()` y una verificación de acceso a la solicitud (`requireSolicitudAccess(profile, solicitudId)`) que reutilice las mismas reglas de visibilidad de `getSolicitudesFiltradas` (ejecutivo propio, JL de origen o destino, logística de la zona, admin).
2. Crear un helper único en `src/lib/auth/guards.ts` (`requireProfile`, `requireRole`, `requireSolicitudAccess`) y usarlo en todas las actions.
3. Regla de lint o test que recorra los exports de `src/app/actions/*.ts` y verifique que cada uno llame a un guard (test de "inventario de actions").

## Riesgos de la solución
- `SolicitudDetalleModal` llama estas actions. Un error de alcance podría ocultar observaciones a usuarios legítimos (por ejemplo, el JL destino). Cubrir con tests por rol.

## Tests necesarios
- Sin sesión → error o lista vacía.
- Ejecutivo sobre solicitud ajena → error.
- JL origen y JL destino, logística de la zona y admin → acceso.

## Plan de implementación
1. Crear `requireSolicitudAccess` con tests.
2. Aplicarlo en las 2 actions y en las de la brecha 006.
3. Test de inventario de actions.

## Criterios de aceptación
- Ninguna action exportada devuelve datos sin sesión válida.
- El test de inventario pasa y falla si se agrega una action sin guard.

## Solución aplicada (2026-10-07)

**Rama:** `fix/brechas-auditoria-2026-10-07`

### Cambios
- `getObservacionesAction` y `getAuditoriaAction` exigen sesión válida (`requireProfile`) y alcance sobre la solicitud (`requireSolicitudAccess`). Sin sesión o sin acceso devuelven una lista vacía, sin llegar al service.
- Nuevo módulo central `src/lib/auth/guards.ts`: `requireProfile`, `requireRole`, `requireSolicitudAccess`, `requireDocumentoAccess` y `requireSolicitudVehiculoAccess`. La regla de visibilidad (`puedeAccederSolicitud`) es la misma de `getSolicitudesFiltradas`, más los participantes asignados.
- Test de inventario: recorre todas las funciones exportadas de `src/app/actions/*.ts` y falla si alguna no invoca un guard (salvo una lista explícita de actions públicas de autenticación), o si una action de solicitudes que recibe un ID no verifica el alcance.

### Archivos
- `src/lib/auth/guards.ts`, `src/app/actions/solicitudes.actions.ts` y las demás actions (usan los guards).

### Tests
- `tests/unitarios/guards.test.ts` (27 casos).
- `tests/unitarios/actions-inventario.test.ts`.
- `tests/unitarios/solicitudes.actions.test.ts`: `should_return_empty_without_querying_when_there_is_no_session`, `should_return_empty_when_solicitud_belongs_to_another_ejecutivo`.
