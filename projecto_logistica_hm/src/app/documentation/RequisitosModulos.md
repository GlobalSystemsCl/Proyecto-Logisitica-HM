# REQUISITOS DE MÓDULOS — Sistema de Gestión de Vehículos H.Motores

> **Documento único de requisitos específicos del sistema.**
>
> Describe para cada módulo: **qué hace**, **cómo funciona**, **a qué pertenece**, **con qué se conecta**, su **estado real** y su **historial de cambios**. Incluye el **flujo global de interacción** entre módulos.
>
> Mantenido por la skill **`requisitos-modulos`** (`.opencode/skills/requisitos-modulos/SKILL.md`). Cualquier cambio de requisito, módulo o flujo debe registrarse aquí en la misma tarea.
>
> Regla de oro: el código, la BD y la UI mandan; este documento los refleja 1:1.

---

## 0. Cómo usar y mantener este documento

- **IDs de requisito**: `R-<MODULO>.<n>` (p. ej. `R-SOL-CRE.4`). Numeración continua; si un requisito se reemplaza, el nuevo recibe otro ID y el anterior queda solo en el historial.
- **Historial de cambios**: por módulo (sección "Historial") y global (sección 14). Fecha ISO `YYYY-MM-DD`, cambio → motivo. Orden: más reciente primero.
- **Estado de módulo**: `implementado` · `parcial` · `pendiente` · `deshabilitado`.
- **Plantilla de módulo nuevo**:

  ```markdown
  ## M. Módulo: <Nombre>
  - **Estado**: `implementado | parcial | pendiente | deshabilitado`
  - **Qué hace**: ...
  - **Cómo funciona**: ...
  - **Requisitos específicos**: R-<MOD>.1 ... R-<MOD>.n
  - **Con qué se conecta**: ...
  - **Depende de**: ...
  - **Historial**:
    | Fecha | Cambio | Motivo |
  ```

- Al agregar un módulo, actualizar también: índice, visión global (sección 1), flujo de interacción y registro global (sección 14).

---

## 1. Visión global del sistema

### 1.1 Actores y permisos

| Rol | Alcance |
|---|---|
| `administrador` | Todo el sistema: usuarios, vehículos, sucursales, historial, solicitudes, aprobaciones y priorización. |
| `ejecutivo` | Crea solicitudes en **su sucursal**; ve y da seguimiento; no asigna fecha de entrega. |
| `jefe_local` | Crea solicitudes (con fecha) en su sucursal; **aprueba/rechaza** las de su sucursal; prioriza y ordena la cola; gestiona vehículos. |
| `logistica` | Gestiona calendarizaciones, despachos y traslados; puede calendarizar, despachar y cancelar solicitudes. |

### 1.2 Mapa de rutas por módulo

| Módulo | Rutas | Acceso |
|---|---|---|
| Autenticación | `/login`, `/recuperar-clave`, `/establecer-clave`, `/auth/callback` | público / sesión |
| Solicitudes | `/solicitudes` | autenticados |
| Aprobación | `/solicitudes/aprobaciones` | `jefe_local`, `administrador` |
| Priorización | `/solicitudes/prioridades` | `jefe_local`, `administrador` |
| Vehículos | `/admin/vehiculos` | `administrador`, `jefe_local`, `logistica` |
| Usuarios | `/admin/usuarios` | `administrador` |
| Sucursales | `/admin/sucursales` | `administrador` |
| Historial/Auditoría | `/admin/historial` | `administrador` |
| Logística | `/logistica/calendarizaciones` | `jefe_local`, `logistica`, `administrador` |
| Perfil | `/perfil` | autenticados |
| Dashboard | `/dashboard` | autenticados |

### 1.3 Flujo principal de interacción entre módulos

