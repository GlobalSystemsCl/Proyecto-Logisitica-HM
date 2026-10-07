# Brecha 021 — Inyección en filtros PostgREST (`.or()` con texto del usuario) y `ilike` sin escape

## Estado
Corregida (índice único pendiente)

## Severidad
Low

## Categoría
Security — Injection (filter injection), Validación

## Descripción
1. `TrasladoService.getVehiculosParaTraslado` construye `query.or(\`patente.ilike.%${seguro}%,chasis.ilike.%${seguro}%\`)` con `seguro = filtro.replace(/%/g, '')`. Solo se quita `%`. Comas, paréntesis y puntos permiten inyectar condiciones adicionales en la expresión `or` de PostgREST (por ejemplo, `x%,id.neq.0`). El impacto queda acotado a la tabla `vehiculo`, que el rol logística ya puede ver, y a ese endpoint con service_role, así que permite saltarse los filtros de exclusión (vendidos o reservados) en el listado.
2. Validaciones de unicidad con `.ilike('nombre', input)` en sucursales y zonas (`SucursalesService.createSucursal`/`updateSucursal`, `OrganizacionService.createZona`/`updateZona`) no escapan `_` ni `%`. Un nombre con `_` coincide con otros nombres y produce falsos "ya existe".
3. Los `.or(\`sucursal.in.(${ids.join(',')})…\`)` usan IDs numéricos del servidor: sin riesgo.

## Evidencia
- `src/services/traslado.service.ts` ~475-477.
- `src/services/sucursales.service.ts` ~161, ~204; `src/services/organizacion.service.ts` ~52, ~82.

## Impacto
Bajo: lectura de vehículos fuera del filtro previsto para usuarios de Logística o Admin; errores de validación incorrectos.

## Cómo reproducirlo
(No ejecutado.) Buscar `a%,id.not.is.null` en el buscador de vehículos de traslados.

## Causa raíz
Interpolación de texto en la mini-sintaxis de filtros de PostgREST.

## Solución propuesta
1. Escapar el término: eliminar o rechazar `,()."\\` o validar con `^[A-Za-z0-9-]{1,20}$` (patente y chasis son alfanuméricos), o usar dos consultas `.ilike()` separadas o una RPC con parámetros.
2. Unicidad case-insensitive: índice único `lower(nombre)` en `sucursal` y `zona`, y comparar con `.eq` sobre un valor normalizado, o escapar `%`, `_` y `\`.

## Riesgos de la solución
- Bajos.

## Tests necesarios
- Búsqueda con caracteres especiales → sin resultados inesperados ni error 500.
- Crear la zona "Zona_1" cuando existe "ZonaX1" → permitido.

## Plan de implementación
Helper `sanitizarBusqueda` con tests + reemplazo en los 5 puntos.

## Criterios de aceptación
- Ningún texto de usuario se interpola sin sanear en `.or()` ni en `.ilike()`.

## Solución aplicada (2026-10-07)

**Rama:** `fix/brechas-auditoria-2026-10-07`

### Cambios
- `TrasladoService.getVehiculosParaTraslado`: el término de búsqueda pasa por `sanitizarTerminoBusqueda`, que deja solo alfanuméricos y guiones (máximo 30), porque patente y chasis lo son. Ya no se pueden inyectar condiciones en `.or()`.
- Validaciones de nombre único en sucursales y zonas: `escaparPatronLike` escapa `\`, `%` y `_`, así que "Zona_1" ya no coincide con "ZonaX1".

### Archivos
- `src/lib/busqueda.ts`, `src/services/traslado.service.ts`, `src/services/sucursales.service.ts`, `src/services/organizacion.service.ts`

### Tests
- `tests/unitarios/busqueda.test.ts`.

### Pendiente
- Índice único `lower(nombre)` en `sucursal` y `zona`. Antes hay que revisar si hoy existen duplicados.
