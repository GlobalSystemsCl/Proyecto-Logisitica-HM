# REQUISITOS DE MÓDULOS — Sistema de Gestión de Vehículos H.Motores

> **Documento único de requisitos específicos del sistema.**
>
> Describe para cada módulo: **qué hace**, **cómo funciona**, **a qué pertenece**, **con qué se conecta**, su **estado real** y su **historial de cambios**. Incluye el **flujo global de interacción** entre módulos.
>
> Mantenido por la skill **`requisitos-modulos`** (`.opencode/skills/requisitos-modulos/SKILL.md`). Cualquier cambio de requisito, módulo o flujo debe registrarse aquí en la misma tarea.
>
> Regla de oro: el código, la BD y la UI mandan; este documento los refleja 1:1.
>
> **Estructura**: el documento está agrupado en **Partes** (macro-módulos) que contienen los **Módulos**. Ver Parte 0.2.

---

# PARTE 0 — Cómo usar este documento

## 0.1 Índice

| Parte | Módulo | Requisitos | Ruta principal |
|---|---|---|---|
| 1 | *Contexto del sistema* | — | `/dashboard` |
| 2 | 2.1 Autenticación y Seguridad | `R-AUTH.*` | `/login` |
| 2 | 2.2 Perfil de Usuario | `R-PERF.*` | `/perfil` |
| 3 | 3.1 Gestión de Usuarios | `R-USU.*` | `/admin/usuarios` |
| 3 | 3.2 Gestión de Vehículos | `R-VEH.*` | `/admin/vehiculos` |
| 3 | 3.3 Gestión de Sucursales | `R-SUC.*` | `/admin/sucursales` |
| 3 | 3.4 Organización Territorial | `R-ORG.*` | `/admin/sucursales` |
| 4 | 4.1 Solicitudes — Creación | `R-SOL-CRE.*` | `/solicitudes` |
| 4 | 4.2 Solicitudes — Aprobación y rechazo | `R-SOL-APR.*` | `/solicitudes/aprobaciones` |
| 4 | 4.3 Solicitudes — Priorización | `R-SOL-PRI.*` | `/solicitudes/prioridades` |
| 4 | 4.4 Solicitudes — Detalle y trazabilidad | `R-SOL-DET.*` | `/solicitudes` |
| 4 | 4.5 Solicitudes — Lista, filtros y seguimiento | `R-SOL-LIS.*` | `/solicitudes` |
| 5 | 5.1 Logística Operativa | `R-LOG.*` | `/logistica/calendarizaciones` |
| 5 | 5.2 Traslados Internos | `R-TRA.*` | `/solicitudes/traslados` |
| 5 | 5.3 Slots de Estacionamiento | `R-SLOTS.*` | `/logistica/slots` |
| 6 | 6.1 Dashboard por rol | `R-DASH.*` | `/dashboard` |
| 7 | 7.1 Auditoría e Historial | `R-AUD.*` | `/admin/historial` |
| 7 | 7.2 Notificaciones | `R-NOT.*` | — |
| 7 | 7.3 Correo (Brevo) | `R-EMAIL.*` | — |
| 7 | 7.4 FAQ | `R-FAQ.*` | `/faq` |
| 8 | *Registro global de cambios* · *Referencias* | — | — |

## 0.2 Convenciones

- **IDs de requisito**: `R-<MODULO>.<n>`. Numeración continua; si un requisito se reemplaza, el nuevo recibe otro ID y el anterior queda solo en el historial. **Ningún ID se reutiliza ni se elimina.**
- **Historial de cambios**: por módulo (tabla al final de cada módulo) y global (Parte 8). Fecha ISO `YYYY-MM-DD`, cambio → motivo. Orden: más reciente primero.
- **Estado de módulo**: `implementado` · `parcial` · `pendiente` · `deshabilitado`.
- **Plantilla de módulo**:

  ```markdown
  ## M. <Nombre>
  - **Estado**: `implementado | parcial | pendiente | deshabilitado`
  - **Qué hace**: ...
  - **Cómo funciona**: ...
  - **Requisitos específicos**: R-<MOD>.1 ... R-<MOD>.n
  - **Con qué se conecta**: ...
  - **Depende de**: ...
  - **Historial**:
    | Fecha | Cambio | Motivo |
  ```

- Al agregar un módulo, actualizar también: índice (0.1), visión global (Parte 1), flujo de interacción y registro global (Parte 8).
- Las referencias cruzadas se citan por **Parte.nombre de módulo** (no por número de sección).

## 0.3 Glosario de términos del negocio

| Término | Significado en este sistema |
|---|---|
| **Solicitud** | Pedido formal de mover ≥1 vehículo. Va a una sucursal destino (`venta`) o a un evento (`evento`). |
| **Sucursal** | Punto físico de H.Motores con su propioutat de estacionamiento (`slots`). |
| **Zona** | Agrupamiento territorial de sucursales que delimita el alcance del rol `logistica`. |
| **Slot** | Espacio de estacionamiento de una sucursal. Se ocupa al reservar un vehículo y se libera al rechazar/cancelar/despachar. |
| **Cola de prioridad** | Orden de las solicitudes `priorizada` **por sucursal**; la posición 1 es la más urgente. |
| **Calendarización** | Paso de `priorizada` a `calendarizada`: se fija la fecha tentativa de despacho. |
| **Traslado interno** | Movimiento de vehículos **ya vendidos** entre sucursales (tabla `traslado_interno`), distinto de una solicitud. |
| **Encargado de local** | `jefe_local` responsable de una o varias sucursales (`sucursal.usuario_id`). No es lo mismo que *pertenecer* a la sucursal (`usuario.sucursal_id`). |

---

# PARTE 1 — Contexto del sistema

## 1.1 Qué es el sistema

Plataforma interna de H.Motores para **gestionar, aprobar, priorizar y trazar el traslado de vehículos entre sucursales** y a eventos. Cubre el ciclo completo: el Ejecutivo pide el traslado, el Jefe de Local lo aprueba y lo ordena por urgencia, Logística lo calendariza y despacha, y el destino lo recepciona y lo entrega al cliente. Todo queda auditado.

## 1.2 Actores y permisos

| Rol | Alcance |
|---|---|
| `administrador` | Todo el sistema: usuarios, vehículos, sucursales, zonas territoriales, historial, solicitudes, aprobaciones y priorización. |
| `ejecutivo` | Crea solicitudes en **su sucursal**; ve y da seguimiento a **las suyas**; no asigna fecha de entrega. |
| `jefe_local` | Crea solicitudes (con fecha) en sus sucursales; **aprueba/rechaza** las de su sucursal; prioriza y ordena la cola; gestiona vehículos. |
| `logistica` | Gestiona calendarizaciones, despachos y traslados. Su alcance (solicitudes, calendarización, traslados) se limita a sus **zonas/sucursales asignadas**. No crea solicitudes. |
| `operaciones` | Solo **carga de vehículos** al inventario. Sin acceso a solicitudes (`getSolicitudesFiltradas` devuelve `[]`). |

## 1.3 Mapa de rutas por módulo

| Módulo | Rutas |
|---|---|
| Autenticación | `/login`, `/recuperar-clave`, `/registro`, `/establecer-clave`, `/auth/callback` |
| Perfil | `/perfil` |
| Usuarios | `/admin/usuarios` |
| Vehículos | `/admin/vehiculos` |
| Sucursales y Zonas | `/admin/sucursales` |
| Solicitudes | `/solicitudes` |
| Aprobación | `/solicitudes/aprobaciones` |
| Priorización | `/solicitudes/prioridades` |
| Traslados internos | `/solicitudes/traslados` |
| Logística | `/logistica/calendarizaciones` |
| Slots | `/logistica/slots` |
| Historial/Auditoría | `/admin/historial` |
| FAQ | `/faq` |
| Dashboard | `/dashboard` |

## 1.4 Mapa de rutas por rol

| Ruta | Acceso |
|---|---|
| `/dashboard`, `/perfil`, `/faq` | todos los autenticados (el `ejecutivo` es redirigido a `/solicitudes`) |
| `/solicitudes` | `administrador`, `jefe_local`, `ejecutivo`, `logistica` |
| `/solicitudes/aprobaciones` | `jefe_local`, `administrador` |
| `/solicitudes/prioridades` | `jefe_local`, `administrador` |
| `/solicitudes/traslados` | `administrador`, `logistica`, `jefe_local` |
| `/logistica/calendarizaciones` | `jefe_local`, `logistica`, `administrador` |
| `/logistica/slots` | `jefe_local`, `logistica`, `administrador` |
| `/admin/vehiculos` | `administrador`, `jefe_local`, `logistica`, `operaciones` |
| `/admin/usuarios`, `/admin/sucursales`, `/admin/historial` | `administrador` |

### 1.4.1 El Ejecutivo no tiene dashboard: `/solicitudes` es su página principal

El `ejecutivo` tiene pocas acciones y todas caben en un solo lugar, así que un hub de
navegación con una sola card era redundante:

- `GET /dashboard` con rol `ejecutivo` responde `redirect('/solicitudes')` (`R-DASH.13`).
- `cardsPorRol('ejecutivo')` devuelve `[]`: ninguna card declara título para `ejecutivo`
  (`R-DASH.14`), de modo que ni siquiera una regresión del catálogo lo dejaría sin hub.
- `/solicitudes/aprobaciones` ya no acepta `ejecutivo`: se redirige a `/solicitudes`
  (`R-DASH.15`). Antes podía Reach la cola completa de otras sucursales.
- El encabezado de `/solicitudes` omite la flecha "volver" para el `ejecutivo` (lo
  devolvería a sí mismo) y muestra enlaces explícitos **Mi perfil** y **FAQ**
  (`PageHeader.mostrarEnlacesCuenta`), porque su encabezado es su única navegación.

Dentro de `/solicitudes` el Ejecutivo ve únicamente sus propias solicitudes
(`SolicitudesService.getSolicitudesFiltradas` → `ejecutivo_id = viewer.id`) y hace todo
desde ahí: crear, editar, ver el detalle, insistir, cancelar, recibir/asignar cuando
aplica y **entregar al cliente** las que están en `entregada`.

## 1.5 Mapa de cards del dashboard por rol

Fuente de verdad compartida entre código y documentación: `src/config/dashboard-cards.ts`
(`DASHBOARD_CARDS`). Cada card declara su grupo (`gestion`, `operacion`, `soporte`), su
orden y su nombre visible por rol; la visibilidad se deriva de `puedeVerCard()` y
`seccionesPorRol()`. Ninguna página decide módulos con condicionales propios.

