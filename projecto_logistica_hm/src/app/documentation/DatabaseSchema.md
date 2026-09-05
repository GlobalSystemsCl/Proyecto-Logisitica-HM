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
## 5.X Tabla: <nombre_tabla>

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

Para volcar o verificar el esquema 1:1, usar:

* **Script automatizado (fuente preferida):** ejecutar `src/app/documentation/volcado_catalogo_tabla.sql` en el SQL Editor de Supabase. Guarda el catálogo completo (enums, columnas, constraints, índices, RLS, políticas, triggers y funciones) en la tabla temporal `public.catalogo_auditoria`, que OpenCode lee vía API. Evita copiar resultados manualmente.
* Alternativa clásica: `src/app/documentation/auditoria_esquema_supabase.sql` (misma información, salida en pantalla).

El resultado obtenido se traduce a `CREATE TABLE` en este documento. Nunca se pega el resultado crudo como documentación.

---

# 5. Tablas del esquema

> **Estado: `COMPLETADO` — volcado 1:1 cerrado el 2026-08-22** contra el catálogo real de PostgreSQL (vía tabla temporal `catalogo_auditoria`): tablas, columnas, tipos, largos, nullability, defaults, identity, constraints con acciones exactas, índices, RLS, políticas y triggers verificados al 100%.
>
> **Actualizaciones posteriores al volcado (2026-08-26)**: enum `estado_solicitud` ampliado (nuevos estados), `solicitud.ejecutivo_id` nullable, columnas `sucursal_destino`/`direccion_evento`/`titulo_evento`, trigger `tr_validate_solicitud_tipo`, y deshabilitación de triggers de notificación y auditoría (migraciones `20260826_solicitudes_v2*.sql`, `20260826_deshabilitar_notificaciones.sql`, `20260826_deshabilitar_auditoria_service_role.sql`).

## 5.0 Tipos ENUM

```sql
CREATE TYPE public.rol_usuario AS ENUM ('ejecutivo', 'jefe_local', 'logistica', 'administrador');

CREATE TYPE public.estado_solicitud AS ENUM (
    'pendiente',
    'pendiente_aprobacion',
    'aprobada',
    'rechazada',
    'priorizada',
    'asignada',
    'calendarizada',
    'en_transito',
    'entregada',
    'cancelada',
    'finalizada'
);

CREATE TYPE public.tipo_solicitud AS ENUM ('evento', 'venta');

CREATE TYPE public.disponibilidad AS ENUM ('reservado', 'liberado');

CREATE TYPE public.tipo_notificacion AS ENUM (
    'NUEVA_SOLICITUD',
    'SOLICITUD_PRIORIZADA',
    'SOLICITUD_ASIGNADA',
    'SOLICITUD_CALENDARIZADA',
    'SOLICITUD_EN_TRANSITO',
    'SOLICITUD_ENTREGADA',
    'SOLICITUD_FINALIZADA',
    'SOLICITUD_CANCELADA',
    'VEHICULO_RESERVADO',
    'VEHICULO_LIBERADO',
    'NUEVA_OBSERVACION'
);
```

Notas:

* `disponibilidad`: indica si un vehículo que ya tuvo una solicitud puede volver a estar disponible para otra (`reservado` = no, `liberado` = sí).
* `pendiente_aprobacion`, `aprobada` y `rechazada` se agregaron el 2026-08-26 (migración `20260826_solicitudes_v2.sql`) para el flujo ejecutivo → jefe_local → logística. `rechazada` representa la aprobación denegada; `cancelada` + `motivo_cancelacion` es la cancelación posterior.

---

## 5.1 Tabla: usuario

Perfiles internos del sistema, vinculados 1:1 con cuentas de autenticación de Supabase.

### CREATE TABLE

```sql
CREATE TABLE public.usuario (
    id                    UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    nombre                VARCHAR(100) NOT NULL,
    apellido              VARCHAR(100) NOT NULL,
    email                 VARCHAR(255) NOT NULL UNIQUE,
    rol                   public.rol_usuario NOT NULL,
    activo                BOOLEAN DEFAULT true,
    requiere_cambio_clave BOOLEAN DEFAULT false,
    intentos_fallidos     INTEGER DEFAULT 0,
    bloqueado_hasta       TIMESTAMPTZ,
    sucursal_id           BIGINT REFERENCES public.sucursal(id),
    telefono              VARCHAR(30),
    created_at            TIMESTAMP(6) WITHOUT TIME ZONE DEFAULT now(),
    updated_at            TIMESTAMP(6) WITHOUT TIME ZONE DEFAULT now()
);
```

