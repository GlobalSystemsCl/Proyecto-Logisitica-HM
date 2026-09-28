# Plan Maestro de Testing — Sistema Logística H.Motores
> Generado: 2026-09-28 | Basado en análisis real del código fuente del proyecto  
> Stack: Next.js 16 + React 19 | TypeScript | Supabase + PostgreSQL | Vitest (ya configurado)

---

## Estado actual del testing (baseline real)

> La suite de tests **ya existe y está operativa**. Este plan extiende y profundiza lo construido.

| Métrica actual | Valor |
|---|---|
| Framework configurado | **Vitest** (vitest.config.mts ya existe) |
| Setup | `tests/setup-env.ts` + `tests/helpers.ts` |
| Archivos de test existentes | 7 |
| Tests totales | 42 (38 pasan / 4 fallan) |
| Coverage actual | No configurado |
| Scripts npm | `npm run test`, `npm run test:watch` |

### Tests existentes confirmados
- `tests/integracion/slots.test.ts` (8 tests)
- `tests/integracion/flujo-estados.test.ts` (8 tests)
- `tests/integracion/sucursales.test.ts` (4 tests)
- `tests/integracion/seguridad-rls.test.ts` (8 tests)
- `tests/integracion/auditoria-triggers.test.ts` (4 tests)
- `tests/unitarios/vehiculo.service.test.ts` (5 tests)
- `tests/unitarios/auth.service.test.ts` (5 tests)

### Brechas confirmadas en producción (NO corregidas aún)
1. **SLOT-08**: Finalizar solicitud no libera `slots_ocupados` ni `disponibilidad` → trigger faltante
2. **E2E-03**: Cola de prioridad deja huecos al cancelar solicitud priorizada
3. **INT-TRIG-03**: No hay auditoría automática por trigger (deshabilitado por decisión de diseño)
4. **INT-TRIG-04**: La BD permite doble reserva del mismo vehículo (solo lo previene el service layer)

---

## 1. Resumen de la arquitectura actual

```
src/
├── app/                            ← Next.js App Router (Server Components + Server Actions)
│   ├── actions/                    ← Server Actions (orquestación + autorización por rol)
│   │   ├── auditoria.actions.ts    (877 B)
│   │   ├── auth.actions.ts         (4.9 KB)
│   │   ├── organizacion.actions.ts (4.4 KB)
│   │   ├── solicitudes.actions.ts  (26.7 KB) ← CRÍTICO: toda la lógica de flujo de estados
│   │   ├── sucursales.actions.ts   (3.8 KB)
│   │   ├── users.actions.ts        (4.9 KB)
│   │   └── vehiculo.actions.ts     (4.1 KB)
│   ├── admin/                      ← Páginas de administración
│   ├── dashboard/                  ← Dashboard principal
│   ├── logistica/                  ← Módulo de logística
│   ├── solicitudes/                ← Módulo de solicitudes
│   └── auth/ login/ registro/ ... ← Flujos de autenticación
│
├── services/                       ← Capa de negocio (toda la lógica real)
│   ├── solicitudes.service.ts      (57.6 KB) ← EL MÁS GRANDE Y CRÍTICO
│   ├── vehiculo.service.ts         (23.9 KB) ← Segundo más crítico
│   ├── organizacion.service.ts     (18.5 KB)
│   ├── auth.service.ts             (15.5 KB)
│   ├── users.service.ts            (15.5 KB)
│   ├── sucursales.service.ts       (8.4 KB)
│   ├── auditoria.service.ts        (6.9 KB)
│   └── email.service.ts            (8.8 KB)
│
├── lib/
│   ├── fechas.ts                   ← Utilidades de fecha (PURO: ideal para unit tests)
│   └── supabase/                   ← Clientes Supabase (admin, server, middleware)
│
├── types/                          ← Tipos TypeScript (sin lógica)
│   ├── auth.types.ts               ← UserRole, UserProfile, funciones helper
│   ├── solicitud.types.ts          ← EstadoSolicitud, CreateSolicitudInput...
│   ├── sucursal.types.ts           ← EstadoSolicitud enum, DisponibilidadVehiculo...
│   └── vehiculo.types.ts           ← Vehiculo, VehiculoConDisponibilidad...
│
├── components/                     ← Solo 4 componentes React (relativamente pequeño)
│   ├── SolicitudDetalleModal.tsx   (45.9 KB) ← COMPONENTE MONSTRUO: mezcla lógica + UI
│   ├── TopNavbar.tsx
│   ├── SolicitudesHeader.tsx
│   └── usuario-info-modal.tsx
│
└── middleware.ts                   ← Redirección por sesión (delega a supabase/middleware.ts)
```

### Observación arquitectónica crítica
La capa de negocio está correctamente separada en **Services** y **Server Actions**. Sin embargo:
- `SolicitudDetalleModal.tsx` (45.9 KB) mezcla lógica de negocio con UI ← **problema de testing**
- Los Services hacen `createAdminClient()` internamente → acoplamiento fuerte con Supabase
- No existe capa de repositorio separada: los services acceden directamente a la BD

---

## 2. Inventario completo de funcionalidades por módulo

### Módulo: Utilidades (`lib/fechas.ts`)
| Función | Tipo recomendado |
|---|---|
| `hoyISO()` | Unit |
| `esFechaAnteriorAHoy(fecha)` | Unit |
| `formatFecha(iso)` | Unit |
| `formatFechaLarga(iso)` | Unit |

### Módulo: Autenticación (`auth.service.ts` + `auth.actions.ts`)
| Función | Tipo recomendado |
|---|---|
| `AuthService.signIn(email, password)` | Unit (mock Supabase) |
| `AuthService.register(data)` | Unit (mock Supabase) |
| `AuthService.signOut()` | Unit |
| `AuthService.updateProfile(data)` | Unit |
| `AuthService.getCurrentUserProfile()` | Unit |
| `AuthService.sendPasswordResetEmail(email)` | Unit |
| `AuthService.updatePassword(password)` | Unit |
| Bloqueo por intentos fallidos (5 → 15 min) | Unit |
| Verificación cuenta activa antes de login | Unit |
| Validaciones nombre/apellido obligatorios | Unit |
| `nombreCompletoUsuario(u)` | Unit |

### Módulo: Usuarios (`users.service.ts`)
| Función | Tipo recomendado |
|---|---|
| `UsersService.generateTempPassword()` | Unit |
| `UsersService.createUser(input)` | Unit (mock Supabase + EmailService) |
| `UsersService.updateUser(userId, input)` | Unit |
| `UsersService.toggleUserStatus(userId, activo)` | Unit |
| `UsersService.resetUserPassword(userId)` | Unit |
| `UsersService.getUsuarioDetalleById(userId)` | Unit |
| `UsersService.getUsers()` | Unit |
| Bloqueo de auto-desactivación del admin | Unit |
| Bloqueo de desactivación del admin principal (hardcoded email) | Unit |
| Asignación múltiple de sucursales (N:M `usuario_sucursal`) | Integration |
| Asignación de zonas (`usuario_zona`) | Integration |
| jefe_local → vinculación como encargado de sucursal | Integration |

