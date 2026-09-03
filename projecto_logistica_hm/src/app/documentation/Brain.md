# BRAIN — Sistema de Gestión de Vehículos H.Motores

> Documento principal de contexto del proyecto.
>
> Este documento contiene la visión, contexto, arquitectura, módulos, actores, reglas generales y decisiones estructurales del sistema.
>
> **No utilizar este documento como registro detallado del progreso.** El progreso debe mantenerse en `PROJECT_STATUS.md`, el trabajo planificado en `IMPLEMENTATION_PLAN.md` y el esquema de base de datos en `DATABASE_SCHEMA.md`.

---

# 1. Propósito

Este proyecto corresponde a una **plataforma empresarial interna para H.Motores**, orientada a gestionar y controlar el flujo operativo relacionado con vehículos entre sucursales.

El sistema permite registrar solicitudes, gestionar vehículos, coordinar traslados, asignar responsables y mantener trazabilidad sobre las operaciones realizadas.

El sistema **no es un CRM ni un ERP**.

Su objetivo principal es representar y controlar el flujo operativo interno de gestión y traslado de vehículos.

Durante la etapa actual se está desarrollando un **MVP**, por lo que los vehículos serán incorporados manualmente al sistema por usuarios autorizados.

---

# 2. Objetivos principales

El sistema debe permitir:

* Gestionar usuarios internos.
* Controlar el acceso según roles.
* Gestionar vehículos incorporados manualmente.
* Crear y gestionar solicitudes.
* Priorizar solicitudes.
* Asignar solicitudes a logística.
* Calendarizar traslados.
* Gestionar el despacho de vehículos.
* Registrar la entrega del vehículo.
* Finalizar formalmente la entrega.
* Mantener trazabilidad de las acciones.
* Controlar permisos según rol.
* Mantener información histórica.
* Validar manualmente los datos de los vehículos ingresados al sistema.

Durante el MVP no se contempla la integración con una API externa de vehículos.

---

# 3. Actores del sistema

Actualmente existen cuatro actores principales:

| Rol           | Responsabilidad general                                                          |
| ------------- | -------------------------------------------------------------------------------- |
| Administrador | Administración general del sistema, usuarios y vehículos                         |
| Ejecutivo     | Gestión relacionada con vehículos y solicitudes                                  |
| Jefe de Local | Gestión y aprobación desde sucursal, además de incorporación manual de vehículos |
| Logística     | Gestión de traslados, coordinación logística e incorporación manual de vehículos |

Los permisos específicos de cada rol deben documentarse y mantenerse actualizados conforme avance el proyecto.

---

# 4. Principio fundamental del proyecto

El sistema debe representar un **flujo operativo controlado**.

Cada funcionalidad debe integrarse con las demás y respetar:

* Estados.
* Roles.
* Permisos.
* Reglas de negocio.
* Relaciones entre entidades.
* Historial.
* Trazabilidad.

No implementar funcionalidades aisladas que contradigan el flujo general del sistema.

---

# 5. Módulos principales

El sistema está compuesto conceptualmente por los siguientes módulos:

## 5.1 Autenticación y usuarios

Responsable de:

* Inicio de sesión corporativo vía Supabase Email.
* Gestión centralizada de cuentas por Administrador (sin autoregistro público).
* Roles del sistema (`administrador`, `ejecutivo`, `jefe_local`, `logistica`).
* Generación de contraseñas provisorias y envío automático por correo electrónico vía **Brevo API**.
* Establecimiento obligatorio de contraseña personal definitiva en el primer ingreso (`/establecer-clave`).
* Control de activación/desactivación en tiempo real (usuarios inactivos no pueden iniciar sesión).
* Protección contra intentos excesivos de acceso con bloqueo temporal de 15 minutos tras 5 intentos fallidos consecutivos.
* Recuperación y reseteo de contraseñas.
* Soporte para dominio de pruebas (`@gmail.com`) y corporativo (`@hmotores.cl`).

