# Documentación del Sistema — Logística H.Motores (Hernández Motores)

| Campo | Valor |
|---|---|
| Fecha | 2026-10-07 |
| Tipo | Auditoría técnica inicial (solo lectura) |
| Alcance | Código en `projecto_logistica_hm/` + base de datos Supabase en producción (proyecto `Proyecto Logistica-HM`) |
| Método | Lectura completa del código fuente, consultas de catálogo de solo lectura en Postgres, advisors de Supabase |
| No realizado | No se ejecutaron tests, build, lint ni `npm audit` (por instrucción). No se modificó código ni base de datos. No se intentó explotar ninguna vulnerabilidad |
| Secretos | Este documento no contiene valores de secretos. Solo nombres de variables y ubicaciones |

> Convención: lo que no se pudo comprobar se marca como **No determinado** o **No encontrado en el código analizado**.

---

## 1. Resumen ejecutivo

El sistema es una intranet para gestionar el traslado de vehículos entre sucursales de H.Motores. Cubre solicitudes de venta y evento, aprobación por Jefe de Local, cola de prioridades, calendarización y despacho por Logística, recepción en destino, traslados internos, inventario de vehículos (con importación CSV), slots de estacionamiento, usuarios, zonas, marcas y un historial de auditoría.

La arquitectura es un monolito Next.js 16 (App Router) con Server Actions y una capa de services que habla con Supabase. Casi toda la lógica de negocio y la autorización vive en el servidor de Next.js, que usa la clave `service_role` (salta RLS). La base de datos tiene RLS habilitado en las 15 tablas, pero algunas policies son demasiado permisivas, y la clave pública (anon/publishable) permite llamar a la API REST de Supabase directamente, sin pasar por la aplicación.

**Estado de seguridad: crítico.** Dos brechas permiten que cualquier persona con acceso a internet obtenga el rol `administrador`:

1. La policy `UPDATE` de `public.usuario` deja que cada usuario modifique su propia fila completa, incluido `rol` (brecha 001).
2. El trigger `handle_new_auth_user` toma el rol desde los metadatos que el propio usuario envía al registrarse (brecha 002).

Además, el flujo de "aprobación de cuentas" no funciona: la columna `aprobado` no existe en la base de datos (brecha 003).

| Severidad | Cantidad |
|---|---|
| Critical | 2 |
| High | 5 |
| Medium | 10 |
| Low | 7 |
| Informational | 2 |
| **Total** | **26** |

El detalle está en los archivos `brecha-001` a `brecha-026` de esta carpeta.

---

## 2. Stack tecnológico

| Capa | Tecnología | Versión (package.json) |
|---|---|---|
| Framework | Next.js (App Router, Server Actions, React Compiler) | 16.3.2 |
| UI | React / React DOM | 19.2.8 |
| Estilos | Tailwind CSS (PostCSS) | 4 |
| Iconos | lucide-react | ^1.33.0 |
| Drag & drop | @dnd-kit/core, sortable, utilities | 6.3 / 10.0 / 3.2 |
| Excel | xlsx (SheetJS, desde cdn.sheetjs.com) | 0.20.3 |
| Backend-as-a-service | Supabase (`@supabase/ssr`, `@supabase/supabase-js`) | 0.12.4 / 2.112.3 |
| Base de datos | PostgreSQL (Supabase) | 17.6 |
| Correo | Brevo (API HTTP transaccional) | — |
| Tests | Vitest + @vitest/coverage-v8 | 3.2.7 |
| Lenguaje | TypeScript | 5 |
| Lint | ESLint 9 + eslint-config-next | — |
| Dependencia sin uso | `claude` ^0.1.1 | No se importa en ningún archivo (ver brecha 026) |

Despliegue: **No determinado** (hay referencias a Vercel en `.gitignore`; no se encontró configuración de despliegue en el código).

---

## 3. Arquitectura

```
Navegador (Client Components)
   │  useActionState / llamadas a Server Actions (POST con header Next-Action)
   ▼
Next.js server
   ├─ middleware.ts → lib/supabase/middleware.ts  (refresca sesión, redirige si no hay sesión)
   ├─ Server Components (page.tsx / layout.tsx)    (leen perfil y datos vía services)
   ├─ Server Actions (src/app/actions/*.ts)        (verifican rol → llaman services)
   └─ Route Handler /auth/callback                 (verifyOtp / exchangeCodeForSession)
          │
          ▼
   Services (src/services/*.service.ts)
          │  createAdminClient()  → service_role (SALTA RLS)    ← uso mayoritario
          │  createClient() (server) → anon + cookies (aplica RLS) ← solo auth y lectura del propio perfil
          ▼
   Supabase
     ├─ Auth (GoTrue)
     ├─ PostgREST (public schema, 15 tablas, RLS on)
     ├─ Triggers/funciones PL/pgSQL (slots, fechas, disponibilidad)
     └─ Storage bucket privado `solicitud-documentos`
   Brevo API (correo con credenciales)
```

Puntos clave:

- **La autorización real está en las Server Actions**, no en la base de datos. Cada action llama a `AuthService.getCurrentUserProfile()` y compara `profile.rol`. Los services usan `service_role`, así que si una action no valida, no hay segunda barrera.
- **La base de datos queda expuesta en paralelo.** La URL y la clave anon/publishable son públicas (`NEXT_PUBLIC_*`), así que cualquier usuario autenticado puede llamar a `/rest/v1/*` directamente. En ese camino solo protegen las policies RLS.
- El cliente del navegador (`lib/supabase/client.ts`) existe, pero **No encontrado en el código analizado** ningún componente que lo use para leer o escribir datos.

---

## 4. Estructura del proyecto

```
projecto_logistica_hm/
├─ src/
│  ├─ middleware.ts                 Middleware global (sesión y redirecciones)
│  ├─ app/
│  │  ├─ actions/                   8 archivos de Server Actions
│  │  ├─ admin/{historial,sucursales,usuarios,vehiculos}/
│  │  ├─ auth/callback/route.ts     Callback de Supabase Auth
│  │  ├─ dashboard/ login/ registro/ recuperar-clave/ establecer-clave/ perfil/ faq/
│  │  ├─ logistica/{calendarizaciones,slots,reportes}/
│  │  └─ solicitudes/{aprobaciones,prioridades,recepciones,traslados}/ + layout.tsx
│  ├─ components/                   Header, tarjetas de dashboard, modal de detalle, etc.
│  ├─ config/dashboard-cards.ts     Módulos visibles por rol
│  ├─ lib/                          Helpers puros (fechas, filtros, slots, validaciones, asignaciones por rol) + clientes Supabase
│  ├─ services/                     11 services (lógica de negocio y acceso a datos; + notificacion y reporte desde 2026-10)
│  └─ types/                        Tipos de dominio
├─ supabase/                        ver supabase/README.md y brecha 015 (al 2026-10-07 estaba vacía)
│  ├─ migrations/ + rollback/       17 migraciones con fecha y su reversión
│  ├─ scripts/                      Respaldo previo (00), historial de migraciones (01), limpieza TEST-SUC (02) y asignación de sucursales sin jefe (03)
│  └─ seed/                         Datos de prueba del ciclo de vida (poblar, limpiar, validar)
├─ scripts/seed-admin.mjs, seed-solicitudes.mts
├─ tests/                           unitarios (58 archivos al 2026-10-14), mocks (incl. sql.ts), documentación de testing
├─ modelo_excel/                    Plantillas Excel (no analizadas en detalle)
├─ .env.local                       Secretos locales (en .gitignore)
└─ AGENTS.md / CLAUDE.md            Reglas para agentes (tests obligatorios)
```

El repositorio git está en la carpeta superior (`C:\Proyecto-Logisitica-HM`).

---

## 5. Frontend

### Páginas y protección

| Ruta | Archivo | Roles permitidos (verificación en servidor) |
|---|---|---|
| `/` | app/page.tsx | Pública (redirección) |
| `/login`, `/registro`, `/recuperar-clave` | client pages | Públicas |
| `/establecer-clave` | client page | Pública en middleware; la action exige sesión |
| `/dashboard` | dashboard/page.tsx | Autenticado + activo; fuerza `/establecer-clave` si `requiere_cambio_clave` |
| `/perfil`, `/faq` | perfil/page.tsx, faq/page.tsx | Autenticado |
| `/solicitudes/*` | solicitudes/layout.tsx | administrador, jefe_local, ejecutivo, logistica |
| `/logistica/calendarizaciones`, `/logistica/slots` | page.tsx | jefe_local, administrador, logistica |
| `/logistica/reportes` (R17, agregada 2026-10) | page.tsx | administrador |
| `/solicitudes/recepciones` (R13, agregada 2026-10) | page.tsx | jefe_local, administrador |
| `/admin/usuarios`, `/admin/historial`, `/admin/sucursales` | page.tsx | administrador |
| `/admin/vehiculos` | page.tsx | según la página (administrador y roles de gestión) |