### Módulo: Vehículos (`vehiculo.service.ts`)
| Función | Tipo recomendado |
|---|---|
| `VehiculoService.createVehiculo(input)` | Unit |
| Validación chasis 17 alfanuméricos | Unit |
| Validación patente formato XXXX-XX / XXXX-XXXX | Unit |
| Validación año entre 1900 y currentYear+1 | Unit |
| Validación precio no negativo | Unit |
| `VehiculoService.updateVehiculo(id, input)` | Unit |
| Bloqueo modificación vehículo reservado | Unit |
| Bloqueo modificación vehículo vendido | Unit |
| `VehiculoService.deleteVehiculo(id)` | Unit |
| Bloqueo eliminación vehículo reservado | Unit |
| `VehiculoService.verificarDisponibilidad(id)` | Unit |
| `VehiculoService.getVehiculos()` | Unit |
| `VehiculoService.getMarcas()` | Unit |
| **CSV Parser**: `VehiculoService.parseCSV(texto)` | Unit PURO |
| **CSV Parser**: `VehiculoService.detectarDelimitador(texto)` | Unit PURO |
| **CSV Parser**: `VehiculoService.extraerAnio(valor, default)` | Unit PURO |
| **CSV Parser**: `VehiculoService.parsePrecio(valor)` | Unit PURO |
| `VehiculoService.importVehiculosCSV(texto)` | Integration |
| Normalización de sucursal en CSV (por código y por nombre) | Unit |

### Módulo: Solicitudes (`solicitudes.service.ts`) — CRÍTICO
| Función | Tipo recomendado |
|---|---|
| `SolicitudesService.createSolicitud(input, vehiculoIds, userId)` | Unit |
| Validación: mínimo 1 vehículo por solicitud | Unit |
| Validación: vehículo no puede estar doblemente reservado | Unit |
| Validación: slots disponibles en sucursal destino (tipo venta) | Unit |
| Estado inicial por rol (jefe_local → `aprobada`, ejecutivo → `pendiente_aprobacion`) | Unit |
| `SolicitudesService.aprobarSolicitud(id, userId, fecha)` | Unit |
| Validación estado previo `pendiente_aprobacion` | Unit |
| Validación fecha no anterior a hoy | Unit |
| `SolicitudesService.rechazarSolicitud(id, motivo, userId)` | Unit |
| Validación motivo mínimo 5 caracteres | Unit |
| `SolicitudesService.priorizarSolicitud(id, userId)` | Unit |
| Solo estados `pendiente` o `aprobada` pueden priorizarse | Unit |
| `SolicitudesService.priorizarEnPosicion(id, posicion, userId)` | Unit |
| Posición debe ser entero ≥ 1 | Unit |
| Posición no puede superar `cola.length + 1` | Unit |
| `SolicitudesService.reordenarCola(sucursalId, orden, userId)` | Unit |
| Validación IDs únicos en la cola | Unit |
| `SolicitudesService.sacarDeCola(id, userId)` | Unit |
| Solo `priorizada` puede salir de la cola | Unit |
| `SolicitudesService.cancelarSolicitud(id, motivo, userId)` | Unit |
| Solo estados pre-despacho pueden cancelarse | Unit |
| `SolicitudesService.eliminarSolicitud(id)` | Unit |
| Solo pre-despacho puede eliminarse | Unit |
| `SolicitudesService.calendarizarSolicitud(id, fecha, userId)` | Unit |
| Solo `priorizada` o `asignada` pueden calendarizarse | Unit |
| Fecha despacho no puede ser anterior a hoy | Unit |
| `SolicitudesService.descalendarizarSolicitud(id, userId)` | Unit |
| Solo `calendarizada` puede descalendarizarse | Unit |
| `SolicitudesService.despacharSolicitud(id, userId)` | Unit |
| Solo `calendarizada` puede despacharse | Unit |
| `SolicitudesService.cancelarDespacharSolicitud(id, userId)` | Unit |
| Solo `en_transito` puede volver a `calendarizada` | Unit |
| `SolicitudesService.recibirSolicitud(id, userId)` | Unit |
| Solo el jefe_local de la sucursal destino puede recibir | Unit |
| Admin puede recibir cualquier solicitud | Unit |
| `SolicitudesService.finalizarSolicitud(id, userId)` | Unit |
| Solo jefe_local destino o ejecutivo creador o admin puede finalizar | Unit |
| `SolicitudesService.usuarioEnSucursalRecepcion(sucursal, sol)` | Unit PURO |
| `SolicitudesService.agregarVehiculo(solicitudId, vehiculoId, userId)` | Unit |
| `SolicitudesService.quitarVehiculo(solicitudVehiculoId, userId)` | Unit |
| No puede quedar 0 vehículos en una solicitud | Unit |
| `SolicitudesService.agregarObservacion(solicitudId, userId, texto)` | Unit |
| `SolicitudesService.subirDocumentos(solicitudId, userId, archivos)` | Unit |
| Validación tamaño máximo 10MB | Unit |
| Validación tipos MIME permitidos | Unit |
| `SolicitudesService.eliminarDocumento(documentoId, userId, rol)` | Unit |
| Solo admin/logistica o el propio autor puede eliminar documento | Unit |
| `SolicitudesService.registrarAuditoria(...)` | Unit |
| `getEncargadoNombre(sol)` / `getEncargadoId(sol)` | Unit PURO |
| `mapRow(row)` (función interna de mapeo) | Unit PURO |
| `persona(p)` (helper de nombre completo) | Unit PURO |

### Módulo: Server Actions — Capa de autorización (`solicitudes.actions.ts`)
| Función | Tipo recomendado |
|---|---|
| `createSolicitudAction` — rol ejecutivo solo crea en su sucursal | Unit |
| `createSolicitudAction` — jefe_local requiere sucursal asignada | Unit |
| `createSolicitudAction` — rol operaciones/logistica no puede crear | Unit |
| `aprobarSolicitudAction` — solo jefe_local o admin puede aprobar | Unit |
| `rechazarSolicitudAction` — solo jefe_local o admin puede rechazar | Unit |
| `priorizarSolicitudAction` — solo jefe_local o admin puede priorizar | Unit |
| `cancelarSolicitudAction` — validación de encargado (admin/jefe/ejecutivo/logistica) | Unit |
| `calendarizarSolicitudAction` — solo logística o admin | Unit |
| `despacharSolicitudAction` — solo logística o admin | Unit |
| `recibirSolicitudAction` — solo jefe_local destino o admin | Unit |
| `finalizarSolicitudAction` — jefe_local destino, ejecutivo creador, o admin | Unit |

### Módulo: Sucursales (`sucursales.service.ts`)
| Función | Tipo recomendado |
|---|---|
| `SucursalesService.getSucursales()` | Unit |
| `SucursalesService.createSucursal(input)` | Unit |
| Nombre único (case-insensitive) | Unit |
| `SucursalesService.updateSucursal(id, input)` | Unit |
| `SucursalesService.deleteSucursal(id)` | Unit |
| Bloqueo eliminación con usuarios asignados | Unit |
| Cálculo de slots disponibles | Integration |

### Módulo: Organización (`organizacion.service.ts`)
| Función | Tipo recomendado |
|---|---|
| `OrganizacionService.getZonas()` | Unit |
| `OrganizacionService.createZona(nombre)` | Unit |
| `OrganizacionService.updateZona(id, nombre)` | Unit |
| `OrganizacionService.deleteZona(id)` | Unit |
| CRUD de marcas | Unit |
| `OrganizacionService.asegurarMarcaCodigo(codigo)` | Integration |
| `OrganizacionService.usuarioTieneSucursal(userId, sucursalId)` | Unit |
| `OrganizacionService.getUserAssignedBranches(userId)` | Unit |

