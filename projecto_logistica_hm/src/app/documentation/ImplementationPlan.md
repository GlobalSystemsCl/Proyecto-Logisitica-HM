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
* [ ] Volcar el esquema real de Supabase a `DATABASE_SCHEMA.md` con sentencias `CREATE TABLE` (correspondencia 1:1).
* [ ] Verificar que cada tabla existente en Supabase esté documentada como DDL y ninguna tabla documentada falte en Supabase.
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