Nota: `sucursal_id` era UUID y **sin** FK; se corrigió el 2026-08-22 a BIGINT + FK (`usuario_sucursal_fkey`) vía migración `20260822_politicas_rls.sql` (todos los valores eran NULL, no hubo pérdida de datos).

Nota: la columna `telefono` se agregó el 2026-09-05 vía migración `20260905_perfil_usuario_telefono.sql` para el módulo de Perfil de Usuario.

### Índices

```sql
CREATE UNIQUE INDEX usuario_pkey ON public.usuario USING btree (id);
CREATE UNIQUE INDEX usuario_email_key ON public.usuario USING btree (email);
CREATE INDEX idx_usuario_email ON public.usuario USING btree (email);
CREATE INDEX idx_usuario_rol ON public.usuario USING btree (rol);
CREATE INDEX idx_usuario_activo ON public.usuario USING btree (activo);
```

### Triggers

```sql
-- Mantiene updated_at en UTC
CREATE TRIGGER tr_usuario_updated_at
    BEFORE UPDATE ON public.usuario
    FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

-- Sincroniza creación de perfiles desde auth.users
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_new_auth_user();
```

### Row Level Security

RLS habilitado. Políticas vigentes (verificadas):

```sql
CREATE POLICY "Usuarios pueden ver su propio perfil"
    ON public.usuario FOR SELECT
    USING ((auth.uid() = id));

CREATE POLICY "Administradores pueden ver todos los usuarios"
    ON public.usuario FOR SELECT
    USING (es_administrador());

CREATE POLICY "Administradores pueden insertar usuarios"
    ON public.usuario FOR INSERT
    WITH CHECK ((es_administrador() OR (auth.uid() = id)));

CREATE POLICY "Administradores pueden actualizar usuarios"
    ON public.usuario FOR UPDATE
    USING ((es_administrador() OR (auth.uid() = id)));

CREATE POLICY "Administradores pueden eliminar usuarios"
    ON public.usuario FOR DELETE
    USING (es_administrador());
```

### Relaciones

* `id` → `auth.users(id)` (1:1, `ON DELETE CASCADE`) ✔ confirmada
* `sucursal_id` → `public.sucursal(id)` (FK agregada el 2026-08-22; antes solo referencia lógica)
* Reciben FK: `solicitud.ejecutivo_id/jefe_local_id/logistica_id`, `auditoria.usuario_id`, `observacion.usuario_id`, `notificacion.usuario_id/emisor_id`, `sucursal.usuario_id`.

---

## 5.2 Tabla: sucursal

Sucursales H.Motores con capacidad de estacionamiento (`slots`).

### CREATE TABLE

```sql
CREATE TABLE public.sucursal (
    id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    usuario_id     UUID REFERENCES public.usuario(id)
                       ON UPDATE CASCADE ON DELETE CASCADE,
    nombre         VARCHAR,
    direccion      VARCHAR,
    slots          BIGINT,
    slots_ocupados BIGINT DEFAULT 0     -- antes "slots ocupados"; renombrada el 2026-08-22
);
```

### Observaciones

* `ON DELETE CASCADE` en `usuario_id` implica que eliminar un usuario borra su sucursal asociada: validar si es la semántica deseada.
* El default anómalo `gen_random_uuid()` que tenía esta columna fue eliminado el 2026-08-22 (migración `20260822_cleanup_funcion_muerta_y_defaults.sql`).

### Índices

Solo el PK (`sucursal_pkey`, btree en `id`). No hay índices secundarios.

### Row Level Security

RLS habilitado (**FORCED=false**). Políticas creadas el 2026-08-22 (migración `20260822_politicas_rls.sql`, con helpers `usuario_activo()` / `tiene_rol()`):

```sql
-- Todos los usuarios activos ven el catálogo de sucursales
CREATE POLICY "sucursal_select_autenticados"
    ON public.sucursal FOR SELECT TO authenticated
    USING (public.usuario_activo());

-- Solo administrador crea / edita / elimina sucursales
CREATE POLICY "sucursal_admin_total"
    ON public.sucursal FOR ALL TO authenticated
    USING (public.tiene_rol('administrador'))
    WITH CHECK (public.tiene_rol('administrador'));
```

### Relaciones

* `usuario_id` → `public.usuario(id)` (`ON UPDATE CASCADE ON DELETE CASCADE`)
* Recibe FK: `solicitud.sucursal` (origen).

---

## 5.3 Tabla: vehiculo

Vehículos incorporados manualmente al sistema (MVP sin API externa).

### CREATE TABLE