### Módulo: Auditoría (`auditoria.service.ts`)
| Función | Tipo recomendado |
|---|---|
| `AuditoriaService.getAuditoria(filtros?)` | Unit |
| Filtros: entidad, accion, fecha_desde, fecha_hasta | Unit |
| Enriquecimiento de registros (solicitud_id, chasis, patente) | Unit |
| `AuditoriaService.getMetricas()` | Unit |

---

## 3. Mapa de reglas de negocio

### Reglas de estado de solicitud

| Regla | Archivo/Función | Test recomendado | Positivo | Negativo | Edge case |
|---|---|---|---|---|---|
| Solo estados pre-despacho pueden cancelarse | `solicitudes.service.ts:cancelarSolicitud` | Unit | Cancelar `pendiente` | Cancelar `en_transito` | Cancelar `priorizada` (renumera cola) |
| Solo `pendiente_aprobacion` puede ser aprobada | `solicitudes.service.ts:aprobarSolicitud` | Unit | Aprobar `pendiente_aprobacion` | Aprobar `priorizada` | Aprobar solicitud inexistente |
| Solo `pendiente` o `aprobada` puede priorizarse | `solicitudes.service.ts:priorizarSolicitud` | Unit | Priorizar `aprobada` | Priorizar `en_transito` | Priorizar con cola vacía |
| Una solicitud en `en_transito` no puede cancelarse | `solicitudes.service.ts:cancelarSolicitud` | Unit | — | Cancelar `en_transito` | — |
| Solo `calendarizada` puede despacharse | `solicitudes.service.ts:despacharSolicitud` | Unit | Despachar `calendarizada` | Despachar `priorizada` | — |
| Solo `en_transito` puede recibirse | `solicitudes.service.ts:recibirSolicitud` | Unit | Recibir `en_transito` | Recibir `calendarizada` | — |
| Solo `entregada` puede finalizarse | `solicitudes.service.ts:finalizarSolicitud` | Unit | Finalizar `entregada` | Finalizar `en_transito` | — |

### Reglas de permisos por rol

| Regla | Archivo | Test |
|---|---|---|
| Ejecutivo solo crea solicitudes en su sucursal | `solicitudes.actions.ts:createSolicitudAction` | Unit |
| Solo jefe_local o admin pueden aprobar/rechazar/priorizar | `solicitudes.actions.ts` | Unit |
| Solo logística o admin pueden calendarizar/despachar | `solicitudes.actions.ts` | Unit |
| Solo jefe_local de sucursal DESTINO (o admin) puede recibir | `solicitudes.service.ts:recibirSolicitud` | Unit |
| Admin no puede desactivar su propia cuenta | `users.service.ts:toggleUserStatus` | Unit |
| Registro público siempre asigna rol `ejecutivo` | `auth.service.ts:register` | Unit |
| jefe_local creando solicitud → estado inicial `aprobada` | `solicitudes.actions.ts:createSolicitudAction` | Unit |

### Reglas de vehículos

| Regla | Archivo | Test |
|---|---|---|
| Chasis debe tener exactamente 17 caracteres alfanuméricos | `vehiculo.service.ts:createVehiculo` | Unit |
| Patente formato XXXX-XX o XXXX-XXXX | `vehiculo.service.ts:createVehiculo` | Unit |
| Año entre 1900 y currentYear+1 | `vehiculo.service.ts:createVehiculo` | Unit |
| Precio no negativo | `vehiculo.service.ts:createVehiculo` | Unit |
| Vehículo reservado no puede modificarse ni eliminarse | `vehiculo.service.ts:updateVehiculo/deleteVehiculo` | Unit |
| Una solicitud debe tener al menos 1 vehículo | `solicitudes.service.ts:quitarVehiculo` | Unit |
| Un vehículo no puede estar en dos solicitudes activas | `solicitudes.service.ts:agregarVehiculo` | Unit |

---

## 4. Estrategia de testing

### Taxonomía de tests en este proyecto

```
UNIT TESTS (sin IO real)
  └── Mockean: createAdminClient, createClient, esFechaAnteriorAHoy (cuando necesario)
  └── Cubren: lógica de negocio pura, validaciones, transformaciones, permisos
  └── Archivos: services/*.ts, lib/fechas.ts, types/*.ts helpers, actions/* (parcialmente)

INTEGRATION TESTS (con BD real de test)
  └── Usan: createAdminClient con service role (bypassan RLS)
  └── Cubren: flujos completos, integridad referencial, triggers de BD, slots
  └── Archivos: tests/integracion/*.ts (ya existen varios)

E2E TESTS (navegador real)
  └── Herramienta sugerida: Playwright (NO instalado aún)
  └── Cubren: flujos UI completos, autenticación real, navegación
  └── FUERA del alcance de este plan — fase futura
```

### Qué NO convertir en unit tests
- `SolicitudesService.getColaPriorizada()` → solo query a BD, test de integración
- `AuditoriaService.getAuditoria()` → query compleja, test de integración
- `VehiculoService.importVehiculosCSV()` completo → test de integración (el CSV parser SÍ es unit)
- `SolicitudesService.getSolicitudes()` → query a BD, test de integración

---

## 5. Estrategia de mocks

### Qué mockear en unit tests

#### Supabase Admin Client (`@/lib/supabase/admin`)
```typescript
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      upsert: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      neq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      not: vi.fn().mockReturnThis(),
      ilike: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn(),
      single: vi.fn(),
    })),
    auth: { admin: { createUser: vi.fn(), updateUserById: vi.fn() } },
    storage: { from: vi.fn() },
  })),
}));
```

#### Email Service
```typescript
vi.mock('@/services/email.service', () => ({
  EmailService: {
    sendUserCredentialsEmail: vi.fn().mockResolvedValue({ success: true }),
  },
}));
```

#### Fechas (cuando se necesita fecha fija)
```typescript
vi.setSystemTime(new Date('2026-01-15T12:00:00Z'));
// Restaurar: vi.useRealTimers()
```

### Qué NO mockear (funciones puras)
- `VehiculoService.parseCSV()`, `VehiculoService.extraerAnio()`, `VehiculoService.parsePrecio()`
- `esFechaAnteriorAHoy()`, `hoyISO()`, `formatFecha()`, `formatFechaLarga()`
- `getEncargadoNombre()`, `getEncargadoId()`, `persona()`, `mapRow()`, `nombreCompletoUsuario()`

### Qué probar en integration tests (BD real)
- Flujos completos de estado de solicitud
- Triggers de BD (liberación de slots al cancelar/rechazar)
- Restricciones de unicidad (chasis, patente, email)
- Slots disponibles en tiempo real
- RLS (Row Level Security) de Supabase

---

## 6. Estructura propuesta de tests

