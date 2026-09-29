e

# Plan de Implementación — DEV 2

## Proyecto Logística H.M. · Fase Solicitudes + Logística + Operación

> **Basado en análisis real del código, migraciones y arquitectura existente.**
> Generado: 2026-09-28

---

## DIAGNÓSTICO: Lo que DEV 1 dejó listo (CONSUMIR, no reimplementar)

| Contrato                                               | Archivo                            | Línea | Función                                  |
| ------------------------------------------------------ | ---------------------------------- | ------ | ----------------------------------------- |
| `OrganizacionService.getUserAssignedBranches(uid)`   | `organizacion.service.ts`        | 268    | Sucursales asignadas (principal + N:M)    |
| `OrganizacionService.getUserZones(uid)`              | `organizacion.service.ts`        | 315    | Zonas de logística                       |
| `OrganizacionService.usuarioTieneSucursal(uid, sid)` | `organizacion.service.ts`        | 346    | Validación vía RPC SQL SECURITY DEFINER |
| `OrganizacionService.getAvailableVehicles()`         | `organizacion.service.ts`        | 448    | Vehículos disponibles (liberados)        |
| `OrganizacionService.getVehicle(id)`                 | `organizacion.service.ts`        | 403    | Vehículo con disponibilidad              |
| Tabla`usuario_sucursal` (N:M)                        | `20260915_zona_organizacion.sql` | —     | Jefe Local multi-sucursal                 |
| Tabla`usuario_zona` (N:M)                            | `20260915_zona_organizacion.sql` | —     | Logística por zonas                      |
| Función SQL`usuario_tiene_sucursal(uuid, bigint)`   | `20260915_zona_organizacion.sql` | 136    | Helper negocio DB                         |

---

## Estado actual de ENUMs (BD real)

```sql
-- estado_solicitud (valores existentes en BD)
'pendiente' | 'priorizada' | 'asignada' | 'calendarizada'
| 'en_transito' | 'entregada' | 'cancelada' | 'finalizada'
| 'pendiente_aprobacion' | 'aprobada' | 'rechazada'

-- tipo_solicitud
'evento' | 'venta'

-- disponibilidad (solicitud_vehiculo)
'reservado' | 'liberado' | 'vendido'
```

### Gap: nomenclatura actual vs. requerida

| Valor DB (inmutable)     | Label UI actual         | Label UI nuevo                | Acción                          |
| ------------------------ | ----------------------- | ----------------------------- | -------------------------------- |
| `pendiente_aprobacion` | "Pendiente Aprobación" | **Pendiente**           | Solo cambiar label               |
| `aprobada`             | "Aprobada"              | **Aprobada**            | Mantener                         |
| `pendiente`            | "Pendiente"             | Huérfano sin uso             | Mantener en DB, ignorar en flujo |
| `priorizada`           | "Priorizada"            | **Priorizada**          | Mantener                         |
| `asignada`             | "Asignada"              | **Asignada**            | Mantener                         |
| `calendarizada`        | "Calendarizada"         | **Calendarizada**       | Mantener                         |
| `despachada`           | _(no existe)_         | **Despachada**          | **AGREGAR al enum**        |
| `en_transito`          | "En Tránsito"          | **En tránsito**        | Solo label                       |
| `entregada`            | "Entregada"             | **Recepcionada**        | Solo label                       |
| `finalizada`           | "Finalizada"            | **Entregado a cliente** | Solo label                       |
| `cancelada`            | "Cancelada"             | **Cancelada**           | Mantener                         |
| `rechazada`            | "Rechazada"             | **Rechazada**           | Mantener                         |

> **REGLA CRÍTICA**: Los valores del enum PostgreSQL NO se renombran. Solo cambiamos labels en `estadoConfig` de `SolicitudesClient.tsx` y `SolicitudDetalleModal.tsx`.

### Gap: flujo actual vs. requerido

```
Actual:    calendarizada → en_transito → entregada → finalizada
Requerido: calendarizada → despachada → en_transito → entregada[Recepcionada] → finalizada[Entregado a cliente]
```

---

## A. ARCHIVOS A MODIFICAR

### DEV 2 exclusivo (riesgo 0 de conflicto)

| Archivo                                       | Motivo                                                                                                           |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `src/types/sucursal.types.ts`               | Agregar`'despachada'` al union `EstadoSolicitud`                                                             |
| `src/types/solicitud.types.ts`              | Agregar fechas:`fecha_confirmacion`, `fecha_inicio_transito`, `fecha_recepcion`, `fecha_entrega_cliente` |
| `src/services/solicitudes.service.ts`       | Adaptar flujo, insistir, filtrado por zona                                                                       |
| `src/app/actions/solicitudes.actions.ts`    | Nuevas actions + actualizar validaciones multi-sucursal                                                          |
| `src/app/solicitudes/SolicitudesClient.tsx` | Labels, botón Insistir, ocultar prioridad a ejecutivos                                                          |
| `src/components/SolicitudDetalleModal.tsx`  | Trazabilidad, fechas, encargado logística                                                                       |
| `src/app/solicitudes/page.tsx`              | Pasar`sucursales_asignadas` al client                                                                          |

### Archivos nuevos (DEV 2 crea)

| Archivo                                               | Contenido                  |
| ----------------------------------------------------- | -------------------------- |
| `src/types/traslado.types.ts`                       | Tipos traslado interno     |
| `src/services/traslado.service.ts`                  | Lógica traslados internos |
| `src/app/actions/traslados.actions.ts`              | Server actions traslados   |
| `src/app/solicitudes/traslados/page.tsx`            | Vista traslados internos   |
| `src/app/solicitudes/traslados/TrasladosClient.tsx` | UI traslados               |
| `src/app/logistica/slots/page.tsx`                  | Vista slots multi-sucursal |
| `src/app/logistica/slots/SlotsClient.tsx`           | UI slots                   |
| `src/app/faq/page.tsx`                              | Preguntas frecuentes       |

### Archivos compartidos con DEV 1 (mínima modificación)

| Archivo                                  | Qué tocar                                    | Qué NO tocar                                        |
| ---------------------------------------- | --------------------------------------------- | ---------------------------------------------------- |
| `src/types/sucursal.types.ts`          | Solo agregar`'despachada'` al union type    | No tocar`Sucursal`, `Zona`, `VehiculoAsociado` |
| `src/services/organizacion.service.ts` | **SOLO LEER** — importar sin modificar | No agregar métodos, no refactorizar                 |
| `src/components/TopNavbar.tsx`         | Agregar prop`sucursales_asignadas` opcional | No cambiar layout existente                          |

---

## B. TABLAS A MODIFICAR

| Tabla                  | Columnas a agregar                                                                                                                                | Notas                                                                                    |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `solicitud`          | `fecha_confirmacion TIMESTAMPTZ`, `fecha_inicio_transito TIMESTAMPTZ`, `fecha_recepcion TIMESTAMPTZ`, `fecha_entrega_cliente TIMESTAMPTZ` | `fecha_despacho` y `logistica_id` ya existen; reusar `logistica_id` como encargado |
| `solicitud_vehiculo` | Sin cambios                                                                                                                                       | Ya tiene enum`disponibilidad` con `'vendido'`                                        |

---

## C. TABLAS NUEVAS

| Tabla                         | Descripción                                                                                                                                                                                                  |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `traslado_interno`          | `id`, `origen_id` (FK sucursal), `destino_id` (FK sucursal), `logistica_id` (FK usuario), `estado` (enum), `fecha_despacho`, `fecha_recepcion`, `observacion`, `created_at`, `updated_at` |
| `traslado_interno_vehiculo` | `id`, `traslado_id` (FK), `vehiculo_id` (FK), `disponibilidad` (enum), `created_at`                                                                                                                 |
| `insistencia`               | `id`, `solicitud_id` (FK), `usuario_id` (FK), `mensaje TEXT`, `created_at`                                                                                                                          |

---

## D. MIGRACIONES (orden de ejecución obligatorio)

### Migración 1 — `20260928_solicitud_fechas.sql`

```sql
ALTER TABLE public.solicitud
  ADD COLUMN IF NOT EXISTS fecha_confirmacion    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS fecha_inicio_transito TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS fecha_recepcion       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS fecha_entrega_cliente TIMESTAMPTZ;

-- Backfill
UPDATE public.solicitud
  SET fecha_recepcion = fecha_entrega
  WHERE estado = 'entregada' AND fecha_entrega IS NOT NULL;

UPDATE public.solicitud
  SET fecha_entrega_cliente = fecha_actualizacion
  WHERE estado = 'finalizada';
```

### Migración 2 — `20260928_enum_despachada.sql` *(ejecutar SOLA)*

