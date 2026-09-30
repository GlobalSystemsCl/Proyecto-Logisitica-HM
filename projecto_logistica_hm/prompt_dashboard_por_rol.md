# PROMPT DE IMPLEMENTACIÓN — Dashboard por rol, cards de navegación y eliminación del TopNavbar

> **Este documento es un prompt de trabajo.** No es documentación del estado actual: describe **lo que se debe construir**. Al ejecutarlo, los requisitos deben volcarse a `src/app/documentation/RequisitosModulos.md` con los IDs, conexiones e historial que exige la skill `requisitos-modulos`.
>
> **Base de análisis**: código real del repo al 2026-09-30 (rama `main` + `maickol-29.09`).
> **Alcance de este prompt**: reorganización de la documentación de requisitos, rediseño del dashboard por rol como único centro de navegación, eliminación del TopNavbar en todo el sistema, feed de prioridades para el jefe de local, panel de motivo de rechazo y corrección de la actualización de slots por sucursal.
> **Fuera de alcance**: migración de esquema de BD (el motivo de rechazo se sigue leyendo de la observación `[RECHAZO]`; ver `D-1`), rediseño de la paleta de color del sistema.

---

## 0. Contexto del proyecto (léase antes de tocar nada)

Sistema interno de H.Motores para **gestionar, aprobar, priorizar y trazar el traslado de vehículos entre sucursales**. Stack: Next.js (App Router, Server Actions) + Supabase (Postgres + Auth + Storage) + Tailwind + lucide-react + Vitest.

**Roles** (`src/types/auth.types.ts`): `administrador`, `ejecutivo`, `jefe_local`, `logistica`, `operaciones`.

**Alcance por rol de las solicitudes** (`SolicitudesService.getSolicitudesFiltradas`, `src/services/solicitudes.service.ts:347`):

| Rol | Alcance de datos | Puede crear solicitud |
|---|---|---|
| `administrador` | todas | sí |
| `ejecutivo` | solo las que él creó (`ejecutivo_id = userId`) | sí |
| `jefe_local` | sucursal origen **o** destino de las sucursales a su cargo (`OrganizacionService.getUserAssignedBranches`) | sí |
| `logistica` | solicitudes cuya sucursal origen pertenece a sus zonas (`getSolicitudesPorZonas`) | no |
| `operaciones` | `[]` (sin solicitudes) | no |

**Ciclo de vida de la solicitud** (`estado_solicitud`): `pendiente_aprobacion` → `aprobada` | `rechazada` → `pendiente` → `priorizada` → `calendarizada` → `despachada`/`en_transito` → `entregada` → `finalizada`, con `cancelada` como salida transversal.

**Rutas actuales y su acceso real** (verificado en los `page.tsx`):

| Ruta | Acceso |
|---|---|
| `/dashboard` | todos los autenticados |
| `/solicitudes` | `administrador`, `jefe_local`, `ejecutivo`, `logistica` |
| `/solicitudes/aprobaciones` | `jefe_local`, `administrador`, `ejecutivo` |
| `/solicitudes/prioridades` | `jefe_local`, `administrador` |
| `/solicitudes/traslados` | `administrador`, `logistica`, `jefe_local` |
| `/logistica/calendarizaciones` | `jefe_local`, `logistica`, `administrador` |
| `/logistica/slots` | `jefe_local`, `administrador` (badge del navbar) |
| `/admin/vehiculos` | `administrador`, `jefe_local`, `logistica`, `operaciones` |
| `/admin/usuarios`, `/admin/sucursales`, `/admin/historial` | `administrador` |
| `/perfil`, `/faq` | autenticados |

**Puntos de entrada actuales del TopNavbar** (13 archivos, a eliminar según `R-2`):
`src/app/dashboard/page.tsx`, `src/app/faq/page.tsx`, `src/app/perfil/page.tsx`, `src/app/admin/historial/page.tsx`, `src/app/admin/sucursales/page.tsx`, `src/app/admin/usuarios/page.tsx`, `src/app/admin/vehiculos/page.tsx`, `src/app/logistica/calendarizaciones/page.tsx`, `src/app/logistica/slots/page.tsx`, y los 4 sub-módulos de solicitudes vía `SolicitudesHeader` (`src/app/solicitudes/page.tsx`, `.../aprobaciones`, `.../prioridades`, `.../traslados`).

**Pestañas que hoy funcionan como navegación** (`SolicitudesHeader`, `src/components/SolicitudesHeader.tsx:35-48`): `General`, `Traslados`, `Aprobaciones`, `Prioridades`. Son los "labels" que deben convertirse en cards del dashboard.

---

## 1. Reglas obligatorias del proyecto

1. El código, la BD y la UI mandan; la documentación se corrige para reflejar lo implementado, nunca al revés.
2. **Toda función, método o helper nuevo lleva su test unitario en el mismo cambio** (`tests/unitarios/`, alias `@` → `src`). Convenciones: `describe` por función, nombres `should_<resultado>_when_<condición>`, casos positivo/negativo/edge, `vi.clearAllMocks()` en `beforeEach`, sin `test.only`/`test.skip`. Funciones puras (helpers de nomenclatura de cards, extractores de motivo, cálculo de slots libres) **no se mockean**: se prueban directamente.
3. Cerrar cada bloque con `npx tsc --noEmit` y `npm run lint`. Cerrar la tarea con `npm run test`.
4. **No agregar comentarios en el código** salvo que se pidan explícitamente.
5. Mantener el estilo del repo: Server Components por defecto, `'use client'` solo donde haya estado/interactividad, Server Actions para mutaciones, Tailwind con la paleta neutra existente (`#1a2b4b`, `bg-[#f4f6f9]`, bordes `neutral-200`).
6. Todo cambio funcional se registra en `RequisitosModulos.md` (historial del módulo + registro global) con fecha ISO.
7. Si un cambio toca el esquema de BD → usar además la skill `sincronizar-esquema-sql`. **En este prompt no hay cambios de esquema** (ver `D-1`).