- La protección de páginas se hace en cada Server Component con `getCurrentUserProfile()` y `redirect()`. Es correcta para páginas, pero **no protege las Server Actions**, que son endpoints POST independientes de la página (ver brecha 004).
- `requiere_cambio_clave` solo se fuerza en `/dashboard` (brecha 009).
- Componentes grandes con mucha lógica de UI: `SolicitudesClient.tsx` (66 KB), `VehiculosTableClient.tsx` (77 KB), `SucursalesTableClient.tsx` (54 KB), `SolicitudDetalleModal.tsx` (53 KB), `UsersTableClient.tsx` (47 KB). Deuda técnica de mantenibilidad (sección 25).
- XSS: no se encontró `dangerouslySetInnerHTML`, `innerHTML` ni `eval`. React escapa el contenido. El mensaje de error de login viene de un query param, pero se mapea a textos fijos.
- Datos sensibles al cliente: `createUserAction` y `resetUserPasswordAction` devuelven la contraseña temporal al navegador (brecha 013). La tabla de usuarios del admin recibe el perfil completo (aceptable para admin).
- Estado: React local (`useState`, `useActionState`). No hay estado global ni caché de cliente. Después de mutar se usa `revalidatePath` (`lib/rutas.ts`).

---

## 6. Backend

### Server Actions (endpoints reales)

| Archivo | Actions | Guard |
|---|---|---|
| auth.actions.ts | updateProfile, register, login, logout, requestPasswordReset, updatePassword | Validación de formato; sin rate limiting |
| users.actions.ts | createUser, toggleUserStatus, approveUser, resetUserPassword, updateUser | `verifyAdminPermission()` |
| organizacion.actions.ts | CRUD zonas y marcas | `verifyAdminPermission()` |
| sucursales.actions.ts | CRUD sucursales | `verifyAdminPermission()` |
| vehiculo.actions.ts | create/update/delete/import vehículos | roles administrador, jefe_local, logistica, operaciones; delete solo admin |
| traslados.actions.ts | crear/despachar/recibir/listar traslados, vehículos y sucursales para traslado | Logística/Admin; recibir: + jefe_local (validado en service) |
| auditoria.actions.ts | getAuditoria (historial global) | `verifyAdminPermission()` |
| solicitudes.actions.ts | 32 actions (crear, aprobar, rechazar, priorizar, reordenar, cancelar, eliminar, vehículos, observaciones, auditoría, calendarizar, despachar, recibir, finalizar, asignar encargado, insistencias, documentos) | Mixto: **2 sin ningún guard** (`getObservacionesAction`, `getAuditoriaAction`); varias solo exigen "usuario activo" sin verificar pertenencia a la solicitud (brechas 004, 006, 008) |

Patrón común: `try { profile = getProfileOrThrow(); if rol no permitido → error; service(...); revalidarSolicitudes() } catch → { success:false, error: err.message }`. Los mensajes de error de Postgres/PostgREST se devuelven tal cual al cliente (brecha 020).

### Route Handler

`/auth/callback` (GET): procesa `token_hash` + `type` (verifyOtp) o `code` (PKCE) y redirige a `next` (por defecto `/establecer-clave`). `next` se usa como pathname sin lista blanca (brecha 020).

### Middleware

`lib/supabase/middleware.ts`:
1. Refresca la sesión con `supabase.auth.getUser()`.
2. Si `user_metadata.aprobado === false`, cierra la sesión y redirige a `/login?error=pendiente_aprobacion`. **Ese dato lo puede modificar el propio usuario** (brecha 003).
3. Sin usuario y ruta no pública → `/login`.
4. Con usuario en ruta de auth → `/dashboard`.
No valida `activo` ni `requiere_cambio_clave` (brecha 009).

---

## 7. Services

| Service | Responsabilidad | Cliente | Tablas | Observaciones |
|---|---|---|---|---|
| AuthService | perfil actual, registro, login con bloqueo, reset y cambio de clave, editar perfil | server (anon) + admin | usuario, sucursal, usuario_zona | Crea perfiles "huérfanos" con rol según email hardcodeado; escribe la columna inexistente `aprobado` |
| UsersService | CRUD de usuarios, aprobar, reset de clave, sucursales a cargo, zonas | admin | usuario, sucursal, usuario_zona, auth.users | Contraseña temporal con `Math.random`; desactivar no revoca sesión. **Actualizado 2026-10-13:** las asignaciones se validan con `lib/asignaciones.ts` antes de escribir, no se pisan sucursales de otro jefe y los errores de BD se informan (sección 29) |
| SolicitudesService | ciclo de vida completo de solicitudes, cola de prioridad, vehículos, observaciones, auditoría, documentos (Storage), insistencias | admin | solicitud, solicitud_vehiculo, observacion, auditoria, insistencia, solicitud_documento, usuario, storage | 2.100+ líneas; transiciones sin control de concurrencia; operaciones multi-paso sin transacción |
| TrasladoService | traslados internos de vehículos vendidos | admin | traslado_interno, traslado_interno_vehiculo, vehiculo | Creación en 2 pasos con borrado compensatorio |
| VehiculoService | CRUD de vehículos, disponibilidad, importación CSV | admin | vehiculo, solicitud_vehiculo, marca, sucursal | Paginación manual para superar el límite de 1000 filas |
| SucursalesService | CRUD de sucursales y lectura de slots | admin | sucursal, solicitud | Eliminar sucursal borra solicitudes en cascada (brecha 016) |
| OrganizacionService | zonas, marcas, sucursales y zonas del usuario, RPC `usuario_tiene_sucursal` | admin | zona, marca, sucursal, usuario_zona | — |
| AuditoriaService | historial global + métricas | admin | auditoria + joins | Sin paginación |
| EmailService | correo de credenciales vía Brevo | — | — | HTML con interpolación sin escape (brecha 022) |

Servicios agregados por los requisitos (2026-10): `NotificacionService` (correos de operaciones críticas vía Brevo, enviados después de responder con `after` de Next.js; un fallo no afecta la operación) y `ReporteService` (reportería de logística).

Lógica duplicada o en conflicto:
- ~~La lista de estados que "reservan" vehículo es distinta en código y en SQL.~~ **Resuelto 2026-10-13:** `ESTADOS_ACTIVOS_RESERVA` coincide con `fn_estados_reserva_activos()` y un test lo verifica.
- ~~Contadores de slots con triggers incrementales y recálculo completo a la vez.~~ **Resuelto 2026-10-13 (brecha 011):** una sola función, `fn_recalcular_slots_sucursal`, fija ambos contadores.
- La auditoría la registra la aplicación (best-effort, los errores se ignoran). Existen funciones de auditoría y notificación en la BD que no están conectadas a ningún trigger (brecha 018).

---

## 8. Base de datos

### Tablas (schema `public`, todas con RLS habilitado)

> Conteo de filas de la auditoría (2026-10-07). Al 2026-10-13 hay 113 solicitudes (incluye datos de prueba). Columnas actualizadas al 2026-10-13.

| Tabla | Filas aprox. | Propósito | Columnas clave |
|---|---|---|---|
| usuario | 8 | Perfil de aplicación (1:1 con auth.users) | id (FK auth.users, cascade), email (unique), rol (enum rol_usuario), activo, **aprobado** (agregada por la migración de la brecha 003; `CHECK (aprobado OR NOT activo)`), requiere_cambio_clave, intentos_fallidos, bloqueado_hasta, sucursal_id, telefono |
| sucursal | 6 | Sucursales | nombre, direccion, slots, slots_ocupados, slots_reservados, zona_id, usuario_id (jefe de local a cargo: uno por sucursal; desde 2026-10-13 solo puede ser `jefe_local`) |
| zona | 2 | Zonas logísticas | nombre (unique) |
| usuario_zona | 1 | Zona del usuario de logística | PK (usuario_id, zona_id); desde 2026-10-13, índice único `usuario_zona_una_por_usuario` (una zona por usuario) |
| marca | 19 | Catálogo de marcas | codigo (unique), nombre |
| vehiculo | 2.261 | Inventario | chasis (unique), patente (unique), marca, modelo, anio, color, precio, ubicacion (FK sucursal) |
| solicitud | 13 | Solicitud de traslado (venta/evento) | ejecutivo_id, jefe_local_id, logistica_id, estado (enum), tipo_solicitud, sucursal (origen, FK **restrict** desde la brecha 016), sucursal_destino, posicion_prioridad (UNIQUE con sucursal), múltiples fechas de flujo |
| solicitud_vehiculo | 12 | Vehículos de una solicitud | solicitud_id (cascade), vehiculo_id, disponibilidad (reservado/liberado/vendido); UNIQUE(solicitud_id, vehiculo_id) |
| observacion | 5 | Comentarios | solicitud_id (cascade), usuario_id, observacion |
| auditoria | 228 | Bitácora | usuario_id, entidad, entidad_id (uuid), accion, valor_anterior/nuevo (jsonb) |
| insistencia | 1 | Insistencias del ejecutivo (cooldown 24 h) | solicitud_id, usuario_id, mensaje |
| solicitud_documento | 2 | Metadatos de archivos en Storage | ruta_storage (unique), tipo_mime, tamano_bytes, subido_por |
| traslado_interno | 3 | Traslado de vehículos vendidos entre sucursales | origen_id, destino_id (CHECK distintos), logistica_id, estado; desde R8/R13: motivo_cancelacion, fecha_cancelacion, cancelado_por, recepcion_con_novedades, observacion_recepcion |
| traslado_interno_vehiculo | 20 | Vehículos de un traslado | UNIQUE(traslado_id, vehiculo_id); desde R14 un solo vehículo por traslado nuevo (trigger) |
| notificacion | — | Notificaciones en la app (campana) | Desde 2026-10-14 la escribe `NotificacionService` en cada cambio de estado (sección 30) |