| Rol | Cards del dashboard (nombre visible) |
|---|---|
| `administrador` | Gestión de Zonas y Sucursales · Gestión de Solicitudes · Aprobaciones · Prioridades · Traslados · Gestión Logística · Gestión de Vehículos · Slots de Estacionamiento · Gestión de Usuarios · Historial y Trazabilidad |
| `jefe_local` | Solicitudes · Aprobaciones · Prioridades · Traslados · Calendarización de traslados · Carga de vehículos · Slots de Estacionamiento |
| `ejecutivo` | *(sin cards: `/dashboard` lo redirige a `/solicitudes`)* |
| `logistica` | Solicitudes · Traslados · Calendarización de traslados · Carga de vehículos · Slots de Estacionamiento |
| `operaciones` | Carga de vehículos |

Reglas de nomenclatura:

- El `administrador` conserva los títulos `Gestión de ...` (excepción: `Prioridades` y `Traslados`,
  cuyos módulos no administra).
- Cada rol no administrativo usa el nombre de su tarea, no el del módulo:
  `operaciones`/`jefe_local`/`logistica` → `Carga de vehículos`,
  `jefe_local`/`logistica` → `Calendarización de traslados`.
- El `ejecutivo` no tiene cards: `/solicitudes` reúne todo lo suyo (ver 1.4.1).
- Los enlaces de soporte propio (`Mi perfil`, `Preguntas frecuentes`) no son cards de
  módulo: se agrupan aparte bajo el encabezado **Tu cuenta** y existen para todos los roles.
- `/dashboard` es el único centro de navegación: no hay barra de módulos ni pestañas de
  solicitudes (`SolicitudesTabBar` y `lib/solicitudes-tabs.ts` fueron eliminados).
- Encabezado de página (`src/components/PageHeader.tsx`): marca H.Motores con retorno a
  `/dashboard`, sucursal, perfil, cierre de sesión, badge de slots y, opcionalmente,
  título y descripción de la página. No es pegajoso.

## 1.6 Flujo principal de interacción entre módulos

```text
Login (Auth) → Dashboard → [Administrador: Usuarios · Sucursales/Zonas · Vehículos · Historial]
                          └ → Solicitudes
                                 │
      Ejecutivo crea ───────────┤  jefe_local_id = jefe de local de su sucursal
      (sin fecha; estado pendiente_aprobacion)
                                 ▼
      Aprobaciones (jefe_local): aprueba ───(fecha de entrega)───► aprobada
                                  |_rechaza ──────────────────────► rechazada
                                 ▼
       Priorización: priorizada + cola por sucursal (reordenar / sacar de cola)
                                 ▼
       Logística: calendarizada → en_transito → entregada → finalizada
                                 ▼
      Auditoría/Historial: registra cada acción (cambios de estado,
                           asignación/liberación de vehículos, priorización)
                                 ▼
      Notificaciones: BD lista, triggers desactivados, UI pendiente
```

Módulos transversales: **Autenticación** (sesión y roles), **Perfil** (datos de contacto del responsable en cualquier pantalla), **Sucursales/Zonas** (alcance territorial), **Vehículos** (disponibilidad y carga), **Slots** (capacidad de estacionamiento) y **Dashboard** (navegación por rol).

## 1.7 Estados de una solicitud y quién transiciona

| Estado | Cómo se alcanza hoy | Rol |
|---|---|---|
| `pendiente_aprobacion` | Creación por `ejecutivo`/`administrador` | sistema |
| `aprobada` | Creación por `jefe_local` (automático) o aprobación con fecha | jefe_local/admin |
| `rechazada` | Rechazo con motivo (≥5 caracteres) | jefe_local/admin |
| `priorizada` | Priorizar (desde `pendiente`/`aprobada`) | jefe_local/admin |
| `asignada` | No se produce (el estado existe en el enum pero no hay transición que lo genere; `logistica_id` se fija al calendarizar) | — |
| `calendarizada` | Calendarizar desde `priorizada`/`asignada` | jefe_local/logistica/admin |
| `en_transito` | Despachar desde `calendarizada` | logistica/admin |
| `entregada` | Recibir desde `en_transito` | jefe_local/admin |
| `finalizada` | Finalizar desde `entregada` | jefe_local/admin |
| `cancelada` | Cancelación con motivo (pre-despacho: `pendiente_aprobacion`, `aprobada`, `pendiente`, `priorizada`) | admin/jefe_local/ejecutivo/logistica |

---

# PARTE 2 — Identidad y seguridad

## 2.1 Módulo: Autenticación y Seguridad

- **Estado**: `implementado`
- **Qué hace**: login corporativo Supabase Email, control de sesión, bloqueo por intentos, cambio obligatorio de contraseña inicial y recuperación de contraseña. Guarda de rutas por autenticación.
- **Cómo funciona**: `loginAction` → `AuthService.signIn` valida cuenta activa y bloqueo; tras **5 intentos fallidos consecutivos** bloquea la cuenta **15 minutos** (`bloqueado_hasta`), y lo reinicia al éxito. Si `requiere_cambio_clave=true` fuerza `/establecer-clave`. La recuperación usa `resetPasswordForEmail` (no Brevo). El callback OTP/PKCE intercambia código por sesión.
- **Requisitos específicos**:
  - `R-AUTH.1` — Login con correo y contraseña vía Supabase Email.
  - `R-AUTH.2` — Cuenta desactivada no puede iniciar sesión.
  - `R-AUTH.3` — Bloqueo temporal de 15 min tras 5 intentos fallidos.
  - `R-AUTH.4` — Cambio de clave obligatorio en el primer ingreso.
  - `R-AUTH.5` — Recuperación/reset de contraseña por correo.
  - `R-AUTH.6` — Guarda de rutas: solo accesos autenticados; validación de rol en cada página server-side.
- **Con qué se conecta**: `auth.service.ts`, `auth.actions.ts`, `src/middleware.ts`, Supabase Auth, tabla `usuario`.
- **Depende de**: Supabase Auth, RLS.
- **Historial**:
  | Fecha | Cambio | Motivo |
  |---|---|---|
  | 2026-08-27 | Se registra en RequisitosModulos.md | Documentación de requisitos |

---

## 2.2 Módulo: Perfil de Usuario

- **Estado**: `implementado`
- **Qué hace**: vista personal `/perfil` con los datos del usuario autenticado: nombre, apellido, teléfono de contacto (editables) y correo, rol, sucursal, estado de cuenta y fecha de ingreso (solo lectura). Además, reutiliza esos datos en todo el sistema: tarjeta "Contacto responsable" enriquecida en el detalle de solicitud (nombre, rol, sucursal, teléfono y correo) y popups de datos de usuario al hacer clic en un nombre dentro del historial de cambios y observaciones.
- **Cómo funciona**:
  - `PerfilClient.tsx` (client) usa `updateProfileAction` (server action `useActionState`) → `AuthService.updateProfile` actualiza solo `nombre`, `apellido` y `telefono` del propio usuario vía client admin; el correo, rol y sucursal NO son editables desde el perfil.
  - La columna `telefono` (`varchar(30)`) se agregó con la migración `20260905_perfil_usuario_telefono.sql`.
  - `getUsuarioDetalleAction(usuarioId)` → `UsersService.getUsuarioDetalleById` devuelve el detalle completo (nombre de sucursal vía join + sucursales a cargo y zonas asignadas vía `usuario_zona`) para la tarjeta de contacto y los popups.
  - El detalle de solicitud resuelve el responsable con prioridad `logistica_id` → `jefe_local_id` → `ejecutivo_id` y lo muestra en la tarjeta "Contacto responsable" (pestaña Historial).
  - `UsuarioInfoModal`/`UsuarioNombreBoton` (`src/components/usuario-info-modal.tsx`) son componentes client reutilizables: cualquier nombre de usuario del sistema se renderiza como botón (subrayado punteado) que abre el popup con rol, sucursal, teléfono, correo y fecha de ingreso. El popup es **adaptativo por rol**: para `jefe_local`/`administrador` muestra además la sección **"Sucursales a su cargo"** (encargado de local, en chips) distinta de la **sucursal de pertenencia**; para `logistica` muestra la sección **"Zonas de logística territorial"** con sus zonas asignadas en chips; el resto de roles ve solo sucursal de pertenencia. Se aplica en: tabla de solicitudes (encargado), detalle de solicitud (creado por, responsable actual, encargado, jefe de local, logística, contacto responsable, historial de cambios y observaciones), prioridades, aprobaciones, sucursales (encargado y personas asociadas a solicitudes), historial de auditoría y gestión de usuarios.
  - Acceso al perfil desde los encabezados del sistema (nombre cliqueable + botón `UserRound` hacia `/perfil`).
- **Requisitos específicos**:
  - `R-PERF.1` — El usuario autenticado ve su perfil con nombre, apellido, correo, rol, sucursal, teléfono y estado de cuenta.
  - `R-PERF.2` — El usuario edita su nombre, apellido y teléfono; correo, rol y sucursal son solo lectura.
  - `R-PERF.3` — El teléfono es opcional y se limita a 30 caracteres.
  - `R-PERF.4` — El perfil es accesible desde los encabezados del sistema hacia `/perfil`.
  - `R-PERF.5` — El detalle de solicitud muestra "Contacto responsable" con nombre, rol, sucursal, teléfono y correo del responsable.
  - `R-PERF.6` — En todo lugar donde el sistema muestra un nombre de usuario o encargado (tablas, detalle, historial, observaciones, prioridades, aprobaciones, sucursales, usuarios, calendario logístico) el nombre es un botón que abre un popup con los datos de contacto del usuario, para respuesta ante urgencias en cualquier fase del traslado. El popup es **adaptativo por rol**: `jefe_local`/`administrador` ven sus **sucursales a cargo** (encargado) además de la de pertenencia; `logistica` ve sus **zonas territoriales** asignadas.
  - `R-PERF.7` — Los datos se traen con `getUsuarioDetalleAction` (solo usuarios autenticados y activos).