---

## 5.2 Gestión de vehículos

Responsable de:

* Registro manual de vehículos.
* Consulta de vehículos.
* Edición de vehículos.
* Estado del vehículo.
* Asociación del vehículo con una sucursal.
* Validación de los datos ingresados.
* Control de usuarios autorizados para incorporar vehículos.

Durante el MVP, los vehículos serán incorporados manualmente por:

* Administradores.
* Jefes de Local.
* Usuarios de Logística.

No se contempla el uso de una API externa de vehículos durante esta etapa.

---

## 5.3 Gestión de solicitudes

Responsable de:

* Crear solicitudes.
* Visualizar solicitudes.
* Gestionar estados.
* Priorizar.
* Asignar.
* Calendarizar.
* Gestionar traslados.
* Finalizar procesos.

---

## 5.4 Gestión de sucursales

Responsable de:

* Sucursales.
* Relación con vehículos.
* Capacidad de estacionamiento.
* Sucursal origen.
* Sucursal destino.
* Información necesaria para logística.

---

## 5.5 Gestión logística

Responsable de:

* Recepción de solicitudes asignadas.
* Determinación del traslado.
* Sucursal destino.
* Disponibilidad de estacionamiento.
* Fecha estimada.
* Fecha máxima.
* Ubicación del vehículo.
* Despacho.
* Entrega.
* Incorporación manual de vehículos cuando corresponda.

---

## 5.6 Historial y trazabilidad

Responsable de mantener información sobre:

* Cambios de estado.
* Usuarios responsables.
* Fechas.
* Acciones realizadas.
* Eventos importantes.
* Registro de incorporación y modificación de vehículos.

La información histórica debe conservarse incluso cuando un usuario posteriormente sea desactivado.

---

# 6. Flujo principal del sistema

El flujo general actualmente definido es:

```text
PENDIENTE_APROBACION (ejecutivo crea)
   ↓ aprueba jefe_local
APROBADA
   ↓ prioriza jefe_local
PRIORIZADA
   ↓ calendariza jefe_local/logística
CALENDARIZADA
   ↓ despacha logística
EN_TRANSITO
   ↓ recibe jefe_local
ENTREGADA
   ↓ finaliza jefe_local
FINALIZADA
```

Estados adicionales:

```text
RECHAZADA  (jefe_local rechaza solicitud pendiente_aprobacion)
CANCELADA  (desde pre-despacho, con motivo)
```

> Los valores corresponden exactamente al enum `estado_solicitud` de la base de datos (`DATABASE_SCHEMA.md`, sección 5.0). No existe `CREADA` en el modelo actual: una solicitud nace como `pendiente_aprobacion` (ejecutivo) o `aprobada` (jefe_local). `RECHAZADA` se usa cuando el jefe_local rechaza una solicitud pendiente.

---

# 7. Definición de estados

Los estados se representan en la base de datos mediante el enum `public.estado_solicitud`.

## PENDIENTE_APROBACION

La solicitud fue creada por un ejecutivo y espera aprobación del jefe_local. Estado inicial cuando el ejecutivo crea la solicitud.

---

## APROBADA

La solicitud fue aprobada por el jefe_local (o creada directamente por él con fecha de entrega).

---

## PRIORIZADA

La solicitud fue priorizada por el Jefe de Local y está en la cola de prioridad de su sucursal.

---

## ASIGNADA

Estado definido en el enum pero sin transición implementada actualmente. `logistica_id` se fija implícitamente al calendarizar.

---

## CALENDARIZADA

La solicitud tiene una fecha tentativa definida para el traslado.

---

## EN_TRANSITO

El vehículo se encuentra en tránsito hacia la sucursal destino.

---

## ENTREGADA

El vehículo llegó a la sucursal destino y fue recibido por el jefe_local.

---

## FINALIZADA

El Jefe de Local de destino confirmó y finalizó formalmente la entrega del vehículo.