### Enums
- `rol_usuario`: ejecutivo, jefe_local, logistica, administrador, operaciones
- `estado_solicitud`: pendiente, priorizada, asignada, calendarizada, en_transito, entregada, cancelada, finalizada, pendiente_aprobacion, aprobada, rechazada, despachada (`pendiente` y `despachada` no se usan en el flujo actual del código)
- `disponibilidad`: reservado, liberado, vendido
- `tipo_solicitud`: evento, venta · `estado_traslado`: pendiente, en_transito, recepcionado, **cancelado** (R8) · `tipo_notificacion` (11 valores; 18 con la migración `20261014120000`)

### Triggers activos (actualizado 2026-10-13, verificado en producción)

| Tabla | Trigger | Función | Efecto |
|---|---|---|---|
| auth.users | on_auth_user_created | handle_new_auth_user | Crea `public.usuario` siempre como `ejecutivo`, inactivo y no aprobado; ya no lee `rol` de los metadatos (brecha 002) |
| usuario | tr_proteger_columnas_usuario (BEFORE) | fn_proteger_columnas_usuario | Un no administrador no puede cambiar rol, estado, bloqueo ni sucursal (brecha 001) |
| usuario | tr_usuario_updated_at | handle_updated_at | updated_at |
| solicitud | tr_registrar_fechas_flujo (BEFORE UPDATE) | fn_registrar_fechas_flujo | Sella fechas de flujo |
| solicitud | tr_validate_solicitud_tipo | validate_solicitud_tipo | venta exige destino; evento exige dirección y título |
| solicitud | tr_solicitud_destino_invariante | fn_validar_destino_invariante | Destino inmutable una vez definido |
| solicitud | tr_liberar_slots_rechazo_cancelacion | fn_liberar_slots_rechazo_cancelacion | Libera vehículos al rechazar/cancelar y recalcula el destino |
| solicitud | tr_entregar_solicitud_vehiculos | fn_entregar_solicitud_vehiculos | Mueve vehículos al recibir y recalcula destino y origen |
| solicitud | tr_finalizar_solicitud_vehiculos | fn_finalizar_solicitud_vehiculos | Marca vendidos, saca del inventario y recalcula |
| solicitud | tr_recalcular_slots_solicitud_eliminada (AFTER DELETE) | fn_recalcular_slots_solicitud_eliminada | Recalcula el destino al borrar una solicitud |
| solicitud_vehiculo | tr_validar_reserva_unica_vehiculo (BEFORE) | fn_validar_reserva_unica_vehiculo | Impide reservar un vehículo vendido o ya reservado en otra solicitud activa, con advisory lock (brecha 010) |
| solicitud_vehiculo | tr_reservar_slots_solicitud_vehiculo / tr_liberar_slots_solicitud_vehiculo_eliminado | — | Recalculan el destino al reservar o quitar un vehículo |
| vehiculo | tr_recalcular_slots_vehiculos_insertados / _actualizados / _eliminados (por sentencia) | — | Recalculan las sucursales afectadas, una vez por sentencia (reemplazan al trigger por fila desactivado el 2026-09-15) |
| traslado_interno_vehiculo | tr_validar_un_vehiculo_por_traslado (BEFORE) | fn_validar_un_vehiculo_por_traslado | Un vehículo por traslado nuevo (R14) |
| traslado_interno_vehiculo | tr_reservar_slots_traslado_vehiculo / tr_recalcular_slots_traslado_vehiculo_eliminado | — | Recalculan el destino |
| traslado_interno | tr_recibir_traslado_vehiculos, tr_registrar_fechas_traslado, tr_traslado_interno_touch, tr_recalcular_slots_traslado_eliminado | — | Recepción (mueve el vehículo y recalcula), fechas, updated_at y recálculo al borrar |
| sucursal | trg_validar_encargado_sucursal | validar_encargado_sucursal | Valida el encargado. Desde 2026-10-13: debe ser `jefe_local` y la sucursal no puede ser la base de otro jefe (error P0001) |
| insistencia | tr_insistencia_cooldown | fn_insistencia_cooldown | Cooldown 24 h con advisory lock |
| usuario | tr_validar_base_jefe_local (BEFORE, 2026-10-13) | fn_validar_base_jefe_local | La sucursal base de un jefe de local no puede tener otro jefe |
| usuario | tr_sincronizar_sucursales_jefe_local (AFTER, 2026-10-13) | fn_sincronizar_sucursales_jefe_local | La base del jefe queda a su cargo; si deja de ser jefe, sus sucursales quedan libres |

Eliminado el 2026-10-13: `trigger_disponibilidad` (duplicaba la liberación al cancelar).

**Slots (brecha 011):** `fn_recalcular_slots_sucursal(id)` es la única fuente de verdad. `slots_reservados` = reservas de solicitudes en estados de `fn_estados_reserva_activos()` + reservas de traslados pendientes o en tránsito hacia la sucursal; `slots_ocupados` = vehículos con `ubicacion` = sucursal + `slots_reservados`. **Marcha blanca:** superar la capacidad solo emite un aviso y nunca bloquea (capacidades bajas como `slots = 2` son intencionales).

RPC usadas por la app (solo `service_role`): `fn_cancelar_solicitud_en_transito`, `fn_cancelar_traslado_interno` (R8) y `fn_registrar_intento_fallido` (brecha 012).

Funciones sin trigger asociado: `cambio_estado_auditoria`, `auditoria_disponibilidad`, `notificar_solicitud`, `notificar_solicitud_vehiculo`, `notificar_observacion`, `disponibilidad`, `fn_incrementar_slots_ocupados`, `fn_decrementar_slots_ocupados`, `fn_recalcular_slots_por_vehiculo`.

### Integridad (actualizado 2026-10-13)

- FK `solicitud.sucursal → sucursal` pasó a **ON DELETE RESTRICT** (brecha 016): borrar una sucursal con solicitudes falla y el service lo informa. `solicitud.sucursal_destino` no tiene cascade.
- La doble reserva de un vehículo se impide en la BD con `tr_validar_reserva_unica_vehiculo` (brecha 010).
- Contadores de slots: 0 diferencias en todas las sucursales tras la corrección de la brecha 011.
- Sin soft delete: las eliminaciones son físicas.
- Se agregaron 6 índices de FK (brecha 024) y 3 para calendario y reportes (R16/R17); quedan FKs sin índice según el advisor.
- **Desde 2026-10-13:** cada sucursal tiene a lo sumo un jefe de local (`sucursal.usuario_id`, base incluida) y cada usuario de logística una sola zona. Lo garantizan los triggers y el índice de la migración `20261013155000` (sección 29).

---

## 9. Supabase

| Componente | Estado |
|---|---|
| Proyecto | `Proyecto Logistica-HM`, us-east-2, Postgres 17.6, ACTIVE_HEALTHY |
| RLS | Habilitado en las 15 tablas. `solicitud_documento` sin policies (solo service_role) |
| Grants | `anon` y `authenticated` tienen ALL (incl. TRUNCATE) sobre todas las tablas públicas. Solo RLS los limita. TRUNCATE no se evalúa con RLS, pero PostgREST no lo expone |
| Storage | Bucket `solicitud-documentos`, privado, límite 10 MB, lista de MIME (pdf, imágenes, Office, txt, csv, zip). Sin policies de storage: acceso solo vía service_role y URLs firmadas de 300 s |
| Funciones SECURITY DEFINER | 12 ejecutables por anon/authenticated (brecha 014). `es_administrador` y `handle_new_auth_user` sin `search_path` fijo |
| search_path mutable | 22 funciones (advisor) |
| Auth | Email + contraseña. Registro público usado por `/registro` (`signUp` con clave anon). Protección contra contraseñas filtradas: **desactivada**. OAuth: No encontrado en el código analizado. MFA: No encontrado |
| Edge Functions / Realtime | No encontrado en el código analizado |

### Policies RLS por tabla (resumen)