---

## 2. `R-DOC` — Reorganizar los requisitos de `RequisitosModulos.md` por módulo

**Problema actual**: el documento enumera 15 módulos en orden cronológico de creación (secciones 2..15). Solicitudes está partida en tres secciones no contiguas (6, 7, 8), Logística operative está en 9, y no hay índice navegable. No se entiende "qué módulo hace qué" sin leerlo completo, ni hay un mapa rol → rutas → cards.

**Requisito**: reagrupar el documento en **macro-módulos**, cada uno con sus sub-módulos, preceded by a navigable index, and keeping all existing requirement IDs and history intact.

### `R-DOC.1` — Estructura objetivo

```text
# REQUISITOS DE MÓDULOS — Sistema de Gestión de Vehículos H.Motores

PARTE 0 — Cómo usar este documento
  0.1 Índice navegable (tabla: Parte → Módulo → Requisitos → Ruta)
  0.2 Convenciones (IDs R-<MODULO>.<n>, estados, plantilla de módulo, fechas)
  0.3 Glosario de términos del negocio (solicitud, sucursal, slot, cola de
      prioridad, calendarización, traslado, logística, jornada)

PARTE 1 — Contexto del sistema
  1.1 Qué es el sistema y para qué existe (1 párrafo de negocio)
  1.2 Actores y permisos (tabla de roles y alcance)
  1.3 Mapa de rutas por módulo
  1.4 Mapa de rutas por rol  ← NUEVO (ver R-DOC.3)
  1.5 Flujo global de interacción entre módulos (diagrama ASCII)
  1.6 Estados de una solicitud y quién transiciona
  1.7 Puntos de entrada al sistema tras el rediseño (dashboard sin TopNavbar)

PARTE 2 — Identidad y seguridad
  2.1 Autenticación y Seguridad (antes §2)
  2.2 Perfil de Usuario (antes §14)

PARTE 3 — Administración
  3.1 Gestión de Usuarios (antes §3)
  3.2 Gestión de Vehículos (antes §4)
  3.3 Gestión de Sucursales (antes §5)
  3.4 Organización Territorial — Zonas (antes §15)

PARTE 4 — Solicitudes
  4.1 Creación de solicitudes (antes §6)
  4.2 Aprobación y rechazo (antes §7)
  4.3 Priorización y cola por sucursal (antes §8)
  4.4 Detalle, trazabilidad, observaciones y documentos (nuevo, agrupa lo
      disperso en SolicitudesClient/SolicitudDetalleModal)
  4.5 Documentación de requisitos agrupada por módulo ← ver R-DOC.2

PARTE 5 — Logística y Traslados
  5.1 Logística Operativa: calendarización y despacho (antes §9)
  5.2 Traslados internos (/solicitudes/traslados)
  5.3 Slots de estacionamiento por sucursal (antes disperso en §4/§5)

PARTE 6 — Paneles de Control
  6.1 Dashboard por rol (antes §12, ampliado con R-DASH.*)

PARTE 7 — Soporte y plataforma
  7.1 Auditoría e Historial (antes §10)
  7.2 Notificaciones — deshabilitado (antes §11)
  7.3 Correo (Brevo) (antes §13)
  7.4 FAQ

PARTE 8 — Registro global de cambios (antes §16) y Referencias (antes §17)
```

### `R-DOC.2` — Reglas de la reorganización

1. **Ningún requisito se elimina ni se reutiliza**: los IDs existentes (`R-AUTH.*`, `R-SOL-CRE.*`, `R-SOLAPR.*`, `R-SOLPRIO.*`, `R-LOG.*`, `R-AUD.*`, `R-DASH.*`, `R-ORG.*`, `R-PERF.*`, `R-VEH.*`, `R-SUC.*`, `R-EMAIL.*`) se conservan textualmente. Si un requisito cambia de comportamiento, se marca como **modificado** con nota y se crea uno nuevo con ID libre.
2. **El historial no se toca**: las tablas `| Fecha | Cambio | Motivo |` de cada módulo se mantienen, se reubican bajo su módulo y se anteponen las filas nuevas.
3. **Todas las referencias cruzadas se renumeran**: p. ej. "ver sección 16" pasa a "ver Parte 8 — Registro global de cambios", y "§7" a "Parte 4.2". Buscar el texto viejo antes de dar por terminada la tarea.
4. Cada módulo nuevo (4.4, 5.2, 5.3, 6.1 ampliado) se crea con la **plantilla de módulo** definida en la skill `requisitos-modulos`.
5. Encabezado de cada módulo con una línea de **"Qué hace en una frase en lenguaje de negocio"** antes del detalle técnico: ayuda a leer el documento sin entrar en la implementación.

### `R-DOC.3` — Nuevo contexto de negocio en la Parte 1

