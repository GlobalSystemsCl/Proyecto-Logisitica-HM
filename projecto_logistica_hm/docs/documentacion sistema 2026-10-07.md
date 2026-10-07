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
│  │  ├─ logistica/{calendarizaciones,slots}/
│  │  └─ solicitudes/{aprobaciones,prioridades,traslados}/ + layout.tsx
│  ├─ components/                   Header, tarjetas de dashboard, modal de detalle, etc.
│  ├─ config/dashboard-cards.ts     Módulos visibles por rol
│  ├─ lib/                          Helpers puros (fechas, filtros, slots, validaciones) + clientes Supabase
│  ├─ services/                     9 services (lógica de negocio y acceso a datos)
│  └─ types/                        Tipos de dominio
├─ supabase/                        VACÍA (sin migraciones; ver brecha 015)
├─ scripts/seed-admin.mjs, seed-solicitudes.mts
├─ tests/                           unitarios (20 archivos), mocks, documentación de testing
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
| UsersService | CRUD de usuarios, aprobar, reset de clave, sucursales a cargo, zonas | admin | usuario, sucursal, usuario_zona, auth.users | Contraseña temporal con `Math.random`; desactivar no revoca sesión |
| SolicitudesService | ciclo de vida completo de solicitudes, cola de prioridad, vehículos, observaciones, auditoría, documentos (Storage), insistencias | admin | solicitud, solicitud_vehiculo, observacion, auditoria, insistencia, solicitud_documento, usuario, storage | 2.100+ líneas; transiciones sin control de concurrencia; operaciones multi-paso sin transacción |
| TrasladoService | traslados internos de vehículos vendidos | admin | traslado_interno, traslado_interno_vehiculo, vehiculo | Creación en 2 pasos con borrado compensatorio |
| VehiculoService | CRUD de vehículos, disponibilidad, importación CSV | admin | vehiculo, solicitud_vehiculo, marca, sucursal | Paginación manual para superar el límite de 1000 filas |
| SucursalesService | CRUD de sucursales y lectura de slots | admin | sucursal, solicitud | Eliminar sucursal borra solicitudes en cascada (brecha 016) |
| OrganizacionService | zonas, marcas, sucursales y zonas del usuario, RPC `usuario_tiene_sucursal` | admin | zona, marca, sucursal, usuario_zona | — |
| AuditoriaService | historial global + métricas | admin | auditoria + joins | Sin paginación |
| EmailService | correo de credenciales vía Brevo | — | — | HTML con interpolación sin escape (brecha 022) |

Lógica duplicada o en conflicto:
- La lista de estados que "reservan" vehículo existe en código (`ESTADOS_ACTIVOS_RESERVA`) y en SQL (`fn_recalcular_slots_ocupados`). Son distintas: el SQL incluye `despachada`.
- La disponibilidad de vehículos se recalcula a la vez con triggers incrementales (+1/−1) y con recálculo completo. Esto produce contadores desincronizados (brecha 011).
- La auditoría la registra la aplicación (best-effort, los errores se ignoran). Existen funciones de auditoría y notificación en la BD que no están conectadas a ningún trigger (brecha 018).

---

## 8. Base de datos

### Tablas (schema `public`, todas con RLS habilitado)