| Tabla | SELECT | INSERT | UPDATE | DELETE | Problema |
|---|---|---|---|---|---|
| usuario | propio o admin | admin o `auth.uid() = id` | **admin o `auth.uid() = id`, sin WITH CHECK, todas las columnas** | admin | **Escalamiento a admin (brecha 001)** |
| solicitud | admin / participante / JL de su sucursal en estados pendiente o priorizada. **Desde 2026-10-13:** JL con origen o destino en cualquiera de sus sucursales, todos los estados | admin / ejecutivo propio / JL con sucursal | admin / participante / JL sucursal principal; **WITH CHECK solo `usuario_activo()`** | admin | Participantes pueden cambiar estado, fechas o asignados saltando el flujo (brecha 005) |
| solicitud_vehiculo | admin / participante (desde 2026-10-13, también el JL de sus sucursales) | admin, logistica (sin alcance) | admin, logistica (sin alcance) | admin | Logística modifica cualquier reserva (brecha 005) |
| vehiculo | activos | admin, JL, logistica | admin, JL, logistica (sin alcance) | admin | Cualquier JL modifica cualquier vehículo (brecha 005) |
| observacion | admin / participante (desde 2026-10-13, también el JL de sus sucursales) | participante | autor o admin | autor o admin | Correcta |
| auditoria | admin | — | — | — | Correcta (escritura solo service_role) |
| insistencia | **cualquier activo** | ejecutivo propio | — | — | Lectura amplia (bajo impacto) |
| notificacion | destinatario | — (service_role) | destinatario (sin grant: va por Server Action) | destinatario | Correcta |
| sucursal, zona, marca | activos | admin | admin | admin | Correctas |
| usuario_zona | propio o admin | admin | admin | admin | Correcta |
| traslado_interno(_vehiculo) | admin / logística propia / JL origen o destino (en `traslado_interno_vehiculo` era solo destino; alineado el 2026-10-13) | admin, logística | admin, logística; JL solo pasar a recepcionado | admin, logística | Aceptables |

Nota: `tiene_rol()`, `usuario_activo()` y `es_administrador()` leen `public.usuario`. Por eso la brecha 001 (modificar el propio `rol`) habilita **todas** las policies de administrador.

---

## 10. Autenticación

- **Login** (`loginAction` → `AuthService.signIn`): lee `usuario` por email con service_role. Rechaza si `activo=false`, `aprobado=false` (columna inexistente: nunca ocurre) o `bloqueado_hasta` futuro. Llama `signInWithPassword`. En fallo incrementa `intentos_fallidos` (lectura-modificación-escritura no atómica) y bloquea 15 min a los 5 intentos. En éxito resetea el contador y redirige a `/establecer-clave` si `requiere_cambio_clave`, si no a `/dashboard`.
  - El bloqueo es solo de la aplicación. Llamar a Supabase Auth directamente (`/auth/v1/token`) lo salta (brecha 012).
  - Los mensajes distinguen cuenta inexistente, desactivada, pendiente y "te quedan N intentos" → enumeración de cuentas.
- **Registro** (`registerAction` → `AuthService.register`): valida formato, impide el email del admin principal, `signUp` con metadatos `{nombre, apellido, sucursal_id, aprobado:false}`, confirma email con service_role y hace upsert en `usuario` incluyendo `aprobado`. Ese upsert falla porque la columna no existe y su error no se verifica, así que `sucursal_id` tampoco queda guardado (brecha 003).
- **Logout**: `supabase.auth.signOut()`.
- **Recuperación**: `resetPasswordForEmail` con `redirectTo = NEXT_PUBLIC_APP_URL/auth/callback?next=/establecer-clave`. `NEXT_PUBLIC_APP_URL` **no está en `.env.local`** → en local cae a `http://localhost:3000`. En producción: No determinado.
- **Cambio de clave** (`updatePasswordAction`): mínimo 8 caracteres. El registro (`validarPasswordRegistro`) exige 8-72, sin reglas de complejidad. Marca `requiere_cambio_clave=false`.
- **Sesiones y tokens**: cookies gestionadas por `@supabase/ssr`. Refresh en middleware. JWT estándar de Supabase. No se usan claims personalizados. El rol se lee siempre de `public.usuario`.
- **Usuarios desactivados**: se marca `usuario.activo=false`, pero no se revoca la sesión ni se banea en Auth. Las actions y páginas verifican `activo`; el middleware no (brecha 009).

## 11. Autorización

Tres capas, en orden de llegada de la petición:
1. **Middleware**: solo "hay sesión" y el flag manipulable `user_metadata.aprobado`.
2. **Server Components / Server Actions**: verificación de rol con el perfil de `public.usuario`, y en algunos casos alcance (sucursal mediante el RPC `usuario_tiene_sucursal`, autoría del ejecutivo).
3. **RLS**: solo aplica a llamadas directas a la API REST con la clave anon. Las llamadas de la app usan service_role y la saltan.

Debilidades: actions sin guard (004), actions sin verificación de pertenencia (006, 008), RLS permisivo (001, 005).

## 12. Roles y permisos

> Actualizado 2026-10-13: alcance por sucursal y zona aplicado en las actions (brecha 008) y acciones nuevas de los requisitos.

| Capacidad | administrador | jefe_local | ejecutivo | logistica | operaciones |
|---|---|---|---|---|---|
| Usuarios, sucursales, zonas, marcas, historial | ✔ | — | — | — | — |
| Crear solicitud | ✔ | ✔ (sus sucursales; queda aprobada) | ✔ (su sucursal; pendiente_aprobacion) | — | — |
| Aprobar / rechazar / priorizar / reordenar cola | ✔ | ✔ (sus sucursales) | — | — | — |
| Asignar encargado / despachar / cancelar despacho | ✔ | — | — | ✔ (sus zonas) | — |
| Calendarizar / descalendarizar | ✔ | ✔ (alcance; no queda como encargado) | — | ✔ (sus zonas) | — |
| Reprogramar una solicitud calendarizada (R16) | **—** (decisión de negocio 2026-10-13) | — | — | ✔ (sus zonas) | — |
| Cancelar una solicitud o un traslado interno **en tránsito** (R8) | **—** (decisión de negocio 2026-10-13) | — | — | ✔ (encargado o sus zonas) | — |
| Recibir en destino (con novedades, R13) | ✔ | ✔ (destino) | — | — | — |
| Finalizar (entregar al cliente) | ✔ | ✔ (destino) | ✔ (propia) | — | — |
| Cancelar (pre-despacho) | ✔ | ✔ (sucursal) | ✔ (propia) | ✔ (sus zonas) | — |
| Eliminar solicitud (pre-despacho) | ✔ | ✔ (sucursal) | ✔ (propia) | — | — |
| Agregar/quitar vehículos de solicitud | ✔ | ✔ (alcance) | — | ✔ (alcance) | — |
| Insistir | — | — | ✔ (propia, cada 24 h) | — | — |
| Vehículos (crear/editar/importar) | ✔ | ✔ | — | ✔ | ✔ |
| Eliminar vehículo | ✔ | — | — | — | — |
| Traslados internos (crear, despachar) | ✔ | recibir (destino) | — | ✔ | — |
| Reportería de logística (`/logistica/reportes`, R17) | ✔ | — | — | — | — |
| Ver solicitudes | todas | origen o destino en sus sucursales | propias | sucursal origen en sus zonas | ninguna |

Excluir al administrador de reprogramar y de cancelar en tránsito es intencional: está documentado en el JSDoc de las actions y cubierto por tests (`notificaciones.actions.test.ts`, `traslados.actions.test.ts`).

### Asignación de sucursales y zonas por rol (desde 2026-10-13)

| Rol | Sucursal base (`usuario.sucursal_id`) | Sucursales adicionales a cargo (`sucursal.usuario_id`) | Zona (`usuario_zona`) |
|---|---|---|---|
| ejecutivo | Obligatoria (una sola) | — | — |
| jefe_local | Obligatoria; queda a su cargo | Opcionales, varias | — |
| logistica | Obligatoria | — | Exactamente una |
| administrador / operaciones | Opcional | — | — |

- Una sucursal tiene a lo sumo un jefe de local, contando tanto las sucursales base como las adicionales. No hay tabla N:M: las adicionales se guardan en `sucursal.usuario_id`.
- "Sus sucursales" de un jefe de local = base + adicionales. Es el alcance de solicitudes, aprobaciones, priorizaciones, recepciones, traslados, calendario, slots, dashboard y correos (`OrganizacionService.getUserAssignedBranches`, RPC `usuario_tiene_sucursal`) y, desde la migración `20261013155000`, también de la RLS de lectura.
- Las reglas están en `src/lib/asignaciones.ts`. Las aplican el modal de `/admin/usuarios`, `UsersService` y los triggers de la BD.

## 13. APIs

No hay API REST propia. Las interfaces son:
- **Server Actions** (sección 6): ~60 funciones invocables por POST desde cualquier ruta de la app.
- **Route Handler** `GET /auth/callback`.
- **PostgREST de Supabase** (`/rest/v1/*`, `/rest/v1/rpc/*`), accesible con la clave pública. Protegido solo por RLS y grants.
- **Supabase Auth** (`/auth/v1/*`), incluido el signup público.
- **Brevo** `POST https://api.brevo.com/v3/smtp/email` (salida).

## 14. Flujos principales

### Ciclo de vida de una solicitud de venta

```
Ejecutivo crea ──► pendiente_aprobacion ──(JL aprueba + fecha)──► aprobada ──(JL prioriza)──► priorizada (posición N en cola de su sucursal)
   JL crea ─────────────────────────────────────────────────────► aprobada
aprobada|priorizada ──(Logística asigna encargado)──► asignada
priorizada|asignada ──(Logística/JL calendariza fecha)──► calendarizada ──(Logística despacha)──► en_transito
en_transito ──(JL destino recibe)──► entregada ("Recepcionada") ──(JL destino o ejecutivo creador)──► finalizada (vehículos = vendido, salen del inventario)
Pre-despacho: cancelar (motivo) → cancelada · rechazar (JL) → rechazada · eliminar (físico)
calendarizada → descalendarizar → priorizada · en_transito → cancelar despacho → calendarizada
```