Agregar la tabla **rol → rutas accesibles → cards del dashboard**, que es la fuente de verdad compartida entre código y documentación:

| Rol | Cards del dashboard (nombre visible) | Ruta |
|---|---|---|
| `administrador` | Gestión de Usuarios · Gestión de Vehículos · Gestión de Solicitudes · Gestión de Zonas y Sucursales · Gestión Logística · Historial y Trazabilidad | `/admin/usuarios`, `/admin/vehiculos`, `/solicitudes`, `/admin/sucursales`, `/logistica/calendarizaciones`, `/admin/historial` |
| `jefe_local` | Solicitudes · Aprobaciones · Prioridades · Traslados · Logística | `/solicitudes`, `/solicitudes/aprobaciones`, `/solicitudes/prioridades`, `/solicitudes/traslados`, `/logistica/calendarizaciones` |
| `ejecutivo` | *(sin cards: `/dashboard` lo redirige a `/solicitudes`, su página principal)* | `/solicitudes` |
| `logistica` | Solicitudes · Traslados · Calendarización de traslados | `/solicitudes`, `/solicitudes/traslados`, `/logistica/calendarizaciones` |
| `operaciones` | Carga de vehículos | `/admin/vehiculos` |

`operaciones` **no** tiene cards de solicitudes porque `getSolicitudesFiltradas` devuelve `[]` para ese rol y `/solicitudes` no le está permitido.

---

## 3. `R-DASH` — El dashboard es el único centro de navegación

### `R-DASH.1` — Catálogo único de cards por rol

Extraer la definición de las cards del JSX inline de `src/app/dashboard/page.tsx` (líneas 166-251) a un módulo de configuración puro y testeable, por ejemplo `src/config/dashboard-cards.ts`:

```ts
export type DashboardCardGrupo = 'gestion' | 'operacion' | 'soporte';

export interface DashboardCard {
  clave: string;                 // id estable, p. ej. 'vehiculos'
  href: string;
  icono: string;                 // nombre del icono lucide (string, no componente,
                                 // para que el catálogo sea serializable y testeable)
  grupo: DashboardCardGrupo;
  tituloAdmin: string;           // nomenclatura "Gestión de X" (solo administrador)
  tituloPorRol: Partial<Record<UserRole, string>>;  // nomenclatura del rol
  descripcion: string;
  acciones: string[];            // bullets "qué se puede hacer acá"
  soloAdmin?: boolean;
}

export const DASHBOARD_CARDS: DashboardCard[];
export function cardsPorRol(rol: UserRole): DashboardCard[];
export function tituloDeCard(card: DashboardCard, rol: UserRole): string;
```

Reglas del catálogo:

1. **El `administrador` conserva la nomenclatura de gestión**: "Gestión de Usuarios", "Gestión de Vehículos", "Gestión de Solicitudes", "Gestión de Zonas y Sucursales", "Historial y Trazabilidad", "Gestión Logística". Nunca ve la nomenclatura operativa.
2. **Cada rol no administrador ve las cards asignadas a su rol con nomenclatura propia** (ver `R-DASH.2`), y **cada card lleva descripción de qué hace el módulo y qué acciones se pueden realizar** (texto de `descripcion` + lista `acciones` visible en la card).
3. `cardsPorRol` es la **única** fuente de verdad de qué ve cada rol; las páginas internas siguen validando permisos en el servidor (una card no es autorización).
4. El catálogo no debe contener IDs duplicados ni `href` fuera de `src/app` (test que recorra todas las entradas).

### `R-DASH.2` — Nomenclatura por rol (texto literal exigido)

| Card | `tituloAdmin` | Título por rol |
|---|---|---|
| Gestión de Vehículos | Gestión de Vehículos | **`operaciones` → "Carga de vehículos"** (descripción: alta de vehículos al inventario, datos de chasis/patente/marca/modelo, filtros por sucursal, ubicación y fecha de registro) |
| Gestión de Solicitudes | Gestión de Solicitudes | `jefe_local`, `logistica` → "Solicitudes" |
| Aprobaciones | Aprobaciones | `jefe_local` → "Aprobaciones" (`ejecutivo` ya no tiene card: sigue todo en `/solicitudes`) |
| Calendarizaciones | Gestión Logística | `logistica`, `jefe_local` → "Calendarización de traslados" |
| Traslados | Traslados | `jefe_local`, `logistica` → "Traslados" |
| Prioridades | Prioridades | `jefe_local` → "Prioridades" |
| Gestión de Usuarios | Gestión de Usuarios | solo `administrador` |
| Gestión de Zonas y Sucursales | Gestión de Zonas y Sucursales | solo `administrador` |
| Historial y Trazabilidad | Historial y Trazabilidad | solo `administrador` |

`jefe_local` conserva la nomenclatura corta porque su usuario ya conoce el vocabulario del flujo; si se prefiere una nomenclatura de acción también para él, queda a confirmación del cliente (`D-2`).

### `R-DASH.3` — Orden del dashboard del jefe de local: gestión primero, operación después

El dashboard del `jefe_local` (y en general el de todos los roles) se ordena por secciones, con **los módulos de gestión primero** y los puramente operativos/visuales después:

```text
[1] Gestión            → Solicitudes · Aprobaciones · Prioridades · Traslados
[2] Operación          → Calendarización de traslados (Logística)
[3] Soporte            → Perfil · FAQ · (Historial, solo admin)
```