| Tabla | Filas aprox. | Propósito | Columnas clave |
|---|---|---|---|
| usuario | 8 | Perfil de aplicación (1:1 con auth.users) | id (FK auth.users, cascade), email (unique), rol (enum rol_usuario), activo, requiere_cambio_clave, intentos_fallidos, bloqueado_hasta, sucursal_id, telefono. **No existe la columna `aprobado`** |
| sucursal | 6 | Sucursales | nombre, direccion, slots, slots_ocupados, slots_reservados, zona_id, usuario_id (encargado) |
| zona | 2 | Zonas logísticas | nombre (unique) |
| usuario_zona | 1 | N:M usuario-zona (logística) | PK (usuario_id, zona_id) |
| marca | 19 | Catálogo de marcas | codigo (unique), nombre |
| vehiculo | 2.261 | Inventario | chasis (unique), patente (unique), marca, modelo, anio, color, precio, ubicacion (FK sucursal) |
| solicitud | 13 | Solicitud de traslado (venta/evento) | ejecutivo_id, jefe_local_id, logistica_id, estado (enum), tipo_solicitud, sucursal (origen, FK cascade), sucursal_destino, posicion_prioridad (UNIQUE con sucursal), múltiples fechas de flujo |
| solicitud_vehiculo | 12 | Vehículos de una solicitud | solicitud_id (cascade), vehiculo_id, disponibilidad (reservado/liberado/vendido); UNIQUE(solicitud_id, vehiculo_id) |
| observacion | 5 | Comentarios | solicitud_id (cascade), usuario_id, observacion |
| auditoria | 228 | Bitácora | usuario_id, entidad, entidad_id (uuid), accion, valor_anterior/nuevo (jsonb) |
| insistencia | 1 | Insistencias del ejecutivo (cooldown 24 h) | solicitud_id, usuario_id, mensaje |
| solicitud_documento | 2 | Metadatos de archivos en Storage | ruta_storage (unique), tipo_mime, tamano_bytes, subido_por |
| traslado_interno | 3 | Traslado de vehículos vendidos entre sucursales | origen_id, destino_id (CHECK distintos), logistica_id, estado |
| traslado_interno_vehiculo | 20 | Vehículos de un traslado | UNIQUE(traslado_id, vehiculo_id) |
| notificacion | 0 | Notificaciones internas | **Sin uso**: ninguna función de notificación está conectada a un trigger |

### Enums
- `rol_usuario`: ejecutivo, jefe_local, logistica, administrador, operaciones
- `estado_solicitud`: pendiente, priorizada, asignada, calendarizada, en_transito, entregada, cancelada, finalizada, pendiente_aprobacion, aprobada, rechazada, despachada (`pendiente` y `despachada` no se usan en el flujo actual del código)
- `disponibilidad`: reservado, liberado, vendido
- `tipo_solicitud`: evento, venta · `estado_traslado`: pendiente, en_transito, recepcionado · `tipo_notificacion` (11 valores)

### Triggers activos

| Tabla | Trigger | Función | Efecto |
|---|---|---|---|
| auth.users | on_auth_user_created | handle_new_auth_user | Crea `public.usuario`; **toma `rol` de los metadatos del registro** (brecha 002) |
| solicitud | tr_registrar_fechas_flujo (BEFORE UPDATE) | fn_registrar_fechas_flujo | Sella fechas de flujo |
| solicitud | tr_validate_solicitud_tipo | validate_solicitud_tipo | venta exige destino; evento exige dirección y título |
| solicitud | tr_solicitud_destino_invariante | fn_validar_destino_invariante | Destino inmutable una vez definido |
| solicitud | tr_liberar_slots_rechazo_cancelacion | fn_liberar_slots_rechazo_cancelacion | Libera vehículos y descuenta slots al rechazar/cancelar |
| solicitud | trigger_disponibilidad | disponibilidad | Libera vehículos al cancelar (se solapa con el anterior) |
| solicitud | tr_entregar_solicitud_vehiculos | fn_entregar_solicitud_vehiculos | Mueve vehículos al recibir |
| solicitud | tr_finalizar_solicitud_vehiculos | fn_finalizar_solicitud_vehiculos | Marca vendidos, saca del inventario y recalcula slots |
| solicitud_vehiculo | tr_reservar_slots_… / tr_liberar_slots_… | — | +1/−1 en slots del destino |
| vehiculo | tr_recalcular_slots_vehiculo | fn_recalcular_slots_por_vehiculo | Recalcula ocupación al mover vehículo |
| traslado_interno(_vehiculo) | tr_reservar_slots_traslado_vehiculo, tr_recibir_traslado_vehiculos, tr_registrar_fechas_traslado, touch | — | Slots y fechas de traslados |
| sucursal | trg_validar_encargado_sucursal | validar_encargado_sucursal | Valida el encargado |
| insistencia | tr_insistencia_cooldown | fn_insistencia_cooldown | Cooldown 24 h con advisory lock |
| usuario | tr_usuario_updated_at | handle_updated_at | updated_at |