```sql
CREATE TABLE public.vehiculo (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chasis     VARCHAR(17) NOT NULL UNIQUE,
    patente    VARCHAR(10) NOT NULL UNIQUE,
    marca      VARCHAR(100) NOT NULL,
    modelo     VARCHAR(100) NOT NULL,
    anio       INTEGER NOT NULL,
    color      VARCHAR(50),
    precio     NUMERIC(14,2),
    created_at TIMESTAMP(6) WITHOUT TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP(6) WITHOUT TIME ZONE DEFAULT now()
);
```

### Índices

```sql
CREATE UNIQUE INDEX vehiculo_pkey ON public.vehiculo USING btree (id);
CREATE UNIQUE INDEX vehiculo_chasis_key ON public.vehiculo USING btree (chasis);
CREATE UNIQUE INDEX vehiculo_patente_key ON public.vehiculo USING btree (patente);
```

### Row Level Security

RLS habilitado (**FORCED=false**). Políticas creadas el 2026-08-22 (migración `20260822_politicas_rls.sql`):

```sql
CREATE POLICY "vehiculo_select_autenticados"
    ON public.vehiculo FOR SELECT TO authenticated
    USING (public.usuario_activo());

-- Incorporación manual: admin / jefe_local / logistica (BRAIN §5.2)
CREATE POLICY "vehiculo_insert_gestores"
    ON public.vehiculo FOR INSERT TO authenticated
    WITH CHECK (public.tiene_rol('administrador', 'jefe_local', 'logistica'));

CREATE POLICY "vehiculo_update_gestores"
    ON public.vehiculo FOR UPDATE TO authenticated
    USING (public.tiene_rol('administrador', 'jefe_local', 'logistica'))
    WITH CHECK (public.tiene_rol('administrador', 'jefe_local', 'logistica'));

CREATE POLICY "vehiculo_delete_admin"
    ON public.vehiculo FOR DELETE TO authenticated
    USING (public.tiene_rol('administrador'));
```

### Observaciones / deuda detectada

* **No existe** FK a `sucursal` ni campo de auditoría del usuario que incorporó el vehículo (`creado_por`), pese a que `BRAIN.md` §14 exige registrar quién incorporó.

### Relaciones

* Recibe FK: `solicitud_vehiculo.vehiculo_id`.

---

## 5.4 Tabla: solicitud

Solicitudes de traslado de vehículos entre sucursales, con flujo de estados y responsables por rol.

### CREATE TABLE

```sql
CREATE TABLE public.solicitud (
    id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ejecutivo_id             UUID REFERENCES public.usuario(id),   -- nullable desde 2026-08-26 (jefe_local crea sin ejecutivo)
    jefe_local_id            UUID REFERENCES public.usuario(id),
    logistica_id             UUID REFERENCES public.usuario(id),
    estado                   public.estado_solicitud NOT NULL DEFAULT 'pendiente',
    fecha_creacion           TIMESTAMP(6) WITHOUT TIME ZONE DEFAULT now(),
    fecha_actualizacion      TIMESTAMP(6) WITHOUT TIME ZONE DEFAULT now(),
    tipo_solicitud           public.tipo_solicitud NOT NULL DEFAULT 'venta',  -- antes "tipo solicitud"; renombrada el 2026-08-22
    sucursal                 BIGINT REFERENCES public.sucursal(id)
                                 ON UPDATE CASCADE ON DELETE CASCADE,  -- sucursal origen
    sucursal_destino         BIGINT REFERENCES public.sucursal(id),     -- sucursal destino (tipo venta)
    direccion_evento         TEXT,                                      -- dirección del evento (tipo evento)
    titulo_evento            TEXT,                                      -- título del evento (tipo evento)
    fecha_tentativa_despacho TIMESTAMPTZ,   -- fecha tentativa programada del despacho
    fecha_despacho           TIMESTAMPTZ,   -- fecha real de salida del vehículo desde logística
    motivo_cancelacion       TEXT,
    posicion_prioridad       BIGINT UNIQUE, -- posición única en la cola de prioridad
    fecha_limite             TIMESTAMPTZ
);
```

Notas:

* Las FKs a `usuario` no declaran acción (`NO ACTION` implícito): borrar un usuario con solicitudes asociadas fallará.
* `ON DELETE CASCADE` en `sucursal`: borrar la sucursal origen elimina sus solicitudes.
* `ejecutivo_id` se hizo `NULLABLE` el 2026-08-26 (migración `20260826_solicitudes_v2.sql`): el jefe_local puede crear una solicitud sin asignar ejecutivo.
* `sucursal_destino`, `direccion_evento` y `titulo_evento` se agregaron el 2026-08-26 (vía migración parcial aplicada directamente en Supabase; el trigger `validate_solicitud_tipo` las valida según `tipo_solicitud`).
* `fecha_despacho` y `fecha_entrega` se agregaron en el esquema original y son usadas por los servicios de logística (`despacharSolicitud`, `recibirSolicitud`).