Cada paso: Client Component → Server Action (rol + alcance) → `SolicitudesService` (lee estado actual, valida transición, `update` con service_role) → triggers BD (fechas, slots, disponibilidad) → `registrarAuditoria` → `revalidarSolicitudes()`.

### Login
Formulario → `loginAction` → `AuthService.signIn` (service_role lee `usuario`; anon `signInWithPassword` crea cookies) → redirect.

### Registro y aprobación (estado real)
Formulario `/registro` → `registerAction` → `signUp` (trigger crea `usuario` con rol de metadatos) → upsert con `aprobado` (falla en silencio) → el usuario puede iniciar sesión, porque ninguna verificación lee una columna real → solo el middleware lo bloquea por `user_metadata.aprobado=false`, y el propio usuario puede cambiarlo con `auth.updateUser`. `approveUserAction` → `UsersService.approveUser` → `update({aprobado:true})` → **error de columna inexistente** (previsto; no ejecutado).

### Traslado interno
Logística elige **un** vehículo vendido (R14) → `crearTraslado` (insert traslado + insert vehículo; si falla, borra el traslado) → `despachar` → `en_transito` → JL destino `recibir`, con novedades y observación opcionales (R13) → `recepcionado` (trigger mueve el vehículo y recalcula slots).

Cancelación en tránsito (R8, solo Logística): `cancelarTrasladoAction` → RPC `fn_cancelar_traslado_interno`, que en una transacción pasa el traslado a `cancelado` con motivo, libera la reserva, deja el vehículo en la ubicación indicada (o sin ubicación) y recalcula los slots del destino. Para solicitudes, `cancelarEnTransitoAction` → RPC `fn_cancelar_solicitud_en_transito`. Ambas envían un correo [URGENTE] a los involucrados.

### Correos de operaciones críticas (R7)
Las actions agendan el correo con `enSegundoPlano` (`after` de Next.js) después de responder: no bloquean ni revierten la operación si Brevo falla. Eventos: creada, aprobada, rechazada, calendarizada, reprogramada [URGENTE], despachada, recibida y cancelación en tránsito [URGENTE]. No se avisa a quien hizo la acción.

### Documentos
Upload multipart (Server Action, límite 15 MB) → validación de tamaño y MIME (declarado por el navegador) → Storage privado + fila `solicitud_documento` + auditoría. Descarga mediante URL firmada de 5 min.

### Flujo de errores
Los services devuelven `{success, error}`; las actions envuelven en try/catch y devuelven `error.message` (incluye mensajes de Postgres). Logs con `console.error` en el servidor. No hay logger estructurado ni monitoreo (No encontrado en el código analizado).

## 15. Reglas de negocio

- Toda solicitud debe tener al menos 1 vehículo (al crear y al quitar).
- Un vehículo no puede estar reservado en 2 solicitudes activas (solo en el service).
- El ejecutivo crea solo en su sucursal; en venta, el destino debe ser su sucursal.
- Si el ejecutivo crea y no hay JL asignado a la sucursal, la creación se rechaza.
- Fechas de entrega y despacho no pueden ser anteriores a hoy.
- Motivo de rechazo y cancelación: mínimo 5 caracteres.
- Cola de prioridad por sucursal origen: posiciones 1..N únicas (UNIQUE en BD), se compacta al salir un elemento.
- Solo se cancela, elimina o editan vehículos en estados pre-despacho.
- El destino de la solicitud es inmutable (trigger).
- Insistencia: solo el ejecutivo creador, 1 cada 24 h (service + trigger con advisory lock).
- Documentos: máximo 10 MB, lista blanca de MIME.
- Bloqueo de cuenta: 5 intentos → 15 minutos.
- El admin principal (email fijo) no puede desactivarse ni autoregistrarse.
- (2026-10-13) Cada sucursal tiene un solo jefe de local. Ejecutivo, jefe de local y logística deben tener sucursal base, y logística exactamente una zona (sección 12).
- (2026-10-13) La priorización se hace solo arrastrando en `/solicitudes/prioridades`. El panel "Priorizaciones pendientes" del dashboard del jefe de local es informativo y su botón "Ver" lleva a esa página.

## 16. Tests

- 20 archivos unitarios, aprox. 512 casos (`it`/`test`), con mocks de `@/lib/supabase/admin` y `server`.
- Cubren: services (auth, users, solicitudes, vehiculo, traslado, organizacion), helpers puros (fechas, filtros, slots, validaciones, CSV, rutas, dashboard).
- **No cubren**: Server Actions (guards de rol y alcance), middleware, `/auth/callback`, policies RLS, funciones y triggers SQL, EmailService, AuditoriaService, SucursalesService.
- `npm run test:integration` apunta a `tests/integracion/`, que **no existe**. `tests/documentacion_testing.md` describe una suite de integración que ya no está en el repo y reporta fallos (SLOT-08, E2E-03) que el código y los triggers actuales parecen haber corregido (no verificado ejecutando).
- Los mocks ocultaron la ausencia de la columna `aprobado`: los tests de `auth.service` y `users.service` la usan y pasan.
- Resultado de ejecución: **No determinado** (no se ejecutaron por instrucción).

**Actualización 2026-10-13:** 57 archivos y **932 tests** en verde (`npm run test`), `tsc --noEmit` y ESLint sin errores, `next build` correcto. Ya se cubren Server Actions (guards, alcance e inventario de actions), middleware (`acceso.test.ts`), EmailService y SucursalesService. Nuevo: tests de contrato de las migraciones SQL (`tests/unitarios/migracion-*.test.ts`, helper `tests/mocks/sql.ts`), que leen los archivos de `supabase/` porque aún no hay tests contra un Postgres real. Siguen faltando RLS, triggers e integración (brecha 017).

Detalle: brecha 017.

**Actualización 2026-10-13:** 54 archivos y 916 tests unitarios en verde, `tsc --noEmit` sin errores y ESLint sin errores (6 advertencias previas). Nuevos: `asignaciones.test.ts` (reglas por rol y conflictos de jefe de local) y casos de `users.service.test.ts` y `solicitudes.service.test.ts` para las asignaciones. `migracion-cancelar-traslado.test.ts` fallaba con saltos de línea CRLF (checkout en Windows); se corrigió su normalización.

**Actualización 2026-10-14** (después de integrar ambas ramas): 60 archivos y **972 tests** en verde, `tsc --noEmit` sin errores y ESLint sin errores (6 advertencias previas).

## 17. Integraciones externas

| Servicio | Uso | Configuración |
|---|---|---|
| Supabase | Auth, BD, Storage | `NEXT_PUBLIC_SUPABASE_URL`, claves anon/publishable y service_role/secret |
| Brevo | Correo de credenciales de usuario y, desde R7, correos de operaciones críticas (`NotificacionService`) | `BREVO_API_KEY`, `BREVO_SENDER_EMAIL`, `BREVO_SENDER_NAME` |
| cdn.sheetjs.com | Origen del paquete `xlsx` | URL fija en package.json |

## 18. Variables de entorno

| Variable | Pública | Uso | Presente en .env.local |
|---|---|---|---|
| NEXT_PUBLIC_SUPABASE_URL | Sí | Todos los clientes | Sí |
| NEXT_PUBLIC_SUPABASE_ANON_KEY | Sí | Cliente anon (legacy) | Sí |
| NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY | Sí | Alternativa a la anterior | Sí |
| SUPABASE_SERVICE_ROLE_KEY | **No (secreto)** | createAdminClient (legacy) | Sí |
| SUPABASE_SECRET_KEY | **No (secreto)** | Alternativa a la anterior | Sí |
| BREVO_API_KEY | **No (secreto)** | EmailService | Sí |
| BREVO_SENDER_EMAIL / BREVO_SENDER_NAME | No | EmailService | Sí |
| BREVO_SMTP_HOST / PORT / USER | No | **No se usan en el código** | Sí |
| NEXT_PUBLIC_APP_URL | Sí | Enlaces de correo y reset (obligatoria en producción desde la brecha 026) | **No** |
| ADMIN_PRINCIPAL_EMAIL | No | Protege al administrador principal de ser desactivado; no otorga permisos (brecha 025, agregada 2026-10-07) | No determinado |
| NEXT_PUBLIC_SOPORTE_EMAIL | Sí | Correo de soporte que se muestra a una cuenta desactivada (requisito de la fase 1, agregada 2026-10) | No determinado |

`.env.local` está en `.gitignore`. Si estuvo alguna vez en el historial de git: No determinado (no hubo acceso a la carpeta del repositorio git).

## 19. Seguridad

Resumen de controles existentes:
- ✔ RLS habilitado en todas las tablas; bucket privado; URLs firmadas cortas.
- ✔ `getUser()` (validado contra Auth) en lugar de `getSession()`.
- ✔ Server Actions con verificación de rol en la mayoría de los casos.
- ✔ Cooldown de insistencias con lock en BD; UNIQUE de cola de prioridad.
- ✘ Escalamiento a administrador por RLS y por trigger de registro (001, 002).
- ✘ Aprobación de cuentas inexistente (003).
- ✘ Actions sin autenticación (004) e IDOR (006, 008).
- ✘ Contraseña del admin principal en el repo (007).
- ✘ Sin rate limiting, sin headers de seguridad, sin protección contra contraseñas filtradas.