Funciones sin trigger asociado: `cambio_estado_auditoria`, `auditoria_disponibilidad`, `notificar_solicitud`, `notificar_solicitud_vehiculo`, `notificar_observacion`.

### Integridad

- FK `solicitud.sucursal → sucursal` con **ON DELETE CASCADE**: borrar una sucursal borra sus solicitudes, observaciones, insistencias, vínculos de vehículos y metadatos de documentos (brecha 016). `solicitud.sucursal_destino` no tiene cascade.
- No existe una restricción en BD que impida reservar el mismo vehículo en dos solicitudes activas. Solo lo valida el service, con una carrera posible (brecha 010). Hoy no hay duplicados en los datos.
- Contadores `slots_ocupados` y `slots_reservados` desincronizados en 4 de 6 sucursales (brecha 011).
- Sin soft delete: las eliminaciones son físicas.
- 12 FKs sin índice (advisor de rendimiento).

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
| solicitud | admin / participante / JL de su sucursal en estados pendiente o priorizada | admin / ejecutivo propio / JL con sucursal | admin / participante / JL sucursal principal; **WITH CHECK solo `usuario_activo()`** | admin | Participantes pueden cambiar estado, fechas o asignados saltando el flujo (brecha 005) |
| solicitud_vehiculo | admin / participante | admin, logistica (sin alcance) | admin, logistica (sin alcance) | admin | Logística modifica cualquier reserva (brecha 005) |
| vehiculo | activos | admin, JL, logistica | admin, JL, logistica (sin alcance) | admin | Cualquier JL modifica cualquier vehículo (brecha 005) |
| observacion | admin / participante | participante | autor o admin | autor o admin | Correcta |
| auditoria | admin | — | — | — | Correcta (escritura solo service_role) |
| insistencia | **cualquier activo** | ejecutivo propio | — | — | Lectura amplia (bajo impacto) |
| notificacion | destinatario | — | destinatario | destinatario | Correcta (sin uso) |
| sucursal, zona, marca | activos | admin | admin | admin | Correctas |
| usuario_zona | propio o admin | admin | admin | admin | Correcta |
| traslado_interno(_vehiculo) | admin / logística propia / JL origen o destino | admin, logística | admin, logística; JL solo pasar a recepcionado | admin, logística | Aceptables |

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

| Capacidad | administrador | jefe_local | ejecutivo | logistica | operaciones |
|---|---|---|---|---|---|
| Usuarios, sucursales, zonas, marcas, historial | ✔ | — | — | — | — |
| Crear solicitud | ✔ | ✔ (sus sucursales; queda aprobada) | ✔ (su sucursal; pendiente_aprobacion) | — | — |
| Aprobar / rechazar / priorizar / reordenar cola | ✔ | ✔ (sus sucursales) | — | — | — |
| Asignar encargado / despachar / cancelar despacho | ✔ | — | — | ✔ | — |
| Calendarizar / descalendarizar | ✔ | ✔ (sin verificación de alcance) | — | ✔ | — |
| Recibir en destino | ✔ | ✔ (destino) | — | — | — |
| Finalizar (entregar al cliente) | ✔ | ✔ (destino) | ✔ (propia) | — | — |
| Cancelar | ✔ | ✔ (sucursal) | ✔ (propia) | ✔ (cualquiera) | — |
| Eliminar solicitud (pre-despacho) | ✔ | ✔ (sucursal) | ✔ (propia) | — | — |
| Agregar/quitar vehículos de solicitud | ✔ | ✔ (sin alcance) | — | ✔ (sin alcance) | — |
| Insistir | — | — | ✔ (propia, cada 24 h) | — | — |
| Vehículos (crear/editar/importar) | ✔ | ✔ | — | ✔ | ✔ |
| Eliminar vehículo | ✔ | — | — | — | — |
| Traslados internos | ✔ | recibir (destino) | — | ✔ | — |
| Ver solicitudes | todas | origen o destino en sus sucursales | propias | sucursal origen en sus zonas | ninguna |

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
Logística elige vehículos vendidos → `crearTraslado` (insert traslado + insert vehículos; si falla, borra el traslado) → `despachar` → `en_transito` → JL destino `recibir` → `recepcionado` (trigger mueve los vehículos).

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

