# Brecha 017 — Cobertura de tests insuficiente para seguridad y base de datos

## Estado
Parcial

## Severidad
Medium

## Categoría
Testing

## Descripción
Hay 20 archivos de tests unitarios (unos 512 casos), todos con Supabase mockeado. Faltan:
1. **Tests de Server Actions**: son la única barrera de autorización y no tienen ningún test. No hay forma de detectar automáticamente brechas como 004, 006 y 008.
2. **Tests de middleware y `/auth/callback`**.
3. **Tests de RLS y SQL**: policies, funciones y triggers (slots, liberación, finalización, cooldown) no se prueban. Habrían detectado 001, 002, 005 y 011.
4. **Tests de integración**: `package.json` define `test:integration → tests/integracion`, pero la carpeta **no existe**. `tests/documentacion_testing.md` y `tests/helpers.ts` (citado allí) describen una suite que ya no está en el repo.
5. **Tests que validan un comportamiento inexistente**: `auth.service.test.ts` y `users.service.test.ts` usan `aprobado` contra mocks y pasan, aunque la columna no existe (brecha 003).
6. Services sin tests: `EmailService`, `AuditoriaService`, `SucursalesService`.
7. `documentacion_testing.md` (2026-09-07) reporta fallos SLOT-08 y E2E-03 que el código y los triggers actuales parecen haber corregido (`fn_finalizar_solicitud_vehiculos`, `renumerarColaSucursal`). Está desactualizada.
8. `vitest.config.mts` excluye `src/lib/supabase/**` y `route.ts` de la cobertura.

## Evidencia
- `tests/unitarios/*` (20 archivos), `tests/mocks/*`.
- `package.json` script `test:integration`.
- `tests/documentacion_testing.md` secciones 1-3.

## Impacto
Las regresiones de seguridad y de esquema llegan a producción sin detectarse. La regla de `AGENTS.md` ("toda función con su test") se cumple formalmente, pero los mocks ocultan los problemas reales.

## Cómo reproducirlo
`npm run test:integration` → sin archivos (No ejecutado; deducido de la estructura).

## Causa raíz
Estrategia de testing centrada en unitarios con mocks, sin entorno de BD reproducible (brecha 015).

## Solución propuesta
1. **Tests de actions** (unitarios): mockear `AuthService.getCurrentUserProfile` y los services; matriz rol × alcance por action. Añadir un test de inventario que falle si una action exportada no invoca un guard.
2. **Tests de RLS** con Supabase local (`supabase start`) + `supabase test db` (pgTAP) o Vitest con clientes autenticados por rol: un test por policy crítica (001, 005) y por trigger (011).
3. Restaurar `tests/integracion/` contra Supabase local, nunca contra producción.
4. Generar tipos de BD (brecha 015) para que el typecheck detecte columnas inexistentes.
5. Actualizar `documentacion_testing.md`.
6. CI (GitHub Actions u otro): lint + typecheck + unit + integración + RLS en cada PR.

## Riesgos de la solución
- Tiempo de CI mayor; Supabase local requiere Docker.

## Tests necesarios
Esta brecha es en sí la definición de los tests faltantes. Mínimo:
- Actions: crear, aprobar, cancelar, documentos, observaciones y auditoría por rol.
- RLS: `usuario` UPDATE propio, `solicitud` UPDATE de ejecutivo, `solicitud_vehiculo` INSERT de logística.
- Triggers: slots tras cada transición.

## Plan de implementación
1. Tests de actions (sin infraestructura nueva).
2. Supabase local + baseline (depende de la brecha 015).
3. Tests RLS y triggers.
4. CI.

## Criterios de aceptación
- Cada brecha corregida tiene al menos un test que falla antes y pasa después.
- `npm run test:integration` ejecuta tests reales.

## Solución aplicada (2026-10-07)

**Rama:** `fix/brechas-auditoria-2026-10-07`

### Cambios
- **Aislamiento de producción:** `tests/setup-env.ts` ya no carga `.env.local`, que tiene la service_role de producción. Usa valores ficticios apuntando a un host inexistente, así que un test que olvide un mock no puede tocar datos reales (también cierra el punto 6 de la brecha 026).
- **Tests nuevos (16 archivos, 147 casos; la suite pasa de 521 a 699 tests):**
  - Server Actions: `solicitudes.actions.test.ts` (alcance y contacto) y `actions-inventario.test.ts`, que falla si una action exportada no llama a un guard.
  - Guards: `guards.test.ts`, `acceso.test.ts` (middleware), `contacto.test.ts`.
  - Services: `sucursales.service.test.ts` (no tenía tests), `email.service.test.ts` (no tenía tests), `solicitudes.brechas.test.ts`.
  - Utilidades: `errores`, `archivos`, `busqueda`, `html`, `env`, `redireccion`, `admin-principal`, `security-headers`.
- Se corrigieron los tests que validaban comportamiento inexistente (`aprobado` en metadatos, errores crudos de BD).
- Resultado: **36 archivos y 699 tests en verde**, `tsc --noEmit` sin errores, ESLint sin errores (6 advertencias ya existentes) y `next build` correcto.

### Pendiente
- Tests de RLS, triggers e integración con Supabase local (`supabase start` + pgTAP o Vitest con JWT por rol). Requieren Docker y la migración base (brecha 015).
- `package.json` define `test:integration` sobre `tests/integracion`, que no existe.
- Actualizar `tests/documentacion_testing.md`.
- CI (lint + typecheck + unit) en cada PR.