## 20. Bugs encontrados

| ID | Bug | Severidad |
|---|---|---|
| 003 | Columna `aprobado` inexistente: aprobación, registro (sucursal) y creación de usuarios por admin fallan o no tienen efecto | High |
| 010 | Transiciones de estado y reservas sin control de concurrencia ni transacciones | Medium |
| 011 | Contadores de slots desincronizados (4/6 sucursales) — **corregida y aplicada en producción el 2026-10-13** | Medium |
| 016 | Borrar sucursal elimina solicitudes en cascada y deja archivos huérfanos | Medium |
| 018 | Auditoría best-effort; notificaciones sin implementar | Low |
| 026 | `NEXT_PUBLIC_APP_URL` ausente → enlaces de reset a localhost (en local) | Informational |

## 21. Vulnerabilidades encontradas

| ID | Vulnerabilidad | Severidad |
|---|---|---|
| 001 | Escalamiento de privilegios vía `UPDATE usuario` (RLS) | Critical |
| 002 | Rol tomado de metadatos del registro público | Critical |
| 003 | Bypass de aprobación de cuentas | High |
| 004 | Server Actions sin autenticación | High |
| 005 | RLS permisivo en solicitud, solicitud_vehiculo y vehiculo | High |
| 006 | IDOR en documentos, observaciones, insistencias y datos de usuarios | High |
| 007 | Contraseña de administrador hardcodeada en script | High |
| 008 | Alcance por sucursal/zona incompleto en acciones de JL y Logística | Medium |
| 009 | Sesión de usuarios desactivados; cambio de clave no forzado | Medium |
| 012 | Bloqueo de login evitable y enumeración de cuentas | Medium |
| 013 | Contraseñas temporales débiles y expuestas al navegador | Medium |
| 014 | Funciones SECURITY DEFINER expuestas / search_path | Medium |
| 019 | Headers de seguridad ausentes | Low |
| 020 | Mensajes de error internos; `next` sin lista blanca | Low |
| 021 | Inyección de filtros PostgREST en búsqueda | Low |
| 022 | HTML sin escapar en correos | Low |
| 023 | Validación de archivos basada en MIME del cliente | Low |
| 025 | Email del admin principal hardcodeado en código y trigger | Informational |
| 027 | Next.js 16.3.2 con vulnerabilidades críticas de ejecución remota de código (detectada en la fase de corrección con `npm audit`) | Critical |

## 22. Problemas de arquitectura

- Dependencia total del service_role: la RLS no protege el camino principal y la app no protege el camino directo a la BD. Hay dos modelos de autorización distintos que no coinciden (por ejemplo, la RLS de `solicitud` para JL usa solo `usuario.sucursal_id`, mientras la app usa principal + encargadas).
- Esquema de BD sin versionar (brecha 015): los comentarios del código citan migraciones (`20260928_triggers_fechas.sql`) que no están en el repo.
- Lógica de negocio repartida entre service y triggers, con solapamientos (`disponibilidad()` y `fn_liberar_slots_rechazo_cancelacion` liberan vehículos en cancelación).
- `SolicitudesService` de 2.100+ líneas y componentes cliente de 50-77 KB.
- Guards de autorización copiados en cada archivo de actions (`verifyAdminPermission`, `getProfileOrThrow` duplicados).

## 23. Problemas de rendimiento

- `getSolicitudes()` y la vista de Logística cargan **todas** las solicitudes y filtran por zona en memoria.
- `AuditoriaService.getAuditoria` sin paginación ni límite.
- `getCurrentUserProfile()` hace 3 consultas por request y se llama en cada action y página.
- Reescritura de la cola: N updates secuenciales.
- Importación CSV: lee todos los chasis (2.261+) en cada importación.
- 19 policies con `auth.uid()` reevaluado por fila; 12 FKs sin índice; 9 índices sin uso.

## 24. Problemas de escalabilidad

Con los volúmenes actuales (13 solicitudes, 2.261 vehículos) no hay problemas visibles. Con miles de solicitudes, los listados sin paginación y el filtrado en memoria crecerán linealmente. El límite de 15 MB en Server Actions y la subida a través del servidor de Next.js consumen memoria del servidor por cada archivo.

## 25. Deuda técnica

- Columna y flujo `aprobado` desalineados entre código y BD.
- Funciones SQL muertas de auditoría. (Las de notificación y la tabla `notificacion`: resuelto el 2026-10-14, sección 30.)
- Valores de enum sin uso (`pendiente`, `despachada`).
- Variables `BREVO_SMTP_*` sin uso; claves legacy y nuevas de Supabase coexistiendo.
- Dependencia `claude` sin uso.
- Documentación de testing desactualizada (`tests/documentacion_testing.md` y `tests/plan_maestro_testing.md` describen la suite de septiembre); script `test:integration` roto.
- ~~Historial de migraciones de Supabase desalineado con el repo.~~ **Resuelto 2026-10-14** (brecha 015): las 17 migraciones están registradas.
- ~~Sucursales de prueba `TEST-SUC-…` (ids 407 y 408) en producción.~~ **Resuelto 2026-10-14:** borradas con `02_limpiar_sucursales_test.sql`, junto con sus 2 solicitudes; los 2 vehículos BAI que reservaban volvieron a estar disponibles.
- Componentes y services muy grandes.
- `src/middleware.ts` usa la convención obsoleta de Next 16 (renombrada a `proxy.ts`). Funciona; migrar con el codemod oficial.
- La lista de sucursales de `/registro` se genera en el build (página estática): una sucursal nueva no aparece hasta el siguiente despliegue.

## 26. Recomendaciones

Orden sugerido (detalle en cada brecha):
1. **Inmediato (Critical)**: 001 y 002. Bloquear la modificación de `rol`, `activo` y demás columnas sensibles por el propio usuario, e ignorar `rol` de los metadatos del registro. Auditar si algún usuario ya cambió su rol (hoy: 2 administradores; verificar que ambos sean legítimos).
2. **Alta**: 003 (decidir y crear la columna `aprobado` o eliminar el flujo), 004, 005, 006, 007 (rotar la contraseña del admin principal si coincide con la del script).
3. **Media**: centralizar autorización (`requireRole`, `requireSolicitudAccess`), mover transiciones de estado a funciones SQL transaccionales, versionar el esquema con migraciones, tests de actions y RLS.
4. **Baja**: headers, mensajes de error, paginación, limpieza de deuda.

### Decisiones del responsable (2026-10-07)

| # | Decisión | Implicancia |
|---|---|---|
| 1 | Las correcciones se aplicarán **directamente en producción** | No hay ambiente de staging intermedio. Cada cambio de BD (policies, triggers, columnas) debe ir con script de rollback y respaldo previo |
| 2 | **Aún no se ejecutan tests, build ni lint** | Se mantiene el carácter de solo lectura de esta auditoría |
| 3 | Por ahora **solo se documenta** lo que hay que hacer | Ninguna brecha se corrige en esta etapa; el detalle de cada corrección está en `auditoria/brechas/brecha-NNN-*.md` |
| 4 | La documentación se versiona en una **rama separada** (`auditoria/2026-10-07`) | No se mezcla con `main` hasta revisión |
| 5 | **Proceder con la corrección de las brechas** y documentarla en cada archivo | Correcciones en la rama `fix/brechas-auditoria-2026-10-07`, creada desde `auditoria/2026-10-07`. Reemplaza las decisiones 2 y 3 |

Notas de la fase de corrección:
- **Decisión 1 (producción directa):** desde la sesión de corrección no hubo permiso para consultar ni modificar la base de producción. Los cambios de BD quedaron como migraciones versionadas con respaldo y rollback, listas para que el responsable las aplique (ver `plan-despliegue-correcciones-2026-10-07.md`).
- **Tests:** se ejecutaron solo localmente (unitarios con mocks, typecheck, lint y build). Antes de ejecutarlos se aisló `tests/setup-env.ts` para que no pudiera usar las credenciales de producción (brecha 026).

## 27. Estado actual del sistema

**Actualizado el 2026-10-14** con verificación directa en la base de producción (consultas de catálogo de solo lectura). Los cambios del 2026-10-13 sobre datos de prueba y asignación de sucursales por rol están en la sección 29.

- **Base de datos:** de las **18 migraciones** de `projecto_logistica_hm/supabase/migrations/` están **todas aplicadas y registradas en el historial de Supabase**: las 7 de la auditoría, las 3 de los requisitos, la corrección de R8, las 4 de la brecha 011 y la de asignación de sucursales y zonas por rol (`20261013155000`, con el script `03_asignar_sucursales_sin_jefe.sql`) , la de la brecha 014 (`20261013170000`) y la de notificaciones en la app (`20261014120000`), ambas aplicadas el 2026-10-14. También se ejecutaron los scripts `01_alinear_historial_migraciones.sql` y `02_limpiar_sucursales_test.sql`. Producción queda con 4 sucursales y 0 diferencias en los contadores de slots. Las brechas 001 y 002 (escalamiento a administrador) están cerradas en la base.
- **Código:** las correcciones de la auditoría y los requisitos (fases 1 a 6) están integrados en las ramas `joaco-ciclo-2` y `feature/requisitos-2026-10`. Si esa versión está **desplegada en el hosting: No determinado**. Hasta desplegarla, sigue vigente la brecha 027 (Next.js vulnerable) en lo que esté publicado.
- **Verificación local** (2026-10-14): 60 archivos y 972 tests en verde, `tsc --noEmit` sin errores y ESLint sin errores (6 advertencias previas).
- Pasos pendientes del responsable: [`plan-despliegue-correcciones-2026-10-07.md`](plan-despliegue-correcciones-2026-10-07.md).

