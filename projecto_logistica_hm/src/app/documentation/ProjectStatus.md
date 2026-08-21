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
| Autenticación y usuarios | `PENDIENTE_REVISION` |       0% | Alta      | Revisar implementación actual |
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

**Estado:** `PENDIENTE_REVISION`

**Progreso:** 0% inicial

### Debe incluir

* Login.
* Gestión de usuarios.
* Creación por Administrador.
* Correo `@hmotores.cl`.
* Roles.
* Activación/desactivación.
* Recuperación de contraseña.
* Establecimiento de contraseña inicial.
* Protección de acceso.
* Protección contra intentos excesivos.
* Permisos.

### Pendientes

OpenCode debe analizar el repositorio y registrar aquí los pendientes reales.

### Archivos relacionados

Registrar aquí los archivos reales encontrados durante la auditoría.

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
8. Registrar cualquier nueva deuda técnica.
9. Actualizar este documento.

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