```text
Login (Auth) → Dashboard → [Administrador: Usuarios · Sucursales · Vehículos · Historial]
                          └ → Solicitudes
                                 │
      Ejecutivo crea ────────────┤  jefe_local_id = jefe de local de su sucursal
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

### 1.4 Estados de una solicitud y quién transiciona

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

## 2. Módulo: Autenticación y Seguridad

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

## 3. Módulo: Gestión de Usuarios

- **Estado**: `implementado`
- **Qué hace**: CRUD de usuarios del sistema (solo `administrador`): crear, activar/desactivar, resetear contraseña, editar rol/sucursal. Genera contraseña provisoria y la envía por email (Brevo).
- **Cómo funciona**: `createUserAction` crea en `auth.admin.createUser` (email confirmado, `requiere_cambio_clave=true`) + upsert en `public.usuario`; si es `jefe_local` lo vincula como encargado de la sucursal (`usuario_id`). Prevenciones: no permite desactivarse a sí mismo ni desactivar al admin principal (`maic.hernandez.dev@gmail.com`). Sin autoregistro.
- **Requisitos específicos**:
  - `R-USU.1` — Solo administradores gestionan usuarios; sin registro público.
  - `R-USU.2` — Alta con contraseña provisoria `HM-*` y envío Brevo.
  - `R-USU.3` — Reset de contraseña (nueva provisoria + `requiere_cambio_clave`).
  - `R-USU.4` — Activación/desactivación en tiempo real (afecta el login).
  - `R-USU.5` — Edición de rol, sucursal y datos.
  - `R-USU.6` — Un `jefe_local` creado queda como encargado de su sucursal.
- **Con qué se conecta**: `users.service.ts`, `users.actions.ts`, `EmailService`, Supabase Auth Admin, tabla `usuario`, `sucursal`.
- **Depende de**: Módulo Autenticación (sesión), Módulo Correo.
- **Historial**:
  | Fecha | Cambio | Motivo |
  |---|---|---|
  | 2026-08-27 | Se registra en RequisitosModulos.md | Documentación de requisitos |

---

## 4. Módulo: Gestión de Vehículos

- **Estado**: `implementado`
- **Qué hace**: alta/edición/borrado manual de vehículos; consulta de inventario con disponibilidad; validación de datos y de uso en solicitudes activas.
- **Cómo funciona**: `VehiculoService` valida **chasis 17 alfanuméricos**, **patente chilena** (`XXXX-XX`/`XXXX-XXXX`), año 1900..año+1 y duplicados. Un vehículo **reservado en solicitud activa no se puede editar ni eliminar**. La disponibilidad se deriva de `solicitud_vehiculo` con `disponibilidad='reservado'` en estados activos. Roles de alta: administrador, jefe_local, logística (borrar solo administrador).
- **Requisitos específicos**:
  - `R-VEH.1` — Alta manual de vehículos con los campos chasis, patente, marca, modelo, año, color.
  - `R-VEH.2` — Validación de formato (chasis, patente chilena, año, duplicados).
  - `R-VEH.3` — Edición permitida solo si el vehículo no está reservado en solicitud activa.
  - `R-VEH.4` — Borrado permitido solo si no está reservado en solicitud activa.
  - `R-VEH.5` — Inventario muestra disponibilidad (reservado/en_disponible) según reservas activas.
  - `R-VEH.6` — Roles autorizados a incorporar vehículos: administrador, jefe_local, logística.
  - `R-VEH.7` — Campo `precio` opcional (≥ 0) al crear y editar un vehículo; se muestra en el inventario.
- **Con qué se conecta**: `vehiculo.service.ts`, `vehiculo.actions.ts`, `VehiculosTableClient.tsx`, tablas `vehiculo`, `solicitud_vehiculo`.
- **Depende de**: reservas creadas por el Módulo Solicitudes.
- **Historial**:
  | Fecha | Cambio | Motivo |
  |---|---|---|
  | 2026-08-28 | Nuevo campo opcional `precio` (numeric 14,2) en alta/edición e inventario de vehículos; migración `20260828_vehiculo_precio.sql` | Registrar el valor comercial de cada vehículo |
  | 2026-08-27 | Se registra en RequisitosModulos.md | Documentación de requisitos |

---

## 5. Módulo: Gestión de Sucursales

- **Estado**: `implementado`
- **Qué hace**: CRUD de sucursales (`administrador`): nombre, dirección, slots y relación con el `jefe_local` encargado.
- **Cómo funciona**: `SucursalesService` rechaza nombres duplicados y valida `slots` entero ≥ 0 con `slots_ocupados ≤ slots`. El borrado se **bloquea si hay usuarios asignados** a la sucursal y elimina en cascada las solicitudes asociadas (reporta cuántas).
- **Requisitos específicos**:
  - `R-SUC.1` — CRUD de sucursales solo administrador.
  - `R-SUC.2` — Nombre único; slots válidos.
  - `R-SUC.3` — Vincula encargado (jefe_local) a una sucursal.
  - `R-SUC.4` — No se puede eliminar una sucursal con usuarios asignados.
- **Con qué se conecta**: `sucursales.service.ts`, `sucursales.actions.ts`, `SucursalesTableClient.tsx`, tablas `sucursal`, `usuario`, `solicitud`.
- **Depende de**: Módulo Usuarios (encargado), Módulo Solicitudes (origen/destino).
- **Historial**:
  | Fecha | Cambio | Motivo |
  |---|---|---|
  | 2026-08-27 | Se registra en RequisitosModulos.md | Documentación de requisitos |

---

## 6. Módulo: Solicitudes — Creación

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
- **Con qué se conecta**: `solicitudes.service.ts` (`createSolicitud`), `createSolicitudAction`, `SolicitudesClient.tsx`, tablas `solicitud`, `solicitud_vehiculo`, `observacion`, `auditoria`, `usuario`.
- **Depende de**: Módulo Vehículos (inventario/disponibilidad), Módulo Sucursales, Módulo Aprobación (si es ejecutivo).
- **Historial**:
  | Fecha | Cambio | Motivo |
  |---|---|---|
  | 2026-09-05 | Detalle de solicitud: la tarjeta "Contacto responsable" muestra nombre, rol, sucursal, teléfono y correo; los nombres en historial/observaciones abren un popup con los datos del usuario (`getUsuarioDetalleAction`, `usuario-info-modal.tsx`) | Acceso rápido al contacto de responsables y usuarios que intervienen |
  | 2026-08-27 | El ejecutivo ya no ve el campo de fecha; el jefe_local la define al crear o al aprobar | Que la fecha la fije solo el jefe de local |
  | 2026-08-27 | Se asigna `jefe_local_id` automáticamente al crear (jefe de local de la sucursal del ejecutivo) | Aprobación/responsabilidad por sucursal |
  | 2026-08-27 | Se permite sucursal destino = origen | Venta interna en el mismo local |
  | 2026-08-27 | Se elimina validación de destino ≠ origen en trigger BD (`20260827_solicitudes_v2_2.sql`) | Alinearse con venta interna |
  | 2026-08-26 | `createSolicitud` setea `estado` y `jefe_local_id`; se elimina auto-aprobado roto; se agrega validación de reservas activas y auditoría | Esquema V2 de solicitudes |

---

## 7. Módulo: Solicitudes — Aprobación

- **Estado**: `implementado`
- **Qué hace**: el jefe de local (o administrador) aprueba o rechaza solicitudes `pendiente_aprobacion` de **su sucursal**. La aprobación **define la fecha de entrega**.
- **Cómo funciona**: botón "Aprobar" abre un modal con **Fecha de Entrega (requerida)**; al confirmar, `aprobarSolicitudAction(id, fecha)` → `aprobarSolicitud` valida que esté en `pendiente_aprobacion` y que la fecha sea válida, pasa a `aprobada` + `fecha_limite` y audita. El rechazo exige motivo ≥ 5 caracteres, pasa a `rechazada` y agrega observación `[RECHAZO] ...`.
- **Requisitos específicos**:
  - `R-SOL-APR.1` — Solo jefe_local de la sucursal o administrador aprueban/rechazan.
  - `R-SOL-APR.2` — Aprobar exige fecha de entrega válida (verifica `pendiente_aprobacion` previo).
  - `R-SOL-APR.3` — Rechazar exige motivo (≥5 caracteres) y lo registra como observación.
  - `R-SOL-APR.4` — Ambas acciones quedan auditadas.
- **Con qué se conecta**: `solicitudes.service.ts` (`aprobarSolicitud`, `rechazarSolicitud`), `aprobarSolicitudAction`, `rechazarSolicitudAction`, `AprobacionesClient.tsx`, tablas `solicitud`, `observacion`, `auditoria`.
- **Depende de**: Módulo Solicitudes-Creación, Módulo Sucursales.
- **Historial**:
  | Fecha | Cambio | Motivo |
  |---|---|---|
  | 2026-08-27 | Aprobación con modal que exige Fecha de Entrega; `aprobarSolicitudAction(id, fecha)` escribe `fecha_limite` | La fecha la define el jefe de local al aprobar |
  | 2026-08-27 | `AprobacionesClient` adaptado a la firma con fecha | Mantener typecheck y flujo coherente |
  | 2026-08-26 | Estados `aprobada`/`rechazada`/`pendiente_aprobacion` y reglas de transición | Esquema V2 de solicitudes |

---

## 8. Módulo: Solicitudes — Priorización y Cola por sucursal

- **Estado**: `implementado`
- **Qué hace**: el jefe de local (o administrador) prioriza solicitudes `pendiente`/`aprobada` **arrastrándolas desde "Por Priorizar" hacia la cola en la posición deseada**, las ordena en una **cola por sucursal** y puede sacarlas de la cola.
- **Cómo funciona**: `priorizarEnPosicion` inserta la solicitud en la posición exacta donde se suelta (`priorizada` + reescritura de la cola con técnica de dos fases para respetar `UNIQUE(sucursal, posicion_prioridad)`); si la cola está vacía o el destino es de otra sucursal, usa `priorizarSolicitud` (máx+1). `reordenarCola` reordena la cola (solo estados `priorizada`) y `sacarDeCola` vuelve a `aprobada` (recompacta la cola; también se activa arrastrando un ítem fuera de la cola). Todo auditado.
- **Requisitos específicos**:
  - `R-SOL-PRI.1` — Priorizar desde `pendiente`/`aprobada` a `priorizada`.
  - `R-SOL-PRI.2` — La posición de prioridad es por sucursal.
  - `R-SOL-PRI.3` — Reordenar cola solo sobre solicitudes `priorizada`.
  - `R-SOL-PRI.4` — Sacar de cola regresa a `aprobada` sin posición.
  - `R-SOL-PRI.5` — Solo jefe_local de la sucursal o administrador.
  - `R-SOL-PRI.6` — Priorización por drag & drop (`@dnd-kit`): arrastrar desde "Por Priorizar" inserta en la posición de destino (sin botón manual); con `DragOverlay`, zonas droppables para cola vacía y panel vacío, y resaltado del ítem destino. La posición se calcula dentro de la subsecuencia de la misma sucursal (soporta la vista mixta del administrador).
- **Con qué se conecta**: `solicitudes.service.ts` (priorizar/priorizarEnPosicion/reordenar/sacar), acciones `priorizarSolicitudAction`, `priorizarEnPosicionAction`, `reordenarColaAction`, `sacarDeColaAction`, `PrioridadesClient.tsx`, tabla `solicitud`.
- **Depende de**: Módulo Aprobación.
- **Historial**:
  | Fecha | Cambio | Motivo |
  |---|---|---|
  | 2026-08-28 | Priorización por drag & drop: se elimina el botón "Priorizar", nuevo `priorizarEnPosicion`/`priorizarEnPosicionAction` e inserción en posición específica | El usuario pedía elegir la posición al priorizar, no entrar automáticamente al final |
  | 2026-08-27 | Se registra en RequisitosModulos.md | Documentación de requisitos |
  | 2026-08-26 | Creación del módulo de priorización (commit `48d80cb`) | Flujo de priorización del jefe de local |

---

## 9. Módulo: Logística Operativa — `parcial`

- **Estado**: `parcial`
- **Qué hace**: calendarización de traslados con fecha tentativa, despacho (en tránsito), confirmación de entrega en destino y finalización formal. Ruta: `/logistica/calendarizaciones`.
- **Cómo funciona**: `CalendarizacionesClient.tsx` muestra solicitudes `priorizada`/`calendarizada`/`en_transito`/`entregada`/`finalizada` en vista de calendario. Jefe_local/logística pueden **calendarizar** (arrastrar a fecha → `calendarizada`, guarda `fecha_tentativa_despacho` y `logistica_id`). Logística/admin pueden **descalendarizar** (vuelve a `priorizada`). Logística/admin pueden **despachar** (`calendarizada` → `en_transito`, guarda `fecha_despacho`). Jefe_local/admin pueden **recibir** (`en_transito` → `entregada`, guarda `fecha_entrega`). Jefe_local/admin pueden **finalizar** (`entregada` → `finalizada`). Todos los pasos registran auditoría. Botones "Recibir" y "Finalizar" también disponibles en `/solicitudes` (vista general).
- **Requisitos específicos**:
  - `R-LOG.2` — Calendarización con fecha tentativa (`calendarizada`). **Implementado**.
  - `R-LOG.3` — Despacho / en tránsito (`en_transito`). **Implementado**.
  - `R-LOG.4` — Confirmación de entrega en destino (`entregada`). **Implementado**.
  - `R-LOG.5` — Finalización formal (`finalizada`). **Implementado**.
  - `R-LOG.6` — Libera los vehículos al completar/cancelar. Implementado vía trigger `disponibilidad()` (al cancelar).
  - `R-LOG.1` — Asignación explícita de solicitud a logística (`asignada`). **Pendiente**: el estado `asignada` existe en el enum y `calendarizarSolicitud` lo acepta como FROM, pero no hay transición que lo produzca. Actualmente `logistica_id` se fija implícitamente al calendarizar.
- **Con qué se conecta**: `solicitudes.service.ts` (`calendarizarSolicitud`, `descalendarizarSolicitud`, `despacharSolicitud`, `recibirSolicitud`, `finalizarSolicitud`), `solicitudes.actions.ts` (acciones homónimas), `CalendarizacionesClient.tsx`, `SolicitudesClient.tsx` (botones Recibir/Finalizar), tablas `solicitud`, `notificacion` (sin UI aún).
- **Depende de**: Módulo Solicitudes (estados previos).
- **Historial**:
  | Fecha | Cambio | Motivo |
  |---|---|---|
  | 2026-09-03 | Implementado: calendarizar, despachar, recibir, finalizar con UI en `/logistica/calendarizaciones` y botones en `/solicitudes` | Completar flujo logístico del MVP |
  | 2026-09-03 | Fix: revalidate path corregido de `/solicitudes/calendarizaciones` a `/logistica/calendarizaciones` | Path incorrecto impedía refresco de UI |
  | 2026-08-27 | Se documenta como pendiente | Módulo fuera del alcance actual del MVP |

---

## 10. Módulo: Auditoría e Historial

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
- **Depende de**: Módulo Solicitudes (acciones auditadas).
- **Historial**:
  | Fecha | Cambio | Motivo |
  |---|---|---|
  | 2026-08-27 | Se registra en RequisitosModulos.md | Documentación de requisitos |
  | 2026-08-26 | Se deshabilitan triggers de auditoría; el registro pasa a la capa de servicio con usuario real (`20260826_deshabilitar_auditoria_service_role.sql`) | Errores 23502 con service-role |

---

## 11. Módulo: Notificaciones — **deshabilitado a nivel app**

- **Estado**: `parcial` (BD lista, triggers desactivados, sin UI ni lectura)
- **Qué hace (previsto)**: avisar a destinatarios sobre eventos del flujo (nueva solicitud, priorizada, asignada, calendarizada, en tránsito, entregada, finalizada, cancelada, vehículo reservado/liberado, nueva observación).
- **Cómo funciona hoy**: la tabla `notificacion`, el enum `tipo_notificacion` y las funciones `notificar_*` **existen en BD** y sus triggers **fueron desactivados** (`20260826_deshabilitar_notificaciones.sql`) porque violaban `notificacion.usuario_id NOT NULL` cuando el destinatario aún no estaba asignado. No hay servicios, acciones ni UI.
- **Requisitos específicos (propuestos)**:
  - `R-NOT.1` — Generar notificación en cada evento del flujo.
  - `R-NOT.2` — El destinatario lee/marca/elimina sus propias notificaciones (RLS lista).
  - `R-NOT.3` — Reactivar triggers o gestionar vía servicio.
- **Con qué se conectará**: tablas `notificacion`, triggers `notificar_*`, UI.
- **Depende de**: Módulo Solicitudes y Logística.
- **Historial**:
  | Fecha | Cambio | Motivo |
  |---|---|---|
  | 2026-08-27 | Se registra en RequisitosModulos.md | Documentación de requisitos |
  | 2026-08-26 | Triggers de notificación desactivados (`20260826_deshabilitar_notificaciones.sql`) | Fuera de alcance; evita violación de NOT NULL |

---

## 12. Módulo: Dashboard

- **Estado**: `implementado`
- **Qué hace**: vista de inicio con acceso a los módulos según rol, métricas de solicitudes y tile "Gestión Logística" activo (acceso a `/logistica/calendarizaciones` para logística/jefe_local/admin).
- **Cómo funciona**: página server con tarjetas según rol; fuerza el cambio de clave si `requiere_cambio_clave`. Consume métricas de `AuditoriaService` y lecturas de `SolicitudesService`.
- **Requisitos específicos**:
  - `R-DASH.1` — Acceso a módulos según rol.
  - `R-DASH.2` — Fuerza `/establecer-clave` si la clave es provisoria.
  - `R-DASH.3` — Muestra métricas e inventario de solicitudes.
- **Con qué se conecta**: `dashboard/page.tsx`, `AuditoriaService`, `SolicitudesService`.
- **Depende de**: Módulo Autenticación.
- **Historial**:
  | Fecha | Cambio | Motivo |
  |---|---|---|
  | 2026-08-27 | Se registra en RequisitosModulos.md | Documentación de requisitos |

---

## 13. Módulo: Correo (Brevo)

- **Estado**: `implementado` (credenciales iniciales/reset)
- **Qué hace**: envía correos con credenciales provisorias y botón de ingreso al crear usuarios o resetear contraseña.
- **Cómo funciona**: `EmailService.sendUserCredentialsEmail` usa la API Brevo (`https://api.brevo.com/v3/smtp/email`) con `BREVO_API_KEY` y remitente configurable. No interviene en la recuperación de contraseña (esa la hace Supabase).
- **Requisitos específicos**:
  - `R-EMAIL.1` — Envío de credenciales iniciales al crear usuario.
  - `R-EMAIL.2` — Envío de nueva clave provisoria al resetear.
  - `R-EMAIL.3` — Configurable por variables de entorno.