- **Con qué se conecta**: `perfil/page.tsx`, `perfil/PerfilClient.tsx`, `auth.actions.ts` (`updateProfileAction`), `auth.service.ts` (`updateProfile`), `users.service.ts` (`getUsuarioDetalleById`), `solicitudes.actions.ts` (`getUsuarioDetalleAction`), `usuario-info-modal.tsx`, `SolicitudesClient.tsx`, `PrioridadesClient.tsx`, `AprobacionesClient.tsx`, `HistorialClient.tsx`, `SucursalesTableClient.tsx`, `UsersTableClient.tsx`, `sucursales.service.ts` (ids de personas por solicitud), tablas `usuario`, `sucursal`, `usuario_zona`.
- **Depende de**: Módulo Autenticación (sesión), Módulo Solicitudes (detalle).
- **Historial**:
  | Fecha | Cambio | Motivo |
  |---|---|---|
  | 2026-09-29 | Popup "Datos de contacto" adaptativo por rol: `getUsuarioDetalleById` ahora devuelve sucursales a cargo (`sucursal.usuario_id`) y zonas asignadas (`usuario_zona`); el modal muestra "Sucursal de pertenencia" + "Sucursales a su cargo" para `jefe_local`/`administrador` y "Zonas de logística territorial" para `logistica` (chips) | Que el contacto refleje la organización real: un jefe de local puede encabezar varias sucursales y la logística opera por zonas |
  | 2026-09-05 | Mejoras: rediseño UI del perfil (se elimina la franja negra superior; hero con iniciales, datos de contacto en resumen y secciones con iconos), y nombres de usuario cliqueables en TODOS los puntos del sistema que indican un usuario/encargado (tabla de solicitudes, detalle con creador/responsable/encargado/jefe_local/logística, historial de cambios, observaciones, prioridades, aprobaciones, sucursales —encargado y personas de solicitudes—, historial de auditoría y gestión de usuarios) vía `UsuarioNombreBoton` | Acceso ágil a datos de contacto ante urgencias en cualquier fase del traslado; perfil más pulido |
  | 2026-09-05 | Creación del módulo: página `/perfil`, edición de nombre/apellido/teléfono, tarjeta "Contacto responsable" enriquecida y popups de usuario en historial/observaciones; columna `telefono` (`20260905_perfil_usuario_telefono.sql`) | Necesidad de contacto accesible (rol, sucursal, teléfono, correo) del responsable y de los usuarios que intervienen |

---

# PARTE 3 — Administración

## 3.1 Módulo: Gestión de Usuarios

- **Estado**: `implementado`
- **Qué hace**: CRUD de usuarios del sistema (solo `administrador`): crear, activar/desactivar, resetear contraseña, editar rol/sucursal. Genera contraseña provisoria y la envía por email (Brevo). Asigna **zonas** (solo rol `logistica`) y **sucursales a cargo** (encargado de local, roles `jefe_local`/administrador).
- **Cómo funciona**: `createUserAction` crea en `auth.admin.createUser` (email confirmado, `requiere_cambio_clave=true`) + upsert en `public.usuario`; si es `jefe_local` lo vincula como encargado de la sucursal (`usuario_id`). **Regla de pertenencia/organización**: un usuario pertenece a **una sola sucursal** (`usuario.sucursal_id`); ser "encargado" (a cargo) de sucursales es distinto de pertenecer a ellas. Las **zonas** (`usuario_zona`) solo se asignan a usuarios de rol `logistica`; si un usuario deja de ser logística, sus zonas se limpian automáticamente. Prevenciones: no permite desactivarse a sí mismo ni desactivar al admin principal (`maic.hernandez.dev@gmail.com`). Sin autoregistro.
- **Requisitos específicos**:
  - `R-USU.1` — Solo administradores gestionan usuarios; sin registro público.
  - `R-USU.2` — Alta con contraseña provisoria `HM-*` y envío Brevo.
  - `R-USU.3` — Reset de contraseña (nueva provisoria + `requiere_cambio_clave`).
  - `R-USU.4` — Activación/desactivación en tiempo real (afecta el login).
  - `R-USU.5` — Edición de rol, sucursal y datos.
  - `R-USU.6` — Un `jefe_local` creado queda como encargado de su sucursal.
  - `R-USU.7` — Solo el rol `logistica` puede tener zonas territoriales asignadas; al asignar/editar otro rol las zonas se limpian.
  - `R-USU.8` — El usuario pertenece a una única sucursal (`sucursal_id`); un `jefe_local` puede estar a cargo de varias (`sucursal.usuario_id`) sin pertenecer a ellas.
- **Con qué se conecta**: `users.service.ts`, `users.actions.ts`, `EmailService`, Supabase Auth Admin, tablas `usuario`, `sucursal`, `usuario_zona`.
- **Depende de**: Módulo Autenticación (sesión), Módulo Correo, Módulo Organización Territorial (zonas).
- **Historial**:
  | Fecha | Cambio | Motivo |
  |---|---|---|
  | 2026-09-28 | Zonas asignables solo a rol `logistica` (UI oculta el selector para otros roles; service/actions limpian `usuario_zona` en roles no-logística). Regla de pertenencia única a una sucursal: "a cargo" ≠ "pertenece" | Corrección: los encargados por zona son solo logística; los usuarios pertenecen a una sola sucursal |
  | 2026-08-27 | Se registra en RequisitosModulos.md | Documentación de requisitos |

---

## 3.2 Módulo: Gestión de Vehículos

- **Estado**: `implementado`
- **Qué hace**: alta/edición/borrado manual de vehículos; consulta de inventario con disponibilidad; filtrado del inventario por texto, marca, estado, sucursal/ubicación y rango de fecha de registro; validación de datos y de uso en solicitudes activas.
- **Cómo funciona**: `VehiculoService` valida **chasis 17 alfanuméricos**, **patente chilena** (`XXXX-XX`/`XXXX-XXXX`), año 1900..año+1 y duplicados. Un vehículo **reservado en solicitud activa no se puede editar ni eliminar**. La disponibilidad se deriva de `solicitud_vehiculo` con `disponibilidad='reservado'` en estados activos. El listado completo se trae al servidor en una sola pasada (paginación interna por `.range()` de 1000 filas **con desempate por `id`** y deduplicación por `id`, para que el `ORDER BY created_at` —no determinista en importaciones masivas— no devuelva filas repetidas). El filtrado del inventario es de cliente y puro: vive en `src/lib/filtrosVehiculos.ts` (`filtrarVehiculos`, `contarPorDisponibilidad`, `hayFiltrosActivos`), combinado con búsqueda libre, marca, estado, **ubicación** (cada sucursal + el grupo "En viaje / Container" para los vehículos con `ubicacion IS NULL`) y **rango de fecha de registro** (`created_at`, extremos inclusivos, unbound = sin límite). Las métricas de las tarjetas superiores respetan los filtros activos. Roles de alta: administrador, jefe_local, logística (borrar solo administrador).
- **Requisitos específicos**:
  - `R-VEH.1` — Alta manual de vehículos con los campos chasis, patente, marca, modelo, año, color.
  - `R-VEH.2` — Validación de formato (chasis, patente chilena, año, duplicados).
  - `R-VEH.3` — Edición permitida solo si el vehículo no está reservado en solicitud activa.
  - `R-VEH.4` — Borrado permitido solo si no está reservado en solicitud activa.
  - `R-VEH.5` — Inventario muestra disponibilidad (reservado/en_disponible) según reservas activas.
  - `R-VEH.6` — Roles autorizados a incorporar vehículos: administrador, jefe_local, logística.
  - `R-VEH.7` — Campo `precio` opcional (≥ 0) al crear y editar un vehículo; se muestra en el inventario.
  - `R-VEH.8` — El inventario se puede filtrar por sucursal de ubicación, incluyendo la opción "En viaje / Container" (vehículos sin sucursal asignada).
  - `R-VEH.9` — El inventario se puede filtrar por rango de fecha de registro (desde/hasta, extremos inclusivos, cada extremo opcional).
  - `R-VEH.10` — Los filtros son combinables entre sí, restablecen la paginación a la página 1 y se pueden limpiar con un solo botón ("Limpiar filtros").
  - `R-VEH.11` — Las tarjetas de métricas (Total / Disponibles / En Uso / Vendidos) reflejan los resultados filtrados.
  - `R-VEH.12` — La carga del inventario no puede devolver vehículos duplicados por paginación del servidor.
- **Con qué se conecta**: `vehiculo.service.ts`, `vehiculo.actions.ts`, `VehiculosTableClient.tsx`, `src/lib/filtrosVehiculos.ts`, tablas `vehiculo`, `solicitud_vehiculo`.
- **Depende de**: reservas creadas por el Módulo Solicitudes; lista de sucursales del Módulo 3.3 Gestión de Sucursales (opciones del filtro de ubicación).
- **Historial**:
  | Fecha | Cambio | Motivo |
  |---|---|---|
  | 2026-09-29 | Filtros de ubicación (sucursal + En viaje / Container) y de rango de fecha de registro; métricas por filtros; botón "Limpiar filtros"; lógica de filtrado extraída a `src/lib/filtrosVehiculos.ts` con tests | Auditar subconjuntos del inventario (p. ej. vehículos en container o registrados en un rango de fechas) |
  | 2026-09-29 | `getVehiculos`/`getMarcas`/import CSV ordenan por `id` como desempate y deduplican por `id` | El `ORDER BY created_at` con `OFFSET` devolvía 220 vehículos duplicados y 220 omitidos de 2261, provocando el error de `key` duplicada en la tabla |
  | 2026-08-28 | Nuevo campo opcional `precio` (numeric 14,2) en alta/edición e inventario de vehículos; migración `20260828_vehiculo_precio.sql` | Registrar el valor comercial de cada vehículo |
  | 2026-08-27 | Se registra en RequisitosModulos.md | Documentación de requisitos |

---

## 3.3 Módulo: Gestión de Sucursales

- **Estado**: `implementado`
- **Qué hace**: CRUD de sucursales (`administrador`): nombre, dirección, slots, relación con el `jefe_local` encargado y **asignación opcional a una zona territorial** (`zona_id`). Panel: `/admin/sucursales`.
- **Cómo funciona**: `SucursalesService` rechaza nombres duplicados y valida `slots` entero ≥ 0 con `slots_ocupados ≤ slots`. El borrado se **bloquea si hay usuarios asignados** a la sucursal y elimina en cascada las solicitudes asociadas (reporta cuántas). Al crear/editar, el administrador puede elegir la zona territorial a la que pertenece la sucursal.
- **Requisitos específicos**:
  - `R-SUC.1` — CRUD de sucursales solo administrador.
  - `R-SUC.2` — Nombre único; slots válidos.
  - `R-SUC.3` — Vincula encargado (jefe_local) a una sucursal.
  - `R-SUC.4` — No se puede eliminar una sucursal con usuarios asignados.
  - `R-SUC.5` — Validación de slots: la sucursal destino debe tener slots disponibles para la cantidad de vehículos de la solicitud. *(lógica de BD y UI: ver Módulo 5.3 Slots de Estacionamiento)*
  - `R-SUC.6` — Los slots se ocupan al crear la solicitud (estado `pendiente_aprobacion` o `aprobada`). *(ver Módulo 5.3)*
  - `R-SUC.7` — Al rechazar o cancelar una solicitud, se liberan automáticamente los slots ocupados. *(ver Módulo 5.3)*
  - `R-SUC.8` — El frontend muestra slots disponibles al seleccionar sucursal destino. *(ver Módulo 5.3)*
  - `R-SUC.9` — La sucursal puede asignarse a **una** zona territorial (`sucursal.zona_id`) al crearla o editarla.