1. Cada sección lleva título, ícono y una línea de contexto ("Acciones que requieren tu decisión", "Seguimiento visual del traslado").
2. Los grupos vacíos **no se renderizan** (el `logistica` no ve la sección de gestión que no le aplique).
3. El orden de las cards dentro de cada grupo es explícito en el catálogo (`orden` numérico), no depende del orden de aparición en el objeto.

### `R-DASH.4` — Las pestañas de solicitudes pasan a ser cards del dashboard

Las pestañas `General` / `Traslados` / `Aprobaciones` / `Prioridades` de `SolicitudesHeader` **desaparecen** y sus accesos viven como cards del dashboard. Consecuencias:

1. `SolicitudesHeader` deja de recibir la prop `tabs` y deja de renderizar la barra de pestañas. Se conserva como cabecera ligera (ver `R-2.3`) o se elimina si `R-2` loabsorbe.
2. Cada sub-módulo de solicitudes (`/solicitudes`, `/solicitudes/aprobaciones`, `/solicitudes/prioridades`, `/solicitudes/traslados`) debe quedar **alcanzable en un clic** desde el dashboard y **navegable hacia atrás** (volver al dashboard) sin depender de pestañas.
3. Se conserva la **misma matriz de visibilidad por rol** que hoy aplican las pestañas, para no abrir rutas por accidente: `Traslados` no aparece para `ejecutivo`; `Prioridades` no aparece para `ejecutivo` ni `logistica`; `Aprobaciones` no aparece para `logistica` ni `operaciones`.

### `R-DASH.5` — Feed de solicitudes priorizadas en el dashboard del jefe de local

Para que el jefe de local tenga **feedback de qué es urgente** sin entrar al módulo:

1. El dashboard del `jefe_local` renderiza una card de **"Prioridades"** con la **cola de su sucursal, máximo 8 elementos**, ordenados por `posicion_prioridad` ascendente (`1` = más urgente).
2. El alcance es el del jefe de local: sucursales de `OrganizacionService.getUserAssignedBranches(profile.id)`, filtrando `estado = 'priorizada' AND posicion_prioridad IS NOT NULL`. Si el jefe de local preside varias sucursales, **agrupar la lista por sucursal** con un subtítulo por sucursal, y dentro de cada grupo ordenar por posición.
3. Cada fila muestra: **posición** (destacada visualmente para 1-2 en rojo/ámbar), **patente(s) del vehículo**, **sucursal origen → destino** (o el título del evento), **ejecutivo solicitante**, **fecha límite** y **estado**.
4. La lista es de **solo lectura**: reordenar, priorizar o sacar de la cola sigue siendo acción exclusiva de `/solicitudes/prioridades`.
5. Si la fila es clicable, debe abrir el detalle de solicitud reutilizando el componente existente (`SolicitudDetalleModal`) o, si el dashboard es server component, navegar a `/solicitudes/prioridades`. Elegir una opción y dejarla documentada.
6. Si no hay solicitudes priorizadas, mostrar un estado vacío explícito ("No hay solicitudes priorizadas en tus sucursales") — nunca un espacio en blanco.
7. Indicadores de resumen en la cabecera de la card: **total en cola**, **cuántas son urgentes (posición ≤ 2)** y **cuántas hay por aprobar** (`estado = 'pendiente_aprobacion'`), para que el feedback sea inmediato.

### `R-DASH.6` — Todas las solicitudes priorizadas de la cola, para el jefe de local

Además de la lista resumida de `R-DASH.5`:

1. La card debe consumir **todas** las solicitudes priorizadas de su alcance (sin truncar en el origen) y el corte a 8 es **solo visual**, con un enlace "Ver la cola completa (N)" a `/solicitudes/prioridades`.
2. El **orden es por prioridad, no por fecha de creación**: es un ranking de urgencia.
3. La lectura debe ser de **una sola consulta** (`SolicitudesService`) reutilizando el mapper `SOLICITUD_SELECT`/`mapRow`; no duplicar la query de priorizados dentro de `dashboard/page.tsx`.
4. Si el `administrador` tiene varias sucursales a cargo, la card agrupa igual que en `R-DASH.5.2`.

### `R-DASH.7` — Métricas y responsive del dashboard

1. **Tipografía más grande y menos espacio sobrante**: la tipografía actual del dashboard es demasiado chica (`text-xs` en descripciones, `text-lg` en el título de sección) y el banner tiene `min-h-[220px]` con paddings amplios que desperdician alto en pantallas grandes. Subir la escala: título de bienvenida `text-3xl sm:text-4xl`, título de sección `text-xl sm:text-2xl`, título de card `text-lg sm:text-xl`, descripción `text-sm sm:text-base`, metadatos `text-xs` solo para datos secundarios. Reducir el `min-h` del banner y el `py-8`/`space-y-8` del `main`.
2. **Rejilla responsive**: `grid-cols-1 sm:grid-cols-2 xl:grid-cols-3` con `gap-4 sm:gap-5`; en móvil una columna con tarjetas de altura automática (sin `min-h-[220px]` fijo, que genera huecos en tarjetas con poco texto).
3. **Móvil (< 640px)**: sin scroll horizontal en ningún elemento; el nombre del usuario, la sucursal y el rol se apilan o se ocultan, nunca se desbordan; las cards de la lista de prioridades muestran patente + posición + destino, y ocultan los metadatos secundarios.
4. **Tablet (640-1279px)**: dos columnas; la lista de prioridades ocupa ancho completo.
5. **Escritorio (≥ 1280px)**: tres columnas para cards, la lista de prioridades a ancho completo o en columna lateral de 1/3 según densidad de cards.
6. **Largo de texto**: `line-clamp-2` en la descripción de las cards cuando el texto exceda dos líneas, con el texto completo disponible en `title`/`aria-label`, para que las tarjetas queden alineadas.
7. Verificar sin scroll horizontal en 320, 375, 768, 1024, 1280 y 1440 px de ancho.