```sql
-- ADVERTENCIA: ejecutar en transaccion separada del script 3
ALTER TYPE public.estado_solicitud ADD VALUE IF NOT EXISTS 'despachada';
```

### Migración 3 — `20260928_triggers_fechas.sql` *(ejecutar DESPUES del 2)*

```sql
-- Trigger AFTER UPDATE solicitud: registrar fechas automaticamente
CREATE OR REPLACE FUNCTION public.fn_registrar_fechas_flujo()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.estado = 'aprobada' AND OLD.estado IS DISTINCT FROM NEW.estado THEN
    NEW.fecha_confirmacion = now();
  END IF;
  IF NEW.estado = 'despachada' AND OLD.estado IS DISTINCT FROM NEW.estado THEN
    NEW.fecha_inicio_transito = now();
  END IF;
  IF NEW.estado = 'entregada' AND OLD.estado IS DISTINCT FROM NEW.estado THEN
    NEW.fecha_recepcion = now();
  END IF;
  IF NEW.estado = 'finalizada' AND OLD.estado IS DISTINCT FROM NEW.estado THEN
    NEW.fecha_entrega_cliente = now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_registrar_fechas_flujo
  BEFORE UPDATE ON public.solicitud
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_registrar_fechas_flujo();

-- Actualizar fn_recalcular_slots_ocupados para incluir 'despachada'
CREATE OR REPLACE FUNCTION public.fn_recalcular_slots_ocupados(p_sucursal_id bigint)
RETURNS void AS $$
DECLARE
  v_ocupados bigint;
  v_slots    bigint;
BEGIN
  IF p_sucursal_id IS NULL THEN RETURN; END IF;
  SELECT
    (SELECT count(*) FROM public.vehiculo v WHERE v.ubicacion = p_sucursal_id)
    + (SELECT count(*)
         FROM public.solicitud_vehiculo sv
         JOIN public.solicitud sol ON sol.id = sv.solicitud_id
        WHERE sol.sucursal_destino = p_sucursal_id
          AND sv.disponibilidad = 'reservado'
          AND sol.estado IN ('pendiente_aprobacion','aprobada','pendiente',
                             'priorizada','asignada','calendarizada',
                             'despachada','en_transito'))
    INTO v_ocupados;

  SELECT slots INTO v_slots FROM public.sucursal WHERE id = p_sucursal_id;

  IF v_slots IS NOT NULL AND v_ocupados > v_slots THEN
    RAISE EXCEPTION 'Sucursal % excede capacidad: ocupados % > slots %',
      p_sucursal_id, v_ocupados, v_slots;
  END IF;

  UPDATE public.sucursal SET slots_ocupados = v_ocupados WHERE id = p_sucursal_id;
END;
$$ LANGUAGE plpgsql;
```

### Migración 4 — `20260928_traslado_interno.sql`

```sql
CREATE TYPE public.estado_traslado AS ENUM ('pendiente', 'en_transito', 'recepcionado');

CREATE TABLE public.traslado_interno (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  origen_id       BIGINT NOT NULL REFERENCES public.sucursal(id),
  destino_id      BIGINT NOT NULL REFERENCES public.sucursal(id),
  logistica_id    UUID NOT NULL REFERENCES public.usuario(id),
  estado          public.estado_traslado NOT NULL DEFAULT 'pendiente',
  fecha_despacho  TIMESTAMPTZ,
  fecha_recepcion TIMESTAMPTZ,
  observacion     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.traslado_interno_vehiculo (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  traslado_id  UUID NOT NULL REFERENCES public.traslado_interno(id) ON DELETE CASCADE,
  vehiculo_id  UUID NOT NULL REFERENCES public.vehiculo(id),
  disponibilidad public.disponibilidad NOT NULL DEFAULT 'reservado',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_traslado_interno_logistica ON public.traslado_interno(logistica_id);
CREATE INDEX idx_traslado_interno_destino   ON public.traslado_interno(destino_id);
CREATE INDEX idx_traslado_veh_traslado      ON public.traslado_interno_vehiculo(traslado_id);

ALTER TABLE public.traslado_interno ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.traslado_interno_vehiculo ENABLE ROW LEVEL SECURITY;
```

### Migración 5 — `20260928_insistencia.sql`

```sql
CREATE TABLE public.insistencia (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  solicitud_id UUID NOT NULL REFERENCES public.solicitud(id) ON DELETE CASCADE,
  usuario_id   UUID NOT NULL REFERENCES public.usuario(id),
  mensaje      TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_insistencia_solicitud ON public.insistencia(solicitud_id);
ALTER TABLE public.insistencia ENABLE ROW LEVEL SECURITY;
```

### Migración 6 — `20260928_rls_nuevas_tablas.sql`

```sql
-- traslado_interno: SELECT
CREATE POLICY "traslado_select" ON public.traslado_interno FOR SELECT TO authenticated
  USING (
    public.usuario_activo() AND (
      public.tiene_rol('administrador')
      OR (public.tiene_rol('logistica') AND logistica_id = auth.uid())
      OR (public.tiene_rol('jefe_local') AND public.usuario_tiene_sucursal(auth.uid(), destino_id))
    )
  );

-- traslado_interno: mutate
CREATE POLICY "traslado_mutate" ON public.traslado_interno FOR ALL TO authenticated
  USING (public.tiene_rol('administrador') OR public.tiene_rol('logistica'))
  WITH CHECK (public.tiene_rol('administrador') OR public.tiene_rol('logistica'));

-- traslado_interno_vehiculo: heredar del traslado
CREATE POLICY "traslado_veh_select" ON public.traslado_interno_vehiculo FOR SELECT TO authenticated
  USING (public.usuario_activo());

CREATE POLICY "traslado_veh_mutate" ON public.traslado_interno_vehiculo FOR ALL TO authenticated
  USING (public.tiene_rol('administrador') OR public.tiene_rol('logistica'))
  WITH CHECK (public.tiene_rol('administrador') OR public.tiene_rol('logistica'));

-- insistencia: select todos activos
CREATE POLICY "insistencia_select" ON public.insistencia FOR SELECT TO authenticated
  USING (public.usuario_activo());

-- insistencia: insert solo ejecutivos
CREATE POLICY "insistencia_insert" ON public.insistencia FOR INSERT TO authenticated
  WITH CHECK (public.usuario_activo() AND public.tiene_rol('ejecutivo') AND usuario_id = auth.uid());
```

---

## E. ESTADOS — Mapeo definitivo

### Flujo Normal

| Valor DB                 | Label UI                      | Quién avanza             | Efecto                                                 |
| ------------------------ | ----------------------------- | ------------------------- | ------------------------------------------------------ |
| `pendiente_aprobacion` | **Pendiente**           | — (creado por ejecutivo) | Inicial                                                |
| `aprobada`             | **Aprobada**            | Jefe Local                | `fecha_confirmacion` = now()                         |
| `priorizada`           | **Priorizada**          | Jefe Local                | `posicion_prioridad` asignada                        |
| `asignada`             | **Asignada**            | Logística                | `logistica_id` = encargado                           |
| `calendarizada`        | **Calendarizada**       | Logística                | `fecha_tentativa_despacho` asignada                  |
| `despachada`           | **Despachada**          | Logística                | `fecha_despacho` + `fecha_inicio_transito` = now() |
| `en_transito`          | **En tránsito**        | Sistema (inmediato)       | Auto o manual                                          |
| `entregada`            | **Recepcionada**        | Jefe Local destino        | `fecha_recepcion` = now() · vehículo LIBERADO      |
| `finalizada`           | **Entregado a cliente** | Ejecutivo / Jefe Local    | `fecha_entrega_cliente` = now() · vehículo VENDIDO |
| `cancelada`            | **Cancelada**           | Varios                    | Slots liberados                                        |
| `rechazada`            | **Rechazada**           | Jefe Local                | Slots liberados                                        |

### Flujo Traslado Interno

| Valor DB         | Label UI               | Quién avanza         |
| ---------------- | ---------------------- | --------------------- |
| `pendiente`    | **Pendiente**    | Creado por Logística |
| `en_transito`  | **En tránsito** | Logística despacha   |
| `recepcionado` | **Recepcionado** | Jefe Local destino    |

---

## F. FLUJO NORMAL — Detalle de implementación

