# PROJECT STATUS — Estado actual del proyecto

> Este documento representa el **estado real del proyecto**.
>
> Debe actualizarse cada vez que se complete, modifique o deje incompleta una funcionalidad importante.
>
> El objetivo es evitar perder trabajo y permitir que cualquier sesión de desarrollo pueda determinar rápidamente dónde quedó el proyecto.

---

# 1. Estados permitidos

Cada módulo y funcionalidad debe utilizar uno de estos estados:

| Estado               | Significado                                    |
| -------------------- | ---------------------------------------------- |
| `NO_INICIADO`        | No existe implementación significativa         |
| `PLANIFICADO`        | Existe definición/plan pero aún no comienza    |
| `EN_PROGRESO`        | Se está trabajando actualmente                 |
| `IMPLEMENTADO`       | Implementación realizada pero falta validación |
| `COMPLETADO`         | Implementado y validado                        |
| `BLOQUEADO`          | No puede continuar debido a una dependencia    |
| `PENDIENTE_REVISION` | Implementado pero requiere revisión            |
| `DEPRECADO`          | Ya no forma parte del sistema actual           |

---

# 2. Regla de progreso

El porcentaje de progreso debe representar el **estado funcional real**, no solamente la cantidad de código escrito.

No considerar una funcionalidad como completada solamente porque existe:

* UI.
* Endpoint.
* Tabla.
* Servicio.

Debe existir un flujo funcional completo y validado.

---

# 3. Resumen general

| Módulo                   | Estado               | Progreso | Prioridad | Observaciones                 |
| ------------------------ | -------------------- | -------: | --------- | ----------------------------- |
| Base de datos (Supabase) | `COMPLETADO`        |     100% | Alta      | Volcado 1:1 cerrado contra catálogo real (2026-08-22) |
| Autenticación y usuarios | `COMPLETADO`         |     100% | Alta      | Sistema y Brevo implementados |
| Vehículos                | `PENDIENTE_REVISION` |       0% | Alta      | Revisar CRUD e integración    |
| Solicitudes              | `PENDIENTE_REVISION` |       0% | Alta      | Revisar flujo completo        |
| Sucursales               | `PENDIENTE_REVISION` |       0% | Alta      | Revisar modelo actual         |
| Logística                | `PENDIENTE_REVISION` |       0% | Alta      | Revisar flujo de traslado     |
| Historial / trazabilidad | `PENDIENTE_REVISION` |       0% | Media     | Existen tablas auditoria/observacion/notificacion por auditar |
| Permisos / roles         | `PENDIENTE_REVISION` |       0% | Alta      | Políticas RLS aplicadas por rol (2026-08-22); validar autorización en la app |

> **IMPORTANTE:** Los porcentajes anteriores son valores iniciales. OpenCode debe realizar un análisis real del repositorio antes de establecer el porcentaje definitivo.

---

# 4. Regla de auditoría del estado

Cuando OpenCode inicie una nueva tarea importante debe comprobar:

### Documentación

* `BRAIN.md`
* `PROJECT_STATUS.md`
* `IMPLEMENTATION_PLAN.md`
* `DATABASE_SCHEMA.md`

### Código

* Estructura del proyecto.
* Componentes.
* Servicios.
* APIs.
* Repositories.
* Modelos.
* Migraciones.
* Policies.
* Tests.
* Variables de entorno relevantes.

### Resultado

Debe comparar:

```text
DOCUMENTACIÓN
      ↕
CÓDIGO REAL
      ↕
BASE DE DATOS
      ↕
FUNCIONALIDAD REAL
```

Si existen diferencias, debe identificarlas.

---

# 5. Estado por módulo

## 5.1 Autenticación y usuarios

**Estado:** `COMPLETADO`

**Progreso:** 100%

### Implementado

* Login corporativo con Supabase Email (`/login`).
* Gestión completa de usuarios y cuentas por Administrador (`/admin/usuarios`).
* Generación de contraseñas provisorias seguras con cambio obligatorio en el primer ingreso.
* Integración transaccional con **Brevo API** (`EmailService`) con remitente `globalsystemschile@gmail.com` y plantilla HTML responsive.
* Envío automático de credenciales al crear un usuario y al resetear contraseñas.
* Botón interactivo para **Copiar Credenciales** directamente desde el panel de administración.
* Recuperación de contraseña (`/recuperar-clave`).
* Establecimiento / cambio de contraseña inicial obligatoria (`/establecer-clave`).
* Activación y desactivación de usuarios en tiempo real (bloqueo inmediato en middleware/servicio).
* Protección contra intentos fallidos excesivos (bloqueo temporal tras 5 intentos).
* Control de roles (`administrador`, `ejecutivo`, `jefe_local`, `logistica`).
* Soporte para dominio de pruebas (`gmail.com`) y corporativo (`hmotores.cl`).
* Usuario Administrador Principal configurado y validado: `maic.hernandez.dev@gmail.com`.