```
tests/
├── setup-env.ts                   ← YA EXISTE: carga .env.local
├── helpers.ts                     ← YA EXISTE: helpers de integración
├── documentacion_testing.md       ← YA EXISTE: resultados de la suite actual
│
├── unitarios/                     ← Tests sin IO (mocks)
│   ├── auth.service.test.ts       ← YA EXISTE: 5 tests (ampliar)
│   ├── vehiculo.service.test.ts   ← YA EXISTE: 5 tests (ampliar)
│   ├── solicitudes.service.test.ts  ← NUEVO: 35+ tests de estados y validaciones
│   ├── solicitudes.actions.test.ts  ← NUEVO: 15+ tests de autorización por rol
│   ├── users.service.test.ts        ← NUEVO: 10+ tests
│   ├── sucursales.service.test.ts   ← NUEVO: 8+ tests
│   ├── organizacion.service.test.ts ← NUEVO: 8+ tests
│   ├── auditoria.service.test.ts    ← NUEVO: 5+ tests
│   ├── fechas.test.ts              ← NUEVO: 12 tests (funciones puras)
│   ├── csv/
│   │   ├── parseCSV.test.ts        ← NUEVO: parser CSV puro
│   │   ├── extraerAnio.test.ts     ← NUEVO: extractor de año
│   │   └── parsePrecio.test.ts     ← NUEVO: parser de precio
│   └── helpers/
│       └── tipos.test.ts           ← NUEVO: helpers de tipos
│
└── integracion/                   ← Tests con BD real
    ├── slots.test.ts              ← YA EXISTE: 8 tests (7 pasan)
    ├── flujo-estados.test.ts      ← YA EXISTE: 8 tests (7 pasan)
    ├── sucursales.test.ts         ← YA EXISTE: 4 tests
    ├── seguridad-rls.test.ts      ← YA EXISTE: 8 tests
    ├── auditoria-triggers.test.ts ← YA EXISTE: 4 tests (2 pasan)
    ├── vehiculos-csv.test.ts      ← NUEVO: importación masiva
    ├── usuarios.test.ts           ← NUEVO: CRUD usuarios + asignaciones
    └── documentos.test.ts         ← NUEVO: subida y descarga de documentos
```

---

## 7. Framework y configuración

### Framework actual: **Vitest** (ya instalado y configurado)

```bash
# Agregar coverage
npm install -D @vitest/coverage-v8

# Opcional: UI visual
npm install -D @vitest/ui
```

```json
// Nuevos scripts en package.json:
{
  "test": "vitest run",
  "test:watch": "vitest",
  "test:coverage": "vitest run --coverage",
  "test:unit": "vitest run tests/unitarios",
  "test:integration": "vitest run tests/integracion"
}
```

```typescript
// Agregar al vitest.config.mts existente:
coverage: {
  provider: 'v8',
  reporter: ['text', 'html', 'lcov'],
  include: ['src/services/**', 'src/lib/**', 'src/app/actions/**'],
  exclude: [
    'src/app/**/page.tsx',
    'src/app/**/layout.tsx',
    'src/components/**',
    'src/lib/supabase/**',
    'src/types/**',
    '**/*.d.ts',
  ],
  thresholds: { statements: 70, branches: 65, functions: 70, lines: 70 }
}
```

---

## 8. Division de trabajo Developer 1 / Developer 2

### Developer 1 — Módulos de Negocio Central

| Módulo | Archivos de test | Tests nuevos | Prioridad |
|---|---|---|---|
| `lib/fechas.ts` | `tests/unitarios/fechas.test.ts` | 12 | P0 |
| CSV Parser puro | `tests/unitarios/csv/*.test.ts` | 15 | P0 |
| `solicitudes.service.ts` (estados + permisos) | `tests/unitarios/solicitudes.service.test.ts` | 35 | P0 |
| `solicitudes.actions.ts` (autorización) | `tests/unitarios/solicitudes.actions.test.ts` | 15 | P1 |
| `auditoria.service.ts` | `tests/unitarios/auditoria.service.test.ts` | 8 | P1 |
| Integración: flujo-estados (ampliar) | `tests/integracion/flujo-estados.test.ts` | 5 | P1 |
| Integración: documentos | `tests/integracion/documentos.test.ts` | 6 | P2 |

**Total Dev 1: ~96 tests nuevos**

**Orden Dev 1:**
1. `fechas.test.ts` → 2. `csv/parseCSV.test.ts` → 3. `csv/extraerAnio.test.ts` → 4. `csv/parsePrecio.test.ts` → 5. `solicitudes.service.test.ts` → 6. `solicitudes.actions.test.ts` → 7. `auditoria.service.test.ts` → 8. Integración

### Developer 2 — Módulos de Entidades y Usuarios

| Módulo | Archivos de test | Tests nuevos | Prioridad |
|---|---|---|---|
| `vehiculo.service.ts` (ampliar) | `tests/unitarios/vehiculo.service.test.ts` | 15 | P0 |
| `auth.service.ts` (ampliar) | `tests/unitarios/auth.service.test.ts` | 8 | P0 |
| `users.service.ts` | `tests/unitarios/users.service.test.ts` | 12 | P1 |
| `sucursales.service.ts` | `tests/unitarios/sucursales.service.test.ts` | 8 | P1 |
| `organizacion.service.ts` | `tests/unitarios/organizacion.service.test.ts` | 8 | P1 |
| Helpers de tipos | `tests/unitarios/helpers/tipos.test.ts` | 6 | P2 |
| Integración: usuarios | `tests/integracion/usuarios.test.ts` | 8 | P2 |
| Integración: vehiculos-csv | `tests/integracion/vehiculos-csv.test.ts` | 6 | P2 |

**Total Dev 2: ~71 tests nuevos**

**Orden Dev 2:**
1. Ampliar `vehiculo.service.test.ts` → 2. Ampliar `auth.service.test.ts` → 3. `users.service.test.ts` → 4. `sucursales.service.test.ts` → 5. `organizacion.service.test.ts` → 6. `helpers/tipos.test.ts` → 7. Integración

> **Punto de conflicto potencial**: solo `tests/helpers.ts` puede ser tocado por ambos. Estrategia: cada dev agrega sus helpers en una sección separada y hace PR dedicado antes de empezar los tests de integración nuevos.

---

## 9. Roadmap por fases

| Fase | Objetivo | Responsable | Tests nuevos | Criterio de finalización |
|---|---|---|---|---|
| F0 | Configuración de coverage | Ambos | 0 | `npm run test:coverage` ejecuta correctamente |
| F1 | Funciones puras (sin mocks) | Ambos (paralelo) | 25 | 100% coverage en funciones puras |
| F2 | Vehículos y Auth (unit con mocks) | Dev2 | 23 | coverage vehiculo ~85%, auth ~80% |
| F3 | Solicitudes: validaciones y estados | Dev1 | 35 | coverage solicitudes.service ~70% |
| F4 | Server Actions: autorización | Dev1 | 15 | coverage actions ~65% |
| F5 | Usuarios, Sucursales, Organización | Dev2 | 28 | coverage users ~75%, sucursales ~70% |
| F6 | Auditoría | Dev1 | 8 | coverage auditoria ~65% |
| F7 | Integración: nuevas suites | Ambos | 25 | Nuevas suites de integración pasan |
| F8 | Coverage y estabilización | Ambos | variable | Global ≥ 75%, reportes actualizados |

---

## 10. Backlog detallado de tests