- **Con qué se conecta**: `email.service.ts`, Módulo Usuarios, Brevo API.
- **Depende de**: variables de entorno.
- **Historial**:
  | Fecha | Cambio | Motivo |
  |---|---|---|
  | 2026-08-27 | Se registra en RequisitosModulos.md | Documentación de requisitos |

---

## 14. Módulo: Perfil de Usuario

- **Estado**: `implementado`
- **Qué hace**: vista personal `/perfil` con los datos del usuario autenticado: nombre, apellido, teléfono de contacto (editables) y correo, rol, sucursal, estado de cuenta y fecha de ingreso (solo lectura). Además, reutiliza esos datos en todo el sistema: tarjeta "Contacto responsable" enriquecida en el detalle de solicitud (nombre, rol, sucursal, teléfono y correo) y popups de datos de usuario al hacer clic en un nombre dentro del historial de cambios y observaciones.
- **Cómo funciona**:
  - `PerfilClient.tsx` (client) usa `updateProfileAction` (server action `useActionState`) → `AuthService.updateProfile` actualiza solo `nombre`, `apellido` y `telefono` del propio usuario vía client admin; el correo, rol y sucursal NO son editables desde el perfil.
  - La columna `telefono` (`varchar(30)`) se agregó con la migración `20260905_perfil_usuario_telefono.sql`.
  - `getUsuarioDetalleAction(usuarioId)` → `UsersService.getUsuarioDetalleById` devuelve el detalle completo (con nombre de sucursal vía join) para la tarjeta de contacto y los popups.
  - El detalle de solicitud resuelve el responsable con prioridad `logistica_id` → `jefe_local_id` → `ejecutivo_id` y lo muestra en la tarjeta "Contacto responsable" (pestaña Historial).
  - `UsuarioInfoModal`/`UsuarioNombreBoton` (`src/components/usuario-info-modal.tsx`) son componentes client reutilizables: el nombre del usuario en el timeline de historial y en observaciones se renderiza como botón que abre el popup con rol, sucursal, teléfono, correo y fecha de ingreso.
  - Acceso al perfil desde los headers del sistema (nombre cliqueable + botón `UserRound` hacia `/perfil`).