- **Con qué se conecta**: `sucursales.service.ts`, `sucursales.actions.ts`, `SucursalesTableClient.tsx`, `organizacion.service.ts` (zonas), tablas `sucursal`, `zona` (vía `zona_id`), `usuario`, `solicitud`.
- **Depende de**: Módulo 3.1 Gestión de Usuarios (encargado), Módulo 4 Solicitudes (origen/destino), Módulo 3.4 Organización Territorial (zonas).
- **Historial**:
  | Fecha | Cambio | Motivo |
  |---|---|---|
  | 2026-09-28 | Sucursal asignable a una zona territorial (`zona_id`) desde el panel; tabla con filtro por zona | Habilitar la agrupación de sucursales por zonas territoriales |
  | 2026-09-02 | Se agrega validación de slots: triggers para validar, incrementar y decrementar `slots_ocupados` | Evitar sobreasignación de vehículos a sucursales |
  | 2026-08-27 | Se registra en RequisitosModulos.md | Documentación de requisitos |

---

## 3.4 Módulo: Organización Territorial (Zonas y Sucursales)

- **Estado**: `implementado`
- **Qué hace**: el `administrador` gestiona **zonas territoriales** (regiones/áreas) y agrupa sucursales en una zona. Un usuario de rol `logistica` se asigna a una o varias zonas/sucursales y su **alcance operativo** (solicitudes, calendarización, traslados) queda limitado a ellas. Panel: `/admin/sucursales` (título "Gestión de Zonas y Sucursales").
- **Cómo funciona**: el panel muestra la sección **"Zonas territoriales"** con una card por zona (nombre, nº de sucursales y listado), botones Editar/Eliminar y un modal crear/renombrar zona; la tabla de sucursales incluye un **filtro por zona** y cada sucursal se asigna a su zona al crearla/editarla. `OrganizacionService` (`getZonas`, `createZona`, `updateZona`, `deleteZona`) valida nombre obligatorio y único (búsqueda `ilike`) y **bloquea el borrado de una zona con sucursales asignadas** (hay que reasignarlas antes). Las actions (`createZonaAction`/`updateZonaAction`/`deleteZonaAction`) revalidan `/admin/sucursales` y `/admin/zonas`. La asignación de usuarios de logística a zonas/sucursales se hace desde Gestión de Usuarios (Pestañas "Zonas" / "Sucursales" → tablas `usuario_zona`/`usuario_sucursal`). Aplicación del alcance: `getSolicitudesFiltradas` filtra para logística por `solicitud.sucursal_zona_id` (`getSolicitudesPorZonas`); calendarizaciones y slots usan `getUserAssignedBranches`.
- **Requisitos específicos**:
  - `R-ORG.1` — CRUD de zonas solo administrador desde el panel "Gestión de Zonas y Sucursales".
  - `R-ORG.2` — El nombre de la zona es obligatorio y no puede repetirse (incluye renombrar a un nombre ya usado).
  - `R-ORG.3` — No se puede eliminar una zona que tenga sucursales asignadas; el sistema exige reasignarlas antes.
  - `R-ORG.4` — Una sucursal pertenece a **una sola** zona (`sucursal.zona_id`, opcional) y se asigna al crear/editar.
  - `R-ORG.5` — El panel muestra las sucursales de cada zona y permite filtrar la tabla de sucursales por zona.
  - `R-ORG.6` — Solo los usuarios de rol `logistica` reciben zonas territoriales (`usuario_zona`); a cualquier otro rol se le limpian (UI + service/actions). Las sucursales "a cargo" (`sucursal.usuario_id`) son del `jefe_local`/administrador, independientes de la pertenencia (`usuario.sucursal_id`).
  - `R-ORG.7` — La logística ve y opera solo solicitudes de sus zonas (`getSolicitudesPorZonas` sobre `sucursal_zona_id`); calendarización y slots usan sus sucursales asignadas.
  - `R-ORG.8` — La validación de pertenencia se centraliza en `OrganizacionService` (`usuarioTieneSucursal`, `getUserAssignedBranches`, `getUserZones`); la operativa NO reimplementa la lógica de asignación.
- **Con qué se conecta**: `organizacion.service.ts` (CRUD zonas + asignaciones), `organizacion.actions.ts` (`createZonaAction`, `updateZonaAction`, `deleteZonaAction`), `sucursales.service.ts`/`sucursales.actions.ts` (`zona_id`), `SucursalesTableClient.tsx` (UI zonas), `users.actions.ts`/`UsersTableClient.tsx` (asignación a usuarios), `solicitudes.service.ts` (`getSolicitudesFiltradas`, `getSolicitudesPorZonas`), `dashboard/page.tsx` (card admin), tablas `zona`, `usuario_zona`, `usuario_sucursal`, `sucursal.zona_id`.
- **Depende de**: Módulo 3.1 Gestión de Usuarios (asignación de zonas/sucursales), Módulo 3.3 Gestión de Sucursales (`zona_id`), Módulo 5.1 Logística Operativa (aplicación del alcance).
- **Historial**:
  | Fecha | Cambio | Motivo |
  |---|---|---|
  | 2026-09-28 | UI de gestión de zonas: sección "Zonas territoriales" con cards (crear/renombrar/eliminar con protección), filtro por zona en la tabla de sucursales, asignación de sucursal a zona y revalidación de `/admin/sucursales`; card del dashboard renombrada a "Gestión de Zonas y Sucursales" | La gestión de zonas existía en backend/BD (DEV 1) sin panel para el administrador |
  | 2026-09-15 | Esquema de zonas: tablas `zona`, `usuario_zona`, `usuario_sucursal`, columna `sucursal.zona_id`, fns `usuario_tiene_sucursal` y RLS (`20260915_zona_organizacion.sql`) | Soportar organización territorial y alcance de logística por zonas |

---

# PARTE 4 — Solicitudes

## 4.1 Módulo: Solicitudes — Creación

- **Estado**: `implementado`
- **Qué hace**: formulario de creación de solicitudes con ≥ 1 vehículo, tipo `venta` (sucursal destino) o `evento` (dirección/título), reserva de vehículos y registro de auditoría.
- **Cómo funciona**:
  - Roles: `ejecutivo`, `jefe_local`, `administrador`.
  - El ejecutivo crea **solo en su sucursal**, **sin campo de fecha** → `pendiente_aprobacion`, y hereda `jefe_local_id` = jefe de local de su sucursal (si no existe, no puede crear).
  - El jefe_local crea con **fecha de entrega obligatoria** → `aprobada` automáticamente; `jefe_local_id = profile.id`.
  - `createSolicitud` valida que ningún vehículo esté reservado en otra solicitud activa; inserta `solicitud_vehiculo` con `disponibilidad='reservado'`; si falla hace rollback (borra la solicitud); registra auditoría `ASIGNACION_VEHICULO` por vehículo y observación inicial.
  - Destino puede ser **igual** al origen (venta interna).
- **Requisitos específicos**:
  - `R-SOL-CRE.1` — Una solicitud no puede existir sin al menos un vehículo.
  - `R-SOL-CRE.2` — Los vehículos seleccionados no pueden estar reservados en otra solicitud activa.
  - `R-SOL-CRE.3` — Ejecutivo crea solo en su sucursal y sin fecha de entrega.
  - `R-SOL-CRE.4` — Al crear, el ejecutivo queda asignado (si aplica) y se resuelve `jefe_local_id` por sucursal.
  - `R-SOL-CRE.5` — Jefe_local/admin deben indicar fecha de entrega al crear; jefe_local crea el estado `aprobada`.
  - `R-SOL-CRE.6` — Reserva de vehículos transaccional (rollback si falla).
  - `R-SOL-CRE.7` — La sucursal destino puede coincidir con la origen.
  - `R-SOL-CRE.8` — Al crear una solicitud de venta, se valida que la sucursal destino tenga slots disponibles para la cantidad de vehículos seleccionados.
  - `R-SOL-CRE.9` — El frontend muestra los slots disponibles al seleccionar la sucursal destino y advierte si se exceden.
- **Con qué se conecta**: `solicitudes.service.ts` (`createSolicitud`), `createSolicitudAction`, `SolicitudesClient.tsx`, tablas `solicitud`, `solicitud_vehiculo`, `observacion`, `auditoria`, `usuario`.
- **Depende de**: Módulo 3.2 Gestión de Vehículos (inventario/disponibilidad), Módulo 3.3 Gestión de Sucursales, Módulo 4.2 Aprobación (si es ejecutivo), Módulo 5.3 Slots.
- **Historial**:
  | Fecha | Cambio | Motivo |
  |---|---|---|
  | 2026-09-05 | Detalle de solicitud: la tarjeta "Contacto responsable" muestra nombre, rol, sucursal, teléfono y correo; los nombres en historial/observaciones abren un popup con los datos del usuario (`getUsuarioDetalleAction`, `usuario-info-modal.tsx`) | Acceso rápido al contacto de responsables y usuarios que intervienen |
  | 2026-08-27 | El ejecutivo ya no ve el campo de fecha; el jefe_local la define al crear o al aprobar | Que la fecha la fije solo el jefe de local |
  | 2026-08-27 | Se asigna `jefe_local_id` automáticamente al crear (jefe de local de la sucursal del ejecutivo) | Aprobación/responsabilidad por sucursal |
  | 2026-08-27 | Se permite sucursal destino = origen | Venta interna en el mismo local |
  | 2026-08-27 | Se elimina validación de destino ≠ origen en trigger BD (`20260827_solicitudes_v2_2.sql`) | Alinearse con venta interna |
  | 2026-08-26 | `createSolicitud` setea `estado` y `jefe_local_id`; se elimina auto-aprobado roto; se agrega validación de reservas activas y auditoría | Esquema V2 de solicitudes |
  | 2026-09-02 | Se agrega validación de slots disponibles en sucursal destino (trigger BD + service + frontend) | Evitar que solicitudes excedan capacidad de slots de la sucursal destino |

---

## 4.2 Módulo: Solicitudes — Aprobación y rechazo