```
[Ejecutivo crea] → pendiente_aprobacion
       ↓
[JL aprueba + confirma fecha_limite] → aprobada  (fecha_confirmacion = now())
       ↓ [JL prioriza]
   priorizada (posicion_prioridad 1..N en cola)
       ↓ [Logística asigna encargado]
   asignada  (logistica_id = userId)
       ↓ [Logística calendariza]
   calendarizada  (fecha_tentativa_despacho)
       ↓ [Logística despacha]
   despachada  (fecha_despacho + fecha_inicio_transito = now())
       ↓ [automático o manual]
   en_transito
       ↓ [JL destino recepciona]
   entregada [UI: Recepcionada]  (fecha_recepcion = now())
   vehículo: disponibilidad='liberado', ubicacion=sucursal_destino
       ↓ [Ejecutivo / JL entrega al cliente]
   finalizada [UI: Entregado a cliente]  (fecha_entrega_cliente = now())
   vehículo: disponibilidad='vendido', ubicacion=NULL
```

### Cambios en `solicitudes.service.ts`

**`despacharSolicitud()`**: cambiar `estado: 'en_transito'` → `estado: 'despachada'`. El trigger de DB actualiza `fecha_despacho` e `fecha_inicio_transito`. En la misma llamada, hacer un segundo UPDATE inmediato a `en_transito` si el flujo es instantáneo, o dejar `despachada` como estado visible hasta que logística confirme inicio de ruta.

**`recibirSolicitud()`**: ya hace `estado: 'entregada'` — agregar `fecha_recepcion: ahora` en el UPDATE (además del trigger de DB como respaldo).

**`finalizarSolicitud()`**: ya hace `estado: 'finalizada'` — agregar `fecha_entrega_cliente: ahora`.

**`aprobarSolicitud()`**: agregar `fecha_confirmacion: ahora` al UPDATE.

---

## G. FLUJO TRASLADO INTERNO

```
[Logística crea traslado]
  - Selecciona vehículos VENDIDOS
  - Selecciona sucursal destino
  - Valida slots en destino
  - Reserva slot
  - Notifica JL destino (solo aviso, no puede rechazar)
       ↓ [Logística despacha]
   en_transito + fecha_despacho = now()
       ↓ [JL destino recepciona]
   recepcionado + fecha_recepcion = now()
   vehículo: ubicacion = destino (SIGUE VENDIDO)
   slot: liberado en destino
```

### `traslado.service.ts` — Métodos

```typescript
class TrasladoService {
  static async crearTraslado(input: CreateTrasladoInput, vehiculosIds: string[], logisticaId: string)
  static async despacharTraslado(trasladoId: string, logisticaId: string)
  static async recibirTraslado(trasladoId: string, jefeLocalId: string)
  static async getTrasladosByLogistica(logisticaId: string)
  static async getTrasladosByDestinoSucursal(sucursalId: number)
  static async getTrasladoById(id: string)
}
```

---

## H. PERMISOS POR ROL

| Acción                      | Ejecutivo            | Jefe Local          | Logística | Admin |
| ---------------------------- | -------------------- | ------------------- | ---------- | ----- |
| Crear solicitud              | ✅ (propia sucursal) | ✅ (sus sucursales) | ❌         | ✅    |
| Ver solicitudes              | Solo propias         | Sus sucursales      | Sus zonas  | Todas |
| Aprobar / Rechazar           | ❌                   | ✅ (sus sucursales) | ❌         | ✅    |
| Modificar fecha_limite       | ❌                   | ✅ (al aprobar)     | ❌         | ✅    |
| Priorizar                    | ❌                   | ✅                  | ❌         | ✅    |
| Asignar encargado logística | ❌                   | ❌                  | ✅         | ✅    |
| Calendarizar                 | ❌                   | ❌                  | ✅         | ✅    |
| Despachar                    | ❌                   | ❌                  | ✅         | ✅    |
| Recepcionar                  | ❌                   | ✅ (destino)        | ❌         | ✅    |
| Entregar a cliente           | ✅ (propia sol.)     | ✅ (destino)        | ❌         | ✅    |
| Insistir                     | ✅ (24h cooldown)    | ❌                  | ❌         | ❌    |
| Ver prioridad                | ❌                   | ✅                  | ✅         | ✅    |
| Crear traslado interno       | ❌                   | ❌                  | ✅         | ✅    |
| Ver slots navbar             | ❌                   | ✅ (sus suc.)       | ❌         | ✅    |
| Subir documentos             | ✅                   | ✅                  | ✅         | ✅    |
| Cancelar                     | ✅ (pre-despacho)    | ✅ (sus suc.)       | ✅         | ✅    |

### Cambios críticos en acciones existentes

- **`aprobarSolicitudAction`**: reemplazar `solicitud.sucursal === profile.sucursal_id` → `await OrganizacionService.usuarioTieneSucursal(profile.id, solicitud.sucursal)`
- **`priorizarSolicitudAction`**: mismo reemplazo
- **`cancelarSolicitudAction`**: para `jefe_local`, usar `usuarioTieneSucursal`
- **`getSolicitudes`**: filtrar por zonas para logística (CRÍTICO — actualmente devuelve todas)

---

## I. RLS — Políticas nuevas

```sql
-- traslado_interno: SELECT
-- logistica ve las suyas, jefe_local ve las que llegan a su sucursal, admin todo
CREATE POLICY "traslado_select" ON public.traslado_interno FOR SELECT TO authenticated
  USING (
    public.usuario_activo() AND (
      public.tiene_rol('administrador')
      OR (public.tiene_rol('logistica') AND logistica_id = auth.uid())
      OR (public.tiene_rol('jefe_local')
          AND public.usuario_tiene_sucursal(auth.uid(), destino_id))
    )
  );

-- insistencia: INSERT solo ejecutivos
CREATE POLICY "insistencia_insert" ON public.insistencia FOR INSERT TO authenticated
  WITH CHECK (
    public.usuario_activo()
    AND public.tiene_rol('ejecutivo')
    AND usuario_id = auth.uid()
  );
```

> **NOTA**: La tabla `solicitud` ya usa `admin client` (service_role) en el server. No tocar su RLS.

---

## J. INTEGRACIÓN CON DEV 1

```typescript
// IMPORTAR desde organizacion.service.ts (no reimplementar)
import { OrganizacionService } from '@/services/organizacion.service';

// 1. Filtrar solicitudes de logística por zona
const zonas = await OrganizacionService.getUserZones(userId);
// → zonas[].id → filtrar solicitudes donde sucursal.zona_id IN (zonas)

// 2. Validar Jefe Local multi-sucursal
const ok = await OrganizacionService.usuarioTieneSucursal(userId, sucursalId);

// 3. Sucursales del JL para navbar slots
const sucursales = await OrganizacionService.getUserAssignedBranches(userId);

// 4. Vehículos disponibles para traslado interno
const vehiculos = await OrganizacionService.getAvailableVehicles();
```

### Nueva función en `solicitudes.service.ts`

```typescript
static async getSolicitudesFiltradas(
  userId: string,
  rol: UserRole
): Promise<SolicitudLista[]> {
  const admin = createAdminClient();
  let query = admin.from('solicitud').select(SOLICITUD_SELECT_CON_ZONA);
  // SOLICITUD_SELECT_CON_ZONA incluye: sucursal!solicitud_sucursal_fkey(nombre, zona_id)

  if (rol === 'ejecutivo') {
    query = query.eq('ejecutivo_id', userId);
  } else if (rol === 'jefe_local') {
    const sucursales = await OrganizacionService.getUserAssignedBranches(userId);
    const ids = sucursales.map(s => s.id);
    query = query.or(`sucursal.in.(${ids}),sucursal_destino.in.(${ids})`);
  } else if (rol === 'logistica') {
    const zonas = await OrganizacionService.getUserZones(userId);
    const zonaIds = zonas.map(z => z.id);
    // Filtrar en memoria tras traer (o usar join con zona)
    const { data } = await query;
    return ((data || []) as SolicitudRawRow[])
      .map(mapRow)
      .filter(s => /* sucursal.zona_id in zonaIds */);
  }
  // admin: sin filtro
  const { data } = await query.order('fecha_creacion', { ascending: false });
  return ((data || []) as SolicitudRawRow[]).map(mapRow);
}
```

---

## K. RIESGOS DE CONFLICTO GIT

| Archivo                                    | Nivel       | Mitigación                                                                     |
| ------------------------------------------ | ----------- | ------------------------------------------------------------------------------- |
| `src/types/sucursal.types.ts`            | 🟡 MEDIO    | Solo agregar`'despachada'` al final del union; coordinar con DEV 1            |
| `src/app/actions/solicitudes.actions.ts` | 🟡 MEDIO    | Cambio quirúrgico en 3 funciones; comentar motivo                              |
| `src/services/solicitudes.service.ts`    | 🟢 BAJO     | DEV 1 no toca este archivo por convenio                                         |
| `src/components/TopNavbar.tsx`           | 🟡 MEDIO    | Solo prop opcional nueva; no rompe                                              |
| `src/services/organizacion.service.ts`   | 🔴 NO TOCAR | Solo importar                                                                   |
| Migraciones SQL`20260928_*`              | 🟢 BAJO     | Fecha propia no colisiona con DEV 1                                             |
| Triggers en`solicitud`                   | 🟡 MEDIO    | Verificar que`tr_registrar_fechas_flujo` no colisione con triggers existentes |