Este es el último estado exitoso del flujo.

---

## RECHAZADA

La solicitud fue rechazada por el jefe_local. Se registra con motivo.

---

## CANCELADA

La solicitud fue cancelada (incluye rechazos). El motivo se registra en `motivo_cancelacion`.

Debe conservarse el historial de la cancelación.

---

# 8. Reglas generales de negocio

Las reglas de negocio deben documentarse antes de implementar funcionalidades que las afecten.

Reglas actualmente conocidas:

* Las cuentas son administradas por Administradores.
* No existe registro público.
* Los usuarios utilizan correo corporativo `@hmotores.cl`.
* Los permisos dependen del rol.
* Un usuario desactivado no puede iniciar sesión.
* La información histórica debe conservarse.
* Los vehículos son incorporados manualmente al sistema.
* Los vehículos pueden estar asociados a una sucursal.
* Los Administradores pueden incorporar vehículos manualmente.
* Los Jefes de Local pueden incorporar vehículos manualmente.
* Los usuarios de Logística pueden incorporar vehículos manualmente.
* El Ejecutivo no incorpora vehículos, salvo que esta regla sea modificada posteriormente.
* El flujo de solicitudes debe respetar sus estados.
* Una solicitud puede eliminarse únicamente antes de su despacho (estados `pendiente`, `priorizada`, `asignada`, `calendarizada`), por el Administrador, el ejecutivo que la creó o el jefe_local de la sucursal de origen. Desde `en_transito` en adelante ninguna persona puede eliminarla. Las solicitudes en estado `cancelada` nunca se eliminan: quedan como registro histórico.
* Logística gestiona el traslado.
* La sucursal destino debe tener disponibilidad para recibir el vehículo cuando corresponda.
* La entrega debe ser confirmada por la sucursal destino.
* La entrega debe finalizarse formalmente después de ser marcada como entregada.
* Los datos de los vehículos deben validarse antes de guardarse.
* Los estados de las solicitudes se representan mediante el enum `estado_solicitud` de la base de datos (`pendiente_aprobacion`, `aprobada`, `rechazada`, `pendiente`, `priorizada`, `asignada`, `calendarizada`, `en_transito`, `entregada`, `finalizada`, `cancelada`). La documentación se adapta al esquema real, no al revés.
* El flujo principal es: `pendiente_aprobacion` → `aprobada` → `priorizada` → `calendarizada` → `en_transito` → `entregada` → `finalizada`. El estado `asignada` existe en el enum pero no se produce actualmente.
* Calendarizar asigna `logistica_id` y `fecha_tentativa_despacho`. Despachar registra `fecha_despacho`. Recibir registra `fecha_entrega`. Finalizar es el cierre formal.
* Durante el MVP no se utilizará una API externa de vehículos.
* No se debe implementar lógica de integración, sincronización o cache relacionada con una API externa de vehículos.

Las nuevas reglas deben agregarse aquí cuando sean aprobadas y pasen a formar parte de las reglas generales del sistema.

---

# 9. Arquitectura

La arquitectura definida actualmente contempla:

```text
Frontend
Next.js
   │
   ▼
Service Layer
Next.js
   │
   ├──► Repository / Data Access
   │          │
   │          ▼
   │       Supabase
   │
   └──► Gestión manual de vehículos
```

La arquitectura debe mantener separación de responsabilidades.

Durante el MVP no se contempla una capa de integración con una API externa de vehículos.

---

# 10. Frontend

Tecnología principal:

* Next.js
* React
* TypeScript
* Tailwind CSS

Responsabilidades:

* Interfaz.
* Navegación.
* Formularios.
* Visualización.
* Experiencia de usuario.
* Consumo de servicios.
* Formularios para incorporación y edición manual de vehículos.

El frontend no debe contener reglas críticas de seguridad como única barrera.

## 10.1 Identidad visual (convención obligatoria)

Sistema monocromo corporativo definido el 2026-08-25: **~90% blanco / 10% negro**.