- **Estado**: `implementado`
- **Qué hace**: el jefe de local (o administrador) aprueba o rechaza solicitudes `pendiente_aprobacion` de **su sucursal**. La aprobación **define la fecha de entrega**. El rechazo deja un **motivo visible** para el solicitante.
- **Cómo funciona**: botón "Aprobar" abre un modal con **Fecha de Entrega (requerida)**; al confirmar, `aprobarSolicitudAction(id, fecha)` → `aprobarSolicitud` valida que esté en `pendiente_aprobacion` y que la fecha sea válida, pasa a `aprobada` + `fecha_limite` y audita. El rechazo exige motivo ≥ 5 caracteres, pasa a `rechazada` y **agrega una observación con el prefijo `[RECHAZO] `** (`rechazarSolicitud`), que es el registro del motivo; además queda en auditoría (`accion='rechazo'`, `valor_nuevo.motivo`). La columna `motivo_cancelacion` es un campo aparte y solo aplica a cancelaciones. La lectura del motivo vive en `src/lib/motivoRechazo.ts` (`PREFIJO_RECHAZO`, `tienePrefijoRechazo`, `quitarPrefijoRechazo`, `extraerMotivoRechazo`) para que rechazo, detalle y lista muestren siempre el mismo texto.
- **Requisitos específicos**:
  - `R-SOL-APR.1` — Solo jefe_local de la sucursal o administrador aprueban/rechazan.
  - `R-SOL-APR.2` — Aprobar exige fecha de entrega válida (verifica `pendiente_aprobacion` previo).
  - `R-SOL-APR.3` — Rechazar exige motivo (≥5 caracteres) y lo registra como observación.
  - `R-SOL-APR.4` — Ambas acciones quedan auditadas.
  - `R-SOL-APR.5` — El motivo se **lee de vuelta** para el solicitante: el detalle muestra un panel rojo en todas las pestañas con el motivo, el responsable y la fecha, extrayéndolo de la observación `[RECHAZO]` más reciente (`extraerMotivoRechazo`). Las solicitudes rechazadas sin esa observación caen a un mensaje genérico. No existe columna `motivo_rechazo`: el registro es la observación prefijada.
  - `R-SOL-APR.6` — En la lista, el estado `Rechazada` es un botón que abre directamente el detalle para poder leer el motivo sin entrar a otra pestaña.
- **Con qué se conecta**: `solicitudes.service.ts` (`aprobarSolicitud`, `rechazarSolicitud`), `aprobarSolicitudAction`, `rechazarSolicitudAction`, `AprobacionesClient.tsx`, `src/lib/motivoRechazo.ts` (extracción del motivo), `SolicitudDetalleModal.tsx` (panel del motivo), tablas `solicitud`, `observacion`, `auditoria`.
- **Depende de**: Módulo 4.1 Solicitudes-Creación, Módulo 3.3 Gestión de Sucursales.
- **Historial**:
  | Fecha | Cambio | Motivo |
  |---|---|---|
  | 2026-09-30 | `R-SOL-APR.5`/`.6`: panel rojo del motivo en `SolicitudDetalleModal` (todas las pestañas, con responsable y fecha) y estado "Rechazada" como botón en `SolicitudesClient`, ambos sobre `src/lib/motivoRechazo.ts`. Sin columna nueva | El solicitante no tenía forma de leer por qué le rechazaron |
  | 2026-08-27 | Aprobación con modal que exige Fecha de Entrega; `aprobarSolicitudAction(id, fecha)` escribe `fecha_limite` | La fecha la define el jefe de local al aprobar |
  | 2026-08-27 | `AprobacionesClient` adaptado a la firma con fecha | Mantener typecheck y flujo coherente |
  | 2026-08-26 | Estados `aprobada`/`rechazada`/`pendiente_aprobacion` y reglas de transición | Esquema V2 de solicitudes |

---

## 4.3 Módulo: Solicitudes — Priorización y Cola por sucursal

- **Estado**: `implementado`
- **Qué hace**: el jefe de local (o administrador) prioriza solicitudes `pendiente`/`aprobada` **arrastrándolas desde "Por Priorizar" hacia la cola en la posición deseada**, las ordena en una **cola por sucursal** y puede sacarlas de la cola.
- **Cómo funciona**: `priorizarEnPosicion` inserta la solicitud en la posición exacta donde se suelta (`priorizada` + reescritura de la cola con técnica de dos fases para respetar `UNIQUE(sucursal, posicion_prioridad)`); si la cola está vacía o el destino es de otra sucursal, usa `priorizarSolicitud` (máx+1). `reordenarCola` reordena la cola (solo estados `priorizada`) y `sacarDeCola` vuelve a `aprobada` (recompacta la cola; también se activa arrastrando un ítem fuera de la cola). Todo auditado. El **resumen de la cola** (top 8, agrupada por sucursal) se muestra además en el dashboard del jefe de local como feedback de urgencia (ver Módulo 6.1 Dashboard).
- **Requisitos específicos**:
  - `R-SOL-PRI.1` — Priorizar desde `pendiente`/`aprobada` a `priorizada`.
  - `R-SOL-PRI.2` — La posición de prioridad es por sucursal.
  - `R-SOL-PRI.3` — Reordenar cola solo sobre solicitudes `priorizada`.
  - `R-SOL-PRI.4` — Sacar de cola regresa a `aprobada` sin posición.
  - `R-SOL-PRI.5` — Solo jefe_local de la sucursal o administrador.
  - `R-SOL-PRI.6` — Priorización por drag & drop (`@dnd-kit`): arrastrar desde "Por Priorizar" inserta en la posición de destino (sin botón manual); con `DragOverlay`, zonas droppables para cola vacía y panel vacío, y resaltado del ítem destino. La posición se calcula dentro de la subsecuencia de la misma sucursal (soporta la vista mixta del administrador).
- **Con qué se conecta**: `solicitudes.service.ts` (priorizar/priorizarEnPosicion/reordenar/sacar), acciones `priorizarSolicitudAction`, `priorizarEnPosicionAction`, `reordenarColaAction`, `sacarDeColaAction`, `PrioridadesClient.tsx`, `dashboard/page.tsx` + `DashboardPrioridades.tsx` (resumen), tabla `solicitud`.
- **Depende de**: Módulo 4.2 Aprobación.
- **Historial**:
  | Fecha | Cambio | Motivo |
  |---|---|---|
  | 2026-08-28 | Priorización por drag & drop: se elimina el botón "Priorizar", nuevo `priorizarEnPosicion`/`priorizarEnPosicionAction` e inserción en posición específica | El usuario pedía elegir la posición al priorizar, no entrar automáticamente al final |
  | 2026-08-27 | Se registra en RequisitosModulos.md | Documentación de requisitos |
  | 2026-08-26 | Creación del módulo de priorización (commit `48d80cb`) | Flujo de priorización del jefe de local |

---

## 4.4 Módulo: Solicitudes — Detalle, trazabilidad, observaciones y documentos

- **Estado**: `implementado`
- **Qué hace**: vista de detalle de una solicitud con su tira de información (vehículo, origen, destino, prioridad, encargado, responsable), fechas de planificación, **trazabilidad del flujo**, historial de auditoría, observaciones, documentos adjuntos y el **motivo de rechazo** cuando corresponde.
- **Cómo funciona**: `SolicitudDetalleModal.tsx` (client) se abre desde las tablas de solicitudes, prioridades, aprobaciones y el dashboard. Al abrir carga en paralelo `getObservacionesAction`, `getAuditoriaAction`, `getUsuarioDetalleAction` y `getDocumentosSolicitudAction`. Tabs: Información, Historial, Observaciones, Documentos. Cuando `estado === 'rechazada'` muestra un **panel rojo en la parte superior** con el motivo, quién rechazó y cuándo; el motivo se obtiene con el helper puro `extraerMotivoRechazo` desde la observación con prefijo `[RECHAZO] ` (más reciente). El motivo de cancelación (`motivo_cancelacion`) se muestra aparte y con estilo diferenciado.
- **Requisitos específicos**:
  - `R-SOL-DET.1` — El detalle muestra la información clave de la solicitud y la trazabilidad de fechas del flujo.
  - `R-SOL-DET.2` — El motivo de rechazo (estado `rechazada`) se muestra en un panel destacado **en la parte superior del modal**, en todas sus pestañas, con el nombre de quien rechazó y la fecha.
  - `R-SOL-DET.3` — El motivo de rechazo se extrae de la observación `[RECHAZO]` más reciente mediante un helper puro y probado; si no existe (histórico), se informa que no quedó registrado.
  - `R-SOL-DET.4` — El motivo de cancelación (`motivo_cancelacion`) se muestra de forma diferenciada al de rechazo.
  - `R-SOL-DET.5` — Observaciones, auditoría y documentos se cargan al abrir el detalle y son editables según permisos.
  - `R-SOL-DET.6` — Los nombres de usuarios del detalle son botones con popup de datos de contacto (Módulo 2.2).
- **Con qué se conecta**: `SolicitudDetalleModal.tsx`, `src/lib/motivoRechazo.ts`, `solicitudes.actions.ts` (`getObservacionesAction`, `getAuditoriaAction`, `getDocumentosSolicitudAction`, `subir/eliminar/descargarDocumentoSolicitudAction`, `agregarObservacionAction`), tablas `solicitud`, `observacion`, `auditoria`, `solicitud_documento`, `usuario`.
- **Depende de**: Módulo 4.1/4.2 Solicitudes, Módulo 2.2 Perfil (datos de contacto), Módulo 5.3 Slots (liberación por rechazo/cancelación).
- **Historial**:
  | Fecha | Cambio | Motivo |
  |---|---|---|
  | 2026-08-27 | Se crea el módulo de detalle de solicitud (tira de información, tabs de historial/observaciones/documentos) | El sistema necesita una vista única de la solicitud con su trazabilidad |

---

## 4.5 Módulo: Solicitudes — Lista, filtros y seguimiento unificado

- **Estado**: `implementado`
- **Qué hace**: página única `/solicitudes` que muestra las tarjetas de métricas, la barra de filtros y la tabla de solicitudes. Para el `ejecutivo` es además su **página principal**: ahí crea, edita, sigue y entrega, sin necesidad de un dashboard propio (ver 1.4.1).
- **Cómo funciona**: el servidor entrega la lista ya recortada al alcance del usuario con `SolicitudesService.getSolicitudesFiltradas` (el `ejecutivo` solo ve las suyas); el cliente solo afina la vista. La lógica de agrupación de estados vive en el helper puro y probado `src/lib/filtroSolicitudes.ts` (`GRUPOS_FILTRO_SOLICITUDES`, `grupoFiltro`, `estadoEnGrupo`, `filtrarPorGrupo`, `contarPorGrupo`, `destinoDeSolicitud`, `coincideBusqueda`) para que las tarjetas, los chips y la tabla nunca discrepen. Los filtros se aplican en cascada: **grupo de estado** → estado exacto (select) → texto.
- **Requisitos específicos**:
  - `R-SOL-LIS.1` — El filtro principal es por **grupo de estado** y muestra el contador de cada grupo: `Todas` · `Pendientes` (`pendiente_aprobacion`, `pendiente`) · `En curso` (`aprobada`, `priorizada`, `asignada`, `calendarizada`, `despachada`, `en_transito`) · `Por entregar` (`entregada`) · `Rechazadas` (`rechazada`) · `Finalizadas` (`finalizada`). `cancelada` queda fuera de los grupos y solo se ve en "Todas".
  - `R-SOL-LIS.2` — Las 4 tarjetas de métricas son **botones** que activan el filtro de su grupo (`aria-pressed` marca el activo), de modo que el contador y el filtro nunca se contradicen.
  - `R-SOL-LIS.3` — Al cambiar de grupo, si el estado exacto seleccionado no pertenece al grupo nuevo, el select vuelve a "Todos".
  - `R-SOL-LIS.4` — El buscador cubre sucursal, ID, nombres de personas, destino, dirección/título del evento y patente.
  - `R-SOL-LIS.5` — La tabla conserva su diseño (Solicitud, Destino, Estado, Encargado, Tipo, Creación, Fecha/hora límite, Acciones, Ver) con el semáforo de atraso por `fecha_limite` y el borde de color.
  - `R-SOL-LIS.6` — Cuando no hay resultados se distingue entre "todavía no tienes solicitudes" y "no hay solicitudes en <grupo>".
  - `R-SOL-LIS.7` — Para el `ejecutivo` la página se titula **Mis Solicitudes** y el encabezado no ofrece volver al dashboard; muestra enlaces **Mi perfil** y **FAQ**.
  - `R-SOL-LIS.8` — La entrega al cliente (`entregada` → `finalizada`) sigue disponible para el `ejecutivo` creador desde esta misma tabla (`finalizarSolicitudAction`), igual que para el jefe de local de destino o el administrador.
