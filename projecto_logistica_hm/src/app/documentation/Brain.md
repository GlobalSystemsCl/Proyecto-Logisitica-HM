# BRAIN — Sistema de Gestión de Vehículos H.Motores

> Documento principal de contexto del proyecto.
>
> Este documento contiene la visión, contexto, arquitectura, módulos, actores, reglas generales y decisiones estructurales del sistema.
>
> **No utilizar este documento como registro detallado del progreso.** El progreso debe mantenerse en `PROJECT_STATUS.md` y el trabajo planificado en `IMPLEMENTATION_PLAN.md`.

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

* Login.
* Gestión de cuentas.
* Roles.
* Activación/desactivación.
* Recuperación de contraseña.
* Seguridad.
* Control de acceso.

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

Estados adicionales:

```text
RECHAZADA
CANCELADA
```

---

# 7. Definición de estados

## CREADA

La solicitud fue registrada en el sistema.

---

## PENDIENTE

La solicitud existe pero todavía no ha sido priorizada.

---

## PRIORIZADA

La solicitud fue priorizada por el Jefe de Local.

---

## ASIGNADA

La solicitud pasó al área de Logística para su gestión.

---

## CALENDARIZADA

La solicitud tiene una fecha tentativa definida para el traslado.

---

## DESPACHADA

El vehículo se encuentra en proceso de traslado.

---

## ENTREGADA

El vehículo llegó a la sucursal destino.

---

## FINALIZADA

El Jefe de Local de destino confirmó y finalizó formalmente la entrega del vehículo.

Este es el último estado exitoso del flujo.

---

## RECHAZADA

La solicitud fue rechazada.

Debe registrarse quién realizó la acción y cuándo corresponda.

---

## CANCELADA

La solicitud fue cancelada.

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
* Logística gestiona el traslado.
* La sucursal destino debe tener disponibilidad para recibir el vehículo cuando corresponda.
* La entrega debe ser confirmada por la sucursal destino.
* La entrega debe finalizarse formalmente después de ser marcada como entregada.
* Los datos de los vehículos deben validarse antes de guardarse.
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
```

La estructura definitiva debe mantenerse documentada en la documentación correspondiente de base de datos.

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
/docs/
├── BRAIN.md
├── PROJECT_STATUS.md
└── IMPLEMENTATION_PLAN.md
```

### BRAIN.md

Contexto permanente del proyecto.

### PROJECT_STATUS.md

Estado real del proyecto.

### IMPLEMENTATION_PLAN.md

Plan de implementación y seguimiento de tareas.

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