- **Requisitos específicos**:
  - `R-PERF.1` — El usuario autenticado ve su perfil con nombre, apellido, correo, rol, sucursal, teléfono y estado de cuenta.
  - `R-PERF.2` — El usuario edita su nombre, apellido y teléfono; correo, rol y sucursal son solo lectura.
  - `R-PERF.3` — El teléfono es opcional y se limita a 30 caracteres.
  - `R-PERF.4` — El perfil es accesible desde los headers del sistema hacia `/perfil`.
  - `R-PERF.5` — El detalle de solicitud muestra "Contacto responsable" con nombre, rol, sucursal, teléfono y correo del responsable.
  - `R-PERF.6` — Al hacer clic en un nombre de usuario en historial/observaciones se abre un popup con sus datos de contacto.
  - `R-PERF.7` — Los datos se traen con `getUsuarioDetalleAction` (solo usuarios autenticados y activos).
- **Con qué se conecta**: `perfil/page.tsx`, `perfil/PerfilClient.tsx`, `auth.actions.ts` (`updateProfileAction`), `auth.service.ts` (`updateProfile`), `users.service.ts` (`getUsuarioDetalleById`), `solicitudes.actions.ts` (`getUsuarioDetalleAction`), `usuario-info-modal.tsx`, `SolicitudesClient.tsx`, tablas `usuario`, `sucursal`.
- **Depende de**: Módulo Autenticación (sesión), Módulo Solicitudes (detalle).
- **Historial**:
  | Fecha | Cambio | Motivo |
  |---|---|---|
  | 2026-09-05 | Creación del módulo: página `/perfil`, edición de nombre/apellido/teléfono, tarjeta "Contacto responsable" enriquecida y popups de usuario en historial/observaciones; columna `telefono` (`20260905_perfil_usuario_telefono.sql`) | Necesidad de contacto accesible (rol, sucursal, teléfono, correo) del responsable y de los usuarios que intervienen |