- **Con qué se conecta**: `SolicitudesClient.tsx`, `src/lib/filtroSolicitudes.ts`, `SolicitudesService.getSolicitudesFiltradas`, `solicitudes.actions.ts` (`finalizarSolicitudAction`, `insistirSolicitudAction`, `cancelarSolicitudAction`), `src/components/PageHeader.tsx`, `src/config/dashboard-cards.ts`, tabla `solicitud`.
- **Depende de**: Módulo 4.1/4.2 Solicitudes, Módulo 5.1 Logística Operativa (estados `entregada`/`finalizada`), Módulo 6.1 Dashboard por rol.
- **Historial**:
  | Fecha | Cambio | Motivo |
  |---|---|---|
  | 2026-09-30 | `R-SOL-LIS.1`-`.8`: filtro por grupos con contadores, tarjetas-metrics clicables, helper puro `src/lib/filtroSolicitudes.ts` y `/solicitudes` como página principal del `ejecutivo` (sin dashboard, sin `/solicitudes/aprobaciones`) | El ejecutivo repetía la misma card dos veces; sus estados (pendientes, aprobadas, por entregar) se dispersaban entre dos páginas |

---

# PARTE 5 — Logística y Traslados

## 5.1 Módulo: Logística Operativa — `parcial`

- **Estado**: `parcial`
- **Qué hace**: calendarización de traslados con fecha tentativa, despacho (en tránsito), confirmación de entrega en destino y finalización formal. Ruta: `/logistica/calendarizaciones`.
- **Cómo funciona**: `CalendarizacionesClient.tsx` muestra solicitudes `priorizada`/`calendarizada`/`en_transito`/`entregada`/`finalizada` en vista de calendario. Jefe_local/logística pueden **calendarizar** (arrastrar a fecha → `calendarizada`, guarda `fecha_tentativa_despacho` y `logistica_id`). Logística/admin pueden **descalendarizar** (vuelve a `priorizada`). Logística/admin pueden **despachar** (`calendarizada` → `en_transito`, guarda `fecha_despacho`). Jefe_local/admin pueden **recibir** (`en_transito` → `entregada`, guarda `fecha_entrega`). Jefe_local/admin pueden **finalizar** (`entregada` → `finalizada`). Todos los pasos registran auditoría. Botones "Recibir" y "Finalizar" también disponibles en `/solicitudes` (vista general). **La logística opera solo sobre sus zonas/sucursales asignadas**: `getSolicitudesFiltradas` usa `getSolicitudesPorZonas` (filtra por `solicitud.sucursal_zona_id` de las zonas de `usuario_zona`) para el rol logística, y las calendarizaciones/slots usan `getUserAssignedBranches`.
- **Requisitos específicos**:
  - `R-LOG.2` — Calendarización con fecha tentativa (`calendarizada`). **Implementado**.
  - `R-LOG.3` — Despacho / en tránsito (`en_transito`). **Implementado**.
  - `R-LOG.4` — Confirmación de entrega en destino (`entregada`). **Implementado**.
  - `R-LOG.5` — Finalización formal (`finalizada`). **Implementado**.
  - `R-LOG.6` — Libera los vehículos al completar/cancelar. Implementado vía trigger `disponibilidad()` (al cancelar).
  - `R-LOG.7` — La logística ve y opera solo solicitudes de sus zonas/sucursales asignadas (organización territorial). **Implementado**.
  - `R-LOG.1` — Asignación explícita de solicitud a logística (`asignada`). **Pendiente**: el estado `asignada` existe en el enum y `calendarizarSolicitud` lo acepta como FROM, pero no hay transición que lo produzca. Actualmente `logistica_id` se fija implícitamente al calendarizar.
- **Con qué se conecta**: `solicitudes.service.ts` (`calendarizarSolicitud`, `descalendarizarSolicitud`, `despacharSolicitud`, `recibirSolicitud`, `finalizarSolicitud`, `getSolicitudesFiltradas`, `getSolicitudesPorZonas`), `solicitudes.actions.ts` (acciones homónimas), `CalendarizacionesClient.tsx`, `SolicitudesClient.tsx` (botones Recibir/Finalizar), `organizacion.service.ts` (`getUserZones`, `getUserAssignedBranches`), tablas `solicitud`, `notificacion` (sin UI aún).
- **Depende de**: Módulo 4 Solicitudes (estados previos), Módulo 3.4 Organización Territorial (alcance por zonas).
- **Historial**:
  | Fecha | Cambio | Motivo |
  |---|---|---|
  | 2026-09-28 | Documentado el alcance territorial de logística por zonas (`getSolicitudesPorZonas`, `getUserAssignedBranches`) como R-LOG.7 | La logística ya operaba limitada a sus zonas; se formaliza en requisitos |
  | 2026-09-03 | Implementado: calendarizar, despachar, recibir, finalizar con UI en `/logistica/calendarizaciones` y botones en `/solicitudes` | Completar flujo logístico del MVP |
  | 2026-09-03 | Fix: revalidate path corregido de `/solicitudes/calendarizaciones` a `/logistica/calendarizaciones` | Path incorrecto impedía refresco de UI |
  | 2026-08-27 | Se documenta como pendiente | Módulo fuera del alcance actual del MVP |

---

## 5.2 Módulo: Traslados Internos

- **Estado**: `implementado`
- **Qué hace**: mueve vehículos **ya vendidos** entre sucursales (tabla `traslado_interno`). A diferencia de una solicitud, el vehículo **nunca cambia de `disponibilidad`**: sigue `vendido`. Flujo: `pendiente` → `en_transito` → `recepcionado`. Ruta: `/solicitudes/traslados`.
- **Cómo funciona**: sólo **operadores** (`administrador`/`logistica`) crean traslados: eligen origen, destino y vehículos vendidos no actualmente en tránsito. Al crear, cada vehículo queda en `en_traslado_activo`; al despachar pasa a `en_transito` (guarda `fecha_despacho`). El **jefe local destino solo recepciona**; no puede rechazar. Logística/admin pueden cancelar un traslado pendiente, lo que libera los vehículos. Cada acción revalida `/solicitudes/traslados`.
- **Requisitos específicos**:
  - `R-TRA.1` — Traslado interno mueve vehículos ya `vendido`; no reserva slots ni altera su disponibilidad.
  - `R-TRA.2` — Solo `administrador` y `logistica` (operadores) crean traslados con sus vehículos disponibles.
  - `R-TRA.3` — Un vehículo no puede estar en dos traslados activos simultáneamente.
  - `R-TRA.4` — El jefe local destino recepciona el traslado; no puede rechazarlo.
  - `R-TRA.5` — El estado sigue `pendiente` → `en_transito` → `recepcionado`.
  - `R-TRA.6` — Cancelar un traslado pendiente libera los vehículos para nuevos traslados.
- **Con qué se conecta**: `src/app/solicitudes/traslados/` (`page.tsx`, `TrasladosClient.tsx`), `traslados.actions.ts`, `traslado.service.ts`, `src/types/traslado.types.ts`, tablas `traslado_interno`, `traslado_vehiculo`, `vehiculo`.
- **Depende de**: Módulo 3.2 Gestión de Vehículos (inventario vendido), Módulo 3.4 Organización Territorial (alcance de zonas/sucursales).
- **Historial**:
  | Fecha | Cambio | Motivo |
  |---|---|---|
  | 2026-08-27 | Se crea el módulo de traslados internos | Mover vehículos ya vendidos entre sucursales sin ocupar slots ni generar solicitudes |

---

## 5.3 Módulo: Slots de Estacionamiento por sucursal

- **Estado**: `implementado`
- **Qué hace**: controla la capacidad de estacionamiento de cada sucursal (`sucursal.slots`, `slots_ocupados`, `slots_reservados`) para que no se acepten más vehículos de los que caben. Muestra los slots disponibles al seleccionar la sucursal destino y expone un panel de detalle en `/logistica/slots`.
- **Cómo funciona**: la lógica de ocupación vive en **triggers de BD** (`esquema-completo-sql.sql`): `tr_validar_slots_solicitud_vehiculo` (BEFORE INSERT, rechaza si no hay capacidad), `tr_incrementar_slots_ocupados` (AFTER INSERT en `solicitud_vehiculo`, suma en la sucursal **destino** de solicitudes tipo `venta`), `tr_decrementar_slots_ocupados` (AFTER DELETE) y `tr_liberar_slots_rechazo_cancelacion` (AFTER UPDATE del estado a `rechazada`/`cancelada`: cuenta los vehículos `reservado`, los libera y decrementa). El conteo de "libres" = `slots − slots_ocupados − slots_reservados`. El service y la UI usan el mismo criterio. El panel `/logistica/slots` es la vista de detalle y el dashboard muestra un indicador resumido.
- **Requisitos específicos**:
  - `R-SLOTS.1` — No se puede asignar/reservar un vehículo si la sucursal destino no tiene slots libres suficientes.
  - `R-SLOTS.2` — Los slots de la sucursal destino se incrementan al crear la solicitud (tipo `venta`).
  - `R-SLOTS.3` — Al rechazar, cancelar o eliminar una solicitud, sus slots se liberan automáticamente.
  - `R-SLOTS.4` — El sistema muestra los slots disponibles por sucursal (formulario de creación y panel `/logistica/slots`).
  - `R-SLOTS.5` — El conteo de slots libres descuenta tanto `slots_ocupados` como `slots_reservados`, y nunca es negativo.
  - `R-SLOTS.6` — El indicador de slots libres del panel/dashboard se actualiza tras acciones que réservéeen o liberen vehículos, y también cuando el cambio lo hace otro usuario (al volver a la pestaña).