---

## 4. `R-NAV` — Eliminar el TopNavbar de todo el sistema

### `R-NAV.1` — Borrado del componente

Eliminar `src/components/TopNavbar.tsx` y `src/components/SolicitudesHeader.tsx` y sus 13 puntos de uso:

```text
src/app/dashboard/page.tsx
src/app/faq/page.tsx
src/app/perfil/page.tsx
src/app/admin/historial/page.tsx
src/app/admin/sucursales/page.tsx
src/app/admin/usuarios/page.tsx
src/app/admin/vehiculos/page.tsx
src/app/logistica/calendarizaciones/page.tsx
src/app/logistica/slots/page.tsx
src/app/solicitudes/page.tsx            (vía SolicitudesHeader)
src/app/solicitudes/aprobaciones/page.tsx
src/app/solicitudes/prioridades/page.tsx
src/app/solicitudes/traslados/page.tsx
```

1. Ninguna página debe seguir importando `TopNavbar` ni `SlotResumen`; `SlotResumen` debe mudarse al tipo de datos del nuevo indicador de slots (`R-SLOTS.3`).
2. El tipo `SlotResumen` deja de vivir en un componente de UI: pasa a `src/types/sucursal.types.ts` o al módulo del badge.
3. La **navegación por pestañas desaparece** en los 4 sub-módulos de solicitudes (ver `R-DASH.4`).

### `R-NAV.2` — Qué reemplaza al TopNavbar

Cada página debe seguir ofreciendo, **sin barra superior pegajosa**, las funciones que el navbar prestaba. Componente nuevo suggested: `src/components/PageHeader.tsx` (server), con:

1. Escudo H.Motores + "H.Motores" como enlace a `/dashboard` (marca de sistema, no navegación).
2. Nombre, apellido y **rol** del usuario, con enlace a `/perfil`.
3. **Sucursal** del usuario.
4. **Botón de cerrar sesión** (el `logoutAction` que ya existe en `src/app/actions/auth.actions.ts`).
5. Indicador de **slots libres** para `jefe_local` y `administrador` (ver `R-SLOTS`).
6. Enlace "Volver al dashboard" (`ArrowLeft`) en los módulos internos, sustituyendo el `backHref` que hoy pony el navbar.
7. En móvil el `PageHeader` **no debe ser pegajoso** ni ocupar más de una fila compacta: nombre + rol en una línea, botón de sesión como ícono, y el resto accesible desde el dashboard.

### `R-NAV.3` — Requisitos de comportamiento

1. `PageHeader` es un **Server Component** (recibe los datos del usuario como props, sin `useState`).
2. Debe funcionar en `/login`, `/recuperar-clave`, `/registro` y `/establecer-clave` aunque el usuario no esté autenticado: en ese caso renderizar solo la marca, sin datos de usuario, sin slots y sin logout.
3. Ninguna ruta puede quedar **sin salida**: debe existir siempre un enlace visible a `/dashboard` (o a `/login` si no hay sesión).
4. El badge de slots que hoy vive en el navbar (`R-SLOTS`) pasa a la card de **Slots** del dashboard y a un indicador compacto en `PageHeader` para `jefe_local`/`administrador`; el resto de los roles **no lo ven**.
5. `/logistica/slots` deja de ser una página "oculta" que solo se alcanzaba por hover del navbar: pasa a ser una **card del dashboard** (grupo Soporte) para `jefe_local` y `administrador`, manteniendo la página con su tabla de detalle.

---

## 5. `R-SOL` — Motivo de rechazo visible en el detalle de solicitud

### `R-SOL.1` — Panel rojo de motivo de rechazo

Cuando `solicitud.estado === 'rechazada'`, el modal de detalle de solicitud (`src/components/SolicitudDetalleModal.tsx`) debe mostrar **en la parte superior del modal** (antes de los tabs, no dentro de la pestaña de Información) un bloque destacado que comunique la decisión:

1. Estilo: panel **rojo** (`bg-red-50`, `border-red-200`, texto `text-red-900`), ícono de rechazo/bandera, título **"Solicitud rechazada"** y el texto **"Motivo del rechazo"**.
2. Contenido: el **motivo que dejó el jefe de local** + **quién lo rechazó** (nombre del `jefe_local_id` de la solicitud, vía `UsuarioNombreBoton`) + **fecha del rechazo**.
3. Debe ser visible en **cualquier pestaña** del modal (Información, Historial, Observaciones, Documentos) y no puede quedar oculto por scroll: va en la franja superior, dentro de la zona `shrink-0`.
4. El motivo es **dato derivado**: hoy no existe columna `motivo_rechazo`; el motivo se guarda en la tabla `observacion` con el prefijo `[RECHAZO] ` (`SolicitudesService.rechazarSolicitud`, `src/services/solicitudes.service.ts:1086-1090`) y también en la auditoría (`accion = 'rechazo'`, `valor_nuevo.motivo`).
5. Implementar un helper puro y testeado, por ejemplo `src/lib/motivoRechazo.ts`:

   ```ts
   export const PREFIJO_RECHAZO = '[RECHAZO]';
   export function extraerMotivoRechazo(observaciones: ObservacionEntry[]): {
     motivo: string;
     usuario_id: string | null;
     usuario_nombre: string | null;
     created_at: string;
   } | null;
   ```

   Reglas: toma la **observación más reciente** cuyo `observacion` empiece con `[RECHAZO]`; devuelve `motivo` **sin el prefijo y con `trim()`**; devuelve `null` si no hay ninguna; **no debe lanzar** ante `observaciones` vacío, `null`, `undefined` ni entradas con `observacion` nula; debe ser insensible a mayúsculas/espacios del prefijo. Test unitario obligatorio (función pura, sin mocks).
6. **Fallback**: si el estado es `rechazada` pero no se encuentra ninguna observación `[RECHAZO]` (solicitudes históricas), mostrar el panel con un texto explícito de que el motivo no quedó registrado, en lugar de ocultarlo.
7. El modal ya carga las observaciones al abrirse (`getObservacionesAction`), por lo que el panel se renderiza sin peticiones adicionales. No llamar a la auditoría solo para esto.
8. El motivo de rechazo **debe quedar también visible en la lista/tabla** de solicitudes (no solo en el modal): badge o tooltip "Rechazada" que al hacer clic abra el modal con el panel ya visible.
9. El motivo de **cancelación** (`motivo_cancelacion`, columna real) se mantiene como está, pero se diferencia visualmente del de rechazo para no confundirlos.

### `R-SOL.2` — `APELAR` (decisión pendiente, ver `D-1`)

El panel de rechazo debe dejar **explícito** que se puede recurrir. **No implementar la apelación en este bloque**: solo dejar el texto y el punto de extensión. Si el cliente decide implementar la apelación más adelante, se hará como requisito aparte que reutilice `insistirSolicitudAction` (ya existente) o una acción nueva con su propio estado.

---

## 6. `R-SLOTS` — Los slots por sucursal deben actualizarse siempre

### `R-SLOTS.1` — Diagnóstico del problema (leído del código, no supuesto)

El indicador de slots del navbar se actualiza **solo con ciertas acciones**. Causas concretas, en orden de impacto:

1. **Los datos se leen en el servidor, por página.** El badge se construye en cada `page.tsx` con `SucursalesService.getSlotsPorSucursales(ids)` (`sucursales.service.ts:64`) y se pasa como prop al componente de UI. No hay estado compartido: cada página vuelve a consultar.
2. **Las acciones revalidan rutas concretas y el navbar no está entre ellas.** Las ~25 llamadas a `revalidatePath` de `solicitudes.actions.ts` cubren `/solicitudes`, `/solicitudes/aprobaciones`, `/solicitudes/prioridades` y `/logistica/calendarizaciones`, pero **ninguna reválida `/dashboard` ni `/logistica/slots`**. Quien reservationa o libera un vehículo no refresca el indicador del dashboard.
3. **El cambio real ocurre en triggers de BD, invisible para la app.** `sucursal.slots_ocupados` lo modifican `tr_incrementar_slots_ocupados` (AFTER INSERT en `solicitud_vehiculo`), `tr_decrementar_slots_ocupados` (AFTER DELETE) y `tr_liberar_slots_rechazo_cancelacion` (AFTER UPDATE de `solicitud` a `rechazada`/`cancelada`) (`esquema-completo-sql.sql:1128-1135`). Los triggers no disparan revalidación de Next.
4. **El Router Cache del cliente sobrevive a la mutación.** Con `export const dynamic = 'force-dynamic'` los datos del servidor siempre son frescos, pero tras una Server Action la navegación cliente no vuelve a pedir el RSC de la página actual salvo `router.refresh()`. Resultado: el número queda "clavado" hasta recargar con F5.
5. **No hay refresco por cambio externo.** Si **otro usuario** reserva un slot, la pantalla de este usuario nunca se entera: no hay polling ni `visibilitychange`. Un `revalidatePath` solo revalida la petición del cliente que hizo la acción.
6. Los datos del badge son **promedio agregado**: el dropdown calcula `slots - slots_ocupados` y **omite `slots_reservados`**, que la BD ya expone (`sucursales.service.ts:72`). El número mostrado puede no cuadrar con la vista `/logistica/slots`.

### `R-SLOTS.2` — Corrección

1. **Una sola función de revalidación.** Crear `src/lib/rutas.ts` (o `src/lib/revalidacion.ts`) con la lista canónica de rutas afectadas por solicitudes y slots y un helper:

   ```ts
   export const RUTAS_AFECTADAS_POR_SOLICITUDES = [
     '/dashboard',
     '/solicitudes',
     '/solicitudes/aprobaciones',
     '/solicitudes/prioridades',
     '/solicitudes/traslados',
     '/logistica/calendarizaciones',
     '/logistica/slots',
   ] as const;
   export function revalidarSolicitudes(): void;
   ```

   Reemplazar **todas** las llamadas dispersas de `revalidatePath` de `solicitudes.actions.ts` y `traslados.actions.ts` por este helper, de modo que ninguna ruta quede fuera por olvido. Test unitario del helper con `revalidatePath` mockeado: debe invocar exactamente las 7 rutas.
