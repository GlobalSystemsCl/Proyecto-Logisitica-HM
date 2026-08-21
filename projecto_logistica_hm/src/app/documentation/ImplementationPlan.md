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


El objetivo es que una nueva sesión pueda continuar el desarrollo **sin depender del contexto de una conversación anterior**.