### Índices

```sql
CREATE UNIQUE INDEX solicitud_pkey ON public.solicitud USING btree (id);
CREATE UNIQUE INDEX solicitud_posicion_prioridad_key ON public.solicitud USING btree (posicion_prioridad);
```

### Triggers

```sql
-- Valida que tipo_solicitud traiga sus campos obligatorios
CREATE TRIGGER tr_validate_solicitud_tipo
    BEFORE INSERT OR UPDATE ON public.solicitud
    FOR EACH ROW EXECUTE FUNCTION validate_solicitud_tipo();

-- Audita cambios de estado (inserta en public.auditoria)
CREATE TRIGGER trigger_cambio_estado_auditoria
    AFTER UPDATE OF estado ON public.solicitud
    FOR EACH ROW EXECUTE FUNCTION cambio_estado_auditoria();

-- Libera vehículos reservados cuando la solicitud pasa a 'cancelada'
CREATE TRIGGER trigger_disponibilidad
    AFTER UPDATE OF estado ON public.solicitud
    FOR EACH ROW EXECUTE FUNCTION disponibilidad();

-- Notificaciones por creación y por cada transición de estado
CREATE TRIGGER trigger_notificacion_solicitud
    AFTER INSERT OR UPDATE OF estado ON public.solicitud
    FOR EACH ROW EXECUTE FUNCTION notificar_solicitud();
```

> **trigger_cambio_estado_auditoria DESHABILITADO el 2026-08-26** (migración `20260826_deshabilitar_auditoria_service_role.sql`): la app escribe con el cliente service-role (`createAdminClient`), donde `auth.uid()` es NULL, y la función violaba `auditoria.usuario_id NOT NULL`, abortando aprobaciones/rechazos/priorizaciones/cancelaciones. La auditoría de estados ahora la registra `SolicitudesService.registrarAuditoria` con el usuario autenticado real. La función `cambio_estado_auditoria()` se conserva.
>
> **DESHABILITADO el 2026-08-26** (migración `20260826_deshabilitar_notificaciones.sql`): el módulo de notificaciones no está contemplado y el trigger violaba `notificacion.usuario_id NOT NULL` cuando el jefe_local de la sucursal aún no está asignado. La función `notificar_solicitud()` se conserva; solo se eliminó el trigger (reversible).
```

### Row Level Security

RLS habilitado (**FORCED=false**). Políticas creadas el 2026-08-22 (migración `20260822_politicas_rls.sql`). RLS limita **quién** toca filas; las transiciones de estado válidas se validan en la capa de servicios:

```sql
-- Participantes (ejecutivo / jefe_local / logistica asignado), admin,
-- y jefe_local de la sucursal origen para pendientes/priorizadas
CREATE POLICY "solicitud_select_participantes"
    ON public.solicitud FOR SELECT TO authenticated
    USING (
        public.usuario_activo()
        AND (
            public.tiene_rol('administrador')
            OR ejecutivo_id  = auth.uid()
            OR jefe_local_id = auth.uid()
            OR logistica_id  = auth.uid()
            OR (
                public.tiene_rol('jefe_local')
                AND estado IN ('pendiente', 'priorizada')
                AND sucursal = (
                    SELECT u.sucursal_id FROM public.usuario u WHERE u.id = auth.uid()
                )
            )
        )
    );

-- El ejecutivo crea solicitudes a su propio nombre
CREATE POLICY "solicitud_insert_ejecutivo"
    ON public.solicitud FOR INSERT TO authenticated
    WITH CHECK (
        public.tiene_rol('administrador', 'ejecutivo')
        AND ejecutivo_id = auth.uid()
    );

CREATE POLICY "solicitud_update_participantes"
    ON public.solicitud FOR UPDATE TO authenticated
    USING (
        public.usuario_activo()
        AND (
            public.tiene_rol('administrador')
            OR ejecutivo_id  = auth.uid()
            OR jefe_local_id = auth.uid()
            OR logistica_id  = auth.uid()
            OR (
                public.tiene_rol('jefe_local')
                AND sucursal = (
                    SELECT u.sucursal_id FROM public.usuario u WHERE u.id = auth.uid()
                )
            )
        )
    )
    WITH CHECK (public.usuario_activo());

CREATE POLICY "solicitud_delete_admin"
    ON public.solicitud FOR DELETE TO authenticated
    USING (public.tiene_rol('administrador'));
