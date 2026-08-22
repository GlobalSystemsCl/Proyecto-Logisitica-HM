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
| Autenticación y usuarios | `COMPLETADO`         |     100% | Alta      | Sistema y Brevo implementados |
| Vehículos                | `PENDIENTE_REVISION` |       0% | Alta      | Revisar CRUD e integración    |
| Solicitudes              | `PENDIENTE_REVISION` |       0% | Alta      | Revisar flujo completo        |
| Sucursales               | `PENDIENTE_REVISION` |       0% | Alta      | Revisar modelo actual         |
| Logística                | `PENDIENTE_REVISION` |       0% | Alta      | Revisar flujo de traslado     |
| Historial / trazabilidad | `PENDIENTE_REVISION` |       0% | Media     | Revisar implementación        |
| Permisos / roles         | `PENDIENTE_REVISION` |       0% | Alta      | Revisar RLS y autorización    |

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
* Rechazo.
* Historial.

### Flujo

```text
CREADA
 ↓
PENDIENTE
 ↓
PRIORIZADA
 ↓
ASIGNADA
 ↓
CALENDARIZADA
 ↓
DESPACHADA
 ↓
ENTREGADA
 ↓
FINALIZADA
```

Estados alternativos:

```text
RECHAZADA
CANCELADA
```

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
| Pendiente de auditoría | —      | —      | —         | —         |

Cada vez que una implementación quede incompleta debe registrarse aquí.

---

# 7. Registro de funcionalidades terminadas

| Funcionalidad | Módulo | Fecha | Estado | Validado |
| ------------- | ------ | ----- | ------ | -------- |
| —             | —      | —     | —      | —        |

Una funcionalidad solamente puede pasar a `COMPLETADO` cuando haya sido validada.

---

# 8. Problemas encontrados

| Problema | Módulo | Severidad | Estado | Solución |
| -------- | ------ | --------- | ------ | -------- |
| —        | —      | —         | —      | —        |

---

# 9. Deuda técnica

| Elemento | Módulo | Impacto | Prioridad | Estado |
| -------- | ------ | ------- | --------- | ------ |
| —        | —      | —       | —         | —      |

---

# 10. Última auditoría

```text
Fecha:
Realizada por:
Commit:
Branch:
Estado general:
```

### Resumen de la última auditoría

```text
Pendiente de realizar la primera auditoría profunda del repositorio.
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
