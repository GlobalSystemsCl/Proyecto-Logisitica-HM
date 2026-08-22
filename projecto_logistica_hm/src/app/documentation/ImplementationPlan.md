# IMPLEMENTATION PLAN — Plan de implementación

> Este documento contiene el roadmap activo del proyecto.
>
> No debe ser un documento estático. Debe actualizarse conforme se implementan funcionalidades.

---

# 1. Objetivo

Mantener un plan claro de implementación para evitar:

* Comenzar demasiadas funcionalidades simultáneamente.
* Dejar módulos incompletos.
* Perder trabajo entre sesiones.
* Implementar funcionalidades sin considerar dependencias.
* Olvidar actualizar documentación.
* Crear funcionalidades que contradigan otras existentes.

---

# 2. Estados del plan

Cada tarea debe utilizar uno de estos estados:

```text
PENDIENTE
EN_PROGRESO
BLOQUEADA
IMPLEMENTADA
VALIDANDO
COMPLETADA
CANCELADA
```

---

# 3. Regla fundamental

Antes de comenzar una funcionalidad grande:

```text
1. Analizar proyecto
        ↓
2. Revisar documentación
        ↓
3. Revisar estado real
        ↓
4. Identificar pendientes
        ↓
5. Identificar dependencias
        ↓
6. Crear/actualizar plan
        ↓
7. Implementar
        ↓
8. Validar
        ↓
9. Documentar
        ↓
10. Actualizar estado
```

---

# 4. Fases generales

## Fase 0 — Auditoría inicial

**Estado:** `EN_PROGRESO`

### Objetivo

Realizar una revisión profunda del proyecto actual.

### Tareas

* [x] Analizar estructura del repositorio (parcial: clientes Supabase, middleware, migraciones, documentación).
* [ ] Identificar frontend.
* [ ] Identificar backend/service layer.
* [ ] Identificar repositories.
* [ ] Identificar modelos.
* [x] Identificar migraciones (1 archivo: `20260822_auth_and_users.sql`).
* [x] Revisar Supabase (vía API REST con credenciales de `.env.local`: 8 tablas, 5 enums, 2 RPCs confirmados).
* [x] Volcar el esquema real de Supabase a `DATABASE_SCHEMA.md` con sentencias `CREATE TABLE` (correspondencia 1:1) — **cerrado al 100% contra catálogo real (2026-08-22)**.
* [x] Verificar que cada tabla existente en Supabase esté documentada como DDL y ninguna tabla documentada falte en Supabase (8 tablas, 5 enums, 11 funciones verificadas).
* [ ] Revisar autenticación.
* [ ] Revisar RLS.
* [ ] Revisar rutas protegidas.
* [ ] Revisar servicios.
* [ ] Revisar funcionalidades existentes.
* [ ] Revisar funcionalidades parcialmente implementadas.
* [ ] Revisar TODOs.
* [ ] Revisar código muerto o incompleto.
* [ ] Revisar errores conocidos.
* [x] Comparar implementación con documentación (esquema BD y estados; resto pendiente).
* [x] Actualizar `PROJECT_STATUS.md`.

### Tareas derivadas de la auditoría (2026-08-22)

* [x] Corregir `.env.local`: claves estaban intercambiadas (`sb_secret_` expuesta en variable pública). Ahora: publishable en `NEXT_PUBLIC_SUPABASE_ANON_KEY`, secret en `SUPABASE_SERVICE_ROLE_KEY`.
* [x] Verificar que los clientes Supabase leen las variables correctas (`client.ts`, `server.ts`, `middleware.ts`, `admin.ts`) — sin cambios de código necesarios.
* [x] Alinear estados de `Brain.md` al enum real `estado_solicitud`.
* [x] Crear script `src/app/documentation/auditoria_esquema_supabase.sql`.
* [x] Crear script `src/app/documentation/volcado_catalogo_tabla.sql` (volcado sin copiar resultados; tabla temporal `catalogo_auditoria`).
* [x] **USUARIO:** ejecutar scripts en SQL Editor — renombres aplicados y catálogo completo leído vía API.
* [x] Cerrar volcado 1:1 en `DATABASE_SCHEMA.md` con el catálogo (tipos, largos, defaults, UNIQUE, ON DELETE, índices, RLS, triggers, funciones).

### Siguiente tarea recomendada

* [x] **Crear políticas RLS para las 7 tablas de negocio** (sucursal, vehiculo, solicitud, solicitud_vehiculo, auditoria, observacion, notificacion) — aplicadas por usuario con `supabase/migrations/20260822_politicas_rls.sql` (incluye corrección `usuario.sucursal_id` UUID→BIGINT + FK con guardia anti-pérdida); tipo verificado vía OpenAPI (`int64`) el 2026-08-22. Próximo paso: probar permisos por rol en la app.
* [x] Eliminar función muerta `traspaso_auth_tabla_usuario` y limpiar default anómalo `sucursal.usuario_id DEFAULT gen_random_uuid()` — aplicado por usuario con migración `20260822_cleanup_funcion_muerta_y_defaults.sql` y verificado vía API (2026-08-22).
* [x] Corregir `usuario.sucursal_id` (UUID sin FK → BIGINT + FK a sucursal) y actualizar tipos TS (`sucursal_id?: number`) — incluido en `20260822_politicas_rls.sql` (2026-08-22).
* [ ] Decidir diseño faltante: `vehiculo.creado_por`/FK sucursal; `solicitud.sucursal_destino`/`fecha_entrega`; timestamps con TZ.
* [ ] Validar semántica de cascadas: `usuario → sucursal` (ON DELETE CASCADE) y `sucursal → solicitud` (ON DELETE CASCADE).
* [ ] Limpiar tabla temporal: `DROP TABLE public.catalogo_auditoria;` — *el usuario la ejecutará junto con las políticas RLS*.

## Fase 1 — Autenticación y Gestión de Usuarios

**Estado:** `COMPLETADA`

### Objetivo

Implementar sistema de autenticación cerrado corporativo con Supabase Email, gestión de cuentas por administrador, activación/desactivación, protección contra intentos excesivos y recuperación/establecimiento de contraseñas.

### Tareas

* [x] Diseñar y crear tabla `public.usuario` en Supabase con RLS y triggers de sincronización.
* [x] Configurar clientes Supabase SSR, Browser y Admin con Service Role.
* [x] Crear middleware de protección de rutas y actualización de sesión.
* [x] Implementar capa de servicio `AuthService` y `UsersService`.
* [x] Crear Server Actions para login, logout, recuperación y cambio de clave.
* [x] Crear Server Actions para CRUD administrativo de usuarios.
* [x] Diseñar página corporativa de Login (`/login`).
* [x] Diseñar página de recuperación de contraseña (`/recuperar-clave`).
* [x] Diseñar página de establecimiento de contraseña inicial (`/establecer-clave`).
* [x] Diseñar panel de control administrativo de usuarios (`/admin/usuarios`).
* [x] Integrar servicio de envío de correos transaccionales con **Brevo API** (`EmailService`).
* [x] Diseñar plantilla corporativa HTML para envío de credenciales por correo con remitente `globalsystemschile@gmail.com`.
* [x] Implementar flujo de contraseñas provisorias con cambio obligatorio en el primer ingreso.
* [x] Configurar usuario administrador inicial: `maic.hernandez.dev@gmail.com`.
* [x] Actualizar `DATABASE_SCHEMA.md`, `BRAIN.md` y `PROJECT_STATUS.md`.

---

El objetivo es que una nueva sesión pueda continuar el desarrollo **sin depender del contexto de una conversación anterior**.