```

Nota: el filtro del jefe_local requiere `usuario.sucursal_id` poblado (columna corregida a BIGINT + FK el 2026-08-22).

### Relaciones

* `ejecutivo_id`, `jefe_local_id`, `logistica_id` → `public.usuario(id)`
* `sucursal` → `public.sucursal(id)` (origen)
* Reciben FK: `observacion.solicitud_id`, `solicitud_vehiculo.solicitud_id`.

---

## 5.5 Tabla: solicitud_vehiculo

Tabla puente N:M entre solicitudes y vehículos, con el estado de reserva del vehículo respecto a la solicitud.

### CREATE TABLE

```sql
CREATE TABLE public.solicitud_vehiculo (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    solicitud_id   UUID NOT NULL REFERENCES public.solicitud(id) ON DELETE CASCADE,
    vehiculo_id    UUID NOT NULL REFERENCES public.vehiculo(id),   -- sin ON DELETE: NO ACTION implícito
    created_at     TIMESTAMP(6) WITHOUT TIME ZONE DEFAULT now(),
    disponibilidad public.disponibilidad NOT NULL DEFAULT 'reservado'
);
```

### Índices

```sql
CREATE UNIQUE INDEX solicitud_vehiculo_pkey ON public.solicitud_vehiculo USING btree (id);
CREATE UNIQUE INDEX solicitud_vehiculo_unique ON public.solicitud_vehiculo USING btree (solicitud_id, vehiculo_id);
```

### Triggers

```sql
-- Audita asignación y cambios de disponibilidad (inserta en public.auditoria)
CREATE TRIGGER trigger_auditoria_insert_disponibilidad
    AFTER INSERT ON public.solicitud_vehiculo
    FOR EACH ROW EXECUTE FUNCTION auditoria_disponibilidad();

CREATE TRIGGER trigger_auditoria_update_disponibilidad
    AFTER UPDATE OF disponibilidad ON public.solicitud_vehiculo
    FOR EACH ROW EXECUTE FUNCTION auditoria_disponibilidad();

-- Notifica al ejecutivo: vehículo reservado / liberado
CREATE TRIGGER trigger_notificacion_solicitud_vehiculo
    AFTER INSERT OR UPDATE OF disponibilidad ON public.solicitud_vehiculo
    FOR EACH ROW EXECUTE FUNCTION notificar_solicitud_vehiculo();
```

> **trigger_auditoria_insert_disponibilidad y trigger_auditoria_update_disponibilidad DESHABILITADOS el 2026-08-26** (migración `20260826_deshabilitar_auditoria_service_role.sql`): con el cliente service-role `auth.uid()` es NULL y la función violaba `auditoria.usuario_id NOT NULL`, abortando la reserva de vehículos al crear solicitudes (causa de "creada sin vehículos"). La asignación/liberación ahora se audita en la capa de servicios (`ASIGNACION_VEHICULO` / `CAMBIO_DISPONIBILIDAD_VEHICULO`). Las funciones se conservan.
>
> **DESHABILITADO el 2026-08-26** (migración `20260826_deshabilitar_notificaciones.sql`): violaba `notificacion.usuario_id NOT NULL` cuando la solicitud no tiene ejecutivo asignado (p. ej. creada por jefe_local). La función se conserva.
```

### Row Level Security

RLS habilitado (**FORCED=false**). Políticas creadas el 2026-08-22 (migración `20260822_politicas_rls.sql`):

```sql
-- Ven la fila los participantes de la solicitud o un administrador
CREATE POLICY "sv_select_participantes"
    ON public.solicitud_vehiculo FOR SELECT TO authenticated
    USING (
        public.usuario_activo()
        AND (
            public.tiene_rol('administrador')
            OR EXISTS (
                SELECT 1 FROM public.solicitud s
                WHERE s.id = solicitud_id
                  AND (s.ejecutivo_id  = auth.uid()
                       OR s.jefe_local_id = auth.uid()
                       OR s.logistica_id  = auth.uid())
            )
        )
    );

-- Las reservas las gestiona logística (o admin)
CREATE POLICY "sv_insert_logistica"
    ON public.solicitud_vehiculo FOR INSERT TO authenticated
    WITH CHECK (public.tiene_rol('administrador', 'logistica'));

CREATE POLICY "sv_update_logistica"
    ON public.solicitud_vehiculo FOR UPDATE TO authenticated
    USING (public.tiene_rol('administrador', 'logistica'))
    WITH CHECK (public.tiene_rol('administrador', 'logistica'));

CREATE POLICY "sv_delete_admin"
    ON public.solicitud_vehiculo FOR DELETE TO authenticated
    USING (public.tiene_rol('administrador'));
```

### Relaciones

* `solicitud_id` → `public.solicitud(id)` (`ON DELETE CASCADE`)
* `vehiculo_id` → `public.vehiculo(id)` (`NO ACTION`)
* UNIQUE `(solicitud_id, vehiculo_id)`.

