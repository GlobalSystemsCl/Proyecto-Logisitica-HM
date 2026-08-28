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

## Fase 2 — Gestión de Sucursales

**Estado:** `COMPLETADO`

### Objetivo

Implementar el módulo administrativo de sucursales: CRUD completo por parte del Administrador, control de capacidad de estacionamiento (ajuste manual de `slots_ocupados` solo en este módulo) y consulta de las solicitudes —con sus vehículos y responsables— cuyo origen es cada sucursal. Este módulo precede a Gestión de Solicitudes porque la solicitud depende de la sucursal.

### Tareas

* [x] Crear tipos del dominio (`src/types/sucursal.types.ts`: `Sucursal`, inputs CRUD, `SucursalSolicitudItem` con vehículos asociados).
* [x] Crear servicio (`src/services/sucursales.service.ts`): `getSucursales` (join encargado), `getSolicitudesPorSucursal` (consulta anidada con responsables y vehículos vía `solicitud_vehiculo`), `createSucursal`, `updateSucursal`, `deleteSucursal` con protecciones (bloquea si hay usuarios asignados; informa solicitudes en cascada).
* [x] Crear Server Actions con guard de Administrador (`src/app/actions/sucursales.actions.ts`): crear, editar, eliminar + `revalidatePath`.
* [x] Implementar página `/admin/sucursales` con guard idéntico al módulo de usuarios y header corporativo con escudo.
* [x] Implementar cliente `SucursalesTableClient.tsx`: métricas (Total / Capacidad Total / Estacionados), búsqueda, tabla con barra de ocupación, modal crear/editar, confirmación de borrado con aviso de cascada, y modal detalle con estados reales del enum, posición de prioridad, fechas, personas asociadas y tarjetas de vehículos (patente/marca/modelo/año/color + disponibilidad `reservado`/`liberado`).
* [x] Activar tile "Gestión de Sucursales" en el dashboard (solo administrador).
* [x] Validación estática: `tsc --noEmit` y ESLint sin errores (2026-08-25).
* [x] Validación funcional por el usuario en la app (2026-08-25: "funcionó"; antes se resolvió un bug de entorno — HMR WebSocket roto por caché `.next` + `.env.local` duplicado).
* [ ] Decidir diseño faltante relacionado: `solicitud.sucursal_destino`/`fecha_entrega` (la vista actual muestra solo el origen).

### Decisiones de diseño registradas para Gestión de Solicitudes

* [x] **Eliminación de solicitudes** (regla aprobada el 2026-08-25): permitida solo pre-despacho (`pendiente`, `priorizada`, `asignada`, `calendarizada`) por Administrador, ejecutivo creador o jefe_local de la sucursal origen; desde `en_transito` nadie puede eliminarlas; `cancelada` nunca se elimina. Requerirá migración RLS para ampliar la política `solicitud_delete_admin` (hoy solo administrador).

---

## Fase 3 — Gestión de Solicitudes (v1)

**Estado:** `EN_PROGRESO`

### Objetivo

Primera versión operativa del módulo `/solicitudes`: creación de solicitudes de traslado por Ejecutivo/Administrador, cola de priorización por Jefe de Local de la sucursal origen, reserva y liberación de vehículos (gestión exclusiva del Administrador en esta versión), cancelación con motivo obligatorio y eliminación restringida según la regla aprobada en Fase 2. Los estados posteriores a priorizada (asignada → calendarizada → en_transito → entregada → finalizada) quedan para la fase de Logística.

### Tareas

* [x] Crear tipos (`src/types/solicitud.types.ts`): `SolicitudLista` (joins resueltos), `CreateSolicitudInput`, `VehiculoInventario`, re-export del dominio compartido.
* [x] Crear servicio (`src/services/solicitudes.service.ts`): listado con joins (sucursal, personas, vehículos vía `solicitud_vehiculo`), inventario global con marcaje `reservado_en_activa` (estados activos = `ESTADOS_ACTIVOS_RESERVA`), crear con reservas atómicas, priorizar (max+1), cancelar (motivo obligatorio + libera reservas), eliminar según regla histórica, agregar/quitar vehículo anti-doble-reserva.
* [x] Crear Server Actions (`src/app/actions/solicitudes.actions.ts`) con permisos por rol: crear (ejecutivo/admin), priorizar (admin/jefe_local sucursal propia), cancelar (creador pendiente|priorizada / jefe_local / admin pre-despacho), eliminar (regla Fase 2), gestionar vehículos (solo admin).
* [x] Implementar página `/solicitudes` (guard usuario activo, header corporativo con escudo) y cliente `SolicitudesClient.tsx`: visibilidad por rol (admin/logística todo; ejecutivo lo suyo; jefe_local su sucursal), métricas, filtros, tabla con cola de prioridad, modal creación (multi-reserva solo admin), detalle con gestión de vehículos, modales cancelar/eliminar.
* [x] Activar tile "Gestión de Solicitudes" en el dashboard (todos los roles).
* [x] Validación estática: `tsc --noEmit` y ESLint sin errores/warnings (2026-08-25).
* [x] Priorización por drag & drop en `/solicitudes/prioridades` (2026-08-28): arrastrar desde "Por Priorizar" inserta en la posición elegida vía `SolicitudesService.priorizarEnPosicion` + `priorizarEnPosicionAction`; se elimina el botón "Priorizar" de ese panel; sacar de cola también arrastrando fuera. Pendiente validación funcional del usuario.
* [ ] Validación funcional por el usuario en la app.
* [ ] Migración RLS futura: ampliar `solicitud_delete_admin` para creador/jefe_local pre-despacho (la app hoy valida en Server Actions porque los servicios usan `createAdminClient()`).

---

El objetivo es que una nueva sesión pueda continuar el desarrollo **sin depender del contexto de una conversación anterior**.