## 16. Tests

- 20 archivos unitarios, aprox. 512 casos (`it`/`test`), con mocks de `@/lib/supabase/admin` y `server`.
- Cubren: services (auth, users, solicitudes, vehiculo, traslado, organizacion), helpers puros (fechas, filtros, slots, validaciones, CSV, rutas, dashboard).
- **No cubren**: Server Actions (guards de rol y alcance), middleware, `/auth/callback`, policies RLS, funciones y triggers SQL, EmailService, AuditoriaService, SucursalesService.
- `npm run test:integration` apunta a `tests/integracion/`, que **no existe**. `tests/documentacion_testing.md` describe una suite de integración que ya no está en el repo y reporta fallos (SLOT-08, E2E-03) que el código y los triggers actuales parecen haber corregido (no verificado ejecutando).
- Los mocks ocultaron la ausencia de la columna `aprobado`: los tests de `auth.service` y `users.service` la usan y pasan.
- Resultado de ejecución: **No determinado** (no se ejecutaron por instrucción).

Detalle: brecha 017.

## 17. Integraciones externas

| Servicio | Uso | Configuración |
|---|---|---|
| Supabase | Auth, BD, Storage | `NEXT_PUBLIC_SUPABASE_URL`, claves anon/publishable y service_role/secret |
| Brevo | Correo de credenciales de usuario | `BREVO_API_KEY`, `BREVO_SENDER_EMAIL`, `BREVO_SENDER_NAME` |
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
| NEXT_PUBLIC_APP_URL | Sí | Enlaces de correo y reset | **No** |

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
| 011 | Contadores de slots desincronizados (4/6 sucursales) | Medium |
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
- Funciones SQL muertas (auditoría y notificaciones) y tabla `notificacion` sin uso.
- Valores de enum sin uso (`pendiente`, `despachada`).
- Variables `BREVO_SMTP_*` sin uso; claves legacy y nuevas de Supabase coexistiendo.
- Dependencia `claude` sin uso.
- Documentación de testing desactualizada; script `test:integration` roto.
- Componentes y services muy grandes.

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
| 3 | Por ahora **solo se documenta** lo que hay que hacer | Ninguna brecha se corrige en esta etapa; el detalle de cada corrección está en `docs/brecha-NNN-*.md` |
| 4 | La documentación se versiona en una **rama separada** (`auditoria/2026-10-07`) | No se mezcla con `main` hasta revisión |

## 27. Estado actual del sistema

- Funcional para los flujos operativos principales de solicitudes y traslados (según el código; no se ejecutó).
- **No apto para exposición pública** mientras existan las brechas 001 y 002: cualquier persona puede registrarse y obtener el rol administrador.
- Aprobación de cuentas no operativa.
- Ninguna brecha se ha solucionado aún. Todas están en estado **Pendiente**.

## 28. Historial de cambios

| Fecha | Cambio | Autor |
|---|---|---|
| 2026-10-07 | Creación del documento: auditoría inicial de solo lectura, 26 brechas documentadas | Claude (auditoría asistida) |
| 2026-10-07 | Registro de decisiones del responsable (sección 26) | Claude (auditoría asistida) |
