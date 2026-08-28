---
name: sincronizar-esquema-sql
description: Mantiene `esquema-completo-sql.sql` (raíz del repo) como espejo 1:1 del esquema VIVO de Supabase. Use cuando se aplique cualquier cambio de esquema en la base de datos (migraciones nuevas en `supabase/migrations/`, sentencias DDL ejecutadas en el SQL Editor de Supabase, CREATE/ALTER/DROP de tablas, tipos, funciones, triggers, políticas RLS, comentarios, enums) o cuando se pida actualizar/sincronizar/regenerar `esquema-completo-sql.sql`, el esquema, el dump/schema de la base de datos o `DatabaseSchema.md`. No usar para cambios solo de código/UI sin impacto en el esquema.
---

# Sincronizar esquema SQL 1:1

El archivo `esquema-completo-sql.sql` en la raíz del repo es el **espejo del esquema VIVO** de Supabase (proyecto `yaqbccvlenouqmtqrlrq`, `db.yaqbccvlenouqmtqrlrq.supabase.co`). Debe reflejar EXACTAMENTE lo que hay en el servidor: nombres reales de constraints/índices/funciones/triggers, políticas RLS, enums, defaults y comentarios.

## Disparadores

Usar esta skill siempre que:

- Se cree/aplique una migración en `supabase/migrations/` (especialmente si se ejecuta en el SQL Editor de Supabase).
- Se ejecute cualquier DDL sobre la base (tablas, columnas, enums, funciones, triggers, políticas, comentarios, extensiones).
- Se pida "actualizar el esquema", "sync", "regenerar", "esquema 1:1", `esquema-completo-sql.sql`, `DatabaseSchema.md`/`DATABASE_SCHEMA.md`.
- Al auditar o retomar el proyecto: validar que el archivo siga coincidiendo con el esquema real.

## Orden del archivo (respetar siempre)

El dump está organizado por secciones con headers `-- ====...====` y `-- N.`:

1. Tipos ENUM (`CREATE TYPE ... AS ENUM`).
2. Tablas (`CREATE TABLE` con columnas, tipos, nullabilidad, defaults e identidad; sin restricciones inline).
3. Restricciones (nombres exactos PK/UNIQUE/FK vía `pg_get_constraintdef`).
4. Índices adicionales (los que no genera la PK/UNIQUE).
5. Funciones (definiciones exactas `pg_get_functiondef`).
6. Triggers activos en el servidor (`pg_get_triggerdef`).
7. Row Level Security (enable + políticas `pg_policies`).
8. Comentarios de columnas.

No reordenar ni fusionar secciones. Los objetos se agregan/eliminan donde corresponde.

## Procedimiento

1. **Detectar el cambio aplicado**: leer las migraciones nuevas y/o el DDL ejecutado en Supabase desde la última extracción (fecha en el header del archivo).
2. **Extraer el esquema REAL desde el servidor** (no inventar). Usar la Management API de Supabase
   (`POST v1/projects/yaqbccvlenouqmtqrlrq/database/query`) con SQL sobre catálogos del sistema, o el SQL Editor con rol owner/service. Queries canónicas:
   - Enums: `pg_type` + `pg_enum`.
   - Columnas/defaults/identidad: `information_schema.columns`, default con `pg_get_expr(adbin, adrelid)`.
   - Constraints: `pg_constraint` + `pg_get_constraintdef(c.oid)`.
   - Índices: `pg_index` + `pg_get_indexdef(i.indexrelid)`.
   - Funciones: `pg_proc` + `pg_get_functiondef(p.oid)` (orden `pg_depend`/nombre).
   - Triggers: `pg_trigger` + `pg_get_triggerdef(t.oid)`.
   - RLS: `pg_class.relrowsecurity` + `pg_policies`.
   - Comentarios: `obj_description` / `col_description`.
3. **Comparar y actualizar** `esquema-completo-sql.sql`: aplicar el diff exacto (agregar/eliminar/modificar objetos). Conservar los comentarios técnicos del header (método, proyecto, base) salvo actualizar **Fecha de extracción**.
4. **Actualizar también `src/app/documentation/DatabaseSchema.md`** (regla 1:1 de BRAIN) si el cambio afecta lo que ese documento refleja (enums, estados, tablas).
5. **Verificar**: contrastar el resultado con el servidor — número de tablas/constraints/índices/funciones/triggers/políticas y definiciones que difieran (dif vacío o solo orden). Si no hay forma de consultar la BD, pedir al usuario que ejecute la extracción en el SQL Editor y pegar la salida; nunca escribir definiciones adivinadas.

## Reglas fijas

- El archivo es SOLO un espejo de solo lectura: corregir el archivo para que coincida con la BD, nunca al revés.
- Conservar los nombres EXACTOS del servidor (constraints, índices) aunque el estilo DDL "teórico" diría otra cosa.
- Ninguna operación destructiva contra la BD: solo lectura/extracción.
- `DatabaseSchema.md` usa estilo DDL `CREATE TABLE` completo; si un cambio de esquema no está reflejado ahí, actualizarlo en la misma tarea.
- Al terminar, correr `npx tsc --noEmit` y `npm run lint` si tocaste TypeScript.