---

## L. ORDEN DE IMPLEMENTACIÓN — 45 pasos en 9 fases

> **REGLA DE AVANCE**: No pasar a la siguiente fase hasta que **TODOS** los ítems de prueba de la fase anterior estén marcados como ✅. Si alguna prueba falla, corregir antes de avanzar.

---

### 🔲 FASE 1 — Base de datos *(1-2 horas)*

**Estado de fase: ⬜ PENDIENTE**

#### Pasos de implementación

- [ ] 1. Ejecutar `20260928_solicitud_fechas.sql` (columnas de fechas)
- [ ] 2. Ejecutar `20260928_enum_despachada.sql` (nuevo valor enum — SOLO, transacción separada)
- [ ] 3. Ejecutar `20260928_triggers_fechas.sql` (después del 2, otra sesión SQL)
- [ ] 4. Ejecutar `20260928_traslado_interno.sql`
- [ ] 5. Ejecutar `20260928_insistencia.sql`
- [ ] 6. Ejecutar `20260928_rls_nuevas_tablas.sql`

#### 🧪 Plan de pruebas — Fase 1

Ejecutar en Supabase SQL Editor (tabla `public`):

```sql
-- PRUEBA 1.1: Columnas nuevas existen en solicitud
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'solicitud'
  AND column_name IN (
    'fecha_confirmacion','fecha_inicio_transito',
    'fecha_recepcion','fecha_entrega_cliente'
  );
-- ESPERADO: 4 filas devueltas
```

```sql
-- PRUEBA 1.2: Valor 'despachada' existe en el enum
SELECT enumlabel FROM pg_enum
JOIN pg_type ON pg_enum.enumtypid = pg_type.oid
WHERE pg_type.typname = 'estado_solicitud'
ORDER BY enumsortorder;
-- ESPERADO: 'despachada' aparece en la lista
```

```sql
-- PRUEBA 1.3: Trigger de fechas existe
SELECT tgname, tgtype FROM pg_trigger
WHERE tgrelid = 'public.solicitud'::regclass
  AND tgname = 'tr_registrar_fechas_flujo';
-- ESPERADO: 1 fila
```

```sql
-- PRUEBA 1.4: Tablas nuevas existen
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('traslado_interno','traslado_interno_vehiculo','insistencia');
-- ESPERADO: 3 filas
```

```sql
-- PRUEBA 1.5: Tipo estado_traslado existe
SELECT typname FROM pg_type WHERE typname = 'estado_traslado';
-- ESPERADO: 1 fila
```

```sql
-- PRUEBA 1.6: RLS habilitado en tablas nuevas
SELECT tablename, rowsecurity FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('traslado_interno','traslado_interno_vehiculo','insistencia');
-- ESPERADO: rowsecurity = true en las 3
```

```sql
-- PRUEBA 1.7: Trigger de fechas funciona correctamente
-- (requiere una solicitud existente en estado 'aprobada' para probar)
-- Actualizar una solicitud real a 'aprobada' y verificar fecha_confirmacion:
UPDATE public.solicitud SET estado = 'aprobada'
  WHERE id = '<UUID_solicitud_en_pendiente_aprobacion>'
  RETURNING id, estado, fecha_confirmacion;
-- ESPERADO: fecha_confirmacion = timestamp actual (no NULL)
-- ROLLBACK si era de prueba:
-- UPDATE public.solicitud SET estado = 'pendiente_aprobacion', fecha_confirmacion = NULL WHERE id = '<UUID>';
```

```sql
-- PRUEBA 1.8: Índices creados
SELECT indexname FROM pg_indexes
WHERE tablename IN ('traslado_interno','traslado_interno_vehiculo','insistencia')
  AND schemaname = 'public';
-- ESPERADO: idx_traslado_interno_logistica, idx_traslado_interno_destino,
--           idx_traslado_veh_traslado, idx_insistencia_solicitud
```

**Checklist de pruebas Fase 1:**

- [ ] P1.1 — 4 columnas nuevas en `solicitud`
- [ ] P1.2 — `'despachada'` en el enum `estado_solicitud`
- [ ] P1.3 — Trigger `tr_registrar_fechas_flujo` existe
- [ ] P1.4 — 3 tablas nuevas creadas
- [ ] P1.5 — Tipo `estado_traslado` creado
- [ ] P1.6 — RLS habilitado en las 3 tablas nuevas
- [ ] P1.7 — Trigger registra `fecha_confirmacion` al pasar a `aprobada`
- [ ] P1.8 — Todos los índices creados

**✅ FASE 1 COMPLETA** — Marcar cuando TODOS los ítems anteriores estén en ✅

---

### 🔲 FASE 2 — Tipos TypeScript *(30 min)*

**Estado de fase: ⬜ PENDIENTE** *(no iniciar sin Fase 1 ✅)*

#### Pasos de implementación

- [ ] 7. `sucursal.types.ts` → agregar `'despachada'` a `EstadoSolicitud`
- [ ] 8. `solicitud.types.ts` → agregar 4 fechas nuevas a `SolicitudLista` y `SolicitudMinima`
- [ ] 9. Actualizar `SOLICITUD_SELECT` en `solicitudes.service.ts` con nuevas columnas
- [ ] 10. Crear `src/types/traslado.types.ts`

#### 🧪 Plan de pruebas — Fase 2

Ejecutar en terminal del proyecto:

```bash
# PRUEBA 2.1: TypeScript compila sin errores
npx tsc --noEmit
# ESPERADO: 0 errores
```

```bash
# PRUEBA 2.2: Los nuevos tipos son reconocidos
# Verificar que 'despachada' no genere error de tipo en:
# src/types/sucursal.types.ts → EstadoSolicitud debe incluirlo
grep -n "despachada" src/types/sucursal.types.ts
# ESPERADO: Al menos 1 línea con 'despachada'
```

```bash
# PRUEBA 2.3: Campos de fechas nuevos en SolicitudLista
grep -n "fecha_confirmacion\|fecha_inicio_transito\|fecha_recepcion\|fecha_entrega_cliente" src/types/solicitud.types.ts
# ESPERADO: 4 líneas (una por cada campo)
```

```bash
# PRUEBA 2.4: traslado.types.ts existe
ls src/types/traslado.types.ts
# ESPERADO: archivo encontrado
```

```bash
# PRUEBA 2.5: SOLICITUD_SELECT incluye nuevas columnas
grep -n "fecha_confirmacion" src/services/solicitudes.service.ts
# ESPERADO: al menos 1 ocurrencia
```

```bash
# PRUEBA 2.6: Next.js arranca sin errores de tipado
# Revisar consola de 'npm run dev' — no debe mostrar errores de tipo
# ESPERADO: "Ready" sin errores TS
```

**Checklist de pruebas Fase 2:**

- [ ] P2.1 — `tsc --noEmit` sin errores
- [ ] P2.2 — `'despachada'` en `EstadoSolicitud`
- [ ] P2.3 — 4 fechas nuevas en `SolicitudLista`
- [ ] P2.4 — `traslado.types.ts` creado
- [ ] P2.5 — `SOLICITUD_SELECT` actualizado
- [ ] P2.6 — Dev server arranca sin errores

**✅ FASE 2 COMPLETA** — Marcar cuando TODOS los ítems anteriores estén en ✅

---

### 🔲 FASE 3 — Servicios *(3-4 horas)*

**Estado de fase: ⬜ PENDIENTE** *(no iniciar sin Fase 2 ✅)*

#### Pasos de implementación

- [ ] 11. `solicitudes.service.ts` → `mapRow()`: mapear nuevas fechas
- [ ] 12. `solicitudes.service.ts` → `getSolicitudesFiltradas()`: filtro por rol/zona
- [ ] 13. `solicitudes.service.ts` → `aprobarSolicitud()`: agregar `fecha_confirmacion`
- [ ] 14. `solicitudes.service.ts` → `despacharSolicitud()`: estado `'despachada'` + fechas
- [ ] 15. `solicitudes.service.ts` → `recibirSolicitud()`: agregar `fecha_recepcion`
- [ ] 16. `solicitudes.service.ts` → `finalizarSolicitud()`: agregar `fecha_entrega_cliente`
- [ ] 17. `solicitudes.service.ts` → nuevo `insistirSolicitud()` con rate limit 24h
- [ ] 18. `solicitudes.service.ts` → nuevo `asignarEncargadoLogistica()` (estado `asignada`)
- [ ] 19. Crear `src/services/traslado.service.ts` completo