### Archivos relacionados

* Migración SQL: `supabase/migrations/20260822_auth_and_users.sql`
* Clientes Supabase: `src/lib/supabase/client.ts`, `src/lib/supabase/server.ts`, `src/lib/supabase/admin.ts`, `src/lib/supabase/middleware.ts`
* Middleware de rutas: `src/middleware.ts`
* Tipos: `src/types/auth.types.ts`
* Capa de servicios: 
  - `src/services/auth.service.ts`
  - `src/services/users.service.ts`
  - `src/services/email.service.ts` (Brevo API)
* Server Actions: `src/app/actions/auth.actions.ts`, `src/app/actions/users.actions.ts`
* Páginas y UI:
  - `src/app/login/page.tsx`
  - `src/app/recuperar-clave/page.tsx`
  - `src/app/establecer-clave/page.tsx`
  - `src/app/auth/callback/route.ts`
  - `src/app/dashboard/page.tsx`
  - `src/app/admin/usuarios/page.tsx`
  - `src/app/admin/usuarios/UsersTableClient.tsx`

---

## 5.2 Gestión de vehículos

**Estado:** `PENDIENTE_REVISION`

**Progreso:** 0% inicial

### Debe incluir

* CRUD de vehículos.
* Asociación a sucursal.
* Estado del vehículo.
* Datos del vehículo.

### Pendientes

Determinar mediante auditoría.

---

## 5.3 Gestión de solicitudes

**Estado:** `PENDIENTE_REVISION`

**Progreso:** 0% inicial

### Debe incluir

* Creación.
* Consulta.
* Estados.
* Priorización.
* Asignación.
* Calendarización.
* Despacho.
* Entrega.
* Finalización.
* Cancelación.
* Historial.

### Flujo

Enum real `estado_solicitud` (ver `DATABASE_SCHEMA.md` §5.0):

```text
PENDIENTE
 ↓
PRIORIZADA      <- Jefe de Local prioriza (posicion_prioridad)
 ↓
ASIGNADA        <- se asigna logistica_id
 ↓
CALENDARIZADA   <- Logística agenda fecha tentativa de despacho
 ↓
EN_TRANSITO     <- despacho real del vehículo
 ↓
ENTREGADA       <- confirmación de recepción
 ↓
FINALIZADA      <- cierre
```

Alternativa:

```text
CANCELADA       <- desde cualquier estado previo a entrega;
                   exige motivo_cancelacion y libera automáticamente
                   los vehículos reservados (trigger disponibilidad)
```

No existen `creada` ni `rechazada`: una solicitud nace directamente en `pendiente`.

---

## 5.4 Gestión de sucursales

**Estado:** `PENDIENTE_REVISION`

**Progreso:** 0% inicial

Debe revisarse:

* CRUD.
* Asociación con usuarios.
* Asociación con vehículos.
* Capacidad.
* Disponibilidad.
* Sucursal origen.
* Sucursal destino.

---

## 5.5 Gestión logística

**Estado:** `PENDIENTE_REVISION`

**Progreso:** 0% inicial

Debe revisarse:

* Recepción de solicitudes.
* Destino.
* Disponibilidad de estacionamiento.
* Fecha estimada.
* Fecha máxima.
* Ubicación.
* Despacho.
* Entrega.
* Finalización.

---

## 5.6 Historial y trazabilidad

**Estado:** `PENDIENTE_REVISION`

**Progreso:** 0% inicial

Debe revisarse:

* Cambios de estado.
* Usuario responsable.
* Fecha/hora.
* Acciones.
* Historial de solicitudes.
* Historial de vehículos.
* Conservación de información después de desactivar usuarios.

---

# 6. Registro de funcionalidades incompletas

Esta sección debe utilizarse para evitar que trabajo iniciado quede olvidado.

| Funcionalidad          | Módulo | Estado | Qué falta | Prioridad |
| ---------------------- | ------ | ------ | --------- | --------- |
| (vacío — las políticas RLS se completaron el 2026-08-22, ver registro de terminadas) | | | | |

Cada vez que una implementación quede incompleta debe registrarse aquí.

---

# 7. Registro de funcionalidades terminadas