* Fondos de página: `bg-neutral-100`. Superficies/tarjetas: `bg-white` con borde `border-neutral-200`.
* Texto principal `text-neutral-900`; jerarquía secundaria `neutral-500` / `neutral-400`.
* El negro (`neutral-900`) es el único acento: botones primarios, badge de rol Administrador, tarjeta destacada "Activos", avatares, tile del escudo. Blanco como texto solo sobre fondo negro.
* Rojo semántico únicamente para errores o acciones destructivas (`red-50`/`red-200`/`red-600`/`red-700`). Estados de éxito se expresan con bloque negro + texto blanco; no usar verde.
* Badges de rol por jerarquía tonal: administrador = negro sólido, jefe_local = `neutral-700`, ejecutivo = `neutral-200`, logistica = `neutral-100`.
* Sin modo oscuro automático: tokens fijos en `globals.css` (`--background #ffffff`, `--foreground #171717`).
* Logo corporativo: `public/images.png` (escudo blanco y negro). Se usa con `next/image` y clase `mix-blend-multiply` para fundir su fondo blanco sobre superficies claras. Ubicaciones actuales: login, top bar del dashboard, header del módulo admin.
* Toda página nueva debe seguir esta convención; no introducir colores fuera de la escala neutral salvo el rojo semántico.

---

# 11. Service Layer

La capa de servicios debe centralizar la lógica de negocio.

Responsabilidades:

* Validaciones.
* Reglas de negocio.
* Orquestación de operaciones.
* Comunicación con repositorios.
* Control de flujo.
* Gestión de la incorporación manual de vehículos.
* Validación de permisos para crear y editar vehículos.

Los componentes de UI no deberían contener lógica empresarial compleja.

Durante el MVP no se contempla comunicación con APIs externas de vehículos.

---

# 12. Repository / acceso a datos

La capa de acceso a datos debe encargarse de interactuar con:

* Supabase.
* PostgreSQL.
* Tablas.
* Consultas.
* Funciones necesarias.
* Persistencia de vehículos ingresados manualmente.

La lógica de negocio no debería quedar mezclada directamente con las consultas de base de datos.

---

# 13. Supabase

Supabase se utiliza como parte de la infraestructura del sistema.

Actualmente puede encargarse de:

* PostgreSQL.
* Autenticación.
* Storage cuando sea necesario.
* Row Level Security.
* Persistencia de datos.
* Almacenamiento de vehículos incorporados manualmente.
* Registro de historial y trazabilidad.

El espejo del esquema de base de datos se mantiene en `DATABASE_SCHEMA.md`. Las reglas del modelo de datos están definidas en la sección 15.

---

# 14. Incorporación manual de vehículos

Durante el MVP, los vehículos serán registrados directamente por usuarios autorizados dentro del sistema.

Los roles autorizados son:

* Administrador.
* Jefe de Local.
* Logística.

La incorporación manual debe contemplar:

* Formulario de registro.
* Validación de campos obligatorios.
* Validación de formato de datos.
* Asociación con una sucursal cuando corresponda.
* Registro del usuario que incorporó el vehículo.
* Fecha y hora de incorporación.
* Posibilidad de editar la información según permisos.
* Historial de modificaciones importantes.

Los campos definitivos del vehículo deben definirse según el modelo de datos aprobado para el MVP.

No se debe depender de información obtenida desde servicios externos.

---

# 15. Base de datos

Entidades principales conocidas:

```text
Usuario
Vehículo
Solicitud
Sucursal
SolicitudVehículo (tabla puente N:M)
Auditoría
Observación
Notificación
```

La estructura definitiva debe mantenerse documentada en la documentación correspondiente de base de datos (`DATABASE_SCHEMA.md`).

Reglas del modelo de datos:

* La documentación de la base de datos debe mantener correspondencia **1:1** con el esquema real de Supabase.
* Cada tabla existente debe documentarse en estilo DDL, con su sentencia `CREATE TABLE` completa, **como si se estuviera creando el esquema**, incluyendo tipos, restricciones, llaves foráneas e índices.
* No está permitido documentar las tablas mediante consultas `SELECT`, capturas del dashboard ni descripciones informales.
* Cualquier cambio de esquema aplicado en Supabase debe reflejarse en `DATABASE_SCHEMA.md` dentro de la misma tarea.
* El archivo `esquema-completo-sql.sql` (raíz del repo) es el espejo 1:1 del esquema VIVO de Supabase (enums, tablas, constraints, índices, funciones, triggers, RLS, comentarios con nombres exactos del servidor). Debe actualizarse en la misma tarea en que se aplique cualquier cambio de esquema. Para esto se usa la skill **`sincronizar-esquema-sql`** (`.opencode/skills/sincronizar-esquema-sql/SKILL.md`), que describe el procedimiento de extracción y actualización.

No asumir nuevas entidades sin analizar primero el modelo existente.

La entidad `Vehículo` debe permitir almacenar información ingresada manualmente y mantener, cuando corresponda, los datos de auditoría relacionados con su creación y modificación.

---

# 16. Principios de desarrollo

Todo desarrollo debe seguir estos principios:

### 16.1 Analizar antes de modificar

Antes de implementar una funcionalidad importante:

1. Revisar el estado actual del proyecto.
2. Revisar la documentación.
3. Revisar el código existente.
4. Revisar la base de datos.
5. Revisar las dependencias con otros módulos.
6. Identificar funcionalidades incompletas.
7. Identificar posibles regresiones.
8. Crear o actualizar el plan de implementación.

---

### 16.2 No dejar funcionalidades a medias

Una funcionalidad no debe considerarse terminada simplemente porque:

* Existe la interfaz.
* Existe el endpoint.
* Existe la tabla.
* Compila.

Debe verificarse el flujo completo.

---

### 16.3 Documentación como parte del desarrollo

Toda funcionalidad importante implementada debe actualizar la documentación correspondiente.

La documentación no debe realizarse únicamente al final del proyecto.

---

### 16.4 Mantener trazabilidad

Debe ser posible determinar:

```text
Qué se implementó
↓
Por qué se implementó
↓
Dónde se implementó
↓
Qué módulos afecta
↓
Qué falta
↓
Cuál es el siguiente paso
```

---

### 16.5 Priorizar el alcance del MVP

Durante el MVP se debe priorizar:

* Gestión manual de vehículos.
* Flujo principal de solicitudes.
* Roles y permisos esenciales.
* Traslados entre sucursales.
* Historial y trazabilidad básica.

No se deben implementar integraciones externas que no formen parte del alcance actual.

---

# 17. Documentación relacionada

La documentación principal del proyecto se organiza de la siguiente manera:

```text
src/app/documentation/
├── BRAIN.md
├── PROJECT_STATUS.md
├── IMPLEMENTATION_PLAN.md
├── DATABASE_SCHEMA.md
└── auditoria_esquema_supabase.sql (script auxiliar de volcado/auditoría)
```

Además, en la raíz del repo:

```text
esquema-completo-sql.sql        (espejo 1:1 del esquema VIVO de Supabase)
.opencode/skills/sincronizar-esquema-sql/SKILL.md   (skill que mantiene ese espejo actualizado)
```

Y en `src/app/documentation/`:

```text
RequisitosModulos.md            (requisitos específicos por módulo, conexiones, flujos y cambios)
.opencode/skills/requisitos-modulos/SKILL.md        (skill que mantiene ese documento actualizado)
```

### BRAIN.md

Contexto permanente del proyecto.

### PROJECT_STATUS.md

Estado real del proyecto.

### IMPLEMENTATION_PLAN.md

Plan de implementación y seguimiento de tareas.

### DATABASE_SCHEMA.md

Espejo 1:1 del esquema de Supabase, documentado con sentencias `CREATE TABLE`.