#### 🧪 Plan de pruebas — Fase 3

Pruebas funcionales usando Supabase SQL Editor + consola del servidor Next.js:

```bash
# PRUEBA 3.1: Compilación sin errores
npx tsc --noEmit
# ESPERADO: 0 errores
```

**Prueba 3.2 — `getSolicitudesFiltradas` filtra correctamente (manual en UI)**

1. Iniciar sesión como usuario con rol `logistica` que tenga UNA zona asignada
2. Navegar a `/solicitudes`
3. Verificar que solo se ven solicitudes cuya sucursal tiene `zona_id` en las zonas del usuario
4. Iniciar sesión como `logistica` sin zonas asignadas → debe ver 0 solicitudes
5. **ESPERADO**: filtro por zona funciona

**Prueba 3.3 — `aprobarSolicitud` registra `fecha_confirmacion` (manual en UI)**

1. Iniciar sesión como `jefe_local`
2. Aprobar una solicitud en estado `pendiente_aprobacion`
3. Verificar en Supabase Table Editor → tabla `solicitud` → columna `fecha_confirmacion` no debe ser NULL
4. **ESPERADO**: `fecha_confirmacion` = timestamp del momento de aprobación

**Prueba 3.4 — `despacharSolicitud` usa estado `despachada` (manual en UI)**

1. Iniciar sesión como `logistica`
2. Despachar una solicitud en estado `calendarizada`
3. Verificar en tabla `solicitud`: `estado = 'despachada'`, `fecha_despacho` no NULL, `fecha_inicio_transito` no NULL
4. **ESPERADO**: los 3 campos actualizados correctamente

**Prueba 3.5 — `recibirSolicitud` registra `fecha_recepcion`**

1. Como `jefe_local` del destino, recepcionar una solicitud en `en_transito`
2. Verificar: `estado = 'entregada'`, `fecha_recepcion` no NULL
3. Verificar: `solicitud_vehiculo.disponibilidad = 'liberado'` para todos los vehículos
4. **ESPERADO**: vehículo liberado + fecha registrada

**Prueba 3.6 — `finalizarSolicitud` registra `fecha_entrega_cliente`**

1. Como ejecutivo o `jefe_local`, finalizar una solicitud en `entregada`
2. Verificar: `estado = 'finalizada'`, `fecha_entrega_cliente` no NULL
3. Verificar: `solicitud_vehiculo.disponibilidad = 'vendido'`, `vehiculo.ubicacion = NULL`
4. **ESPERADO**: vehículo vendido + ubicacion NULL + fecha registrada

**Prueba 3.7 — `insistirSolicitud` con rate limit**

1. Como ejecutivo, hacer clic en "Insistir" en una solicitud propia activa
2. Verificar en tabla `insistencia`: nueva fila con `solicitud_id` y `usuario_id`
3. Intentar insistir de nuevo **inmediatamente** → debe rechazar con mensaje de cooldown
4. Verificar en tabla `auditoria`: evento de insistencia registrado
5. **ESPERADO**: primera insistencia OK, segunda bloqueada con tiempo restante

```sql
-- PRUEBA 3.8: Método getTrasladoById existe (verificar que traslado.service.ts compila)
npx tsc --noEmit
-- ESPERADO: 0 errores
```

**Checklist de pruebas Fase 3:**

- [ ] P3.1 — `tsc --noEmit` sin errores
- [ ] P3.2 — Filtrado de solicitudes por zona funciona para logística
- [ ] P3.3 — `fecha_confirmacion` se registra al aprobar
- [ ] P3.4 — Estado `despachada` + fechas se registran al despachar
- [ ] P3.5 — `fecha_recepcion` + vehículo liberado al recepcionar
- [ ] P3.6 — `fecha_entrega_cliente` + vehículo vendido al finalizar
- [ ] P3.7 — Rate limit de insistencia bloquea segunda acción en 24h
- [ ] P3.8 — `traslado.service.ts` compila sin errores

**✅ FASE 3 COMPLETA** — Marcar cuando TODOS los ítems anteriores estén en ✅

---

### 🔲 FASE 4 — Server Actions *(1-2 horas)*

**Estado de fase: ⬜ PENDIENTE** *(no iniciar sin Fase 3 ✅)*

#### Pasos de implementación

- [ ] 20. `solicitudes.actions.ts` → `aprobarSolicitudAction()`: usar `usuarioTieneSucursal`
- [ ] 21. `solicitudes.actions.ts` → `priorizarSolicitudAction()`: usar `usuarioTieneSucursal`
- [ ] 22. `solicitudes.actions.ts` → `cancelarSolicitudAction()`: usar `usuarioTieneSucursal`
- [ ] 23. `solicitudes.actions.ts` → nuevo `insistirSolicitudAction()`
- [ ] 24. `solicitudes.actions.ts` → nuevo `asignarEncargadoAction()`
- [ ] 25. Crear `src/app/actions/traslados.actions.ts` completo

#### 🧪 Plan de pruebas — Fase 4

```bash
# PRUEBA 4.1: Compilación sin errores
npx tsc --noEmit
# ESPERADO: 0 errores
```

**Prueba 4.2 — Jefe Local multi-sucursal puede aprobar solicitudes de todas sus sucursales**

1. Crear usuario `jefe_local` con 2 sucursales asignadas en `usuario_sucursal`
2. Crear solicitud en sucursal 1 (la que NO es la `sucursal_id` principal)
3. Iniciar sesión como ese `jefe_local`
4. Intentar aprobar la solicitud de sucursal 1
5. **ESPERADO**: aprobación exitosa (antes del fix fallaba)

**Prueba 4.3 — Jefe Local NO puede aprobar solicitudes fuera de sus sucursales**

1. Con el mismo usuario, intentar aprobar una solicitud de una sucursal 3 (no asignada)
2. **ESPERADO**: error "Solo puedes aprobar solicitudes de tus sucursales asignadas"

**Prueba 4.4 — Jefe Local puede priorizar solicitudes de todas sus sucursales**

1. Mismo `jefe_local` con 2 sucursales
2. Priorizar una solicitud de sucursal 2 (no principal)
3. **ESPERADO**: priorización exitosa

**Prueba 4.5 — `insistirSolicitudAction` funciona desde la UI**

1. Como ejecutivo, abrir modal de solicitud propia en estado activo
2. Hacer clic en "Insistir"
3. **ESPERADO**: mensaje de éxito, botón deshabilitado con countdown 24h

**Prueba 4.6 — `asignarEncargadoAction` cambia estado a `asignada`**

1. Como logística, asignarse como encargado de una solicitud `aprobada` o `priorizada`
2. Verificar: `estado = 'asignada'`, `logistica_id` = id del usuario logística
3. **ESPERADO**: ambos campos actualizados

**Prueba 4.7 — `traslados.actions.ts` compila y exporta las funciones esperadas**

```bash
grep -n "export async function" src/app/actions/traslados.actions.ts
# ESPERADO: crearTrasladoAction, despacharTrasladoAction, recibirTrasladoAction
```

**Checklist de pruebas Fase 4:**

- [ ] P4.1 — `tsc --noEmit` sin errores
- [ ] P4.2 — JL multi-sucursal puede aprobar en sucursal no-principal
- [ ] P4.3 — JL NO puede aprobar en sucursal ajena
- [ ] P4.4 — JL puede priorizar en todas sus sucursales
- [ ] P4.5 — `insistirSolicitudAction` registra y bloquea correctamente
- [ ] P4.6 — `asignarEncargadoAction` actualiza estado a `asignada`
- [ ] P4.7 — `traslados.actions.ts` exporta las funciones requeridas

**✅ FASE 4 COMPLETA** — Marcar cuando TODOS los ítems anteriores estén en ✅

---

### 🔲 FASE 5 — UI Solicitudes existente *(3-4 horas)*

**Estado de fase: ⬜ PENDIENTE** *(no iniciar sin Fase 4 ✅)*

#### Pasos de implementación