- `R-SLOTS.7` - El cálculo de "libres" es una única función pura compartida: `src/lib/slots.ts` (`slotsLibres`, `resumenSlots`, `textoSlots`, `nombreSucursal`, `ordenarPorDisponibilidad`), usada por el indicador compacto del encabezado (`SlotsResumen.tsx`) y por `/logistica/slots`, para que ambas vistas no puedan discrepar. `resumenSlots` deriva además una criticidad (`ok` / `atencion` bajo el 20 % libre / `critico` sin libres) que se muestra como punto de color.
- **Con qué se conecta**: triggers `fn_validar_slots_solicitud_vehiculo`, `fn_incrementar_slots_ocupados`, `fn_decrementar_slots_ocupados`, `fn_liberar_slots_rechazo_cancelacion`; `sucursales.service.ts` (`getSlotsPorSucursales`), `src/lib/slots.ts` (cálculo puro), `src/components/SlotsResumen.tsx` (badge del encabezado), `/logistica/slots/SlotsClient.tsx`, `SolicitudesClient.tsx` (selección de destino), tablas `sucursal`, `solicitud`, `solicitud_vehiculo`.
- **Depende de**: Módulo 4.1 Solicitudes-Creación, Módulo 3.3 Gestión de Sucursales.
- **Historial**:
  | Fecha | Cambio | Motivo |
  |---|---|---|
  | 2026-09-30 | `R-SLOTS.7`: el cálculo de libres se centraliza en `src/lib/slots.ts` y el badge del encabezado lo reutiliza, con refresco por foco (`router.refresh()`, throttle 15 s) y detalle por sucursal | Evitar dos cálculos de "libres" distintos entre badge y panel |
  | 2026-08-27 | Se registra la lógica de slots | Evitar sobreasignación de vehículos a sucursales |

---

# PARTE 6 — Paneles de control

## 6.1 Módulo: Dashboard por rol

- **Estado**: `implementado`
- **Qué hace**: es el **centro de navegación del sistema**. Muestra las cards de los módulos asignados al rol del usuario (con título, descripción y acciones disponibles), el resumen de slots libres y, para el jefe de local, un **feed de las solicitudes priorizadas** (urgencia). Sustituye la navegación por pestañas y al TopNavbar.
- **Cómo funciona**: página server (`src/app/dashboard/page.tsx`) que lee el perfil, obliga a `/establecer-clave` si la clave es provisoria, y arma las secciones **Gestión** (módulos que requieren decisión), **Operación** (módulos visuales/operativos) y **Soporte** (perfil, FAQ, historial, slots) usando el catálogo `src/config/dashboard-cards.ts` (`cardsPorRol`, `tituloDeCard`). El `administrador` ve la nomenclatura de gestión ("Gestión de …"); los demás roles ven la nomenclatura de su rol. El feed de prioridades consume la cola priorizada del alcance del jefe de local (`estado='priorizada'`, ordenada por `posicion_prioridad`), agrupada por sucursal y con corte visual a 8 elementos.
- **Requisitos específicos**:
  - `R-DASH.1` — Acceso a módulos según rol.
  - `R-DASH.2` — Fuerza `/establecer-clave` si la clave es provisoria.
  - `R-DASH.3` — Muestra métricas e inventario de solicitudes.
  - `R-DASH.4` — Un catálogo único (`src/config/dashboard-cards.ts`) define qué cards ve cada rol, con título, descripción, acciones, icono, href y orden.
  - `R-DASH.5` — El `administrador` conserva la nomenclatura "Gestión de …"; los demás roles ven la nomenclatura propia de su rol ("Carga de vehículos" para `operaciones`/`jefe_local`/`logistica`, "Calendarización de traslados" para `jefe_local`/`logistica`).
  - `R-DASH.6` — Cada card muestra el título, una descripción de qué hace el módulo y las acciones que se pueden realizar.
  - `R-DASH.7` — El dashboard se ordena en secciones Gestión → Operación → Soporte; los grupos vacíos no se renderizan.
  - `R-DASH.8` — Los antiguos accesos por pestañas (General/Traslados/Aprobaciones/Prioridades) se reemplazan por cards de acceso directo en el dashboard, conservando la visibilidad por rol.
  - `R-DASH.9` — El dashboard del jefe de local muestra la cola priorizada de sus sucursales (máx. 8 visibles, agrupada si preside varias) ordenada por posición, con la patente, ruta y estado de cada solicitud.
  - `R-DASH.10` — El feed de prioridades indica el total en cola, cuántas son urgentes (posición ≤ 2) y cuántas están por aprobar.
  - `R-DASH.11` — La lectura de prioridades y slots se hace una sola vez por render y no duplica consultas.
  - `R-DASH.12` — La interfaz del dashboard es responsive (320–1440 px, sin scroll horizontal) y usa una tipografía legible.
  - `R-DASH.13` — El `ejecutivo` **no tiene dashboard**: `/dashboard` responde `redirect('/solicitudes')`, que es su página principal y reúne todo lo suyo (ver 1.4.1 y Módulo 4.5).
  - `R-DASH.14` — Ninguna card declara título para `ejecutivo`, por lo que `cardsPorRol('ejecutivo')` y `seccionesPorRol('ejecutivo')` devuelven listas vacías.
  - `R-DASH.15` — `/solicitudes/aprobaciones` es exclusiva de `jefe_local` y `administrador`; el `ejecutivo` es redirigido a `/solicitudes` y nunca ve solicitudes de otras sucursales.
- **Con qué se conecta**: `src/app/dashboard/page.tsx`, `src/config/dashboard-cards.ts`, `DashboardCardGrid.tsx`, `DashboardPrioridades.tsx`, `src/lib/slots.ts`, `src/services/solicitudes.service.ts` (priorizadas), `src/services/sucursales.service.ts` (slots), `src/services/organizacion.service.ts` (sucursales asignadas), `src/components/PageHeader.tsx`, `src/app/solicitudes/aprobaciones/page.tsx` (guard de rol).
- **Depende de**: Módulo 2.1 Autenticación (sesión/rol), Módulo 4.3 Priorización, Módulo 4.5 Lista y filtros, Módulo 5.3 Slots.
- **Historial**:
  | Fecha | Cambio | Motivo |
  |---|---|---|
  | 2026-08-27 | Se registra en RequisitosModulos.md | Documentación de requisitos |
  | 2026-09-30 | `R-DASH.13`-`R-DASH.15`: el `ejecutivo` deja de tener cards, `/dashboard` lo redirige a `/solicitudes` y `/solicitudes/aprobaciones` queda restringida a `jefe_local`/`administrador` | Dos cards que apuntaban casi a lo mismo; todo su flujo cabe en `/solicitudes` |
  | 2026-09-30 | Implementación de `R-DASH.4`–`R-DASH.12`: catálogo único `src/config/dashboard-cards.ts`, secciones Gestión/Operación/Soporte y feed de prioridades (top 8) para `jefe_local`. Se eliminan `TopNavbar`, `SolicitudesHeader`, `SolicitudesTabBar` y `lib/solicitudes-tabs.ts` | El dashboard pasa a ser el centro de navegación por rol |

---

# PARTE 7 — Soporte y plataforma

## 7.1 Módulo: Auditoría e Historial

- **Estado**: `implementado` (registro a nivel servicio) + panel admin
- **Qué hace**: registra y consulta la trazabilidad de acciones (cambios de estado, asignación/liberación de vehículos, priorización, cancelaciones) y expone métricas. Panel solo `administrador` con exportación a Excel.
- **Cómo funciona**: la escritura se hace desde la capa de servicios vía `SolicitudesService.registrarAuditoria` con el **usuario autenticado real** (los triggers automáticos fueron **deshabilitados** porque el cliente service-role dejaba `auth.uid()=NULL` y violaba `auditoria.usuario_id NOT NULL`, error 23502). `AuditoriaService.getAuditoria` aplica filtros y enriquece con datos de vehículos; `getMetricas` calcula finalizadas/reservadas/canceladas.
- **Requisitos específicos**:
  - `R-AUD.1` — Registro de auditoría en cada transición relevante (estado, vehículos, priorización, cancelación).
  - `R-AUD.2` — La auditoría registra el usuario que realizó la acción.
  - `R-AUD.3` — Consulta con filtros y métricas solo administrador.
  - `R-AUD.4` — El historial se conserva aunque el usuario haya sido desactivado.
  - `R-AUD.5` — Exportación a Excel del historial.
- **Con qué se conecta**: `auditoria.service.ts`, `auditoria.actions.ts`, `HistorialClient.tsx`, tabla `auditoria`, `solicitud_vehiculo`, `vehiculo`.
- **Depende de**: Módulo 4 Solicitudes (acciones auditadas).
- **Historial**:
  | Fecha | Cambio | Motivo |
  |---|---|---|
  | 2026-08-27 | Se registra en RequisitosModulos.md | Documentación de requisitos |
  | 2026-08-26 | Se deshabilitan triggers de auditoría; el registro pasa a la capa de servicio con usuario real (`20260826_deshabilitar_auditoria_service_role.sql`) | Errores 23502 con service-role |

---

## 7.2 Módulo: Notificaciones — **deshabilitado a nivel app**

- **Estado**: `parcial` (BD lista, triggers desactivados, sin UI ni lectura)
- **Qué hace (previsto)**: avisar a destinatarios sobre eventos del flujo (nueva solicitud, priorizada, asignada, calendarizada, en tránsito, entregada, finalizada, cancelada, vehículo reservado/liberado, nueva observación).
- **Cómo funciona hoy**: la tabla `notificacion`, el enum `tipo_notificacion` y las funciones `notificar_*` **existen en BD** y sus triggers **fueron desactivados** (`20260826_deshabilitar_notificaciones.sql`) porque violaban `notificacion.usuario_id NOT NULL` cuando el destinatario aún no estaba asignado. No hay servicios, acciones ni UI.
- **Requisitos específicos (propuestos)**:
  - `R-NOT.1` — Generar notificación en cada evento del flujo.
  - `R-NOT.2` — El destinatario lee/marca/elimina sus propias notificaciones (RLS lista).
  - `R-NOT.3` — Reactivar triggers o gestionar vía servicio.
- **Con qué se conectará**: tablas `notificacion`, triggers `notificar_*`, UI.
- **Depende de**: Módulo 4 Solicitudes y Módulo 5.1 Logística.
- **Historial**:
  | Fecha | Cambio | Motivo |
  |---|---|---|
  | 2026-08-27 | Se registra en RequisitosModulos.md | Documentación de requisitos |
  | 2026-08-26 | Triggers de notificación desactivados (`20260826_deshabilitar_notificaciones.sql`) | Fuera de alcance; evita violación de NOT NULL |

---

## 7.3 Módulo: Correo (Brevo)

