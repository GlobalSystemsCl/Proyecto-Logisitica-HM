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

- El número visible de una solicitud es `<código de sucursal de origen>-<correlativo>` (101-15) y se arma solo con `codigoSolicitud` (`src/lib/codigoSolicitud.ts`), que necesita `sucursal` y `numero`; los traslados internos usan `codigoTraslado`. No usar `id.slice(0, 8)` en código nuevo.
- El código de sucursal ES `sucursal.id` (los del Excel de concesionarios). Para filtrar solicitudes por sucursal se usa `solicitud.sucursal`; no crear otra relación ni columna de código. La BD asigna `solicitud.numero` (trigger `tr_asignar_numero_solicitud`): la app nunca lo escribe.
- Para que una solicitud se pueda abrir desde cualquier lista, envolver su número en `AbrirSolicitudDetalle` (`src/components/`).

## Cuentas

- Toda creación de cuentas valida el dominio con `validarDominioCorreo` (`src/lib/dominios.ts`, variable `DOMINIOS_CORREO_PERMITIDOS`). El login nunca se restringe por dominio.
- El administrador solo recibe la notificación `NUEVO_USUARIO` (campana, sin correo); no agregarlo a los destinatarios del flujo de solicitudes.

## Ayuda

- Las preguntas frecuentes están en `src/config/faq.ts`, por rol y por vista. Si un cambio modifica lo que el usuario ve o una regla de negocio, actualizar ahí la respuesta que lo explica. Una ruta nueva se agrega a `RUTAS_VISTA` para que el botón de ayuda la reconozca.