- [ ] 26. `SolicitudesClient.tsx` → `estadoConfig`: renombrar todos los labels
- [ ] 27. `SolicitudesClient.tsx` → `tipoSolicitudConfig`: "venta" → "Sala de venta"
- [ ] 28. `SolicitudesClient.tsx` → ocultar `posicion_prioridad` a ejecutivos
- [ ] 29. `SolicitudesClient.tsx` → agregar botón **Insistir** (ejecutivos, sol. propia, estado activo)
- [ ] 30. `SolicitudesClient.tsx` → label `fecha_limite` → "Fecha/hora límite"
- [ ] 31. `SolicitudesClient.tsx` → label `fecha_tentativa_despacho` → "Fecha estimada"
- [ ] 32. `SolicitudesClient.tsx` → indicador visual de atraso (normal/próxima/atrasada)
- [ ] 33. `SolicitudesClient.tsx` → filtro de visibilidad usando `getSolicitudesFiltradas`
- [ ] 34. `SolicitudesClient.tsx` → label "Origen de solicitud" (reemplaza "Sucursal de origen")
- [ ] 35. `SolicitudDetalleModal.tsx` → sección "Encargado de solicitud" (`logistica_id`)
- [ ] 36. `SolicitudDetalleModal.tsx` → nuevas fechas en timeline de trazabilidad
- [ ] 37. `SolicitudDetalleModal.tsx` → ocultar prioridad a ejecutivos
- [ ] 38. `solicitudes/page.tsx` → pasar `sucursales_asignadas` del JL al client component

#### 🧪 Plan de pruebas — Fase 5

Pruebas visuales en el navegador con `npm run dev`:

**Prueba 5.1 — Labels de estado correctos (inspección visual)**

1. Abrir `/solicitudes` como admin
2. Verificar que los badges de estado muestran:
   - `pendiente_aprobacion` → badge "Pendiente" (no "Pendiente Aprobación")
   - `entregada` → badge "Recepcionada"
   - `finalizada` → badge "Entregado a cliente"
   - `en_transito` → badge "En tránsito"
3. **ESPERADO**: todos los labels correctos según la tabla de nomenclatura

**Prueba 5.2 — "Sala de venta" en formulario de creación**

1. Como ejecutivo, abrir modal de nueva solicitud
2. Verificar que el campo de tipo muestra "Sala de venta" (no "Venta")
3. **ESPERADO**: label actualizado

**Prueba 5.3 — Prioridad oculta para ejecutivos**

1. Iniciar sesión como ejecutivo
2. Abrir una solicitud propia que esté en estado `priorizada`
3. Verificar que NO aparece la posición en la cola ni el número de prioridad
4. Iniciar sesión como `jefe_local` y abrir la misma solicitud → SÍ debe aparecer
5. **ESPERADO**: prioridad invisible para ejecutivos, visible para JL y logística

**Prueba 5.4 — Botón Insistir visible solo para ejecutivos en sus solicitudes**

1. Como ejecutivo, ir a `/solicitudes`
2. En una solicitud propia en estado `asignada` → debe aparecer botón "Insistir"
3. En una solicitud de OTRO ejecutivo → NO debe aparecer
4. Como `jefe_local` → NO debe aparecer en ninguna solicitud
5. **ESPERADO**: visibilidad condicionada correctamente

**Prueba 5.5 — Labels de fechas correctos**

1. Abrir modal de creación de solicitud
2. Verificar que el campo de fecha muestra "Fecha/hora límite" (no "Fecha límite" o "Tentativa")
3. En modal de detalle de solicitud calendarizada → verificar "Fecha estimada"
4. **ESPERADO**: ambos labels actualizados

**Prueba 5.6 — Indicador visual de atraso**

1. Modificar manualmente en BD `fecha_limite` de una solicitud activa a ayer (pasada)
   ```sql
   UPDATE public.solicitud SET fecha_limite = now() - interval '1 day'
   WHERE id = '<UUID>' AND estado NOT IN ('finalizada','cancelada','rechazada');
   ```
2. Recargar `/solicitudes`
3. **ESPERADO**: la solicitud muestra indicador rojo/borde de atraso
4. Cambiar `fecha_limite` a mañana → indicador normal
5. Cambiar a pasado mañana → sin indicador especial

**Prueba 5.7 — Encargado de solicitud en modal de detalle**

1. Asignar un encargado logístico a una solicitud (paso 4.6)
2. Abrir el modal de detalle de esa solicitud como cualquier rol
3. **ESPERADO**: aparece sección "Encargado de solicitud" con nombre del logístico

**Prueba 5.8 — Nuevas fechas en trazabilidad**

1. Tomar una solicitud que haya pasado por todo el flujo (crear, aprobar, calendarizar, despachar, recepcionar, finalizar)
2. Abrir su modal de detalle → pestaña de trazabilidad
3. **ESPERADO**: se ven los timestamps de cada transición incluyendo `fecha_confirmacion`, `fecha_recepcion`, `fecha_entrega_cliente`

**Prueba 5.9 — "Origen de solicitud" no aparece en cards**

1. Ir a `/solicitudes` como cualquier rol
2. Verificar que en las tarjetas de solicitud NO aparece el texto "Sucursal de origen"
3. En modal de detalle → verificar que aparece "Origen" (no eliminado, solo reubicado)
4. **ESPERADO**: sin "Sucursal de origen" en lista, sí en detalle

**Prueba 5.10 — Funcionalidades existentes no rotas**

1. Crear una solicitud nueva como ejecutivo → debe funcionar
2. Cancelar una solicitud como JL → debe funcionar
3. Subir un documento a una solicitud → debe funcionar
4. Ver auditoría de una solicitud → debe funcionar
5. **ESPERADO**: todas las funcionalidades previas sin regresión

**Checklist de pruebas Fase 5:**

- [ ] P5.1 — Labels de estado correctos visualmente
- [ ] P5.2 — "Sala de venta" en formulario de creación
- [ ] P5.3 — Prioridad oculta para ejecutivos
- [ ] P5.4 — Botón Insistir visible solo donde debe
- [ ] P5.5 — Labels de fecha actualizados
- [ ] P5.6 — Indicador de atraso funciona con fecha pasada/futura
- [ ] P5.7 — Encargado de solicitud visible en modal
- [ ] P5.8 — Nuevas fechas en timeline de trazabilidad
- [ ] P5.9 — "Origen de solicitud" reubicado correctamente
- [ ] P5.10 — Sin regresiones en funcionalidades existentes

**✅ FASE 5 COMPLETA** — Marcar cuando TODOS los ítems anteriores estén en ✅

---

### 🔲 FASE 6 — UI Traslados Internos *(3 horas)*

**Estado de fase: ⬜ PENDIENTE** *(no iniciar sin Fase 5 ✅)*

#### Pasos de implementación

- [ ] 39. Crear `src/app/solicitudes/traslados/page.tsx`
- [ ] 40. Crear `src/app/solicitudes/traslados/TrasladosClient.tsx`

#### 🧪 Plan de pruebas — Fase 6

**Prueba 6.1 — Vista accesible para logística**

1. Iniciar sesión como `logistica`
2. Navegar a `/solicitudes/traslados`
3. **ESPERADO**: página carga sin error 404 ni error de permisos

**Prueba 6.2 — Ejecutivo NO puede acceder**

1. Iniciar sesión como `ejecutivo`
2. Navegar a `/solicitudes/traslados`
3. **ESPERADO**: redirección a `/solicitudes` o mensaje de "Sin permisos"

**Prueba 6.3 — Crear traslado interno**

1. Como `logistica`, ir a `/solicitudes/traslados`
2. Crear un nuevo traslado: origen → destino, seleccionar 1 vehículo VENDIDO
3. **ESPERADO**: traslado creado con estado `pendiente`, slot reservado en sucursal destino

**Prueba 6.4 — Verificar reserva de slot al crear traslado**

```sql
-- Antes de crear:
SELECT slots, slots_ocupados, slots_reservados FROM public.sucursal WHERE id = <destino_id>;

-- Después de crear el traslado:
SELECT slots, slots_ocupados, slots_reservados FROM public.sucursal WHERE id = <destino_id>;
-- ESPERADO: slots_reservados +1, slots_ocupados +1
```

**Prueba 6.5 — Despachar traslado**

1. Con traslado en estado `pendiente`, hacer clic en "Despachar"
2. **ESPERADO**: estado cambia a `en_transito`, `fecha_despacho` registrada

**Prueba 6.6 — Jefe Local ve traslados que llegan a su sucursal**

1. Iniciar sesión como `jefe_local` de la sucursal destino
2. Navegar a `/solicitudes/traslados` (o donde se muestre al JL)
3. **ESPERADO**: ve el traslado pendiente/en tránsito hacia su sucursal

**Prueba 6.7 — Jefe Local NO puede rechazar un traslado**

1. Como `jefe_local` destino, verificar que NO existe botón "Rechazar" en el traslado
2. **ESPERADO**: solo puede recepcionar, no rechazar

**Prueba 6.8 — Recepcionar traslado y verificar slots**

```sql
-- Antes de recepcionar (sucursal destino):
SELECT slots_ocupados, slots_reservados FROM public.sucursal WHERE id = <destino_id>;
```