- **Estado**: `implementado` (credenciales iniciales/reset)
- **Qué hace**: envía correos con credenciales provisorias y botón de ingreso al crear usuarios o resetear contraseña.
- **Cómo funciona**: `EmailService.sendUserCredentialsEmail` usa la API Brevo (`https://api.brevo.com/v3/smtp/email`) con `BREVO_API_KEY` y remitente configurable. No interviene en la recuperación de contraseña (esa la hace Supabase).
- **Requisitos específicos**:
  - `R-EMAIL.1` — Envío de credenciales iniciales al crear usuario.
  - `R-EMAIL.2` — Envío de nueva clave provisoria al resetear.
  - `R-EMAIL.3` — Configurable por variables de entorno.
- **Con qué se conecta**: `email.service.ts`, Módulo 3.1 Gestión de Usuarios, Brevo API.
- **Depende de**: variables de entorno.
- **Historial**:
  | Fecha | Cambio | Motivo |
  |---|---|---|
  | 2026-08-27 | Se registra en RequisitosModulos.md | Documentación de requisitos |

---

## 7.4 Módulo: FAQ

- **Estado**: `implementado`
- **Qué hace**: página `/faq` con preguntas frecuentes del sistema agrupadas por categoría (Solicitudes, estados del flujo, roles, etc.) para orientar al usuario sin salir del sistema.
- **Cómo funciona**: `faq/page.tsx` (server) renderiza un array estático de categorías y preguntas, cada una con enlace de vuelta al dashboard. No consulta BD; el contenido es editorial.
- **Requisitos específicos**:
  - `R-FAQ.1` — La FAQ presenta preguntas frecuentes agrupadas por categoría sobre el flujo de solicitudes, estados y roles.
  - `R-FAQ.2` — La FAQ es accesible para todos los usuarios autenticados.
- **Con qué se conecta**: `src/app/faq/page.tsx`, `src/components/PageHeader.tsx`.
- **Depende de**: Módulo 2.1 Autenticación (sesión), Módulo 6.1 Dashboard (navegación de retorno).
- **Historial**:
  | Fecha | Cambio | Motivo |
  |---|---|---|
  | 2026-08-27 | Se crea el módulo de FAQ | Orientar al usuario sobre el flujo de solicitudes |

---

# PARTE 8 — Registro global de cambios y referencias

Orden: más reciente primero.

| Fecha | Módulo | Cambio | Motivo |
|---|---|---|---|
| 2026-09-30 | Solicitudes / Dashboard | **El Ejecutivo se unifica en `/solicitudes`**: sin cards de dashboard (`R-DASH.14`), `/dashboard` redirige a `/solicitudes` (`R-DASH.13`), `/solicitudes/aprobaciones` queda restringida a `jefe_local`/`administrador` (`R-DASH.15`), el encabezado de esa página muestra enlaces Mi perfil/FAQ y sin "volver". La lista suma filtro por grupos con contadores (`Pendientes`, `En curso`, `Por entregar`, `Rechazadas`, `Finalizadas`), tarjetas-metrics clicables y helper puro `src/lib/filtroSolicitudes.ts` (26 tests) | El ejecutivo repetía la misma card dos veces y sus estados se dispersaban entre dos páginas; su flujo cabe entero en una sola vista |
| 2026-09-30 | Dashboard | Rediseño por rol: catálogo único `src/config/dashboard-cards.ts` (10 cards, secciones Gestión/Operación/Soporte + "Tu cuenta"), nomenclatura por rol, feed de prioridades (top 8, agrupado por sucursal) para `jefe_local`, `PageHeader` en reemplazo de `TopNavbar` en **todo** el sistema y eliminación de `SolicitudesHeader`/`SolicitudesTabBar`/`lib/solicitudes-tabs.ts` | El dashboard pasa a ser el centro de navegación; cada rol entra directo a lo suyo |
| 2026-09-30 | Solicitudes-Aprobación | Motivo de rechazo visible: `src/lib/motivoRechazo.ts`, panel rojo en el detalle (motivo, responsable, fecha) y estado "Rechazada" navegable en la lista | El solicitante no sabía por qué le rechazaron |
| 2026-09-30 | Solicitudes / Traslados | Revalidación unificada: `revalidarSolicitudes()` (`src/lib/rutas.ts`) reemplaza las ~24 llamadas dispersas a `revalidatePath` en `solicitudes.actions.ts` y `traslados.actions.ts`, e incluye `/dashboard` y `/logistica/slots` | Los cambios hechos por un usuario dejaban el dashboard y los slots desactualizados |
| 2026-09-30 | Slots | Cálculo de "libres" centralizado en `src/lib/slots.ts` (funciones puras + criticidad) y reutilizado por el badge del encabezado y `/logistica/slots`; refresco por foco con throttle | Badge y panel no podían divergir; cambios de otros usuarios no llegaban |
| 2026-09-29 | Vehículos | Filtros de **ubicación** (cada sucursal + "En viaje / Container") y de **rango de fecha de registro** (desde/hasta) en `/admin/vehiculos`, combinables con búsqueda/marca/estado; métricas y paginación responden a los filtros; botón "Limpiar filtros"; lógica pura en `src/lib/filtrosVehiculos.ts` con 39 tests | Localizar vehículos por sucursal y por momento de registro |
| 2026-09-29 | Vehículos | Fix: `getVehiculos`/`getMarcas`/import CSV desempatan el `ORDER BY` por `id` y deduplican por `id` | La paginación con `OFFSET` sobre `created_at` (empates en importaciones masivas) devolvía 220 duplicados y 220 omitidos de 2261 → error de React de `key` duplicada |
| 2026-09-29 | Perfil de Usuario | Popup "Datos de contacto" adaptativo por rol: `getUsuarioDetalleById` devuelve sucursales a cargo y zonas (`usuario_zona`); el modal muestra "Sucursal de pertenencia" + "Sucursales a su cargo" para `jefe_local`/`administrador` y "Zonas de logística territorial" para `logistica` | Reflejar la organización real del usuario en el contacto: encargado de varias sucursales y logística por zonas |
| 2026-09-28 | Organización Territorial | Regla de asignación de zonas: **solo rol `logistica`** (selector oculto para otros roles; `setZonasAsignadas` limpia `usuario_zona` en roles no-logística) y **pertenencia única a una sucursal** (a cargo ≠ pertenece; `jefe_local` puede encabezar varias sucursales) | Los encargados por zona son únicamente logística; los usuarios pertenecen a una sola sucursal |
| 2026-09-28 | Organización Territorial | Panel "Gestión de Zonas y Sucursales": CRUD de zonas (crear/renombrar/eliminar con protección), asignación de sucursal a zona y filtro por zona; revalidate de las actions de zona; card del dashboard renombrada | Habilitar la gestión visual de zonas territoriales y su vínculo con sucursales y el alcance de Logística |
| 2026-09-05 | Perfil de Usuario | Rediseño UI del perfil (sin franja negra; hero con iniciales y resumen de contacto) y nombres de usuario cliqueables (popup de datos) en todos los puntos del sistema que indican un usuario/encargado: tabla y detalle de solicitudes, historial de cambios, observaciones, prioridades, aprobaciones, sucursales (encargado + personas de solicitudes), historial de auditoría y gestión de usuarios | Acceso ágil a datos de contacto ante urgencias en cualquier fase del traslado; perfil más pulido |
| 2026-09-05 | Perfil de Usuario | Nuevo módulo: página `/perfil`, edición de nombre/apellido/teléfono, columna `telefono`, tarjeta "Contacto responsable" del detalle de solicitud con rol/sucursal/teléfono/correo y popups de datos de usuario en historial/observaciones | Necesidad de contacto accesible del responsable y de los usuarios que intervienen en las solicitudes |
| 2026-09-03 | Logística Operativa | Implementado flujo completo: calendarizar, despachar, recibir, finalizar con UI en `/logistica/calendarizaciones` y botones en `/solicitudes` | Completar flujo logístico del MVP |
| 2026-09-03 | Logística Operativa | Fix: revalidate path `/solicitudes/calendarizaciones` → `/logistica/calendarizaciones` en 4 server actions | Path incorrecto impedía refresco de UI |
| 2026-09-02 | Solicitudes/Sucursales | Validación de slots: triggers BD para validar, incrementar y decrementar `slots_ocupados`; frontend muestra slots disponibles; service valida antes de crear | Evitar sobreasignación de vehículos a sucursales |
| 2026-08-28 | Solicitudes-Priorización | Drag & drop para priorizar: se elimina el botón "Priorizar"; arrastrar desde "Por Priorizar" inserta en la posición elegida (`priorizarEnPosicion`) | Elegir la posición al priorizar en vez de entrar siempre al final |
| 2026-08-28 | Vehículos | Campo opcional `precio` en alta/edición e inventario (`20260828_vehiculo_precio.sql`) | Registrar el valor comercial de cada vehículo |
| 2026-08-27 | Solicitudes-Creación | Ejecutivo crea sin fecha; fecha la define jefe de local al crear o al aprobar | Requisito: solo el jefe de local pone la fecha |
| 2026-08-27 | Solicitudes-Creación | Asignación automática de `jefe_local_id` (jefe de local de la sucursal del ejecutivo) | Responsabilidad/aprobación por sucursal |
| 2026-08-27 | Solicitudes-Creación | Sucursal destino puede ser igual a la origen (trigger `validate_solicitud_tipo` simplificado, `20260827_solicitudes_v2_2.sql`) | Venta interna en el mismo local |
| 2026-08-27 | Solicitudes-Aprobación | Aprobación con modal de Fecha de Entrega; `aprobarSolicitudAction(id, fecha)` | Fecha definida por el jefe de local |
| 2026-08-27 | Solicitudes-Creación | Fix: la sucursal de origen del ejecutivo se setea automáticamente al abrir el formulario | Evita error "Debes seleccionar la sucursal de origen" |
| 2026-08-26 | Auditoría | Triggers de auditoría deshabilitados; registro desde la capa de servicio con usuario real | Errores 23502 con service-role |
| 2026-08-26 | Notificaciones | Triggers desactivados (`20260826_deshabilitar_notificaciones.sql`) | Fuera de alcance MVP |
| 2026-08-26 | Solicitudes | Esquema V2: `pendiente_aprobacion`/`aprobada`/`rechazada`, `sucursal_destino`, `ejecutivo_id` nullable | Flujo de aprobación del jefe de local |

## Referencias

- `Brain.md` — contexto permanente del proyecto.
- `ProjectStatus.md` — estado real del proyecto.
- `ImplementationPlan.md` — plan de implementación y seguimiento.
- `DatabaseSchema.md` y `esquema-completo-sql.sql` — esquema 1:1 de la BD.
- `prompt_dashboard_por_rol.md` — especificación/prompt del rediseño del dashboard por rol.
- Skills: `requisitos-modulos` y `sincronizar-esquema-sql` (`.opencode/skills/`).