---

## 5.6 Tabla: auditoria

Trazabilidad general de acciones sobre entidades (historial técnico). Alimentada por triggers y por lógica de servicio.

### CREATE TABLE

```sql
CREATE TABLE public.auditoria (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id     UUID NOT NULL REFERENCES public.usuario(id),   -- responsable de la acción (auth.uid())
    entidad        VARCHAR NOT NULL,     -- p.ej. 'solicitud', 'solicitud_vehiculo'
    entidad_id     UUID NOT NULL,
    accion         VARCHAR NOT NULL,     -- p.ej. 'CAMBIO_ESTADO', 'ASIGNACION_VEHICULO', 'CAMBIO_DISPONIBILIDAD_VEHICULO'
    valor_anterior JSONB,
    valor_nuevo    JSONB,
    created_at     TIMESTAMP(6) WITHOUT TIME ZONE DEFAULT now()
);
```

### Índices

Solo el PK (`auditoria_pkey`, btree en `id`). No hay índices secundarios.

### Row Level Security

RLS habilitado (**FORCED=false**). Política creada el 2026-08-22 (migración `20260822_politicas_rls.sql`):

```sql
CREATE POLICY "auditoria_select_admin"
    ON public.auditoria FOR SELECT TO authenticated
    USING (public.tiene_rol('administrador'));
```

**Inmutable vía API:** sin políticas de INSERT/UPDATE/DELETE, nadie escribe por cliente; los triggers `SECURITY DEFINER` insertan por fuera del RLS.

### Relaciones

* `usuario_id` → `public.usuario(id)` (`NO ACTION`)

---

## 5.7 Tabla: observacion

Comentarios/observaciones de usuarios sobre una solicitud.

### CREATE TABLE

```sql
CREATE TABLE public.observacion (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    solicitud_id UUID NOT NULL REFERENCES public.solicitud(id) ON DELETE CASCADE,
    usuario_id   UUID NOT NULL REFERENCES public.usuario(id),   -- autor
    observacion  TEXT NOT NULL,
    created_at   TIMESTAMP(6) WITHOUT TIME ZONE DEFAULT now(),
    updated_at   TIMESTAMP(6) WITHOUT TIME ZONE DEFAULT now()
);
```

### Índices

Solo el PK (`observacion_pkey`, btree en `id`).

### Triggers

```sql
-- Notifica a ejecutivo/jefe_local/logística de la solicitud (excepto al autor)
CREATE TRIGGER trigger_notificacion_observacion
    AFTER INSERT ON public.observacion
    FOR EACH ROW EXECUTE FUNCTION notificar_observacion();
```

> **DESHABILITADO el 2026-08-26** (migración `20260826_deshabilitar_notificaciones.sql`): violaba `notificacion.usuario_id NOT NULL` al no existir participantes asignados. La función se conserva.
```

Nota: `updated_at` no tiene trigger propio en esta tabla; su default `now()` solo aplica al INSERT.

### Row Level Security

RLS habilitado (**FORCED=false**). Políticas creadas el 2026-08-22 (migración `20260822_politicas_rls.sql`):

```sql
CREATE POLICY "observacion_select_participantes"
    ON public.observacion FOR SELECT TO authenticated
    USING (
        public.usuario_activo()
        AND (
            public.tiene_rol('administrador')
            OR EXISTS (
                SELECT 1 FROM public.solicitud s
                WHERE s.id = solicitud_id
                  AND (s.ejecutivo_id  = auth.uid()
                       OR s.jefe_local_id = auth.uid()
                       OR s.logistica_id  = auth.uid())
            )
        )
    );

-- Solo participantes; el autor debe ser uno mismo
CREATE POLICY "observacion_insert_participantes"
    ON public.observacion FOR INSERT TO authenticated
    WITH CHECK (
        public.usuario_activo()
        AND usuario_id = auth.uid()
        AND EXISTS (
            SELECT 1 FROM public.solicitud s
            WHERE s.id = solicitud_id
              AND (s.ejecutivo_id  = auth.uid()
                   OR s.jefe_local_id = auth.uid()
                   OR s.logistica_id  = auth.uid())
        )
    );

CREATE POLICY "observacion_update_autor_o_admin"
    ON public.observacion FOR UPDATE TO authenticated
    USING (public.usuario_activo() AND (usuario_id = auth.uid() OR public.tiene_rol('administrador')))
    WITH CHECK (public.usuario_activo() AND (usuario_id = auth.uid() OR public.tiene_rol('administrador')));