| Brecha | Severidad | Estado (2026-10-14) |
|---|---|---|
| 001 Escalamiento vía UPDATE usuario | Critical | **Corregida · migración aplicada en producción** |
| 002 Rol desde metadatos del registro | Critical | **Corregida · migración aplicada en producción** |
| 027 Next.js vulnerable | Critical | Corregida en código · despliegue No determinado |
| 003 Columna `aprobado` inexistente | High | **Corregida · migración aplicada en producción** |
| 004 Actions sin autenticación | High | Corregida |
| 005 RLS permisivo | High | **Corregida · migración aplicada en producción** |
| 006 IDOR | High | Corregida |
| 007 Contraseña en el seed | High | Parcial · **rotar la contraseña (responsable)** |
| 008 Alcance sucursal/zona | Medium | Corregida (reglas por defecto a confirmar) |
| 009 Sesión de desactivados / cambio de clave | Medium | Corregida |
| 010 Concurrencia | Medium | Parcial · trigger anti doble reserva y RPC de intentos aplicados; faltan RPC transaccionales |
| 011 Slots desincronizados | Medium | **Corregida · aplicada en producción el 2026-10-13 (0 diferencias)** |
| 012 Bloqueo de login / enumeración | Medium | Parcial · RPC aplicada; falta configuración en el dashboard de Supabase |
| 013 Contraseñas temporales | Medium | Corregida |
| 014 Funciones SECURITY DEFINER | Medium | **Corregida · aplicada en producción el 2026-10-14** (RLS idénticas para los 8 usuarios activos en el ensayo previo) |
| 015 Esquema sin migraciones | Medium | Parcial · 18 migraciones versionadas, aplicadas y registradas en el historial de Supabase; falta la migración base |
| 016 Borrado en cascada de sucursal | Medium | **Corregida · migración aplicada en producción** |
| 017 Cobertura de tests | Medium | Parcial (unitarios, actions y contrato de migraciones; faltan RLS, triggers e integración) |
| 018 Auditoría y notificaciones | Low | Parcial · notificaciones en la app implementadas y aplicadas en producción (2026-10-14); falta la decisión de diseño de la auditoría |
| 019 Headers de seguridad | Low | Corregida (CSP en Report-Only) |
| 020 Errores internos / `next` | Low | Corregida |
| 021 Inyección en filtros | Low | Corregida (índice único `lower(nombre)` pendiente) |
| 022 HTML en correos | Low | Corregida |
| 023 Validación de archivos | Low | Corregida |
| 024 Rendimiento | Low | Parcial · índices aplicados; falta paginación |
| 025 Email del admin hardcodeado | Informational | Corregida · migración aplicada; requiere `ADMIN_PRINCIPAL_EMAIL` en el hosting |
| 026 Dependencias y variables de entorno | Informational | Parcial (acciones del responsable en el hosting) |

### Requisitos implementados después de la auditoría (rama `feature/requisitos-2026-10`)

| Fase | Requisitos | Resumen |
|---|---|---|
| 1 | — | Mensaje con correo de soporte para cuentas desactivadas (`NEXT_PUBLIC_SOPORTE_EMAIL`); "Fecha límite de entrega propuesta" en todas las pantallas; estados visibles del vehículo (Disponible, Reservado, Vendido); solicitudes rechazadas o canceladas sin observaciones ni documentos; prioridades con una cola por sucursal |
| 2 | R2, R8, R13, R14 | Traslados internos de 1 vehículo; cancelación en tránsito de solicitudes y traslados (RPC atómicas); bandeja `/solicitudes/recepciones` con novedades, observación y fotos; reprogramación auditada (`recalendarizacion`); auditoría de altas, ediciones, eliminaciones e importaciones de vehículos |
| 3 | R7 | Correos de operaciones críticas (ver sección 14) |
| 4 | R2, R3, R5, R11, R12 | Paneles de acción del Jefe de Local y del Ejecutivo; vehículos en tránsito con su destino; 20 % de slots extra por sucursal como aviso |
| 5 | R16 | Calendario de logística con vistas mes/semana/día, filtros en la URL, indicadores y reprogramación arrastrando |
| 6 | R17 | `/logistica/reportes` (solo administrador): tiempos, atrasos, reprogramaciones y cancelaciones por encargado, exportación a Excel; indicadores propios en el dashboard de Logística |

La descripción completa de cada requisito (R1–R17) **no está documentada en el repositorio**: solo se conoce por los mensajes de commit. Se recomienda agregar el listado acordado con el negocio.

Correcciones posteriores (2026-10-13): la cancelación de un traslado interno descuenta también `slots_ocupados` (corrección de R8), la brecha 011 y la asignación de sucursales y zonas por rol (sección 29).

## 28. Historial de cambios

| Fecha | Cambio | Autor |
|---|---|---|
| 2026-10-07 | Creación del documento: auditoría inicial de solo lectura, 26 brechas documentadas | Claude (auditoría asistida) |
| 2026-10-07 | Registro de decisiones del responsable (sección 26) | Claude (auditoría asistida) |
| 2026-10-07 | Fase de corrección: código, migraciones y tests en `fix/brechas-auditoria-2026-10-07`; sección "Solución aplicada" en cada brecha; nueva brecha 027; estado actualizado (sección 27) y plan de despliegue | Claude (auditoría asistida) |
| 2026-10-13 | Verificación en producción: las 7 migraciones de la auditoría y las 3 de requisitos ya estaban aplicadas. Corrección de R8 (slots al cancelar un traslado) y de la brecha 011, aplicadas en producción. Actualizadas las secciones 4–5, 7–8, 12, 14, 16–18, 20, 25 y 27 (requisitos implementados), y las brechas 001–003, 005, 010–012, 014–016, 021, 024 y 025 | Claude (asistido) |
| 2026-10-13 | Datos de prueba en producción, panel de priorizaciones del dashboard solo informativo y corrección de la asignación de sucursales y zonas por rol (migración `20261013155000`). Secciones 4, 7, 8, 9, 12, 15, 16 y nueva sección 29 | Claude (asistido) |
| 2026-10-14 | Integración de las dos actualizaciones del 2026-10-13 (el merge había descartado la primera). La migración de asignación se renombró de `20261013150000` a `20261013155000` porque repetía la versión de `brecha_011_trigger_vehiculos`; el script de asignación pasó a `03_`. Estado de las brechas 014 y 015 en la sección 27 | Claude (asistido) |
| 2026-10-14 | Aplicadas en producción la migración de la brecha 014 y los scripts de historial (brecha 015) y de limpieza TEST-SUC. Secciones 25, 27 y 29.1; brechas 014 y 015 | Claude (asistido) |
| 2026-10-14 | Notificaciones en la app por cambios de estado (campana con Realtime) y registro sin correo de Supabase. Nueva sección 30; secciones 8, 9, 25 y 27; brecha 018 | Claude (asistido) |

## 29. Cambios del 2026-10-13

Rama `feature/requisitos-2026-10`.

### 29.1 Asignación de sucursales y zonas por rol

**Problema encontrado**
- En `/admin/usuarios`, el modal permitía asignar "sucursales a su cargo" también a administradores. Al editar uno, `UsersService` le pasó las 6 sucursales (`sucursal.usuario_id`) y se las quitó en silencio a los jefes de local. En producción quedaron todas a cargo de un administrador y Valparaíso sin jefe, así que su ejecutivo no podía crear solicitudes.
- Los errores de BD al guardar sucursales y zonas se ignoraban: el modal informaba éxito aunque no se hubiera guardado nada.
- Nada impedía que una sucursal fuera base de un jefe y estuviera a cargo de otro, ni que logística tuviera varias zonas.
- `SolicitudesService.getJefeLocalDeSucursal` consultaba una tabla N:M `usuario_sucursal` que no existe.
- La RLS de lectura de `solicitud` solo dejaba ver al jefe de local su sucursal base, y solo en estado pendiente o priorizada.

**Modelo** (sin tablas nuevas): las reglas por rol están en la sección 12. Las sucursales adicionales siguen en `sucursal.usuario_id`: al ser una sola columna, cada sucursal tiene a lo sumo un jefe.

**Código**

