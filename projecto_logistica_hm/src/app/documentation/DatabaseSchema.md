# DATABASE SCHEMA — Espejo del esquema de Supabase

> Este documento es el **espejo oficial del esquema de la base de datos de Supabase**.
>
> Debe mantenerse en correspondencia **1:1** con las tablas que existen realmente en Supabase.
>
> Cada tabla se documenta **como si estuviéramos creando el esquema**, es decir, mediante sentencias `CREATE TABLE` (DDL), **no** mediante consultas `SELECT` ni descripciones sueltas.

---

# 1. Regla fundamental: correspondencia 1:1

El esquema documentado aquí y el esquema real de Supabase deben ser **idénticos**:

```text
SUPABASE (real)  ←────── 1:1 ──────►  DATABASE_SCHEMA.md (documentado)
```

Esto significa:

* Toda tabla que exista en Supabase debe estar documentada en este archivo.
* Ninguna tabla documentada aquí debe dejar de existir en Supabase.
* Los nombres de tablas, columnas, tipos, restricciones, llaves foráneas e índices deben coincidir exactamente.
* Si el esquema cambia en Supabase, este documento debe actualizarse en la misma tarea.
* Si se crea una tabla nueva desde el código o una migración, primero se define/aplica en Supabase y luego se vuelca aquí.

No está permitido que la base de datos real y este documento diverjan. Cualquier diferencia detectada durante una auditoría debe registrarse y corregirse de inmediato.

---

# 2. Convención de documentación: DDL, no consultas

Cada tabla se documenta **en estilo DDL**, como si el esquema estuviera siendo creado desde cero:

```sql
CREATE TABLE nombre_tabla (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    columna     text NOT NULL,
    ...
);
```

Reglas de formato:

* Una sentencia `CREATE TABLE` por cada tabla existente.
* Incluir tipos de dato exactos, `NOT NULL`, valores por defecto, `PRIMARY KEY`, `UNIQUE`, `REFERENCES` y `ON DELETE`/`ON UPDATE` tal como están en Supabase.
* Documentar índices, secuencias, enums, triggers y políticas RLS asociados a cada tabla, en secciones propias debajo del `CREATE TABLE`.
* **Prohibido** documentar tablas mediante `SELECT`, capturas de pantalla del dashboard o descripciones informales. Las consultas solo se usan como herramienta para *extraer* el esquema (ver sección 4), nunca como formato de documentación.
* El orden recomendado de documentación sigue las entidades principales: usuarios, sucursales, vehículos, solicitudes, logística e historial.

---

# 3. Estructura de este documento

Por cada tabla debe existir una sección con este formato:

```text
## 3.X Tabla: <nombre_tabla>

Propósito breve de la tabla.

### CREATE TABLE

(sentencia DDL completa)

### Índices

(CREATE INDEX cuando existan)

### Row Level Security

(Políticas RLS si aplica; indicar explícitamente si no tiene RLS)

### Relaciones

(FKs entrantes y salientes)
```

---

# 4. Cómo obtener el esquema real desde Supabase

Para volcar o verificar el esquema 1:1, obtener el DDL real desde Supabase mediante cualquiera de estos medios:

* **Dashboard:** `Database` → `Tables` → definición de cada tabla.
* **SQL Editor** con una consulta sobre el catálogo (solo para extraer información):

```sql
select table_name, column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
order by table_name, ordinal_position;
```

* Restricciones y llaves foráneas:

```sql
select conrelid::regclass as tabla, conname, pg_get_constraintdef(oid)
from pg_constraint
where connamespace = 'public'::regnamespace;
```

El resultado obtenido se traduce a `CREATE TABLE` en este documento. Nunca se pega el resultado crudo como documentación.

---

# 5. Tablas del esquema

> **Estado actual:** pendiente del primer volcado desde Supabase (tarea registrada en `IMPLEMENTATION_PLAN.md`, Fase 0).
>
> Las secciones siguientes corresponden a las entidades conocidas del sistema (`BRAIN.md`, sección 15). Cada sección debe completarse con el DDL real de Supabase y eliminarse si la tabla no existe realmente.

## 5.1 Tabla: Usuario / perfiles

**Estado:** `DEFINIDO_1_1`

### CREATE TABLE

```sql
CREATE TABLE public.usuario (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL UNIQUE,
    nombre TEXT NOT NULL,
    apellido TEXT NOT NULL,
    rol TEXT NOT NULL CHECK (rol IN ('administrador', 'ejecutivo', 'jefe_local', 'logistica')),
    activo BOOLEAN NOT NULL DEFAULT true,
    requiere_cambio_clave BOOLEAN NOT NULL DEFAULT false,
    intentos_fallidos INTEGER NOT NULL DEFAULT 0,
    bloqueado_hasta TIMESTAMPTZ,
    sucursal_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);
```