1. Como `jefe_local` destino, recepcionar el traslado
2. **ESPERADO**: estado `recepcionado`, `fecha_recepcion` registrada

```sql
-- Después de recepcionar:
SELECT slots_ocupados, slots_reservados FROM public.sucursal WHERE id = <destino_id>;
-- ESPERADO: slots_reservados -1, slots_ocupados recalculado
SELECT ubicacion, disponibilidad FROM public.vehiculo JOIN public.solicitud_vehiculo... ;
-- ESPERADO: vehiculo.ubicacion = destino_id, disponibilidad SIGUE SIENDO 'vendido'
```

**Checklist de pruebas Fase 6:**

- [ ] P6.1 — Ruta `/solicitudes/traslados` carga para logística
- [ ] P6.2 — Ejecutivo no puede acceder a traslados
- [ ] P6.3 — Crear traslado interno funciona
- [ ] P6.4 — Slot reservado al crear traslado
- [ ] P6.5 — Despachar traslado funciona
- [ ] P6.6 — JL destino ve sus traslados pendientes
- [ ] P6.7 — JL NO puede rechazar un traslado
- [ ] P6.8 — Recepción actualiza slots y mantiene vehículo como VENDIDO

**✅ FASE 6 COMPLETA** — Marcar cuando TODOS los ítems anteriores estén en ✅

---

### 🔲 FASE 7 — Slots multi-sucursal *(2 horas)*

**Estado de fase: ⬜ PENDIENTE** *(no iniciar sin Fase 6 ✅)*

#### Pasos de implementación

- [ ] 41. `TopNavbar.tsx` → prop `sucursales_asignadas` + badge/dropdown de slots (JL)
- [ ] 42. Crear `src/app/logistica/slots/page.tsx` + `SlotsClient.tsx`

#### 🧪 Plan de pruebas — Fase 7

**Prueba 7.1 — Badge de slots visible en navbar para JL**

1. Iniciar sesión como `jefe_local` con 2+ sucursales asignadas
2. Verificar que en la barra superior aparece un elemento con información de slots
3. **ESPERADO**: badge/ícono con número de slots disponibles visible

**Prueba 7.2 — Badge muestra datos correctos**

1. El badge debe mostrar slots de TODAS las sucursales asignadas al JL (no solo la principal)
2. Comparar con los datos en BD:
   ```sql
   SELECT nombre, slots, slots_ocupados, (slots - slots_ocupados) AS disponibles
   FROM public.sucursal
   WHERE id IN (
     SELECT sucursal_id FROM public.usuario_sucursal WHERE usuario_id = '<JL_UUID>'
     UNION SELECT sucursal_id FROM public.usuario WHERE id = '<JL_UUID>'
   );
   ```
3. **ESPERADO**: los números en el badge coinciden con los de BD

**Prueba 7.3 — Badge NO aparece para ejecutivos**

1. Iniciar sesión como `ejecutivo`
2. Verificar que NO hay badge de slots en el navbar
3. **ESPERADO**: sin badge

**Prueba 7.4 — Vista `/logistica/slots` accesible**

1. Como `jefe_local`, navegar a `/logistica/slots`
2. **ESPERADO**: página carga mostrando slots de todas las sucursales asignadas

**Prueba 7.5 — Slots actualizados en tiempo real después de operación**

1. Crear una solicitud nueva con destino a sucursal del JL
2. Sin recargar, verificar si el badge se actualiza (o tras recarga)
3. **ESPERADO**: slots_ocupados aumenta en el badge/vista

**Checklist de pruebas Fase 7:**

- [ ] P7.1 — Badge de slots visible en navbar para JL
- [ ] P7.2 — Badge muestra datos correctos de todas las sucursales
- [ ] P7.3 — Badge NO aparece para ejecutivos
- [ ] P7.4 — Vista `/logistica/slots` carga correctamente
- [ ] P7.5 — Slots se reflejan actualizados tras operaciones

**✅ FASE 7 COMPLETA** — Marcar cuando TODOS los ítems anteriores estén en ✅

---

### 🔲 FASE 8 — FAQ *(1 hora)*

**Estado de fase: ⬜ PENDIENTE** *(no iniciar sin Fase 7 ✅)*

#### Pasos de implementación

- [ ] 43. Crear `src/app/faq/page.tsx` reutilizando componentes del diseño actual

#### 🧪 Plan de pruebas — Fase 8

**Prueba 8.1 — Ruta `/faq` carga sin errores**

1. Navegar a `/faq` con cualquier sesión activa
2. **ESPERADO**: página carga sin 404 ni error de JS

**Prueba 8.2 — Accesible para todos los roles**

- [ ] Verificar como `ejecutivo` → carga ✅
- [ ] Verificar como `jefe_local` → carga ✅
- [ ] Verificar como `logistica` → carga ✅
- [ ] Verificar como `administrador` → carga ✅

**Prueba 8.3 — Contenido estructurado**

1. La página debe tener al menos 5 preguntas frecuentes relevantes al flujo de solicitudes
2. **ESPERADO**: preguntas agrupadas por categoría (Solicitudes, Estados, Vehículos, etc.)

**Prueba 8.4 — Diseño consistente con el resto del sistema**

1. Verificar que usa el mismo font, colores y componentes del diseño actual
2. **ESPERADO**: visualmente coherente con `/solicitudes`

**Checklist de pruebas Fase 8:**

- [ ] P8.1 — Ruta `/faq` carga sin errores
- [ ] P8.2 — Accesible para todos los roles
- [ ] P8.3 — Contenido con mínimo 5 preguntas frecuentes relevantes
- [ ] P8.4 — Diseño consistente con el sistema

**✅ FASE 8 COMPLETA** — Marcar cuando TODOS los ítems anteriores estén en ✅

---

### 🔲 FASE 9 — QA integral y trazabilidad *(2-3 horas)*

**Estado de fase: ⬜ PENDIENTE** *(no iniciar sin Fase 8 ✅)*

#### Pasos de implementación

- [ ] 44. Verificar registro de auditoría en todos los eventos del flujo
- [ ] 45. Verificar slots: reserva en traslados, liberación al recepcionar, no liberar al entregar a cliente

#### 🧪 Plan de pruebas — Fase 9 (flujo completo end-to-end)

**Prueba 9.1 — Flujo completo de solicitud normal (happy path)**

Ejecutar en orden, verificando cada paso:

| Paso | Actor      | Acción                             | Verificación en BD                                                                                   |
| ---- | ---------- | ----------------------------------- | ----------------------------------------------------------------------------------------------------- |
| 1    | Ejecutivo  | Crea solicitud tipo "Sala de venta" | `estado='pendiente_aprobacion'`, `fecha_creacion` ≠ NULL                                         |
| 2    | JL         | Aprueba con fecha límite           | `estado='aprobada'`, `fecha_confirmacion` ≠ NULL                                                 |
| 3    | JL         | Prioriza                            | `estado='priorizada'`, `posicion_prioridad` ≠ NULL                                               |
| 4    | Logística | Asigna encargado                    | `estado='asignada'`, `logistica_id` ≠ NULL                                                       |
| 5    | Logística | Calendariza                         | `estado='calendarizada'`, `fecha_tentativa_despacho` ≠ NULL                                      |
| 6    | Logística | Despacha                            | `estado='despachada'`, `fecha_despacho` ≠ NULL, `fecha_inicio_transito` ≠ NULL                |
| 7    | JL destino | Recepciona                          | `estado='entregada'`, `fecha_recepcion` ≠ NULL, vehículo `liberado`                           |
| 8    | Ejecutivo  | Entrega a cliente                   | `estado='finalizada'`, `fecha_entrega_cliente` ≠ NULL, vehículo `vendido`, `ubicacion=NULL` |

```sql
-- Verificación final del flujo en BD:
SELECT
  estado,
  fecha_confirmacion,
  fecha_tentativa_despacho AS fecha_estimada,
  fecha_despacho,
  fecha_inicio_transito,
  fecha_recepcion,
  fecha_entrega_cliente
FROM public.solicitud
WHERE id = '<UUID_solicitud_del_flujo>';
-- ESPERADO: todos los campos con valores no NULL
```

**Prueba 9.2 — Trazabilidad completa registrada en auditoría**

```sql
SELECT accion, created_at, valor_nuevo
FROM public.auditoria
WHERE entidad = 'solicitud'
  AND entidad_id = '<UUID_solicitud_del_flujo>'
ORDER BY created_at ASC;
-- ESPERADO: filas para: creacion, aprobacion, priorizacion, calendarizacion,
--           despacho, entrega, finalizacion
```

**Prueba 9.3 — Slots correctos durante todo el flujo**