| Archivo | Cambio |
|---|---|
| `src/lib/asignaciones.ts` (nuevo) | Reglas puras: `normalizarAsignaciones`, `sucursalesOcupadasPorJefes`, `conflictoJefeLocal`, `validarAsignacionesFormulario` |
| `src/services/users.service.ts` | `createUser` y `updateUser` validan asignaciones y conflictos antes de escribir (al crear, antes de crear la cuenta en Auth). Solo un jefe de local puede tener sucursales a cargo. `setSucursalesEncargadas` y `setZonasAsignadas` devuelven el error en vez de ignorarlo |
| `src/app/admin/usuarios/UsersTableClient.tsx` | Campos según el rol: sucursal base; sucursales adicionales solo para el jefe de local, con las de otros jefes bloqueadas y su nombre; una sola zona para logística. Errores dentro del modal |
| `src/services/solicitudes.service.ts` | `getJefeLocalDeSucursal` usa primero `sucursal.usuario_id` y después la sucursal base; se quitó la consulta a `usuario_sucursal` |

**Base de datos:** migración `supabase/migrations/20261013155000_asignacion_sucursales_y_zonas_por_rol.sql`, con su rollback.
- **Datos:** quita los encargados que no son jefe de local y deja la base de cada jefe a su cargo. Si encuentra conflictos, se detiene.
- **`validar_encargado_sucursal`:** el encargado debe ser jefe de local y la sucursal no puede ser la base de otro jefe (error P0001, el mensaje se muestra al usuario).
- **Triggers nuevos en `usuario`:** `tr_validar_base_jefe_local` y `tr_sincronizar_sucursales_jefe_local`.
- **Índice:** `usuario_zona_una_por_usuario`.
- **RLS:** `solicitud_select_participantes`, `sv_select_participantes` y `observacion_select_participantes` incluyen al jefe de local con origen o destino en cualquiera de sus sucursales. `traslado_veh_select` incluye el origen.

**Después de la migración:** el script `supabase/scripts/03_asignar_sucursales_sin_jefe.sql` deja Valparaíso (9), Santiago Centro (8) y las sucursales de prueba 407 y 408 a cargo de Joaquin Lepe, por decisión del responsable. Concón (7) queda con su jefe de base.

**Estado en producción (verificado 2026-10-13):** migración y script aplicados. Las 6 sucursales tienen jefe de local: 6, 8, 9, 407 y 408 → Joaquin Lepe; 7 → maickol concon. El 2026-10-14 se borraron las sucursales de prueba 407 y 408 (quedan 4).

**Pendiente:**
- Los usuarios de logística sin zona (por ejemplo "flowcode soluciones") y los ejecutivos, jefes o logística sin sucursal base deberán completarlas la próxima vez que se editen.
- La RLS de lectura de logística por zona no se alineó con la regla de la app (sigue solo como participante).

### 29.2 Panel de priorizaciones del dashboard del jefe de local

`src/components/DashboardJefeLocal.tsx`: el panel "Priorizaciones pendientes" ya no prioriza directamente. Cada fila tiene un botón "Ver" que abre `/solicitudes/prioridades`, donde la cola se ordena arrastrando. La action `priorizarSolicitudAction` se mantiene porque la usa esa página.

### 29.3 Datos de prueba en producción

Con autorización del responsable, se poblaron datos de prueba en la rama principal de Supabase. Los scripts y su documentación están en `supabase/seed/` (ver `supabase/seed/README.md`).

| Archivo | Uso |
|---|---|
| `01_poblar_escenarios.sql` | 30 escenarios escritos a mano (S1–S30) y 4 traslados |
| `02_limpiar_escenarios.sql` | Borra solo los datos de prueba y restaura vehículos, colas y slots |
| `03_validar_escenarios.sql` | Controles de integridad, historial, fechas, colas y RLS por usuario (solo lectura) |
| `04_poblar_100_solicitudes.sql` | 100 solicitudes generadas (S1001–S1100) en todos los estados y 6 traslados |

- Cada solicitud recorre las mismas transiciones que `SolicitudesService`, con sus validaciones. Así se disparan los triggers reales y cada paso queda en `auditoria` con su actor y su hora.
- Usan usuarios reales y vehículos existentes del stock; no crean usuarios ni vehículos ni cambian el esquema.
- Todo lo creado tiene un id que empieza con `5eed`.
- **Estado en producción (2026-10-13):** están cargadas las 100 solicitudes S1001–S1100 y 6 traslados; las 30 de `01` ya se limpiaron.
- Para cualquier análisis de datos reales, excluir `id::text like '5eed%'`.
- **Atención:** avanzar una solicitud de prueba desde la app envía correos reales (Brevo) a las cuentas de los usuarios.

Hallazgos del poblamiento:
1. Las solicitudes creadas por un jefe de local no guardan `fecha_confirmacion`, así que la reportería de logística no mide su tiempo de respuesta.
2. ~~Los traslados internos suman `slots_ocupados` que `fn_recalcular_slots_ocupados` no cuenta (brecha 011).~~ **Resuelto 2026-10-13:** `fn_recalcular_slots_sucursal` cuenta las reservas de traslados.
3. Asignar un encargado desde `priorizada` no limpia `posicion_prioridad`.
4. Revertir un despacho conserva `fecha_inicio_transito`.

## 30. Notificaciones en la app (2026-10-14)

Campana en el encabezado con las notificaciones de cada usuario por los cambios de estado de sus solicitudes y traslados internos. Se suman a los correos de R7, que no cambian.

**Quién recibe cada aviso** (acordado con el responsable el 2026-10-14; definido en `src/lib/notificaciones-app.ts`, `DESTINATARIOS_APP`). Nunca se notifica a quien hizo la acción.

| Cambio de estado | Notificación en la app | Correo (R7) |
|---|---|---|
| Creada | Jefe de local de origen | Sí |
| Aprobada | Ejecutivo, Logística de la zona | Sí |
| Rechazada | Ejecutivo | Sí |
| Priorizada (entra a la cola; reordenar no avisa) | Ejecutivo | No |
| Asignada a un encargado | Encargado de Logística, ejecutivo | No |
| Programada / reprogramada | Ejecutivo, jefes de origen y destino | Sí |
| Desprogramada (vuelve a la cola) | Ejecutivo, jefe de origen | No |
| Despachada (en tránsito) | Jefe de destino, ejecutivo | Solo al jefe |
| Despacho revertido | Jefe de destino, ejecutivo | No |
| Recibida en destino | Ejecutivo, encargado de Logística | Sí |
| Finalizada | Jefe de origen, encargado de Logística | No |
| Cancelada (antes del despacho) | Ejecutivo, jefe de origen, encargado de Logística | No |
| Cancelada en tránsito / traslado interno cancelado | Todos los involucrados | Sí |

**Cómo funciona**
- Las actions llaman a `notificar(evento, …)` después de una operación exitosa. `NotificacionService.notificarSolicitud` resuelve los participantes una vez, envía el correo si el evento es de R7 e inserta una fila en `notificacion` por destinatario (service_role). Corre en segundo plano (`after`): si falla, la operación no se ve afectada.
- La campana (`src/components/CampanaNotificaciones.tsx`, dentro de `PageHeader`) carga la bandeja con `getBandejaNotificacionesAction` y se suscribe con **Supabase Realtime** a los INSERT del propio usuario. La RLS de la tabla solo le entrega los suyos. Ante cada aviso vuelve a pedir la bandeja al servidor.
- Muestra las últimas 20 y el contador de no leídas. Al abrir una notificación se marca como leída y lleva al detalle (`/solicitudes?solicitud=<id>`, que abre el modal) o a `/solicitudes/traslados`. También hay "Marcar todas como leídas".
- Marcar como leída va por Server Action (`bandeja.actions.ts`): `authenticated` solo tiene SELECT sobre la tabla y el id del usuario sale de la sesión.
- CSP: `connect-src` incluye el websocket de Supabase (`wss://…`).

**Base de datos:** migración `supabase/migrations/20261014120000_notificaciones_en_app.sql` (+ rollback): tipos nuevos en `tipo_notificacion`, índices `(usuario_id, leida, created_at)` y `emisor_id`, tabla publicada en Realtime y eliminación de las funciones antiguas `notificar_solicitud`, `notificar_observacion` y `notificar_solicitud_vehiculo`. Esas funciones no tenían trigger y usaban `auth.uid()` como emisor: con service_role es NULL y `emisor_id` es NOT NULL, así que conectarlas habría hecho fallar todas las transiciones. Ensayada en producción (revertida): el destinatario ve solo las suyas, otro usuario no las ve y `authenticated` no puede modificarlas.

**Estado (2026-10-14):** código en `joaco-ciclo-2` y **migración aplicada en producción** y registrada en el historial (verificado: 18 valores en el enum, 2 índices nuevos, tabla en Realtime, 0 funciones `notificar_*`, historial con 18 filas).

**Tests:** `notificaciones-app.test.ts`, `notificacion.service.test.ts`, `notificaciones.actions.test.ts`, `bandeja.actions.test.ts`, `migracion-notificaciones.test.ts`, `security-headers.test.ts`. La campana no tiene test de componente (el proyecto no tiene infraestructura para eso).

**Pendiente**
- Limpieza de notificaciones antiguas (no hay retención; la tabla crece con el uso).
- Observaciones nuevas y reservas de vehículos no notifican (los tipos `NUEVA_OBSERVACION`, `VEHICULO_RESERVADO` y `VEHICULO_LIBERADO` quedan sin uso).