| ID | Módulo | Funcionalidad | Archivo | Función | Tipo | Prioridad | Developer | Estado |
|---|---|---|---|---|---|---|---|---|
| T001 | Setup | Instalar coverage y configurar scripts | `vitest.config.mts` | — | Config | P0 | Ambos | ⬜ |
| T002 | Fechas | `hoyISO` devuelve formato YYYY-MM-DD | `fechas.test.ts` | `hoyISO` | Unit | P0 | Dev1 | ⬜ |
| T003 | Fechas | `hoyISO` con fecha fija (vi.setSystemTime) | `fechas.test.ts` | `hoyISO` | Unit | P0 | Dev1 | ⬜ |
| T004 | Fechas | `esFechaAnteriorAHoy` true para fecha pasada | `fechas.test.ts` | `esFechaAnteriorAHoy` | Unit | P0 | Dev1 | ⬜ |
| T005 | Fechas | `esFechaAnteriorAHoy` false para hoy | `fechas.test.ts` | `esFechaAnteriorAHoy` | Unit | P0 | Dev1 | ⬜ |
| T006 | Fechas | `esFechaAnteriorAHoy` false para fecha futura | `fechas.test.ts` | `esFechaAnteriorAHoy` | Unit | P0 | Dev1 | ⬜ |
| T007 | Fechas | `esFechaAnteriorAHoy` con null → false | `fechas.test.ts` | `esFechaAnteriorAHoy` | Unit | P0 | Dev1 | ⬜ |
| T008 | Fechas | `esFechaAnteriorAHoy` con formato inválido → false | `fechas.test.ts` | `esFechaAnteriorAHoy` | Unit | P0 | Dev1 | ⬜ |
| T009 | Fechas | `formatFecha` formatea correctamente DD/MM/YYYY | `fechas.test.ts` | `formatFecha` | Unit | P1 | Dev1 | ⬜ |
| T010 | Fechas | `formatFecha` con null → '—' | `fechas.test.ts` | `formatFecha` | Unit | P1 | Dev1 | ⬜ |
| T011 | Fechas | `formatFechaLarga` incluye nombre del mes en español | `fechas.test.ts` | `formatFechaLarga` | Unit | P2 | Dev1 | ⬜ |
| T012 | Fechas | `formatFechaLarga` con fecha inválida → '—' | `fechas.test.ts` | `formatFechaLarga` | Unit | P2 | Dev1 | ⬜ |
| T013 | CSV | `parseCSV` con CSV separado por comas | `csv/parseCSV.test.ts` | `parseCSV` | Unit | P0 | Dev1 | ⬜ |
| T014 | CSV | `parseCSV` con TSV (tabs) | `csv/parseCSV.test.ts` | `parseCSV` | Unit | P0 | Dev1 | ⬜ |
| T015 | CSV | `parseCSV` con comillas escapadas `""` | `csv/parseCSV.test.ts` | `parseCSV` | Unit | P1 | Dev1 | ⬜ |
| T016 | CSV | `parseCSV` filtra filas completamente vacías | `csv/parseCSV.test.ts` | `parseCSV` | Unit | P1 | Dev1 | ⬜ |
| T017 | CSV | `extraerAnio` desde serial de Excel (44000+) | `csv/extraerAnio.test.ts` | `extraerAnio` | Unit | P0 | Dev1 | ⬜ |
| T018 | CSV | `extraerAnio` desde DD/MM/YYYY | `csv/extraerAnio.test.ts` | `extraerAnio` | Unit | P0 | Dev1 | ⬜ |
| T019 | CSV | `extraerAnio` desde YYYY-MM-DD | `csv/extraerAnio.test.ts` | `extraerAnio` | Unit | P0 | Dev1 | ⬜ |
| T020 | CSV | `extraerAnio` con valor vacío → porDefecto | `csv/extraerAnio.test.ts` | `extraerAnio` | Unit | P0 | Dev1 | ⬜ |
| T021 | CSV | `parsePrecio` formato chileno "13.859.244,00" | `csv/parsePrecio.test.ts` | `parsePrecio` | Unit | P0 | Dev1 | ⬜ |
| T022 | CSV | `parsePrecio` formato US "13,859,244.00" | `csv/parsePrecio.test.ts` | `parsePrecio` | Unit | P0 | Dev1 | ⬜ |
| T023 | CSV | `parsePrecio` con string vacío → null | `csv/parsePrecio.test.ts` | `parsePrecio` | Unit | P0 | Dev1 | ⬜ |
| T024 | CSV | `parsePrecio` con texto no numérico → null | `csv/parsePrecio.test.ts` | `parsePrecio` | Unit | P1 | Dev1 | ⬜ |
| T025 | Helpers | `nombreCompletoUsuario` combina nombre y apellido | `helpers/tipos.test.ts` | `nombreCompletoUsuario` | Unit | P1 | Dev2 | ⬜ |
| T026 | Helpers | `nombreCompletoUsuario` con null → cadena vacía | `helpers/tipos.test.ts` | `nombreCompletoUsuario` | Unit | P1 | Dev2 | ⬜ |
| T027 | Helpers | `getEncargadoNombre` prioriza ejecutivo | `helpers/tipos.test.ts` | `getEncargadoNombre` | Unit | P1 | Dev2 | ⬜ |
| T028 | Helpers | `getEncargadoNombre` usa jefe_local si no hay ejecutivo | `helpers/tipos.test.ts` | `getEncargadoNombre` | Unit | P1 | Dev2 | ⬜ |
| T029 | Helpers | `usuarioEnSucursalRecepcion` con sucursal_destino | `solicitudes.service.test.ts` | `usuarioEnSucursalRecepcion` | Unit | P1 | Dev1 | ⬜ |
| T030 | Helpers | `usuarioEnSucursalRecepcion` sin sucursal_destino (usa origen) | `solicitudes.service.test.ts` | `usuarioEnSucursalRecepcion` | Unit | P1 | Dev1 | ⬜ |
| T031 | Auth | `signIn` con cuenta desactivada → error | `auth.service.test.ts` | `signIn` | Unit | P0 | Dev2 | ✅ |
| T032 | Auth | `signIn` bloqueo por 5 intentos | `auth.service.test.ts` | `signIn` | Unit | P0 | Dev2 | ✅ |
| T033 | Auth | `signIn` cuenta ya bloqueada → mensaje con tiempo | `auth.service.test.ts` | `signIn` | Unit | P0 | Dev2 | ✅ |
| T034 | Auth | `signIn` exitoso resetea intentos fallidos | `auth.service.test.ts` | `signIn` | Unit | P0 | Dev2 | ✅ |
| T035 | Auth | `register` asigna siempre rol `ejecutivo` | `auth.service.test.ts` | `register` | Unit | P0 | Dev2 | ⬜ |
| T036 | Auth | `register` rechaza email ya existente | `auth.service.test.ts` | `register` | Unit | P0 | Dev2 | ⬜ |
| T037 | Auth | `updateProfile` valida nombre y apellido obligatorios | `auth.service.test.ts` | `updateProfile` | Unit | P1 | Dev2 | ⬜ |
| T038 | Auth | `updatePassword` rechaza menos de 8 caracteres | `auth.service.test.ts` | `updatePassword` | Unit | P0 | Dev2 | ⬜ |
| T039 | Auth | `updatePassword` con sesión inválida → error | `auth.service.test.ts` | `updatePassword` | Unit | P1 | Dev2 | ⬜ |
| T040 | Auth | `sendPasswordResetEmail` cuenta desactivada → error | `auth.service.test.ts` | `sendPasswordResetEmail` | Unit | P1 | Dev2 | ⬜ |
| T041 | Vehículo | `createVehiculo` chasis 17 chars válidos | `vehiculo.service.test.ts` | `createVehiculo` | Unit | P0 | Dev2 | ✅ |
| T042 | Vehículo | `createVehiculo` chasis < 17 chars → error | `vehiculo.service.test.ts` | `createVehiculo` | Unit | P0 | Dev2 | ✅ |
| T043 | Vehículo | `createVehiculo` patente formato inválido → error | `vehiculo.service.test.ts` | `createVehiculo` | Unit | P0 | Dev2 | ✅ |
| T044 | Vehículo | `createVehiculo` año fuera de rango → error | `vehiculo.service.test.ts` | `createVehiculo` | Unit | P0 | Dev2 | ✅ |
| T045 | Vehículo | `updateVehiculo` rechaza vehículo reservado | `vehiculo.service.test.ts` | `updateVehiculo` | Unit | P0 | Dev2 | ✅ |
| T046 | Vehículo | `updateVehiculo` rechaza vehículo vendido | `vehiculo.service.test.ts` | `updateVehiculo` | Unit | P0 | Dev2 | ⬜ |
| T047 | Vehículo | `deleteVehiculo` rechaza vehículo reservado | `vehiculo.service.test.ts` | `deleteVehiculo` | Unit | P0 | Dev2 | ⬜ |
| T048 | Vehículo | `deleteVehiculo` rechaza vehículo vendido | `vehiculo.service.test.ts` | `deleteVehiculo` | Unit | P0 | Dev2 | ⬜ |
| T049 | Vehículo | `createVehiculo` precio negativo → error | `vehiculo.service.test.ts` | `createVehiculo` | Unit | P1 | Dev2 | ⬜ |
| T050 | Vehículo | `createVehiculo` chasis normalizado a mayúsculas | `vehiculo.service.test.ts` | `createVehiculo` | Unit | P1 | Dev2 | ⬜ |
| T051 | Vehículo | `createVehiculo` sin patente (opcional) → success | `vehiculo.service.test.ts` | `createVehiculo` | Unit | P1 | Dev2 | ⬜ |
| T052 | Vehículo | `verificarDisponibilidad` vehículo libre | `vehiculo.service.test.ts` | `verificarDisponibilidad` | Unit | P1 | Dev2 | ⬜ |
| T053 | Vehículo | `verificarDisponibilidad` vehículo reservado | `vehiculo.service.test.ts` | `verificarDisponibilidad` | Unit | P1 | Dev2 | ⬜ |
| T054 | Solicitudes | `createSolicitud` sin vehículos → error | `solicitudes.service.test.ts` | `createSolicitud` | Unit | P0 | Dev1 | ⬜ |
| T055 | Solicitudes | `createSolicitud` vehículo ya reservado → error | `solicitudes.service.test.ts` | `createSolicitud` | Unit | P0 | Dev1 | ⬜ |
| T056 | Solicitudes | `createSolicitud` tipo venta sin slots → error | `solicitudes.service.test.ts` | `createSolicitud` | Unit | P0 | Dev1 | ⬜ |
| T057 | Solicitudes | `aprobarSolicitud` desde `pendiente_aprobacion` → success | `solicitudes.service.test.ts` | `aprobarSolicitud` | Unit | P0 | Dev1 | ⬜ |
| T058 | Solicitudes | `aprobarSolicitud` desde `priorizada` → error | `solicitudes.service.test.ts` | `aprobarSolicitud` | Unit | P0 | Dev1 | ⬜ |
| T059 | Solicitudes | `aprobarSolicitud` con fecha pasada → error | `solicitudes.service.test.ts` | `aprobarSolicitud` | Unit | P0 | Dev1 | ⬜ |
| T060 | Solicitudes | `rechazarSolicitud` motivo < 5 chars → error | `solicitudes.service.test.ts` | `rechazarSolicitud` | Unit | P0 | Dev1 | ⬜ |
| T061 | Solicitudes | `rechazarSolicitud` desde estado no válido → error | `solicitudes.service.test.ts` | `rechazarSolicitud` | Unit | P0 | Dev1 | ⬜ |
| T062 | Solicitudes | `priorizarSolicitud` desde `aprobada` → success | `solicitudes.service.test.ts` | `priorizarSolicitud` | Unit | P0 | Dev1 | ⬜ |
| T063 | Solicitudes | `priorizarSolicitud` desde `en_transito` → error | `solicitudes.service.test.ts` | `priorizarSolicitud` | Unit | P0 | Dev1 | ⬜ |
| T064 | Solicitudes | `priorizarSolicitud` sin sucursal asignada → error | `solicitudes.service.test.ts` | `priorizarSolicitud` | Unit | P0 | Dev1 | ⬜ |
| T065 | Solicitudes | `priorizarEnPosicion` posición < 1 → error | `solicitudes.service.test.ts` | `priorizarEnPosicion` | Unit | P0 | Dev1 | ⬜ |
| T066 | Solicitudes | `priorizarEnPosicion` posición > cola+1 → error | `solicitudes.service.test.ts` | `priorizarEnPosicion` | Unit | P0 | Dev1 | ⬜ |
| T067 | Solicitudes | `reordenarCola` con IDs duplicados → error | `solicitudes.service.test.ts` | `reordenarCola` | Unit | P1 | Dev1 | ⬜ |
| T068 | Solicitudes | `reordenarCola` con orden vacío → error | `solicitudes.service.test.ts` | `reordenarCola` | Unit | P1 | Dev1 | ⬜ |
| T069 | Solicitudes | `sacarDeCola` desde estado no `priorizada` → error | `solicitudes.service.test.ts` | `sacarDeCola` | Unit | P1 | Dev1 | ⬜ |
| T070 | Solicitudes | `cancelarSolicitud` desde `en_transito` → error | `solicitudes.service.test.ts` | `cancelarSolicitud` | Unit | P0 | Dev1 | ⬜ |
| T071 | Solicitudes | `cancelarSolicitud` desde `pendiente` → success | `solicitudes.service.test.ts` | `cancelarSolicitud` | Unit | P0 | Dev1 | ⬜ |
| T072 | Solicitudes | `eliminarSolicitud` desde `en_transito` → error | `solicitudes.service.test.ts` | `eliminarSolicitud` | Unit | P0 | Dev1 | ⬜ |
| T073 | Solicitudes | `calendarizarSolicitud` desde `priorizada` → success | `solicitudes.service.test.ts` | `calendarizarSolicitud` | Unit | P0 | Dev1 | ⬜ |
| T074 | Solicitudes | `calendarizarSolicitud` con fecha pasada → error | `solicitudes.service.test.ts` | `calendarizarSolicitud` | Unit | P0 | Dev1 | ⬜ |
| T075 | Solicitudes | `calendarizarSolicitud` desde `cancelada` → error | `solicitudes.service.test.ts` | `calendarizarSolicitud` | Unit | P0 | Dev1 | ⬜ |
| T076 | Solicitudes | `descalendarizarSolicitud` vuelve a `priorizada` | `solicitudes.service.test.ts` | `descalendarizarSolicitud` | Unit | P1 | Dev1 | ⬜ |
| T077 | Solicitudes | `despacharSolicitud` solo desde `calendarizada` | `solicitudes.service.test.ts` | `despacharSolicitud` | Unit | P0 | Dev1 | ⬜ |
| T078 | Solicitudes | `cancelarDespacharSolicitud` solo desde `en_transito` | `solicitudes.service.test.ts` | `cancelarDespacharSolicitud` | Unit | P1 | Dev1 | ⬜ |
| T079 | Solicitudes | `recibirSolicitud` por jefe_local destino → success | `solicitudes.service.test.ts` | `recibirSolicitud` | Unit | P0 | Dev1 | ⬜ |
| T080 | Solicitudes | `recibirSolicitud` por jefe_local de otra sucursal → error | `solicitudes.service.test.ts` | `recibirSolicitud` | Unit | P0 | Dev1 | ⬜ |
| T081 | Solicitudes | `recibirSolicitud` por admin → success | `solicitudes.service.test.ts` | `recibirSolicitud` | Unit | P0 | Dev1 | ⬜ |
| T082 | Solicitudes | `recibirSolicitud` solo desde `en_transito` | `solicitudes.service.test.ts` | `recibirSolicitud` | Unit | P0 | Dev1 | ⬜ |
| T083 | Solicitudes | `finalizarSolicitud` por ejecutivo creador → success | `solicitudes.service.test.ts` | `finalizarSolicitud` | Unit | P0 | Dev1 | ⬜ |
| T084 | Solicitudes | `finalizarSolicitud` por ejecutivo NO creador → error | `solicitudes.service.test.ts` | `finalizarSolicitud` | Unit | P0 | Dev1 | ⬜ |
| T085 | Solicitudes | `finalizarSolicitud` por jefe_local destino → success | `solicitudes.service.test.ts` | `finalizarSolicitud` | Unit | P0 | Dev1 | ⬜ |
| T086 | Solicitudes | `finalizarSolicitud` por admin → success | `solicitudes.service.test.ts` | `finalizarSolicitud` | Unit | P0 | Dev1 | ⬜ |
| T087 | Solicitudes | `finalizarSolicitud` solo desde `entregada` | `solicitudes.service.test.ts` | `finalizarSolicitud` | Unit | P0 | Dev1 | ⬜ |
| T088 | Solicitudes | `agregarVehiculo` pre-despacho → success | `solicitudes.service.test.ts` | `agregarVehiculo` | Unit | P1 | Dev1 | ⬜ |
| T089 | Solicitudes | `agregarVehiculo` vehículo ya reservado → error | `solicitudes.service.test.ts` | `agregarVehiculo` | Unit | P0 | Dev1 | ⬜ |
| T090 | Solicitudes | `quitarVehiculo` con solo 1 vehículo → error | `solicitudes.service.test.ts` | `quitarVehiculo` | Unit | P0 | Dev1 | ⬜ |
| T091 | Solicitudes | `agregarObservacion` vacía → error | `solicitudes.service.test.ts` | `agregarObservacion` | Unit | P2 | Dev1 | ⬜ |
| T092 | Solicitudes | `subirDocumentos` archivo > 10MB → error | `solicitudes.service.test.ts` | `subirDocumentos` | Unit | P1 | Dev1 | ⬜ |
| T093 | Solicitudes | `subirDocumentos` tipo MIME inválido → error | `solicitudes.service.test.ts` | `subirDocumentos` | Unit | P1 | Dev1 | ⬜ |
| T094 | Solicitudes | `subirDocumentos` lista vacía → error | `solicitudes.service.test.ts` | `subirDocumentos` | Unit | P1 | Dev1 | ⬜ |
| T095 | Solicitudes | `eliminarDocumento` por autor → success | `solicitudes.service.test.ts` | `eliminarDocumento` | Unit | P1 | Dev1 | ⬜ |
| T096 | Solicitudes | `eliminarDocumento` por ejecutivo no autor → error | `solicitudes.service.test.ts` | `eliminarDocumento` | Unit | P1 | Dev1 | ⬜ |
| T097 | Actions | `createSolicitudAction` ejecutivo sucursal incorrecta → error | `solicitudes.actions.test.ts` | `createSolicitudAction` | Unit | P0 | Dev1 | ⬜ |
| T098 | Actions | `createSolicitudAction` rol operaciones → error | `solicitudes.actions.test.ts` | `createSolicitudAction` | Unit | P0 | Dev1 | ⬜ |
| T099 | Actions | `createSolicitudAction` tipo evento sin dirección → error | `solicitudes.actions.test.ts` | `createSolicitudAction` | Unit | P0 | Dev1 | ⬜ |
| T100 | Actions | `createSolicitudAction` jefe_local → estado `aprobada` | `solicitudes.actions.test.ts` | `createSolicitudAction` | Unit | P0 | Dev1 | ⬜ |
| T101 | Actions | `aprobarSolicitudAction` por ejecutivo → error | `solicitudes.actions.test.ts` | `aprobarSolicitudAction` | Unit | P0 | Dev1 | ⬜ |
| T102 | Actions | `aprobarSolicitudAction` jefe_local otra sucursal → error | `solicitudes.actions.test.ts` | `aprobarSolicitudAction` | Unit | P0 | Dev1 | ⬜ |
| T103 | Actions | `cancelarSolicitudAction` ejecutivo de su solicitud → success | `solicitudes.actions.test.ts` | `cancelarSolicitudAction` | Unit | P1 | Dev1 | ⬜ |
| T104 | Actions | `reordenarColaAction` logistica → error | `solicitudes.actions.test.ts` | `reordenarColaAction` | Unit | P1 | Dev1 | ⬜ |
| T105 | Usuarios | `generateTempPassword` prefijo "HM-" + 7 chars | `users.service.test.ts` | `generateTempPassword` | Unit | P1 | Dev2 | ⬜ |
| T106 | Usuarios | `createUser` email duplicado → error | `users.service.test.ts` | `createUser` | Unit | P0 | Dev2 | ⬜ |
| T107 | Usuarios | `createUser` requiere_cambio_clave=true por defecto | `users.service.test.ts` | `createUser` | Unit | P0 | Dev2 | ⬜ |
| T108 | Usuarios | `toggleUserStatus` admin desactiva su propia cuenta → error | `users.service.test.ts` | `toggleUserStatus` | Unit | P0 | Dev2 | ⬜ |
| T109 | Usuarios | `toggleUserStatus` admin principal hardcodeado → error | `users.service.test.ts` | `toggleUserStatus` | Unit | P0 | Dev2 | ⬜ |
| T110 | Usuarios | `updateUser` actualiza campos correctamente | `users.service.test.ts` | `updateUser` | Unit | P1 | Dev2 | ⬜ |
| T111 | Sucursales | `createSucursal` nombre duplicado → error | `sucursales.service.test.ts` | `createSucursal` | Unit | P1 | Dev2 | ⬜ |
| T112 | Sucursales | `deleteSucursal` con usuarios asignados → error | `sucursales.service.test.ts` | `deleteSucursal` | Unit | P0 | Dev2 | ⬜ |
| T113 | Sucursales | `deleteSucursal` sin usuarios → success | `sucursales.service.test.ts` | `deleteSucursal` | Unit | P1 | Dev2 | ⬜ |
| T114 | Organización | `createZona` nombre vacío → error | `organizacion.service.test.ts` | `createZona` | Unit | P2 | Dev2 | ⬜ |
| T115 | Organización | `createZona` nombre duplicado → error | `organizacion.service.test.ts` | `createZona` | Unit | P2 | Dev2 | ⬜ |
| T116 | Auditoría | `getAuditoria` sin filtros devuelve lista | `auditoria.service.test.ts` | `getAuditoria` | Unit | P2 | Dev1 | ⬜ |
| T117 | Auditoría | `getAuditoria` con filtro por entidad | `auditoria.service.test.ts` | `getAuditoria` | Unit | P2 | Dev1 | ⬜ |
| T118 | Auditoría | `getMetricas` devuelve 3 contadores correctos | `auditoria.service.test.ts` | `getMetricas` | Unit | P2 | Dev1 | ⬜ |