2. **`router.refresh()` en el cliente después de toda mutación que mueva slots.** En `SolicitudesClient`, `AprobacionesClient`, `PrioridadesClient`, `TrasladosClient` y el cliente de calendarizaciones, invocar `router.refresh()` tras el `await` exitoso de: crear solicitud, agregar/quitar vehículo, aprobar, rechazar, cancelar, eliminar, priorizar, reordenar, calendarizar, descalendarizar, despachar, iniciar tránsito, recibir, finalizar, crear/editar traslado.
3. **Refresco ante foco de ventana** para captar cambios de otros usuarios. Un componente cliente `SlotsResumen` (o el propio `PageHeader`) registra `visibilitychange` y `focus` y llama `router.refresh()` con un **throttle** de al menos 15 s, para no generar peticiones constantes.
4. **Un único origen de datos.** Extraer el cálculo del resumen a un helper puro y testeado, por ejemplo `src/lib/slots.ts`:

   ```ts
   export interface SlotSucursalResumen {
     nombre: string | null; slots: number; slots_ocupados: number; slots_reservados: number;
   }
   export function slotsLibres(s: SlotSucursalResumen): number;
   export function resumenSlots(
     items: SlotSucursalResumen[]
   ): { libres: number; total: number; criticidad: 'ok' | 'atencion' | 'critico' };
   ```

   `slotsLibres` debe usar `Math.max(slots - slots_ocupados - slots_reservados, 0)` para coincidir con la lógica de la BD, y `resumenSlots` debe devolver la criticidad: `critico` si no hay ninguno libre, `atencion` si hay menos del 20 % libre, `ok` en otro caso. Sin `NaN` con `null` (normalizar a 0). Test unitario obligatorio (funciones puras, sin mocks).
5. **Una sola consulta para el dashboard.** El dashboard pide slots y prioridades en un `Promise.all` y no vuelve a pedir datos que ya se Pardan; los valores que alimenten cards y el `PageHeader` deben venir de la misma llamada.
6. **Verificación**: tras crear una solicitud de tipo `venta` con vehículo reservado, el indicador del dashboard y de `/logistica/slots` deben reflejar el slot consumido **sin F5**; tras cancelar o rechazar, deben reflejar la liberación. Prueba manual con **dos sesiones** (usuario A reserva, usuario B recibe el cambio al volver a la pestaña).

---

## 7. `R-UI` — Requisito transversal de calidad visual

1. **Letras más grandes en todo el dashboard y en los nuevos componentes**: escala mínima `text-sm` para descripciones y `text-base`/`text-lg` para títulos; nada de `text-[10px]`/`text-[11px]` en elementos de lectura frecuente (sí en metadatos secundarios).
2. **Eliminar espacio sobrante**: revisar `min-h-[220px]`, `py-8`, `space-y-8`, `gap-5` y paddings `p-6`/`p-8` de las cards; el objetivo es que en un monitor de 1440 px el contenido del dashboard entre sin scroll innecesario, y en móvil sin cortes.
3. **Consistencia visual** con el resto del sistema: `rounded-2xl`, bordes `neutral-200`, fondo de página `bg-[#f4f6f9]`, acento `text-[#1a2b4b]`, iconografía lucide. El hover de card debe seguir el patrón actual (borde `neutral-400` + `shadow-md`).
4. **Accesibilidad**: el color no puede ser el único indicador de estado (acompañar con texto o ícono); los estados vacíos deben tener texto; los botones de solo ícono necesitan `title`/`aria-label`.
5. **Estados vacíos en todas las cards nuevas**: prioridades sin cola, slots sin sucursales asignadas, solicitudes sin resultados.

---

## 8. Archivos previstos

```text
NUEVOS
  src/config/dashboard-cards.ts              catálogo de cards (puro, testeable)
  src/components/PageHeader.tsx              reemplazo del TopNavbar
  src/components/SlotsResumen.tsx            indicador de slots (cliente, refresco por foco)
  src/components/DashboardCardGrid.tsx       render de secciones/grupos
  src/components/DashboardPrioridades.tsx    feed de la cola priorizada
  src/lib/slots.ts                           cálculos puros de slots
  src/lib/motivoRechazo.ts                   extracción del motivo de rechazo
  src/lib/rutas.ts                           rutas canónicas + revalidarSolicitudes()
  tests/unitarios/dashboard-cards.test.ts
  tests/unitarios/slots.test.ts
  tests/unitarios/motivoRechazo.test.ts
  tests/unitarios/rutas.test.ts

MODIFICADOS
  src/app/dashboard/page.tsx                 cards por rol, secciones, prioridades, sin TopNavbar
  src/components/SolicitudDetalleModal.tsx  panel rojo de motivo de rechazo
  src/app/actions/solicitudes.actions.ts     revalidarSolicitudes() + router.refresh en el flujo
  src/app/actions/traslados.actions.ts       idem
  src/app/solicitudes/**/page.tsx            sin SolicitudesHeader; PageHeader + volver al dashboard
  src/app/admin/**/page.tsx, src/app/logistica/**, src/app/faq, src/app/perfil
                                                PageHeader en vez de TopNavbar
  src/types/sucursal.types.ts                SlotResumen
  src/app/documentation/RequisitosModulos.md  reorganización R-DOC + R-DASH/R-NAV/R-SOL/R-SLOTS
  src/app/documentation/ProjectStatus.md, Brain.md   si cambia el estado de los módulos

ELIMINADOS
  src/components/TopNavbar.tsx
  src/components/SolicitudesHeader.tsx
```