CREATE POLICY "observacion_delete_autor_o_admin"
    ON public.observacion FOR DELETE TO authenticated
    USING (public.usuario_activo() AND (usuario_id = auth.uid() OR public.tiene_rol('administrador')));
```

### Relaciones

* `solicitud_id` → `public.solicitud(id)` (`ON DELETE CASCADE`)
* `usuario_id` → `public.usuario(id)` (`NO ACTION`)

---

## 5.8 Tabla: notificacion

Notificaciones in-app dirigidas a un usuario, generadas por los triggers del sistema.

### CREATE TABLE

```sql
CREATE TABLE public.notificacion (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id UUID NOT NULL REFERENCES public.usuario(id) ON DELETE CASCADE,  -- destinatario
    emisor_id  UUID NOT NULL REFERENCES public.usuario(id) ON DELETE CASCADE,  -- origen del evento / auth.uid()
    tipo       public.tipo_notificacion NOT NULL,
    titulo     VARCHAR(100) NOT NULL,
    mensaje    TEXT NOT NULL,
    leida      BOOLEAN NOT NULL DEFAULT false,
    entidad    VARCHAR(50) NOT NULL,   -- 'solicitud' | 'observacion' | 'solicitud_vehiculo'
    entidad_id UUID NOT NULL,
    ruta       TEXT,                   -- p.ej. '/solicitudes/<uuid>'
    created_at TIMESTAMP(6) WITHOUT TIME ZONE DEFAULT now()
);
```

### Índices

Solo el PK (`notificacion_pkey`, btree en `id`).

### Row Level Security

RLS habilitado (**FORCED=false**). Políticas creadas el 2026-08-22 (migración `20260822_politicas_rls.sql`). Cada usuario gestiona solo las suyas; **sin INSERT vía API**: las notificaciones las generan exclusivamente los triggers `SECURITY DEFINER`:

```sql
CREATE POLICY "notificacion_select_destinatario"
    ON public.notificacion FOR SELECT TO authenticated
    USING (public.usuario_activo() AND usuario_id = auth.uid());

CREATE POLICY "notificacion_update_destinatario"
    ON public.notificacion FOR UPDATE TO authenticated
    USING (public.usuario_activo() AND usuario_id = auth.uid())
    WITH CHECK (public.usuario_activo() AND usuario_id = auth.uid());

CREATE POLICY "notificacion_delete_destinatario"
    ON public.notificacion FOR DELETE TO authenticated
    USING (public.usuario_activo() AND usuario_id = auth.uid());