---

## 11. Dependencias entre tareas

```
T001 (Setup)
  │
  ├─ T002-T012 [fechas.test.ts] — Dev1
  ├─ T013-T016 [parseCSV.test.ts] — Dev1
  ├─ T017-T020 [extraerAnio.test.ts] — Dev1
  ├─ T021-T024 [parsePrecio.test.ts] — Dev1
  └─ T025-T028 [tipos.test.ts] — Dev2
        │
        ├─ T029-T030 [solicitudes helpers] — Dev1 ←─── T035-T040 [auth ampliado] — Dev2
        │                                            └── T046-T053 [vehiculo ampliado] — Dev2
        │
        ├─ T054-T096 [solicitudes.service.test.ts] — Dev1
        │
        ├─ T097-T104 [solicitudes.actions.test.ts] — Dev1  (depende de T054-T096)
        │
        ├─ T105-T110 [users.service.test.ts] — Dev2
        ├─ T111-T113 [sucursales.service.test.ts] — Dev2
        └─ T114-T115 [organizacion.service.test.ts] — Dev2
              │
              └─ T116-T118 [auditoria.service.test.ts] — Dev1
                    │
                    └─ Integración (todos los nuevos) — Ambos
```

**Tareas completamente paralelas entre devs:** T002-T028 (Fase 1) + T035-T053 (Dev2) al mismo tiempo que T054-T096 (Dev1).