### Índices

```sql
CREATE INDEX idx_usuario_email ON public.usuario(email);
CREATE INDEX idx_usuario_rol ON public.usuario(rol);
CREATE INDEX idx_usuario_activo ON public.usuario(activo);
```

### Triggers

```sql
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_usuario_updated_at
    BEFORE UPDATE ON public.usuario
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();
```

### Row Level Security (RLS)

```sql
ALTER TABLE public.usuario ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuarios pueden ver su propio perfil"
    ON public.usuario
    FOR SELECT
    USING (auth.uid() = id);

CREATE POLICY "Administradores pueden ver todos los usuarios"
    ON public.usuario
    FOR SELECT
    USING (public.es_administrador());

CREATE POLICY "Administradores pueden insertar usuarios"
    ON public.usuario
    FOR INSERT
    WITH CHECK (public.es_administrador() OR auth.uid() = id);

CREATE POLICY "Administradores pueden actualizar usuarios"
    ON public.usuario
    FOR UPDATE
    USING (public.es_administrador() OR auth.uid() = id);

CREATE POLICY "Administradores pueden eliminar usuarios"
    ON public.usuario
    FOR DELETE
    USING (public.es_administrador());
```

### Relaciones

* `id` -> `auth.users(id)` (FK 1:1, `ON DELETE CASCADE`)
* `sucursal_id` -> `public.sucursal(id)` (FK opcional, N:1)

---

## 5.2 Tabla: Sucursal

**Estado:** `PENDIENTE_VOLCADO`

### CREATE TABLE

```sql
-- PENDIENTE: reemplazar por el DDL real de Supabase
CREATE TABLE sucursal (
    -- columnas reales según Supabase
);
```

### Notas

* Verificar capacidad de estacionamiento y relación con vehículos y usuarios.

---

## 5.3 Tabla: Vehículo

**Estado:** `PENDIENTE_VOLCADO`

### CREATE TABLE

```sql
-- PENDIENTE: reemplazar por el DDL real de Supabase
CREATE TABLE vehiculo (
    -- columnas reales según Supabase
);
```

### Notas

* Verificar FK a sucursal y campos de auditoría (quién incorporó, cuándo).

---

## 5.4 Tabla: Solicitud

**Estado:** `PENDIENTE_VOLCADO`

### CREATE TABLE

```sql
-- PENDIENTE: reemplazar por el DDL real de Supabase
CREATE TABLE solicitud (
    -- columnas reales según Supabase
);
```

### Notas

* Verificar estados del flujo (`CREADA` → ... → `FINALIZADA`) y cómo se representan (enum, text + check, tabla catálogo).
* Verificar FKs a vehículo, sucursal origen/destino y usuarios responsables.

---

## 5.5 Tablas de logística / calendarización

**Estado:** `PENDIENTE_VERIFICACION`

Confirmar en Supabase si la logística vive en la misma tabla `solicitud` o en tablas separadas. Documentar según lo que exista realmente, no según lo deseado.

---

## 5.6 Tablas de historial / trazabilidad

**Estado:** `PENDIENTE_VERIFICACION`

Confirmar en Supabase qué tablas de historial existen y documentarlas con su DDL real.

---

# 6. Mantenimiento de este documento

Este documento se actualiza cuando:

1. Se crea, modifica o elimina una tabla en Supabase.
2. Se agregan o cambian columnas, índices, constraints, triggers o políticas RLS.
3. Una auditoría detecta divergencia entre Supabase y esta documentación.

En cada actualización debe quedar claro qué tabla cambió, para mantener la trazabilidad exigida en `BRAIN.md` (sección 16.4).

---

# 7. Regla para IA / OpenCode

Antes de trabajar con la capa de repositorios o datos, la IA debe:

1. Leer este documento y compararlo con el esquema real de Supabase cuando tenga acceso.
2. Nunca inventar tablas ni columnas: si algo no está documentado ni verificado, marcarlo como pendiente de volcado.
3. Al proponer cambios de esquema, escribirlos siempre como DDL (`CREATE TABLE`, `ALTER TABLE`) aplicable a Supabase.
4. Tras aplicar cualquier cambio de esquema en Supabase, actualizar este documento en la misma tarea y reflejarlo en `PROJECT_STATUS.md`.