### esquema-completo-sql.sql

Espejo completo y exacto del esquema VIVO de Supabase (extensión del esquema `DATABASE_SCHEMA.md`). Su mantenimiento está automatizado por la skill `sincronizar-esquema-sql`.

### RequisitosModulos.md

Documento único de requisitos específicos por módulo: qué hace, cómo funciona, a qué pertenece, con qué se conecta, estado real, historial de cambios y flujo de interacción entre módulos. Su mantenimiento está automatizado por la skill `requisitos-modulos`. Todo cambio de módulo, requisito o flujo se registra aquí en la misma tarea.

---

# 18. Regla para IA / OpenCode

Antes de implementar una funcionalidad grande, la IA debe:

1. Leer `BRAIN.md`.
2. Leer `PROJECT_STATUS.md`.
3. Leer `IMPLEMENTATION_PLAN.md`.
4. Analizar el repositorio.
5. Determinar en qué estado se encuentra realmente el proyecto.
6. Comparar el código existente con la documentación.
7. Identificar trabajo incompleto.
8. Identificar dependencias.
9. Actualizar el plan.
10. Implementar.
11. Verificar.
12. Actualizar la documentación.

### Carga selectiva de documentación

Para no desperdiciar contexto, los documentos se cargan según el tipo de tarea:

| Tipo de tarea                        | Lectura obligatoria     | Lectura adicional                                    |
| ------------------------------------ | ----------------------- | ---------------------------------------------------- |
| Cualquier tarea                      | `BRAIN.md`              |                                                      |
| Implementar una funcionalidad        | `IMPLEMENTATION_PLAN.md`| Módulo correspondiente en `PROJECT_STATUS.md`        |
| Cambiar/agregar módulos o requisitos | `RequisitosModulos.md`  | Actualizar `ProjectStatus.md` y aplicar la skill `requisitos-modulos` |
| Trabajar con datos o repositorios    | `DATABASE_SCHEMA.md`    |                                                      |
| Modificar el esquema de Supabase     | `DATABASE_SCHEMA.md`    | `PROJECT_STATUS.md` para registrar el cambio; skill `sincronizar-esquema-sql` para mantener `esquema-completo-sql.sql` 1:1 |
| Auditar o retomar el proyecto        | Los cuatro documentos   | Código real del repositorio                          |

Reglas de esta tabla:

* `BRAIN.md` es el único documento de lectura obligatoria siempre.
* La carga selectiva no reemplaza el análisis del código real (pasos anteriores).
* Si un documento relevante no ha sido leído y la tarea lo requiere según esta tabla, debe leerse antes de implementar.
* Para funcionalidades grandes rige además la secuencia completa definida al inicio de esta sección.

Nunca asumir que la documentación representa automáticamente el estado real del código.

El código y la estructura real del proyecto tienen prioridad para determinar el estado técnico actual.

La documentación debe actualizarse después de verificar el código.

Durante el MVP, OpenCode no debe proponer ni implementar:

* Integración con una API externa de vehículos.
* Sincronización automática de vehículos.
* Cache de información proveniente de una API externa.
* Servicios externos para completar automáticamente los datos de vehículos.

Si encuentra código relacionado con una API de vehículos, debe registrarlo como trabajo fuera del alcance del MVP o como deuda técnica, sin incorporarlo al flujo principal actual.

---

# 19. Regla de continuidad

El proyecto debe poder retomarse después de semanas o meses sin depender de memoria de la IA o del desarrollador.

Una nueva sesión debe poder determinar:

```text
¿Qué es el proyecto?
        ↓
¿Qué módulos existen?
        ↓
¿Qué está terminado?
        ↓
¿Qué está en progreso?
        ↓
¿Qué está pendiente?
        ↓
¿Qué quedó incompleto?
        ↓
¿Qué debemos hacer ahora?
```

Esta es una de las funciones principales de la documentación del proyecto.