---

## 12. Objetivos de coverage

| Módulo | Lines | Branches | Functions | Justificación |
|---|---|---|---|---|
| `lib/fechas.ts` | 100% | 100% | 100% | Funciones puras, trivial |
| Parsers CSV (estáticos) | 95% | 90% | 100% | Importación crítica |
| `solicitudes.service.ts` | 85% | 80% | 90% | Módulo más crítico |
| `solicitudes.actions.ts` | 80% | 75% | 85% | Capa de autorización |
| `auth.service.ts` | 80% | 75% | 85% | Login/registro críticos |
| `vehiculo.service.ts` | 80% | 75% | 85% | Validaciones de datos |
| `users.service.ts` | 75% | 70% | 80% | CRUD de usuarios |
| `sucursales.service.ts` | 70% | 65% | 75% | CRUD secundario |
| `organizacion.service.ts` | 65% | 60% | 70% | CRUD de catálogos |
| `auditoria.service.ts` | 65% | 60% | 70% | Trazabilidad importante |
| **GLOBAL** | **75%** | **70%** | **80%** | Objetivo razonable |

> No exigir coverage a: `src/app/*/page.tsx`, `src/components/**`, `src/lib/supabase/**`, `src/types/**`

---

## 13. Definition of Done

### Por test individual
- [ ] Test pasa en verde sin trucos en los mocks
- [ ] Caso negativo cubierto explícitamente
- [ ] Edge cases relevantes incluidos (null, vacío, límites)
- [ ] Nombre descriptivo: `should_[resultado]_when_[condición]`
- [ ] Sin dependencias entre tests (cada uno es aislado)
- [ ] Mocks reseteados en `beforeEach` con `vi.clearAllMocks()`
- [ ] Sin `test.only` ni `test.skip` sin comentario justificado

