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

**Estado:** `PENDIENTE`

### Objetivo

Realizar una revisión profunda del proyecto actual.

### Tareas

* [ ] Analizar estructura del repositorio.
* [ ] Identificar frontend.
* [ ] Identificar backend/service layer.
* [ ] Identificar repositories.
* [ ] Identificar modelos.
* [ ] Identificar migraciones.
* [ ] Revisar Supabase.
* [ ] Revisar autenticación.
* [ ] Revisar RLS.
* [ ] Revisar rutas protegidas.
* [ ] Revisar servicios.
* [ ] Revisar funcionalidades existentes.
* [ ] Revisar funcionalidades parcialmente implementadas.
* [ ] Revisar TODOs.
* [ ] Revisar código muerto o incompleto.
* [ ] Revisar errores conocidos.
* [ ] Comparar implementación con documentación.
* [ ] Actualizar `PROJECT_STATUS.md`.

### Resultado esperado

Obtener una fotografía real del estado del proyecto.

---

# 5. Fase 1 — Base del sistema

**Estado:** `PENDIENTE`

### Objetivo

Garantizar que la base estructural del proyecto sea estable.

### Tareas

* [ ] Revisar arquitectura.
* [ ] Revisar estructura de carpetas.
* [ ] Revisar configuración.
* [ ] Revisar variables de entorno.
* [ ] Revisar conexión con Supabase.
* [ ] Revisar Service Layer.
* [ ] Revisar acceso a datos.
* [ ] Revisar manejo de errores.
* [ ] Revisar autenticación.
* [ ] Revisar autorización.

---

# 6. Fase 2 — Autenticación y usuarios

**Estado:** `PENDIENTE`

### Objetivo

Completar el sistema de cuentas y permisos.

### Tareas

* [ ] Login.
* [ ] Creación de usuarios por Administrador.
* [ ] Dominio fijo `@hmotores.cl`.
* [ ] Validación de correo corporativo.
* [ ] Asignación de roles.
* [ ] Establecimiento de contraseña inicial.
* [ ] Envío de enlace por correo.
* [ ] Recuperación de contraseña.
* [ ] Protección contra intentos excesivos.
* [ ] Activar usuario.
* [ ] Desactivar usuario.
* [ ] Bloqueo de acceso de usuarios inactivos.
* [ ] Protección de rutas.
* [ ] Validación de permisos.
* [ ] Validación backend.
* [ ] Pruebas.
* [ ] Documentación.

---

# 7. Fase 3 — Gestión de vehículos

**Estado:** `PENDIENTE`

### Objetivo

Completar la gestión de vehículos.

### Tareas

* [ ] CRUD de vehículos.
* [ ] Asociación con sucursal.
* [ ] Estados.
* [ ] Información del vehículo.
* [ ] Integración API externa.
* [ ] Cache.
* [ ] Validaciones.
* [ ] Pruebas.
* [ ] Documentación.

---

# 8. Fase 4 — Gestión de solicitudes

**Estado:** `PENDIENTE`

### Objetivo

Implementar el flujo completo de solicitudes.

### Tareas

* [ ] Crear solicitud.
* [ ] Estado CREADA.
* [ ] Estado PENDIENTE.
* [ ] Priorización.
* [ ] Estado PRIORIZADA.
* [ ] Asignación.
* [ ] Estado ASIGNADA.
* [ ] Calendarización.
* [ ] Estado CALENDARIZADA.
* [ ] Despacho.
* [ ] Estado DESPACHADA.
* [ ] Entrega.
* [ ] Estado ENTREGADA.
* [ ] Finalización.
* [ ] Estado FINALIZADA.
* [ ] Rechazo.
* [ ] Cancelación.
* [ ] Validaciones de transición.
* [ ] Historial.
* [ ] Pruebas.
* [ ] Documentación.

---

# 9. Fase 5 — Logística

