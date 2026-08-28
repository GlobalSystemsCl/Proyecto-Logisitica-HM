---
name: requisitos-modulos
description: Mantiene `src/app/documentation/RequisitosModulos.md` como el documento único de requisitos específicos del sistema: qué hace y cómo funciona cada módulo, sus conexiones, su historial de cambios y los flujos de interacción entre módulos. Use cuando se cree, modifique o elimine un módulo, requisito o funcionalidad, cuando cambie el comportamiento o flujo de un módulo, cuando se pida documentar/actualizar requisitos del sistema, o cuando se agregue un módulo/requisito nuevo.
---

# Requisitos de módulos

Mantener `src/app/documentation/RequisitosModulos.md` siempre al día y 1:1 con la realidad del código. Es el documento de requisitos específicos por módulo: qué hace, cómo funciona, a qué pertenece, con qué se conecta, su historial de cambios y el flujo global de interacción entre módulos.

## Disparadores

Usar esta skill siempre que:

- Se cree, modifique, elimine o marque como pendiente un **módulo** o una **funcionalidad**.
- Cambie el **comportamiento**, **flujo** o **regla de negocio** de un módulo existente.
- Se agregue un **requisito nuevo** o se cambie uno existente.
- Se pida "documentar requisitos", "actualizar requisitos", "contexto del sistema", "qué hace X módulo", o editar `RequisitosModulos.md`.
- Antes de cerrar una tarea grande de desarrollo: verificar que `RequisitosModulos.md` refleja lo implementado.

## Qué significa "mantener al día"

El documento debe reflejar:

1. **Qué hace** cada módulo (descripción funcional).
2. **Cómo funciona** (flujo interno, reglas, validaciones, roles que intervienen).
3. **A qué pertenece y con qué se conecta** (relaciones entre módulos, tablas de BD, servicios, acciones, UI).
4. **Historial de cambios** por módulo y el **registro global de cambios** (qué se cambió, cuándo —fecha ISO `YYYY-MM-DD`— y por qué).
5. **Flujo del sistema**: cómo interactúan los módulos entre sí.
6. **Estado real** de cada módulo: `implementado`, `parcial`, `pendiente` o `deshabilitado`.

## Procedimiento

1. **Detectar el cambio real**: leer el código, las migraciones, la BD y la UI que se modificaron (no documentar intenciones).
2. **Actualizar el módulo correspondiente** sin romper el resto:
   - Cambia el comportamiento → actualizar "Qué hace / cómo funciona" y los requisitos afectados.
   - Requisito nuevo → agregar con ID `R-<MODULO>.<n>` (ej. `SOL-CRE.4`) siguiendo numeración continua; si se elimina o reemplaza uno, NO reutilizar IDs.
   - Cambia una conexión → actualizar "Con qué se conecta" en el módulo y en los módulos relacionados.
   - Cada cambio se anota en el **historial del módulo** y en el **registro global** con fecha y motivo.
3. **Módulo nuevo**: crear su sección con la plantilla del documento (qué hace, cómo funciona, requisitos con IDs, conexiones, dependencias, estado, historial) y agregarlo al índice, a la visión global de interacción y al registro global.
4. **Módulo retirado/deshabilitado**: marcarlo como `deshabilitado`/`pendiente` y registrar el cambio; NO borrar su historial.
5. **Verificar coherencia** con `BRAIN.md`, `ProjectStatus.md` y `esquema-completo-sql.sql` (usar la skill `sincronizar-esquema-sql` si hubo cambios de esquema).

## Reglas fijas

- El documento es un **espejo de la realidad**: el código, la BD y la UI mandan; el documento se corrige para reflejarlos, nunca al revés.
- Todo cambio funcional relevante se registra en la misma tarea en que se implementa.
- Las fechas usan formato `YYYY-MM-DD`. El historial se ordena de más reciente a más antiguo.
- No borrar requisitos del historial: la historia es parte del contexto.
- Si el cambio toca esquema de BD, además de este documento actualizar `esquema-completo-sql.sql` y `DatabaseSchema.md` (skill `sincronizar-esquema-sql`).
- Al terminar, `npx tsc --noEmit` y `npm run lint` si se tocó TypeScript.