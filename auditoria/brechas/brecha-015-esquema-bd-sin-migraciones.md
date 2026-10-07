# Brecha 015 — Esquema de base de datos sin migraciones versionadas

## Estado
Pendiente

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