**Estado:** `PENDIENTE`

### Objetivo

Completar el proceso operativo de traslado.

### Tareas

* [ ] Recepción de solicitudes.
* [ ] Selección de destino.
* [ ] Validación de capacidad.
* [ ] Disponibilidad de estacionamiento.
* [ ] Fecha estimada.
* [ ] Fecha máxima.
* [ ] Ubicación.
* [ ] Despacho.
* [ ] Seguimiento.
* [ ] Entrega.
* [ ] Finalización.
* [ ] Pruebas.
* [ ] Documentación.

---

# 10. Fase 6 — Historial y trazabilidad

**Estado:** `PENDIENTE`

### Tareas

* [ ] Historial de solicitudes.
* [ ] Historial de estados.
* [ ] Usuario responsable.
* [ ] Fecha/hora.
* [ ] Acciones.
* [ ] Eventos importantes.
* [ ] Conservación de historial.
* [ ] Visualización.
* [ ] Pruebas.
* [ ] Documentación.

---

# 11. Regla para nuevas funcionalidades

Toda nueva funcionalidad debe agregarse al plan antes de comenzar su implementación cuando sea suficientemente grande como para afectar varios componentes o módulos.

Debe registrarse:

```text
Nombre
Objetivo
Módulo
Dependencias
Estado
Prioridad
Tareas
Criterios de aceptación
```

---

# 12. Plan específico de cada funcionalidad

Para una funcionalidad grande se debe crear una sección con:

## Nombre

### Objetivo

Qué problema resuelve.

### Estado

```text
PENDIENTE
```

### Módulo

Módulo afectado.

### Dependencias

Qué funcionalidades deben existir previamente.

### Archivos potencialmente afectados

Completar después del análisis del repositorio.

### Implementación

* [ ] Paso 1
* [ ] Paso 2
* [ ] Paso 3
* [ ] Paso 4

### Validación

* [ ] Caso exitoso.
* [ ] Caso inválido.
* [ ] Permisos.
* [ ] Errores.
* [ ] Integración.
* [ ] Regresión.

### Documentación

* [ ] Actualizar `BRAIN.md` si cambia el contexto permanente.
* [ ] Actualizar `PROJECT_STATUS.md`.
* [ ] Actualizar este plan.
* [ ] Crear documentación específica si corresponde.

---

# 13. Regla de cierre

Una funcionalidad no puede pasar a:

```text
COMPLETADA
```

hasta cumplir:

```text
Código
  +
Integración
  +
Validación
  +
Pruebas
  +
Documentación
```

Si falta alguna parte importante:

```text
EN_PROGRESO
```

o:

```text
PENDIENTE_REVISION
```

---

# 14. Registro de cambios

| Fecha | Funcionalidad | Acción | Estado |
| ----- | ------------- | ------ | ------ |
| —     | —             | —      | —      |

Registrar cambios importantes del plan.

---

# 15. Próxima tarea recomendada

La próxima tarea debe determinarse después de revisar:

1. `PROJECT_STATUS.md`.
2. Estado real del repositorio.
3. Dependencias.
4. Funcionalidades incompletas.
5. Prioridad empresarial.

No comenzar automáticamente una funcionalidad nueva solamente porque aparece como pendiente.

Primero debe comprobarse si existe una funcionalidad anterior incompleta que tenga prioridad.

---

# 16. Regla de continuidad entre sesiones

Cuando OpenCode comience una nueva sesión de trabajo debe poder ejecutar:

```text
Leer BRAIN.md
      ↓
Leer PROJECT_STATUS.md
      ↓
Leer IMPLEMENTATION_PLAN.md
      ↓
Analizar repositorio
      ↓
Comparar documentación vs código
      ↓
Determinar estado real
      ↓
Continuar desde el punto correcto
```

El objetivo es que una nueva sesión pueda continuar el desarrollo **sin depender del contexto de una conversación anterior**.