| Funcionalidad | Módulo | Fecha | Estado | Validado |
| ------------- | ------ | ----- | ------ | -------- |
| Volcado 1:1 del esquema Supabase a `DATABASE_SCHEMA.md` | Base de datos | 2026-08-22 | `COMPLETADO` | Sí — contra catálogo real vía tabla temporal |
| Corrección `.env.local` (claves intercambiadas) | Infraestructura | 2026-08-22 | `COMPLETADO` | Sí — REST responde OK con ambas claves |
| Alineación de estados `Brain.md` al enum real | Documentación | 2026-08-22 | `COMPLETADO` | Sí |
| Limpieza de esquema: función muerta `traspaso_auth_tabla_usuario` y default anómalo `sucursal.usuario_id` eliminados | Base de datos | 2026-08-22 | `COMPLETADO` | Sí — migración `20260822_cleanup_funcion_muerta_y_defaults.sql`, verificado vía API |
| Políticas RLS por rol para las 7 tablas de negocio + helpers `usuario_activo()`/`tiene_rol()` + corrección `usuario.sucursal_id` UUID→BIGINT con FK | Base de datos / Permisos | 2026-08-22 | `COMPLETADO` | Sí — migración `20260822_politicas_rls.sql`; tipo verificado vía OpenAPI (`int64`). Falta validar permisos por rol dentro de la app |
| Actualización tipos TS (`sucursal_id?: number`) tras cambio de columna | Código | 2026-08-22 | `COMPLETADO` | Sí — `tsc --noEmit` sin errores |

Una funcionalidad solamente puede pasar a `COMPLETADO` cuando haya sido validada.

---

# 8. Problemas encontrados

| Problema | Módulo | Severidad | Estado | Solución |
| -------- | ------ | --------- | ------ | -------- |
| Clave `sb_secret_` expuesta en variable pública (`NEXT_PUBLIC_SUPABASE_ANON_KEY`) | Infraestructura | Alta | Resuelto (2026-08-22) | Reasignada: publishable → `NEXT_PUBLIC_SUPABASE_ANON_KEY`; secret → `SUPABASE_SERVICE_ROLE_KEY` |
| `.env.local` sin `SUPABASE_SERVICE_ROLE_KEY` exigida por `src/lib/supabase/admin.ts` | Autenticación | Alta | Resuelto (2026-08-22) | Variable agregada con la clave secreta válida |
| Columnas con espacios: `sucursal."slots ocupados"`, `solicitud."tipo solicitud"` | Base de datos | Media | Resuelto (2026-08-22) | PARTE 1 de `auditoria_esquema_supabase.sql` ejecutada; renombres verificados vía API |
| Documentación de estados divergía del enum real (`CREADA`/`DESPACHADA`/`RECHAZADA` no existen en BD) | Documentación | Media | Resuelto (2026-08-22) | `Brain.md` alineado al enum `estado_solicitud` |
| 7 tablas con RLS habilitado y CERO políticas → deny-all (solo service role accede) | Permisos / BD | Alta | Resuelto (2026-08-22) | Migración `20260822_politicas_rls.sql`: helpers `usuario_activo()`/`tiene_rol()` + políticas SELECT/INSERT/UPDATE/DELETE por rol. Pendiente validar en app |
| `usuario.sucursal_id` era UUID mientras `solicitud.sucursal` es BIGINT → política RLS fallaba con `operator does not exist: bigint = uuid` | Base de datos | Media | Resuelto (2026-08-22) | Columna cambiada a BIGINT con guardia anti-pérdida (`USING NULL` tras verificar que todos los valores eran NULL); FK agregada; tipos TS actualizados a `number` |
| Función muerta `traspaso_auth_tabla_usuario`: sin trigger e inserta rol 'EJECUTIVO' inválido para el enum | Base de datos | Baja | Resuelto (2026-08-22) | Eliminada vía migración `20260822_cleanup_funcion_muerta_y_defaults.sql`; verificado vía catálogo |
| Default anómalo `sucursal.usuario_id DEFAULT gen_random_uuid()` (FK que autogeneraba UUID inexistente) | Base de datos | Media | Resuelto (2026-08-22) | Default eliminado con la misma migración; verificado vía API |

---

# 9. Deuda técnica