---

## 9. Criterios de aceptación

1. `/dashboard` no renderiza `TopNavbar`; ninguna página del sistema lo importa; `TopNavbar.tsx` y `SolicitudesHeader.tsx` no existen.
2. Cada página conserva marca, usuario, rol, sucursal, acceso a perfil y cerrar sesión; toda ruta tiene una salida visible a `/dashboard` (en `/solicitudes` del `ejecutivo` no se muestra la flecha porque sería un bucle, y en su lugar ofrece enlaces Mi perfil y FAQ).
3. El `administrador` ve las cards con nomenclatura "Gestión de …"; `operaciones` ve "Carga de vehículos"; el `ejecutivo` **no ve cards**: `/dashboard` lo redirige a `/solicitudes`, que muestra sus solicitudes (crear, editar, ver detalle, insistir, cancelar y entregar al cliente) con el filtro por grupos; cada card muestra descripción **y** las acciones disponibles.
4. El `jefe_local` ve sus cards agrupadas: gestión (Solicitudes, Aprobaciones, Prioridades, Traslados) y operación (Logística), en ese orden, y **no ve** las cards de administración.
5. El dashboard del `jefe_local` muestra la cola priorizada de sus sucursales (máx. 8 visibles, agrupada si preside varias), ordenada por posición, con resumen de total/urgentes/por aprobar y enlace a la cola completa.
6. Una solicitud `rechazada` muestra, arriba del modal de detalle y en todas sus pestañas, un panel rojo con el motivo, el nombre del jefe de local y la fecha; las solicitudes históricas sin observación `[RECHAZO]` muestran un aviso explícito en vez de ocultarlo.
7. El número de slots libres del dashboard y de `/logistica/slots` se actualiza sin recargar la página tras reservar/liberar un vehículo, **también** con la acción hecha por otro usuario al volver a la pestaña.
8. El dashboard se ve correctamente entre 320 y 1440 px, sin scroll horizontal, con tipografía legible y sin bloques de espacio vacío.
9. `npx tsc --noEmit`, `npm run lint` y `npm run test` pasan en verde, con los tests nuevos de `slots`, `motivoRechazo`, `dashboard-cards` y `rutas` incluidos.
10. `RequisitosModulos.md` refleja la estructura nueva agrupada por módulo, con los requisitos `R-DASH.*`, `R-NAV.*`, `R-SOL.*`, `R-SLOTS.*` registrados y su historial actualizado.

---

## 10. Decisiones pendientes (no bloquean; documentar la elección tomada)

| Id | Decisión | Recomendación |
|---|---|---|
| `D-1` | **APELAR**: hoy no existe columna `motivo_rechazo` y no hay acción de apelación. ¿Se agrega la columna (migración) y se implementa el recurso de apelación del Ejecutivo, o solo se muestra el motivo de la observación `[RECHAZO]`? | Mostrar el motivo desde `[RECHAZO]` (sin migración). La apelación es un requisito aparte. |
| `D-2` | Nomenclatura de las cards del `jefe_local`: ¿"Solicitudes/Aprobaciones/Prioridades/Traslados" (vocabulario del flujo) o textos de acción más explícitos como el de `operaciones` y `ejecutivo`? | Mantener el vocabulario del flujo para el jefe de local. |
| `D-3` | Las filas de la lista de prioridades del dashboard: ¿abren el modal de detalle o navegan a `/solicitudes/prioridades`? | Navegar a la cola completa (el dashboard es server component y el modal requiere cliente con datos de inventario). |
| `D-4` | ¿El indicador de slots se mantiene además en el `PageHeader` de cada página, o solo en la card del dashboard? | Mantenerlo en el `PageHeader` (comprimido) **y** en la card de slots del dashboard. |
| `D-5` | Con el TopNavbar eliminado, ¿`/logistica/slots` sigue siendo una página propia o se convierte en una sección del dashboard? | Mantener la página propia y agregarla como card del dashboard. |

---

## 11. Orden de ejecución sugerido

1. `R-DOC` — reorganizar `RequisitosModulos.md` **antes** de tocar código, para tener los IDs donde colgar los requisitos nuevos.
2. `R-SLOTS.2.4` (helpers puros `slots.ts`, `rutas.ts`) + tests: son la base de `R-SLOTS` y no dependen de la UI.
3. `R-SOL.1` (`motivoRechazo.ts` + panel rojo) + tests: cambio acotado y de alto valor para el usuario.
4. `R-NAV` (`PageHeader`, `SlotsResumen`, retiro de `TopNavbar`/`SolicitudesHeader`): es el refactor más invasivo y habilita el resto.
5. `R-DASH.1`/`.2` (catálogo + nomenclatura) + tests, y luego `R-DASH.3`/`.4` (secciones, orden y cards que reemplazan las pestañas).
6. `R-DASH.5`/`.6` (feed de prioridades) y `R-DASH.7` (tipografía y responsive).
7. `R-SLOTS.2.1`-`.3` (revalidación unificada y refresco por foco) — con las rutas ya conocidas tras el paso 4.
8. Cerrar: `RequisitosModulos.md`, `ProjectStatus.md`, `tsc`, `lint`, `test`.