```sql
-- Verificar slots de sucursal destino durante el flujo:
-- ANTES de crear solicitud: slots_ocupados = N
-- DESPUÉS de crear: slots_ocupados = N+1, slots_reservados = N+1
-- DESPUÉS de recepcionar: slots_reservados = N, slots_ocupados recalculado
-- DESPUÉS de finalizar (vendido): slots_ocupados recalculado (sin el vehículo)
SELECT nombre, slots, slots_ocupados, slots_reservados FROM public.sucursal WHERE id = <destino_id>;
```

**Prueba 9.4 — Cancelación libera slots**

1. Crear solicitud con destino y vehículo
2. Cancelar la solicitud (pre-despacho)
3. Verificar que `slots_ocupados` y `slots_reservados` vuelven a valores previos
4. **ESPERADO**: slots liberados al cancelar

**Prueba 9.5 — Prueba de permisos cruzados (seguridad)**

| Intento                                                                   | Debe FALLAR          |
| ------------------------------------------------------------------------- | -------------------- |
| Ejecutivo intentando aprobar su propia solicitud                          | ✅ Error de permisos |
| Logística intentando crear una solicitud                                 | ✅ Error de permisos |
| JL de sucursal A intentando aprobar solicitud de sucursal B (no asignada) | ✅ Error de permisos |
| Ejecutivo B intentando insistir en solicitud de Ejecutivo A               | ✅ Error de permisos |
| Ejecutivo intentando ver solicitudes de otros ejecutivos                  | ✅ No aparecen       |
| Logística sin zona asignada viendo solicitudes                           | ✅ Lista vacía      |

**Prueba 9.6 — Sin regresiones en funcionalidades pre-existentes**

- [ ] Login / Logout funciona
- [ ] Importación CSV de vehículos funciona (no tocada)
- [ ] Gestión de usuarios admin funciona (no tocada)
- [ ] Subida de documentos a solicitudes funciona
- [ ] Vista de auditoría histórica muestra datos previos al desarrollo
- [ ] Vista de calendarizaciones en `/logistica/calendarizaciones` funciona

**Prueba 9.7 — Flujo de traslado interno end-to-end**

1. Logística crea traslado de sucursal A → B con vehículo vendido
2. Verificar: `traslado_interno.estado = 'pendiente'`, slot reservado en B
3. Logística despacha: `estado = 'en_transito'`
4. JL de B recepciona: `estado = 'recepcionado'`, slot liberado en B, `vehiculo.ubicacion = B`
5. Verificar que `vehiculo.disponibilidad` sigue siendo `'vendido'` (no liberado)

**Prueba 9.8 — Performance: carga de `/solicitudes` razonable**

1. Con 50+ solicitudes en BD
2. Navegar a `/solicitudes`
3. **ESPERADO**: carga < 3 segundos, sin errores en consola del navegador

**Checklist de pruebas Fase 9:**

- [ ] P9.1 — Flujo completo happy path ejecutado correctamente
- [ ] P9.2 — Trazabilidad completa en tabla `auditoria`
- [ ] P9.3 — Slots correctos en cada etapa del flujo
- [ ] P9.4 — Cancelación libera slots correctamente
- [ ] P9.5 — Todos los intentos de permisos cruzados fallan correctamente
- [ ] P9.6 — Sin regresiones en funcionalidades previas
- [ ] P9.7 — Traslado interno end-to-end correcto
- [ ] P9.8 — Performance aceptable con datos reales

**✅ FASE 9 COMPLETA** — Marcar cuando TODOS los ítems anteriores estén en ✅

---

## ✅ PROYECTO COMPLETO

Cuando las 9 fases estén completas y verificadas:

- [ ] Fase 1 ✅
- [ ] Fase 2 ✅
- [ ] Fase 3 ✅
- [ ] Fase 4 ✅
- [ ] Fase 5 ✅
- [ ] Fase 6 ✅
- [ ] Fase 7 ✅
- [ ] Fase 8 ✅
- [ ] Fase 9 ✅

**🎉 Módulo Solicitudes + Logística + Operación completamente funcional y verificado.**

---

## Detalle técnico por punto del requerimiento

### #1 — Modal de creación

- **"Venta" → "Sala de venta"**: solo cambiar label en el `<select>` del formulario. El valor `'venta'` permanece en DB.
- **"Fecha/hora límite"**: campo `fecha_limite` ya existe. Cambiar solo el `<label>` HTML.
- **La propone el Ejecutivo**: ya funciona así — es opcional al crear. JL la confirma/modifica al aprobar.

### #2 — Origen de solicitud

- En **lista/cards**: no mostrar como columna prominente. Usar solo "Destino" y "Estado".
- En **modal de detalle**: mostrar como "Origen" en la sección de resumen.
- En **trazabilidad/auditoría**: siempre preservar el dato histórico.

### #14 — Atrasos visuales

```typescript
function getEstadoAtraso(sol: SolicitudLista): 'normal' | 'proxima' | 'atrasada' | 'completada' {
  const terminados = ['entregada', 'finalizada', 'cancelada', 'rechazada'];
  if (terminados.includes(sol.estado)) return 'completada';
  if (!sol.fecha_limite) return 'normal';
  const diff = (new Date(sol.fecha_limite).getTime() - Date.now()) / 86400000;
  if (diff < 0) return 'atrasada';   // borde rojo
  if (diff <= 2) return 'proxima';   // borde amarillo
  return 'normal';                   // sin borde especial
}
```

### #15 — Botón Insistir

- Solo ejecutivos, en sus propias solicitudes, en estados activos pre-entrega.
- Rate limit: consultar `insistencia` donde `solicitud_id = X AND usuario_id = Y AND created_at > now() - interval '24 hours'`.
- Si ya insistió en las últimas 24h: mostrar tiempo restante, deshabilitar botón.
- Registrar en `insistencia` + entrada en `auditoria` + observación `[INSISTENCIA]`.

### #17 — Slots en navbar para JL

```tsx
// Agregar a TopNavbar.tsx
interface TopNavbarProps {
  // ... props existentes ...
  sucursalesSlots?: Array<{ id: number; nombre: string | null; slots: number; slots_ocupados: number }>;
}
// Mostrar dropdown/popover con conteo de slots por sucursal
// Solo si rol === 'jefe_local' y sucursalesSlots.length > 0
```

### #19 — Slots en traslados internos

- Al crear `traslado_interno`: verificar slots en `sucursal_destino` (misma validación que solicitudes normales).
- Incrementar `slots_reservados` y `slots_ocupados` al crear.
- Al `recepcionado`: decrementar `slots_reservados` y recalcular con `fn_recalcular_slots_ocupados`.
- El vehículo sigue `VENDIDO` — no cambia `disponibilidad` a `liberado`.

---

## Nomenclatura final UI (tabla de cambios)

| Elemento                           | Actual               | Nuevo                    |
| ---------------------------------- | -------------------- | ------------------------ |
| Tipo "venta"                       | "Venta"              | "Sala de venta"          |
| `en_transito` label              | "En Tránsito"       | "En tránsito"           |
| `entregada` label                | "Entregada"          | "Recepcionada"           |
| `finalizada` label               | "Finalizada"         | "Entregado a cliente"    |
| `fecha_tentativa_despacho` label | "Tentativa"          | "Fecha estimada"         |
| Origen label                       | "Sucursal de origen" | "Origen de solicitud"    |
| `logistica_id` label             | "Logística"         | "Encargado de solicitud" |
| Fecha aprobación                  | Sin label            | "Fecha de confirmación" |

---

## ADVERTENCIAS CRÍTICAS

> **ENUM ADD VALUE**: Las migraciones 2 y 3 deben ejecutarse en transacciones separadas en el SQL Editor de Supabase. PostgreSQL error 55P04 impide usar un valor nuevo de enum en la misma transacción donde se agregó.

> **NO MODIFICAR `organizacion.service.ts`**: Este archivo es propiedad de DEV 1. Solo importar y consumir sus funciones.

> **TRIGGERS EXISTENTES**: `fn_entregar_solicitud_vehiculos` y `fn_finalizar_solicitud_vehiculos` ya manejan la lógica de vehículos en DB. No duplicar en TypeScript. Solo hacer el UPDATE de estado y dejar que los triggers DB hagan su trabajo.

> **`logistica_id` ya existe**: No crear `encargado_logistica_id`. Reusar `logistica_id` como "encargado de la solicitud". Documentar en código con comentario.

> **Validación multi-sucursal JL**: El cambio más urgente y de mayor impacto es en `aprobarSolicitudAction`, `priorizarSolicitudAction` y `cancelarSolicitudAction`. Sin este cambio, un Jefe Local con 3 sucursales solo puede gestionar solicitudes de su sucursal principal.