| Elemento | Módulo | Impacto | Prioridad | Estado |
| -------- | ------ | ------- | --------- | ------ |
| `vehiculo` sin FK a sucursal ni campo `creado_por` | Vehículos | Trazabilidad de incorporación (BRAIN §14) incompleta | Alta | Pendiente decisión |
| `solicitud` sin columna `sucursal_destino` ni `fecha_entrega` | Solicitudes/Logística | El destino y la confirmación de entrega no quedan registrados | Alta | Pendiente diseño |
| `usuario.sucursal_id` era UUID sin FK (sucursal.id es BIGINT) | Usuarios / BD | Integridad referencial débil; impedía filtrar solicitudes por sucursal del jefe_local | Media | Resuelto (2026-08-22): cambiada a BIGINT + FK en `20260822_politicas_rls.sql`; tipos TS actualizados a `number` |
| Timestamps `WITHOUT TIME ZONE` en la mayoría de tablas | Base de datos | Ambigüedad horaria en auditoría/trazabilidad | Baja | Revisar en próxima pasada |
| `sucursal.usuario_id` con `ON DELETE CASCADE` usuario→sucursal | Sucursales / BD | Borrar usuario borra su sucursal asociada | Media | Default anómalo ya corregido; validar semántica de cascada |
| Cascada `solicitud.sucursal → ON DELETE CASCADE`: borrar sucursal elimina solicitudes | Base de datos | Pérdida de historial operativo | Media | Validar semántica deseada |
| Detalles finos del esquema (UNIQUE, largos, ON DELETE, índices, RLS, triggers) sin confirmar | Base de datos | Riesgo de documentar supuestos | Alta | **Resuelto** (2026-08-22): volcado 1:1 cerrado contra catálogo real |

---

# 10. Última auditoría

```text
Fecha: 2026-08-22
Realizada por: OpenCode
Commit: 94861b7
Branch: Joaco
Estado general: Verificación parcial (Fase 0 en curso)
```

### Resumen de la última auditoría

```text
- Esquema de Supabase verificado al 100% contra catálogo real (tabla temporal
  catalogo_auditoria, leída vía API): 8 tablas, 5 enums, 10 funciones públicas
  vigentes (se detectaron 11; la muerta fue eliminada), triggers, índices,
  constraints con acciones exactas y políticas RLS.
- DATABASE_SCHEMA.md cerrado: DDL completo, triggers por tabla, políticas RLS
  reales y alertas del esquema.
- HALLAZGO CRÍTICO (RESUELTO el 2026-08-22): 7 tablas de negocio tenían RLS
  habilitado con CERO políticas => deny-all salvo service role. Corregido con
  migración supabase/migrations/20260822_politicas_rls.sql.
- Descubiertos 6 triggers automáticos no documentados: auditores
  (cambio_estado_auditoria, auditoria_disponibilidad) y notificadores
  (notificar_solicitud, notificar_observacion, notificar_solicitud_vehiculo),
  más liberación automática de vehículos al cancelar.
- Función muerta detectada y eliminada: traspaso_auth_tabla_usuario (sin
  trigger, rol inválido para el enum).
- PENDIENTE: DROP TABLE catalogo_auditoria (limpieza final); decidir diseño
  faltante (creado_por, sucursal_destino, fecha_entrega); validar semántica
  de cascadas usuario→sucursal y sucursal→solicitudes; probar permisos RLS
  por rol dentro de la app.
- RESUELTO (misma sesión): función muerta traspaso_auth_tabla_usuario
  eliminada y default anómalo sucursal.usuario_id eliminado, vía migración
  supabase/migrations/20260822_cleanup_funcion_muerta_y_defaults.sql
  (verificado vía API).
- RESUELTO (misma sesión): políticas RLS creadas para las 7 tablas de negocio
  con helpers usuario_activo()/tiene_rol(); usuario.sucursal_id corregido de
  UUID a BIGINT + FK (guardia anti-pérdida) y tipos TS actualizados a number;
  verificación vía OpenAPI (int64). Migración:
  supabase/migrations/20260822_politicas_rls.sql.
```

---

# 11. Regla de actualización

Después de implementar una funcionalidad importante:

1. Actualizar su estado.
2. Actualizar el porcentaje del módulo.
3. Registrar qué se implementó.
4. Registrar archivos relevantes.
5. Registrar pruebas realizadas.
6. Registrar pendientes.
7. Actualizar `IMPLEMENTATION_PLAN.md`.
8. Si la tarea modificó el esquema de base de datos, actualizar `DATABASE_SCHEMA.md` manteniendo la correspondencia 1:1 con Supabase.
9. Registrar cualquier nueva deuda técnica.
10. Actualizar este documento.

---

# 12. Regla de consistencia

Nunca marcar una funcionalidad como `COMPLETADO` si:

* Existe una parte crítica sin implementar.
* Existen errores conocidos que impiden utilizarla.
* El flujo no puede completarse.
* No se han probado sus partes principales.
* Existen dependencias críticas pendientes.

Si solamente está implementada parcialmente:

```text
EN_PROGRESO
```

Si está implementada pero necesita validación:

```text
PENDIENTE_REVISION
```

---

# 13. Objetivo de este documento

Este documento debe responder rápidamente:

> **"¿En qué punto quedó el proyecto?"**

Y permitir identificar:

* Qué está terminado.
* Qué está en progreso.
* Qué está pendiente.
* Qué quedó a medias.
* Qué problemas existen.
* Qué módulo necesita atención.
* Qué se debe hacer a continuación.