```

### Relaciones

* `usuario_id` → `public.usuario(id)` (destinatario, `ON DELETE CASCADE`)
* `emisor_id` → `public.usuario(id)` (emisor/evento, `ON DELETE CASCADE`)

---

# 6. Funciones públicas

Todas verificadas contra catálogo el 2026-08-22. Cuerpos completos disponibles en la BD y reproducibles con `pg_get_functiondef`.

| Función | Firma | Seguridad | Propósito |
| ------- | ----- | --------- | --------- |
| `usuario_activo()` | `() → boolean` | `SECURITY DEFINER`, `STABLE` | ¿El `auth.uid()` actual existe en `public.usuario` con `activo = true`? Helper de políticas (evita recursión de RLS sobre `usuario`). Creada 2026-08-22. |
| `tiene_rol(VARIADIC roles TEXT[])` | `(text[]) → boolean` | `SECURITY DEFINER`, `STABLE` | ¿El usuario activo tiene alguno de los roles indicados? Uso: `tiene_rol('administrador','logistica')`. Creada 2026-08-22. |
| `es_administrador()` | `() → boolean` | `SECURITY DEFINER` | ¿Usuario autenticado es administrador activo? Usada por políticas RLS de `usuario`. |
| `handle_updated_at()` | `() → trigger` | invoker | Mantiene `updated_at = now()` (UTC) en UPDATE. Trigger: `usuario`. |
| `handle_new_auth_user()` | `() → trigger` | `SECURITY DEFINER` | Sincroniza `auth.users` → `public.usuario`; fuerza rol administrador para `maic.hernandez.dev@gmail.com`; upsert por `id`. |
| `rls_auto_enable()` | `() → event_trigger` | `SECURITY DEFINER` | Event trigger DDL: habilita RLS automáticamente en tablas nuevas del esquema `public`. Explica por qué todas las tablas tienen RLS activo. |
| `validate_solicitud_tipo()` | `() → trigger` | invoker | Valida en INSERT/UPDATE que `tipo_solicitud` traiga sus campos obligatorios (venta → `sucursal_destino`; evento → `direccion_evento` y `titulo_evento`). Creada 2026-08-26. |
| `cambio_estado_auditoria()` | `() → trigger` | `SECURITY DEFINER` | Audita transiciones de estado de `solicitud` en `auditoria` (acción `CAMBIO_ESTADO`). **Sin trigger desde 2026-08-26** (migración `20260826_deshabilitar_auditoria_service_role.sql`); la auditoría de estados la registra la capa de servicios. |
| `disponibilidad()` | `() → trigger` | invoker | Al cancelarse una solicitud, libera (`liberado`) sus vehículos `reservado`. |
| `auditoria_disponibilidad()` | `() → trigger` | `SECURITY DEFINER` | Audita asignación/cambio de disponibilidad en `solicitud_vehiculo` (`ASIGNACION_VEHICULO`, `CAMBIO_DISPONIBILIDAD_VEHICULO`). **Sin trigger desde 2026-08-26** (migración `20260826_deshabilitar_auditoria_service_role.sql`); la auditoría de asignaciones la registra la capa de servicios. |
| `notificar_solicitud()` | `() → trigger` | `SECURITY DEFINER` | Genera `notificacion`: nueva solicitud (al jefe_local) y cada transición de estado (al rol correspondiente). **Sin trigger desde 2026-08-26** (migración `20260826_deshabilitar_notificaciones.sql`); función conservada. |
| `notificar_observacion()` | `() → trigger` | `SECURITY DEFINER` | Notifica `NUEVA_OBSERVACION` a participantes de la solicitud, excepto al autor. **Sin trigger desde 2026-08-26**. |
| `notificar_solicitud_vehiculo()` | `() → trigger` | `SECURITY DEFINER` | Notifica `VEHICULO_RESERVADO` / `VEHICULO_LIBERADO` al ejecutivo. **Sin trigger desde 2026-08-26**. |

> La función muerta `traspaso_auth_tabla_usuario()` fue eliminada el 2026-08-22 (migración `20260822_cleanup_funcion_muerta_y_defaults.sql`): no tenía trigger asociado e insertaba un rol inválido para el enum.

---

# 7. Alertas del esquema (2026-08-22)

1. Cascadas peligrosas: borrar `usuario` borra su `sucursal`; borrar `sucursal` borra sus solicitudes.
2. FKs sin acción hacia `usuario.id` (solicitud, auditoria, observacion, solicitud_vehiculo.vehiculo_id): impiden borrar usuarios con historial (protege trazabilidad, pero conviene documentarlo como decisión).
3. Timestamps `WITHOUT TIME ZONE` en la mayoría de tablas (solo fechas de despacho/límite/bloqueo usan `TIMESTAMPTZ`).
4. Falta diseño: `vehiculo.creado_por`/FK sucursal. `solicitud.fecha_despacho`/`fecha_entrega` ya existen y se usan (resuelto 2026-09-03).
5. El filtro por sucursal del jefe_local en la política de `solicitud` depende de que `usuario.sucursal_id` esté poblado.

> Resueltos el 2026-08-22: default anómalo en `sucursal.usuario_id` (eliminado), función muerta `traspaso_auth_tabla_usuario` (eliminada) y `usuario.sucursal_id` corregido de UUID a BIGINT + FK, vía migraciones `20260822_cleanup_funcion_muerta_y_defaults.sql` y `20260822_politicas_rls.sql`. También resuelto ese día el hallazgo crítico **deny-all**: las 7 tablas de negocio ya cuentan con políticas RLS por rol (helpers `usuario_activo()`/`tiene_rol()`); pendiente validar los permisos dentro de la app.

---

# 8. Mantenimiento de este documento

Este documento se actualiza cuando:

1. Se crea, modifica o elimina una tabla en Supabase.
2. Se agregan o cambian columnas, índices, constraints, triggers o políticas RLS.
3. Una auditoría detecta divergencia entre Supabase y esta documentación.

En cada actualización debe quedar claro qué tabla cambió, para mantener la trazabilidad exigida en `BRAIN.md` (sección 16.4).

---

# 9. Regla para IA / OpenCode

Antes de trabajar con la capa de repositorios o datos, la IA debe:

1. Leer este documento y compararlo con el esquema real de Supabase cuando tenga acceso.
2. Nunca inventar tablas ni columnas: si algo no está documentado ni verificado, marcarlo como pendiente de volcado.
3. Al proponer cambios de esquema, escribirlos siempre como DDL (`CREATE TABLE`, `ALTER TABLE`) aplicable a Supabase.
4. Tras aplicar cualquier cambio de esquema en Supabase, actualizar este documento en la misma tarea y reflejarlo en `PROJECT_STATUS.md`.
5. Para reverificar el volcado, ejecutar `volcado_catalogo_tabla.sql` y leer `catalogo_auditoria` vía API.