### Por PR de tests
- [ ] `npm run test` pasa completamente (sin regresiones)
- [ ] `npm run test:coverage` muestra avance, no retroceso
- [ ] PR revisado por el otro developer
- [ ] Descripción del PR explica casos cubiertos y decisiones de diseño

---

## 14. Problemas de arquitectura que dificultan el testing

### 1. `SolicitudDetalleModal.tsx` — Componente de 45.9 KB (mezcla lógica + UI)
**Impacto**: Lógica de permisos por rol embebida en JSX. No testeable unitariamente.  
**Refactor**: Extraer hooks `useSolicitudPermisos`, `useSolicitudAcciones`.  
**Urgencia**: Baja — no bloquea tests de services. Pendiente Fase 9.

### 2. `createAdminClient()` interno en cada método (acoplamiento)
**Impacto**: Requiere mock a nivel de módulo. Cadenas de mocks complejas.  
**Refactor**: Inyección de dependencia del cliente en los métodos.  
**Urgencia**: No urgente — el mock por módulo funciona (tests existentes lo prueban).

### 3. `solicitudes.service.ts` con 1622 líneas y 30+ métodos
**Impacto**: Unit tests necesitan preparar mocks de 3-4 tablas por test.  
**Refactor**: Extraer `SlotsService`, `ReservaService`.  
**Urgencia**: Testear como está. Refactor posterior.

### 4. Lógica de permisos duplicada en actions Y services
**Impacto**: Debe testearse en dos lugares. Riesgo de divergencia silenciosa.  
**Refactor**: Función `puedeRealizarAccion(rol, accion, contexto)` centralizada.  
**Urgencia**: Documentar la duplicación y testear ambos lados.

### 5. Email de admin hardcodeado en 3+ archivos
**Impacto**: Tests deben usar ese email exacto. Frágil si cambia.  
**Refactor**: Constante `ADMIN_PRINCIPAL_EMAIL` en `auth.types.ts`.  
**Urgencia**: Alta — hacer antes de implementar T108/T109.

---

## PRIMERAS 10 TAREAS

| # | Tarea | Dev | Tiempo | Porqué |
|---|---|---|---|---|
| 1 | T001: Instalar `@vitest/coverage-v8`, agregar scripts y config | Ambos | 15 min | Base de todo el plan. Sin coverage no hay métricas. |
| 2 | T002-T008: `fechas.test.ts` completo (7 tests) | Dev1 | 30 min | Funciones puras, zero mocks, primeros tests que dan confianza. |
| 3 | T013-T016: `csv/parseCSV.test.ts` (4 tests) | Dev1 | 45 min | Función pura crítica. Sin IO. |
| 4 | T017-T020: `csv/extraerAnio.test.ts` (4 tests) | Dev1 | 30 min | Función pura, casos de Excel serial y formatos de fecha. |
| 5 | T021-T024: `csv/parsePrecio.test.ts` (4 tests) | Dev1 | 30 min | Parser de precio con múltiples formatos regionales. |
| 6 | T046-T053: Ampliar `vehiculo.service.test.ts` (8 tests) | Dev2 | 60 min | Lógica simple con mocks claros. Consolida patrón de mock. |
| 7 | T035-T040: Ampliar `auth.service.test.ts` (6 tests) | Dev2 | 60 min | El mock de Supabase auth ya está establecido. |
| 8 | T054-T065: Primera mitad `solicitudes.service.test.ts` | Dev1 | 120 min | Módulo más crítico. Establece el patrón de mock para queries encadenadas. |
| 9 | T066-T087: Segunda mitad `solicitudes.service.test.ts` | Dev1 | 120 min | Máquina de estados completa. Las reglas de negocio más riesgosas. |
| 10 | T097-T104: `solicitudes.actions.test.ts` (8 tests) | Dev1 | 90 min | Cierra el ciclo: validar que `profile.rol` bloquea acciones no permitidas. |

**Resultado al completar las 10 tareas:**
- ~90 tests nuevos (+ 42 existentes = ~132 tests totales)
- Coverage: `fechas.ts` 100%, CSV ~95%, `vehiculo.service` ~85%, `auth.service` ~80%, `solicitudes.service` ~70%, `solicitudes.actions` ~65%
- Base sólida para Fase 5 en paralelo

---

## Convención de nombres de tests

```typescript
describe('SolicitudesService', () => {
  describe('createSolicitud', () => {
    it('should_fail_when_no_vehicles_are_provided', async () => { ... });
    it('should_fail_when_vehicle_is_already_reserved_in_active_request', async () => { ... });
    it('should_fail_when_destination_branch_has_no_available_slots', async () => { ... });
  });
  describe('recibirSolicitud', () => {
    it('should_allow_admin_to_receive_any_request', async () => { ... });
    it('should_reject_when_jefe_local_is_not_from_destination_branch', async () => { ... });
    it('should_fail_when_request_is_not_in_en_transito_state', async () => { ... });
  });
});
```

---

*Plan generado: 2026-09-28 | Basado en análisis real del código fuente de `projecto_logistica_hm/src/`*  
*Suite existente: 42 tests / 38 pasan | Framework: Vitest (ya configurado)*