---

## 15. Registro global de cambios

Orden: más reciente primero.

| Fecha | Módulo | Cambio | Motivo |
|---|---|---|---|
| 2026-09-05 | Perfil de Usuario | Nuevo módulo: página `/perfil`, edición de nombre/apellido/teléfono, columna `telefono`, tarjeta "Contacto responsable" del detalle de solicitud con rol/sucursal/teléfono/correo y popups de datos de usuario en historial/observaciones | Necesidad de contacto accesible del responsable y de los usuarios que intervienen en las solicitudes |
| 2026-09-03 | Logística Operativa | Implementado flujo completo: calendarizar, despachar, recibir, finalizar con UI en `/logistica/calendarizaciones` y botones en `/solicitudes` | Completar flujo logístico del MVP |
| 2026-09-03 | Logística Operativa | Fix: revalidate path `/solicitudes/calendarizaciones` → `/logistica/calendarizaciones` en 4 server actions | Path incorrecto impedía refresco de UI |
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

---

## 16. Referencias

- `Brain.md` — contexto permanente del proyecto.
- `ProjectStatus.md` — estado real del proyecto.
- `ImplementationPlan.md` — plan de implementación y seguimiento.
- `DatabaseSchema.md` y `esquema-completo-sql.sql` — esquema 1:1 de la BD.
- Skills: `requisitos-modulos` y `sincronizar-esquema-sql` (`.opencode/skills/`).