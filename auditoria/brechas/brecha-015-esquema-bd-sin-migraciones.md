# Brecha 015 — Esquema de base de datos sin migraciones versionadas

## Estado
Parcial: 17 migraciones versionadas en `supabase/migrations/`, todas aplicadas en producción y **registradas en el historial de Supabase** (2026-10-14). Falta la migración base del esquema (ver "Avance 2026-10-14")

## Severidad
Medium

## Categoría
Architecture / Database

## Descripción
La carpeta `supabase/` del proyecto está vacía. Tablas, enums, policies RLS, funciones y triggers existen solo en la base de producción. El código hace referencia a migraciones que no están en el repositorio (por ejemplo, `migración 20260928_triggers_fechas.sql` en un comentario de `solicitudes.service.ts`). No hay una forma reproducible de crear un entorno de pruebas ni de saber qué cambió y cuándo.

## Evidencia
- `device_list_dir` de `supabase/` → vacío.
- `src/services/solicitudes.service.ts` líneas ~18-21 (comentario sobre la migración).
- Brecha 003: el código usa una columna que nunca se creó, síntoma directo de esta falta.
- `list_migrations` de Supabase: No determinado (no consultado). Las migraciones aplicadas desde el SQL editor no quedan registradas.

## Impacto
Desalineación código-BD (ya ocurrió), imposibilidad de testear contra una BD equivalente, cambios en producción sin revisión ni rollback, y riesgo alto al aplicar las correcciones de esta auditoría.

## Cómo reproducirlo
No aplica.

## Causa raíz
Cambios de esquema hechos directamente en el dashboard o SQL editor de Supabase.

## Solución propuesta
1. Instalar Supabase CLI y ejecutar `supabase link` y `supabase db pull` para generar una **migración base** (`supabase/migrations/<ts>_baseline.sql`) que refleje el esquema actual de producción, incluidos policies, funciones, triggers, grants y el bucket.
2. Commitear la base y, desde ese momento, hacer todo cambio como migración (`supabase migration new`).
3. `supabase/seed.sql` con datos de prueba no sensibles.
4. Generar los tipos TypeScript (`supabase gen types`) para que el compilador detecte columnas inexistentes como `aprobado`.
5. En CI: levantar `supabase start` local, aplicar las migraciones y correr tests de integración y RLS (brecha 017).

## Riesgos de la solución
- `db pull` requiere credenciales de BD y Docker para la shadow DB. No modifica producción.

## Tests necesarios
- CI aplica las migraciones desde cero sin errores.
- `npm run typecheck` con los tipos generados.

## Plan de implementación
1. Baseline con `db pull` (solo lectura sobre producción).
2. Tipos generados y reemplazo progresivo de los `as unknown as` en services.
3. Integrar en CI.

## Criterios de aceptación
- El esquema completo se puede recrear desde el repositorio.
- Cada corrección de esta auditoría queda como una migración con nombre y fecha.

## Solución aplicada (2026-10-07)

**Rama:** `fix/brechas-auditoria-2026-10-07`

### Cambios
- Se creó `projecto_logistica_hm/supabase/` con:
  - `migrations/`: 7 migraciones con fecha, una por grupo de brechas;
  - `rollback/`: reversión de cada una;
  - `scripts/00_respaldo_antes_de_migrar.sql`: exporta policies, funciones, triggers, grants y FKs actuales;
  - `README.md`: orden de aplicación y procedimiento.

### Pendiente (responsable)
1. `supabase link` + `supabase db pull` para generar la migración base del esquema completo (requiere la contraseña de la BD y Docker).
2. `supabase gen types typescript` para que el typecheck detecte columnas inexistentes.
3. CI con Supabase local que aplique las migraciones desde cero (brecha 017).

## Avance 2026-10-13

### Estado verificado en producción
Las 15 migraciones de `projecto_logistica_hm/supabase/migrations/` están aplicadas (verificado con consultas de catálogo el 2026-10-13):

| # | Migraciones | Cómo se aplicaron |
|---|---|---|
| 1–7 | Auditoría (`2026100712xxxx`) | SQL Editor (fecha exacta No determinada) |
| 8–10 | Requisitos (`20261009…`) | SQL Editor (fecha exacta No determinada) |
| 11 | `20261013120000_fix_cancelar_traslado_slots_ocupados` | Conector de Supabase (`apply_migration`) |
| 12 | `20261013130000_brecha_011_recalculo_slots_unificado` | Conector de Supabase (`apply_migration`) |
| 13–15 | Brecha 011 (`20261013140000`, `…150000`, `…160000`) | SQL Editor |

Se eliminaron `projecto_logistica_hm/migraciones/` y `migraciones.rar`, copias exactas de las 7 primeras: `supabase/` es la única ubicación.

### Desalineación del historial
`supabase_migrations.schema_migrations` solo registra las 2 aplicadas con el conector y con versiones distintas a las del repo (`20261013144915` y `20261013152109` en lugar de `20261013120000` y `20261013130000`). Las aplicadas desde el SQL Editor no quedan registradas. Si se usa `supabase db push`, intentaría aplicar de nuevo las del repo. Todas son idempotentes (`create or replace`, `drop … if exists`, `add column if not exists`), así que no romperían nada, pero el historial debe alinearse.

### Pendiente
1. Migración base con `supabase db pull`.
2. Alinear `schema_migrations` con los archivos del repo (`supabase migration repair --status applied <versión>` por cada archivo ya aplicado).
3. Desde ahí, aplicar todo cambio con la CLI o con el conector para que quede registrado.

## Avance 2026-10-14

### Historial alineado
Se ejecutó `projecto_logistica_hm/supabase/scripts/01_alinear_historial_migraciones.sql` en el SQL Editor. `supabase_migrations.schema_migrations` tiene ahora **17 filas** (de `20261007120000` a `20261013170000`), con la misma versión y nombre que los archivos del repo. Se borraron los 2 registros del conector con versiones distintas (`20261013144915` y `20261013152109`). Con esto, `supabase db push` ya no intentaría repetir migraciones aplicadas.

Un test (`tests/unitarios/script-historial-migraciones.test.ts`) falla si se agrega una migración sin registrarla en el script.

### Versión duplicada corregida
La migración de asignación de sucursales y zonas por rol se creó con la versión `20261013150000`, la misma de `brecha_011_trigger_vehiculos`. Supabase exige versiones únicas, así que se renombró a `20261013155000` sin cambiar el contenido. Ya estaba aplicada.

### Pendiente
1. Migración base con `supabase db pull` (requiere la contraseña de la BD y Docker).
2. Desde ahora, aplicar cada cambio con la CLI (`supabase db push`) para que quede registrado; si se aplica desde el SQL Editor, agregarlo al script de historial en la misma tarea.
