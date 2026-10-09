import { createAdminClient } from '@/lib/supabase/admin';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  CreateSolicitudInput,
  SolicitudLista,
  VehiculoInventario,
  ObservacionEntry,
  AuditoriaEntry,
  DocumentoSolicitud,
  InsistenciaEntry,
} from '@/types/solicitud.types';
import { UserRole } from '@/types/auth.types';
import { DisponibilidadVehiculo } from '@/types/sucursal.types';
import { OrganizacionService } from '@/services/organizacion.service';
import { esFechaAnteriorAHoy } from '@/lib/fechas';
import { mensajeErrorUsuario } from '@/lib/errores';
import { validarContenidoArchivo } from '@/lib/archivos';
import { admiteInteraccion, MENSAJE_SOLICITUD_CERRADA } from '@/lib/estadosSolicitud';
import {
  textoObservacionRecepcion,
  validarMotivoCancelacion,
  validarRecepcion,
  type DatosRecepcion,
} from '@/lib/recepcion';

/**
 * Estados en los que el vehículo sigue RESERVADO (no puede moverse a otra
 * solicitud). Debe coincidir con la lista de estados usada por
 * `public.fn_recalcular_slots_ocupados` (migración 20260928_triggers_fechas.sql),
 * que hoy solo actualiza el conteo informativo de slots (sin validar capacidad).
 */
export const ESTADOS_ACTIVOS_RESERVA = [
  'pendiente_aprobacion',
  'aprobada',
  'pendiente',
  'priorizada',
  'asignada',
  'calendarizada',
  'en_transito',
] as const;

const ESTADOS_PRE_DESPACHO = [
  'pendiente_aprobacion',
  'aprobada',
  'pendiente',
  'priorizada',
];

/** Estados sobre los que Logística (o admin) puede tomar el control operativo. */
const ESTADOS_ASIGNABLES = ['aprobada', 'priorizada'];

/** Estados en los que el Executive puede pedir insistencia sobre su solicitud. */
const ESTADOS_INSISTIBLES = [
  'pendiente_aprobacion',
  'aprobada',
  'priorizada',
  'asignada',
  'calendarizada',
];

/** Respuesta cuando otro usuario cambió la solicitud entre la lectura y la escritura. */
export const MENSAJE_CONFLICTO_ESTADO =
  'La solicitud cambió de estado mientras realizabas la acción. Recarga la página e inténtalo de nuevo.';

/** Cooldown para la insistencia del Ejecutivo: 24 horas. */
export const COOLDOWN_INSISTENCIA_HORAS = 24;

const BUCKET_DOCUMENTOS = 'solicitud-documentos';
const MAX_TAMANO_DOCUMENTO = 10 * 1024 * 1024;

interface SolicitudRawRow {
  id: string;
  sucursal: number;
  sucursal_destino: number | null;
  estado: SolicitudLista['estado'];
  tipo_solicitud: SolicitudLista['tipo_solicitud'];
  posicion_prioridad: number | null;
  ejecutivo_id: string | null;
  jefe_local_id: string | null;
  logistica_id: string | null;
  fecha_creacion: string | null;
  fecha_tentativa_despacho: string | null;
  fecha_despacho: string | null;
  fecha_entrega: string | null;
  fecha_limite: string | null;
  fecha_confirmacion: string | null;
  fecha_inicio_transito: string | null;
  fecha_recepcion: string | null;
  fecha_entrega_cliente: string | null;
  motivo_cancelacion: string | null;
  direccion_evento: string | null;
  titulo_evento: string | null;
  suc: { nombre: string | null; zona_id: number | null } | null;
  destino: { nombre: string | null } | null;
  ejecutivo: { nombre: string; apellido: string } | null;
  jefe: { nombre: string; apellido: string } | null;
  logistica: { nombre: string; apellido: string } | null;
  solicitud_vehiculo: Array<{
    id: string;
    disponibilidad: DisponibilidadVehiculo;
    vehiculo: {
      chasis: string;
      patente: string;
      marca: string;
      modelo: string;
      anio: number;
      color: string | null;
    } | null;
  }> | null;
}

function persona(p: { nombre: string; apellido: string } | null): string | null {
  return p ? `${p.nombre} ${p.apellido}`.trim() : null;
}

const SOLICITUD_SELECT = `id, sucursal, sucursal_destino, estado, tipo_solicitud, posicion_prioridad,
  ejecutivo_id, jefe_local_id, logistica_id,
  fecha_creacion, fecha_tentativa_despacho, fecha_despacho, fecha_entrega, fecha_limite, motivo_cancelacion,
  fecha_confirmacion, fecha_inicio_transito, fecha_recepcion, fecha_entrega_cliente,
  direccion_evento, titulo_evento,
  suc:sucursal!solicitud_sucursal_fkey(nombre, zona_id),
  destino:sucursal!solicitud_sucursal_destino_fkey(nombre),
  ejecutivo:ejecutivo_id(nombre, apellido),
  jefe:jefe_local_id(nombre, apellido),
  logistica:logistica_id(nombre, apellido),
  solicitud_vehiculo(id, disponibilidad, vehiculo(chasis, patente, marca, modelo, anio, color))`;

function mapRow(row: SolicitudRawRow): SolicitudLista {
  return {
    id: row.id,
    sucursal: row.sucursal,
    sucursal_nombre: row.suc?.nombre ?? null,
    sucursal_destino: row.sucursal_destino,
    sucursal_destino_nombre: row.destino?.nombre ?? null,
    estado: row.estado,
    tipo_solicitud: row.tipo_solicitud,
    posicion_prioridad: row.posicion_prioridad,
    ejecutivo_id: row.ejecutivo_id,
    ejecutivo_nombre: persona(row.ejecutivo),
    jefe_local_id: row.jefe_local_id,
    jefe_local_nombre: persona(row.jefe),
    logistica_id: row.logistica_id,
    logistica_nombre: persona(row.logistica),
    fecha_creacion: row.fecha_creacion,
    fecha_tentativa_despacho: row.fecha_tentativa_despacho,
    fecha_despacho: row.fecha_despacho,
    fecha_entrega: row.fecha_entrega,
    fecha_limite: row.fecha_limite,
    fecha_confirmacion: row.fecha_confirmacion ?? null,
    fecha_inicio_transito: row.fecha_inicio_transito ?? null,
    fecha_recepcion: row.fecha_recepcion ?? null,
    fecha_entrega_cliente: row.fecha_entrega_cliente ?? null,
    motivo_cancelacion: row.motivo_cancelacion,
    direccion_evento: row.direccion_evento,
    titulo_evento: row.titulo_evento,
    sucursal_zona_id: row.suc?.zona_id ?? null,
    vehiculos: (row.solicitud_vehiculo || [])
      .filter((sv) => sv.vehiculo)
      .map((sv) => ({
        solicitud_vehiculo_id: sv.id,
        disponibilidad: sv.disponibilidad,
        patente: sv.vehiculo!.patente,
        chasis: sv.vehiculo!.chasis,
        marca: sv.vehiculo!.marca,
        modelo: sv.vehiculo!.modelo,
        anio: sv.vehiculo!.anio,
        color: sv.vehiculo!.color,
      })),
  };
}

export function getEncargadoNombre(sol: SolicitudLista): string | null {
  if (sol.ejecutivo_id) return sol.ejecutivo_nombre;
  if (sol.jefe_local_id) return sol.jefe_local_nombre;
  return null;
}

export function getEncargadoId(sol: SolicitudLista): string | null {
  if (sol.ejecutivo_id) return sol.ejecutivo_id;
  if (sol.jefe_local_id) return sol.jefe_local_id;
  return null;
}

export interface SolicitudMinima {
  id: string;
  estado: SolicitudLista['estado'];
  sucursal: number;
  sucursal_destino: number | null;
  ejecutivo_id: string | null;
  jefe_local_id: string | null;
  logistica_id: string | null;
  tipo_solicitud: SolicitudLista['tipo_solicitud'];
  posicion_prioridad: number | null;
  fecha_tentativa_despacho: string | null;
  fecha_despacho: string | null;
  fecha_entrega: string | null;
  fecha_inicio_transito: string | null;
}

/**
 * R16: filtros opcionales de los listados por rol. Sin opciones, los listados
 * se comportan como siempre.
 */
export interface OpcionesListado {
  /** Solo estos estados. */
  estados?: readonly string[];
  /** Fecha de despacho programada (`fecha_tentativa_despacho`) desde/hasta, `YYYY-MM-DD` inclusive. */
  programadasDesde?: string;
  programadasHasta?: string;
}

type ConsultaFiltrable = {
  in(columna: string, valores: readonly unknown[]): ConsultaFiltrable;
  gte(columna: string, valor: unknown): ConsultaFiltrable;
  lte(columna: string, valor: unknown): ConsultaFiltrable;
};

// Sin restricción genérica: los tipos de supabase-js son demasiado profundos
// para compararlos con `ConsultaFiltrable` (TS2589). La forma es la misma.
function aplicarOpcionesListado<T>(consulta: T, o: OpcionesListado): T {
  let q = consulta as unknown as ConsultaFiltrable;
  if (o.estados && o.estados.length > 0) q = q.in('estado', o.estados);
  if (o.programadasDesde) q = q.gte('fecha_tentativa_despacho', o.programadasDesde);
  if (o.programadasHasta) q = q.lte('fecha_tentativa_despacho', `${o.programadasHasta}T23:59:59.999Z`);
  return q as T;
}

export class SolicitudesService {
  static async getUsuarioRolSucursal(
    admin: SupabaseClient,
    usuarioId: string
  ): Promise<{ rol: UserRole; sucursal_id: number | null } | null> {
    try {
      const { data, error } = await admin
        .from('usuario')
        .select('rol, sucursal_id')
        .eq('id', usuarioId)
        .maybeSingle();

      if (error || !data) return null;
      return data as unknown as { rol: UserRole; sucursal_id: number | null };
    } catch (err) {
      console.error('Error en getUsuarioRolSucursal:', err);
      return null;
    }
  }

  /**
   * Sucursal donde se recepciona/entrega la solicitud: destino explícito o, en
   * eventos, la sucursal de origen.
   */
  static sucursalDeRecepcion(solicitud: SolicitudMinima): number {
    return solicitud.sucursal_destino !== null ? solicitud.sucursal_destino : solicitud.sucursal;
  }

  /**
   * VAL-03: el jefe local puede tener varias sucursales (principal + N:M), por
   * lo que la recepción NO puede validarse contra `usuario.sucursal_id` solamente.
   */
  static async usuarioPuedeRecibirEn(
    usuarioId: string,
    solicitud: SolicitudMinima
  ): Promise<boolean> {
    return OrganizacionService.usuarioTieneSucursal(usuarioId, this.sucursalDeRecepcion(solicitud));
  }

  static async getJefeLocalDeSucursal(sucursalId: number): Promise<string | null> {
    try {
      const admin = createAdminClient();

      // 1) Sucursal principal del jefe (usuario.sucursal_id)
      const { data: principal } = await admin
        .from('usuario')
        .select('id')
        .eq('rol', 'jefe_local')
        .eq('sucursal_id', sucursalId)
        .limit(1);

      if (principal && principal.length > 0) {
        return (principal[0] as { id: string }).id;
      }

      // 2) Encargado directo de la sucursal (sucursal.usuario_id)
      const encargado = await admin
        .from('sucursal')
        .select('usuario_id')
        .eq('id', sucursalId)
        .maybeSingle();

      if (encargado?.data && (encargado.data as { usuario_id: string | null }).usuario_id) {
        const jlEncargado = await admin
          .from('usuario')
          .select('id')
          .eq('id', (encargado.data as { usuario_id: string }).usuario_id)
          .eq('rol', 'jefe_local')
          .maybeSingle();

        if (jlEncargado.data) {
          return (jlEncargado.data as { id: string }).id;
        }
      }

      // 3) Sucursales adicionales del jefe (tabla N:M usuario_sucursal)
      try {
        const { data: asignadas } = await admin
          .from('usuario_sucursal')
          .select('usuario_id')
          .eq('sucursal_id', sucursalId);

        if (asignadas && asignadas.length > 0) {
          const ids = (asignadas as Array<{ usuario_id: string }>).map((r) => r.usuario_id);
          const { data: jefes } = await admin
            .from('usuario')
            .select('id')
            .in('id', ids)
            .eq('rol', 'jefe_local')
            .limit(1);

          if (jefes && jefes.length > 0) {
            return (jefes[0] as { id: string }).id;
          }
        }
      } catch (nmErr) {
        // Tabla N:M puede no existir en algunos entornos: no es fatal.
        console.warn('No se pudo consultar usuario_sucursal en getJefeLocalDeSucursal:', nmErr);
      }

      return null;
    } catch (err) {
      console.error('Error en getJefeLocalDeSucursal:', err);
      return null;
    }
  }

  static async getSolicitudes(opciones: OpcionesListado = {}): Promise<SolicitudLista[]> {
    try {
      const admin = createAdminClient();
      const { data, error } = await aplicarOpcionesListado(admin.from('solicitud').select(SOLICITUD_SELECT), opciones)
        .order('fecha_creacion', { ascending: false });

      if (error) {
        console.error('Error al listar solicitudes:', error);
        return [];
      }

      return ((data || []) as unknown as SolicitudRawRow[]).map(mapRow);
    } catch (err) {
      console.error('Error en getSolicitudes:', err);
      return [];
    }
  }

  /**
   * Solicitudes de las sucursales indicadas que esperan la aprobación del jefe
   * de local (`estado = 'pendiente_aprobacion'`). Alimenta el contador "Por
   * aprobar" del dashboard.
   *
   * `sucursalIds` vacío significa "sin alcance" y devuelve lista vacía;
   * `null` significa todas las sucursales (administrador).
   */
  static async getSolicitudesPendientesAprobacion(sucursalIds: number[] | null): Promise<SolicitudLista[]> {
    const ids = sucursalIds === null ? null : sucursalIds.filter((id) => typeof id === 'number');
    if (ids !== null && ids.length === 0) return [];

    try {
      const admin = createAdminClient();
      let query = admin.from('solicitud').select(SOLICITUD_SELECT).eq('estado', 'pendiente_aprobacion');
      if (ids !== null) query = query.in('sucursal', ids);
      const { data, error } = await query.order('fecha_creacion', { ascending: true });

      if (error) {
        console.error('Error al listar las solicitudes pendientes de aprobación:', error);
        return [];
      }

      return ((data || []) as unknown as SolicitudRawRow[]).map(mapRow);
    } catch (err) {
      console.error('Error en getSolicitudesPendientesAprobacion:', err);
      return [];
    }
  }

  /**
   * R11: solicitudes aprobadas que todavía no entran a la cola de prioridad de
   * su sucursal, de la fecha límite de entrega propuesta más próxima a la más
   * lejana. `null` = todas (administrador); una lista vacía = sin alcance.
   */
  static async getSolicitudesPorPriorizar(sucursalIds: number[] | null): Promise<SolicitudLista[]> {
    const ids = sucursalIds === null ? null : sucursalIds.filter((id) => typeof id === 'number');
    if (ids !== null && ids.length === 0) return [];

    try {
      const admin = createAdminClient();
      let query = admin
        .from('solicitud')
        .select(SOLICITUD_SELECT)
        .eq('estado', 'aprobada')
        .is('posicion_prioridad', null);
      if (ids !== null) query = query.in('sucursal', ids);
      const { data, error } = await query.order('fecha_limite', { ascending: true, nullsFirst: false });

      if (error) {
        console.error('Error al listar las solicitudes por priorizar:', error);
        return [];
      }
      return ((data || []) as unknown as SolicitudRawRow[]).map(mapRow);
    } catch (err) {
      console.error('Error en getSolicitudesPorPriorizar:', err);
      return [];
    }
  }

  /**
   * R16/R17: cantidad de reprogramaciones por solicitud, leída de la auditoría
   * (`accion = 'recalendarizacion'`). Solo incluye las que tienen alguna.
   */
  static async getConteoReprogramaciones(solicitudIds: string[]): Promise<Record<string, number>> {
    const ids = [...new Set(solicitudIds.filter(Boolean))];
    if (ids.length === 0) return {};
    try {
      const admin = createAdminClient();
      const { data, error } = await admin
        .from('auditoria')
        .select('entidad_id')
        .eq('entidad', 'solicitud')
        .eq('accion', 'recalendarizacion')
        .in('entidad_id', ids);
      if (error) {
        console.error('Error al contar reprogramaciones:', error);
        return {};
      }
      const conteo: Record<string, number> = {};
      for (const fila of (data ?? []) as Array<{ entidad_id: string }>) {
        conteo[fila.entidad_id] = (conteo[fila.entidad_id] ?? 0) + 1;
      }
      return conteo;
    } catch (err) {
      console.error('Error en getConteoReprogramaciones:', err);
      return {};
    }
  }

  /**
   * R13: solicitudes en tránsito que deben recibirse en las sucursales
   * indicadas. La sucursal de recepción es el destino (venta) o, en eventos
   * sin destino, la sucursal de origen. `null` = todas (administrador); una
   * lista vacía = sin alcance. Ordenadas por fecha límite de entrega propuesta.
   */
  static async getRecepcionesPendientes(sucursalIds: number[] | null): Promise<SolicitudLista[]> {
    const ids = sucursalIds === null ? null : sucursalIds.filter((id) => Number.isInteger(id));
    if (ids !== null && ids.length === 0) return [];

    try {
      const admin = createAdminClient();
      let query = admin.from('solicitud').select(SOLICITUD_SELECT).eq('estado', 'en_transito');
      if (ids !== null) {
        const lista = ids.join(',');
        query = query.or(`sucursal_destino.in.(${lista}),and(sucursal_destino.is.null,sucursal.in.(${lista}))`);
      }
      const { data, error } = await query.order('fecha_limite', { ascending: true, nullsFirst: false });

      if (error) {
        console.error('Error al listar las recepciones pendientes:', error);
        return [];
      }
      return ((data || []) as unknown as SolicitudRawRow[]).map(mapRow);
    } catch (err) {
      console.error('Error en getRecepcionesPendientes:', err);
      return [];
    }
  }

  /**
   * Lista de solicitudes recortada al alcance real del usuario.
   *
   * - `ejecutivo`   -> solo las suyas
   * - `jefe_local`  -> sucursal origen o destino de todas sus sucursales
   *                   (sucursal principal + las que encabeza como encargado)
   * - `logistica`   -> las sucursal origen cuya `zona_id` está en sus zonas
   * - `administrador` -> todas
   *
   * `operaciones` no gestiona solicitudes: cae en "sin alcance" (lista vacía).
   */
  static async getSolicitudesFiltradas(
    userId: string,
    rol: UserRole,
    opciones: OpcionesListado = {}
  ): Promise<SolicitudLista[]> {
    try {
      if (rol === 'operaciones') return [];

      if (rol === 'ejecutivo') {
        return await this.getSolicitudesPorEjecutivo(userId, opciones);
      }

      if (rol === 'jefe_local') {
        return await this.getSolicitudesPorJefeLocal(userId, opciones);
      }

      if (rol === 'logistica') {
        return await this.getSolicitudesPorZonas(userId, opciones);
      }

      return await this.getSolicitudes(opciones);
    } catch (err) {
      console.error('Error en getSolicitudesFiltradas:', err);
      return [];
    }
  }

  /** Ejecutivo: únicamente las solicitudes que él mismo creó. */
  private static async getSolicitudesPorEjecutivo(userId: string, opciones: OpcionesListado = {}): Promise<SolicitudLista[]> {
    const admin = createAdminClient();
    const { data, error } = await aplicarOpcionesListado(
      admin.from('solicitud').select(SOLICITUD_SELECT).eq('ejecutivo_id', userId),
      opciones
    ).order('fecha_creacion', { ascending: false });

    if (error) {
      console.error('Error al listar solicitudes del ejecutivo:', error);
      return [];
    }
    return ((data || []) as unknown as SolicitudRawRow[]).map(mapRow);
  }

  /**
   * Jefe Local: sucursal origen o sucursal destino de cualquiera de sus
   * sucursales asignadas (principal + las que encabeza como encargado). Una
   * sucursal sin asignar deja al usuario sin alcance.
   */
  private static async getSolicitudesPorJefeLocal(userId: string, opciones: OpcionesListado = {}): Promise<SolicitudLista[]> {
    const sucursales = await OrganizacionService.getUserAssignedBranches(userId);
    const ids = sucursales.map((s) => s.id).filter((id) => typeof id === 'number');

    if (ids.length === 0) return [];

    const admin = createAdminClient();
    const { data, error } = await aplicarOpcionesListado(
      admin
        .from('solicitud')
        .select(SOLICITUD_SELECT)
        .or(`sucursal.in.(${ids.join(',')}),sucursal_destino.in.(${ids.join(',')})`),
      opciones
    ).order('fecha_creacion', { ascending: false });

    if (error) {
      console.error('Error al listar solicitudes del jefe de local:', error);
      return [];
    }
    return ((data || []) as unknown as SolicitudRawRow[]).map(mapRow);
  }

  /**
   * Logística: solo ve las solicitudes cuya sucursal origen pertenece a una de
   * sus zonas. Sin zonas asignadas -> lista vacía (antes veía todas).
   */
  private static async getSolicitudesPorZonas(userId: string, opciones: OpcionesListado = {}): Promise<SolicitudLista[]> {
    const zonas = await OrganizacionService.getUserZones(userId);
    const zonaIds = zonas.map((z) => z.id).filter((id) => typeof id === 'number');

    if (zonaIds.length === 0) return [];

    const admin = createAdminClient();

    // Brecha 024: el filtro por zona se hace en la BD (antes se traían todas
    // las solicitudes y se filtraban en memoria).
    const { data: sucursales, error: sucError } = await admin
      .from('sucursal')
      .select('id')
      .in('zona_id', zonaIds);

    if (sucError) {
      console.error('Error al obtener las sucursales de las zonas:', sucError);
      return [];
    }

    const sucursalIds = ((sucursales || []) as Array<{ id: number }>).map((s) => s.id);
    if (sucursalIds.length === 0) return [];

    const { data, error } = await aplicarOpcionesListado(
      admin.from('solicitud').select(SOLICITUD_SELECT).in('sucursal', sucursalIds),
      opciones
    ).order('fecha_creacion', { ascending: false });

    if (error) {
      console.error('Error al listar solicitudes de logística:', error);
      return [];
    }

    return ((data || []) as unknown as SolicitudRawRow[]).map(mapRow);
  }

  static async getVehiculosInventario(): Promise<VehiculoInventario[]> {
    try {
      const admin = createAdminClient();

      const { data: vehiculos, error } = await admin
        .from('vehiculo')
        .select('id, chasis, patente, marca, modelo, anio, color, ubicacion')
        .order('patente', { ascending: true })
        .limit(100000);

      if (error) {
        console.error('Error al listar vehículos:', error);
        return [];
      }

      const { data: reservas, error: reservasError } = await admin
        .from('solicitud_vehiculo')
        .select('vehiculo_id, solicitud!inner(estado)')
        .eq('disponibilidad', 'reservado')
        .in('solicitud.estado', [...ESTADOS_ACTIVOS_RESERVA])
        .limit(100000);

      if (reservasError) {
        console.error('Error al consultar reservas activas:', reservasError);
      }

      const ocupados = new Set<string>(
        (reservas || []).map((r) => (r as unknown as { vehiculo_id: string }).vehiculo_id)
      );

      const { data: vendidos, error: vendidosError } = await admin
        .from('solicitud_vehiculo')
        .select('vehiculo_id')
        .eq('disponibilidad', 'vendido')
        .limit(100000);

      if (vendidosError) {
        console.error('Error al consultar vehículos vendidos:', vendidosError);
      }

      const vendidoSet = new Set<string>(
        (vendidos || []).map((r) => (r as unknown as { vehiculo_id: string }).vehiculo_id)
      );

      return ((vehiculos || []) as VehiculoInventario[])
        .filter((v) => !vendidoSet.has(v.id))
        .map((v) => ({
          ...v,
          reservado_en_activa: ocupados.has(v.id),
        }));
    } catch (err) {
      console.error('Error en getVehiculosInventario:', err);
      return [];
    }
  }

  static async getSolicitudById(id: string): Promise<SolicitudMinima | null> {
    try {
      const admin = createAdminClient();
      const { data, error } = await admin
        .from('solicitud')
        .select('id, estado, sucursal, sucursal_destino, ejecutivo_id, jefe_local_id, logistica_id, tipo_solicitud, posicion_prioridad, fecha_tentativa_despacho, fecha_despacho, fecha_entrega, fecha_inicio_transito')
        .eq('id', id)
        .maybeSingle();

      if (error || !data) return null;
      return data as unknown as SolicitudMinima;
    } catch (err) {
      console.error('Error en getSolicitudById:', err);
      return null;
    }
  }

  static async getSolicitudCompleta(id: string): Promise<SolicitudLista | null> {
    try {
      const admin = createAdminClient();
      const { data, error } = await admin
        .from('solicitud')
        .select(SOLICITUD_SELECT)
        .eq('id', id)
        .maybeSingle();

      if (error || !data) return null;
      return mapRow(data as unknown as SolicitudRawRow);
    } catch (err) {
      console.error('Error en getSolicitudCompleta:', err);
      return null;
    }
  }

  static async createSolicitud(
    input: CreateSolicitudInput,
    vehiculoIds: string[],
    usuarioId: string
  ): Promise<{ success: boolean; solicitud?: SolicitudLista; error?: string }> {
    try {
      const admin = createAdminClient();

      if (vehiculoIds.length === 0) {
        return {
          success: false,
          error: 'Debes seleccionar al menos un vehículo: una solicitud no puede existir sin vehículos.',
        };
      }

      const insertData: Record<string, unknown> = {
        sucursal: input.sucursal,
        tipo_solicitud: input.tipo_solicitud,
        fecha_limite: input.fecha_limite?.trim() || null,
        estado: input.estado || 'pendiente_aprobacion',
      };

      if (input.ejecutivo_id) {
        insertData.ejecutivo_id = input.ejecutivo_id;
      }

      if (input.jefe_local_id) {
        insertData.jefe_local_id = input.jefe_local_id;
      }

      if (input.tipo_solicitud === 'venta' && input.sucursal_destino) {
        insertData.sucursal_destino = input.sucursal_destino;
      }

      if (input.tipo_solicitud === 'evento') {
        insertData.direccion_evento = input.direccion_evento?.trim() || null;
        insertData.titulo_evento = input.titulo_evento?.trim() || null;
      }

      const { data: reservasActivas, error: reservasError } = await admin
        .from('solicitud_vehiculo')
        .select('vehiculo_id, solicitud!inner(estado)')
        .in('vehiculo_id', vehiculoIds)
        .eq('disponibilidad', 'reservado')
        .in('solicitud.estado', [...ESTADOS_ACTIVOS_RESERVA]);

      if (reservasError) {
        return {
          success: false,
          error: mensajeErrorUsuario(reservasError, 'No se pudo verificar la disponibilidad de los vehículos.'),
        };
      }

      if (reservasActivas && reservasActivas.length > 0) {
        return {
          success: false,
          error: 'Uno o más vehículos seleccionados ya están reservados en otra solicitud activa.',
        };
      }

      const { data, error } = await admin
        .from('solicitud')
        .insert(insertData)
        .select('id')
        .single();

      if (error) {
        return { success: false, error: mensajeErrorUsuario(error, 'No se pudo completar la operación.') };
      }

      const solicitudId = (data as unknown as { id: string }).id;

      const { error: svError } = await admin.from('solicitud_vehiculo').insert(
        vehiculoIds.map((vid) => ({
          solicitud_id: solicitudId,
          vehiculo_id: vid,
          disponibilidad: 'reservado' as const,
        }))
      );

      if (svError) {
        await admin.from('solicitud').delete().eq('id', solicitudId);
        return {
          success: false,
          error: mensajeErrorUsuario(svError, 'No se pudo reservar los vehículos.'),
        };
      }

      for (const vid of vehiculoIds) {
        await this.registrarAuditoria(usuarioId, 'solicitud_vehiculo', solicitudId, 'ASIGNACION_VEHICULO', null, {
          solicitud_id: solicitudId,
          vehiculo_id: vid,
        });
      }

      // La delegación del jefe de local es la única traza de "quién creó y a
      // quién se le entregó": `solicitud` no tiene columna `created_by`.
      if (input.ejecutivo_id) {
        await this.registrarAuditoria(usuarioId, 'solicitud', solicitudId, 'delegacion', null, {
          ejecutivo_id: input.ejecutivo_id,
          jefe_local_id: input.jefe_local_id ?? null,
        });
      }

      const observacion = input.observacion?.trim();
      if (observacion) {
        const { error: obsError } = await admin.from('observacion').insert({
          solicitud_id: solicitudId,
          usuario_id: usuarioId,
          observacion,
        });

        if (obsError) {
          console.error('Error al guardar observación inicial:', obsError);
        }
      }

      const solicitud = await this.getSolicitudCompleta(solicitudId);
      return { success: true, solicitud: solicitud || undefined };
    } catch (err: unknown) {
      return { success: false, error: mensajeErrorUsuario(err, 'Error inesperado al crear la solicitud') };
    }
  }

  static async priorizarSolicitud(id: string, userId: string): Promise<{ success: boolean; posicion?: number; error?: string }> {
    try {
      const admin = createAdminClient();

      const actual = await this.getSolicitudById(id);
      if (!actual) return { success: false, error: 'Solicitud no encontrada.' };
      if (!['pendiente', 'aprobada'].includes(actual.estado)) {
        return { success: false, error: 'Solo las solicitudes Pendientes o Aprobadas pueden priorizarse.' };
      }
      if (actual.sucursal === null || actual.sucursal === undefined) {
        return { success: false, error: 'La solicitud no tiene una sucursal asignada.' };
      }

      const { data: filas } = await admin
        .from('solicitud')
        .select('id, posicion_prioridad')
        .eq('sucursal', actual.sucursal)
        .not('posicion_prioridad', 'is', null)
        .order('posicion_prioridad', { ascending: true });

      const items = (filas as unknown as Array<{ id: string; posicion_prioridad: number | null }> | null) ?? [];
      const hayNegativos = items.some((i) => (i.posicion_prioridad ?? 0) < 0);

      let siguiente: number;
      if (hayNegativos) {
        // Sanear la cola: reescribir 1..N sin dejar posiciones negativas
        const ids = items.map((i) => i.id);
        const sanear = await SolicitudesService.reescribirCola(
          admin,
          ids,
          ids.map((id2, i) => ({ id: id2, pos: i + 1 }))
        );
        if (sanear) return { success: false, error: sanear };
        siguiente = items.length + 1;
      } else {
        siguiente = (items[items.length - 1]?.posicion_prioridad ?? 0) + 1;
      }

      const errEstado = await SolicitudesService.actualizarSiEstado(admin, id, actual.estado, { estado: 'priorizada', posicion_prioridad: siguiente });
      if (errEstado) return { success: false, error: errEstado };

      await this.registrarAuditoria(
        userId,
        'solicitud',
        id,
        'priorizacion',
        { estado: actual.estado, posicion_prioridad: actual.posicion_prioridad ?? null },
        { estado: 'priorizada', posicion_prioridad: siguiente }
      );

      return { success: true, posicion: siguiente };
    } catch (err: unknown) {
      return { success: false, error: mensajeErrorUsuario(err, 'Error inesperado al priorizar') };
    }
  }

  static async reordenarCola(
    sucursalId: number,
    orden: string[],
    userId: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const admin = createAdminClient();

      if (!orden || orden.length === 0) {
        return { success: false, error: 'El orden de la cola no puede estar vacío.' };
      }

      const idsUnicos = new Set(orden);
      if (idsUnicos.size !== orden.length) {
        return { success: false, error: 'El orden de la cola contiene elementos duplicados.' };
      }

      const { data: filas, error: selError } = await admin
        .from('solicitud')
        .select('id, estado, sucursal')
        .in('id', orden);

      if (selError) return { success: false, error: mensajeErrorUsuario(selError, 'No se pudo completar la operación.') };

      if (!filas || filas.length !== orden.length) {
        return { success: false, error: 'Algunas solicitudes del orden no existen.' };
      }

      const filasTipadas = filas as Array<{ id: string; estado: string; sucursal: number }>;
      const mapeo = new Map<string, string>(filasTipadas.map((f) => [f.id, f.estado]));
      for (const id of orden) {
        if (mapeo.get(id) !== 'priorizada') {
          return { success: false, error: 'Solo solicitudes priorizadas pueden reordenarse en la cola.' };
        }
      }

      // Brecha 008: todas las solicitudes deben ser de la sucursal indicada.
      if (filasTipadas.some((f) => f.sucursal !== sucursalId)) {
        return { success: false, error: 'Solo puedes reordenar solicitudes de la cola de esta sucursal.' };
      }

      // El orden debe contener exactamente la cola actual (sin omitir ni agregar).
      const ant = await this.getColaPriorizada(sucursalId);
      const colaActual = new Set(ant.map((c) => c.id));
      if (colaActual.size !== orden.length || orden.some((id) => !colaActual.has(id))) {
        return {
          success: false,
          error: 'La cola cambió mientras la ordenabas. Recarga la página e inténtalo de nuevo.',
        };
      }

      const err = await SolicitudesService.reescribirCola(
        admin,
        orden,
        orden.map((id2, i) => ({ id: id2, pos: i + 1 }))
      );
      if (err) return { success: false, error: err };

      // Brecha 018: auditoria.entidad_id es uuid. Antes se usaba
      // `sucursal_<id>` y el insert fallaba siempre en silencio. Ahora se
      // registra un movimiento por cada solicitud que cambió de posición.
      const posicionAnterior = new Map(ant.map((c) => [c.id, c.posicion_prioridad]));
      for (const [i, id] of orden.entries()) {
        const anterior = posicionAnterior.get(id) ?? null;
        if (anterior === i + 1) continue;
        await this.registrarAuditoria(
          userId,
          'solicitud',
          id,
          'reorden_cola',
          { posicion_prioridad: anterior },
          { posicion_prioridad: i + 1, sucursal: sucursalId }
        );
      }

      return { success: true };
    } catch (err: unknown) {
      return { success: false, error: mensajeErrorUsuario(err, 'Error inesperado al reordenar la cola') };
    }
  }

  static async priorizarEnPosicion(
    id: string,
    posicion: number,
    userId: string
  ): Promise<{ success: boolean; posicion?: number; error?: string }> {
    try {
      const admin = createAdminClient();

      if (!Number.isInteger(posicion) || posicion < 1) {
        return { success: false, error: 'La posición debe ser un entero mayor o igual a 1.' };
      }

      const actual = await this.getSolicitudById(id);
      if (!actual) return { success: false, error: 'Solicitud no encontrada.' };
      if (!['pendiente', 'aprobada'].includes(actual.estado)) {
        return { success: false, error: 'Solo las solicitudes Pendientes o Aprobadas pueden priorizarse.' };
      }
      if (actual.sucursal === null || actual.sucursal === undefined) {
        return { success: false, error: 'La solicitud no tiene una sucursal asignada.' };
      }

      // Cola actual de la sucursal, ordenada por posicion (1..N)
      const cola = await this.getColaPriorizada(actual.sucursal);

      if (posicion > cola.length + 1) {
        return { success: false, error: `La posición máxima válida es ${cola.length + 1}.` };
      }

      // Insertar el nuevo id en la posicion solicitada y reescribir la cola completa
      const nuevoOrden = cola.map((c) => c.id);
      nuevoOrden.splice(posicion - 1, 0, id);

      // Marcar el nuevo item como priorizada (la posición la asigna la reescritura)
      const errEstado = await SolicitudesService.actualizarSiEstado(admin, id, actual.estado, { estado: 'priorizada' });
      if (errEstado) return { success: false, error: errEstado };

      const errReesc = await SolicitudesService.reescribirCola(
        admin,
        nuevoOrden,
        nuevoOrden.map((id2, i) => ({ id: id2, pos: i + 1 }))
      );
      if (errReesc) return { success: false, error: errReesc };

      await this.registrarAuditoria(
        userId,
        'solicitud',
        id,
        'priorizacion',
        { estado: actual.estado, posicion_prioridad: actual.posicion_prioridad ?? null },
        { estado: 'priorizada', posicion_prioridad: posicion }
      );

      return { success: true, posicion };
    } catch (err: unknown) {
      return { success: false, error: mensajeErrorUsuario(err, 'Error inesperado al priorizar en posición') };
    }
  }

  static async sacarDeCola(
    id: string,
    userId: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const admin = createAdminClient();

      const actual = await this.getSolicitudById(id);
      if (!actual) return { success: false, error: 'Solicitud no encontrada.' };
      if (actual.estado !== 'priorizada') {
        return { success: false, error: 'Solo las solicitudes priorizadas pueden salir de la cola.' };
      }

      const errEstado = await SolicitudesService.actualizarSiEstado(admin, id, actual.estado, { estado: 'aprobada', posicion_prioridad: null });
      if (errEstado) return { success: false, error: errEstado };

      const errReesc = await SolicitudesService.renumerarColaSucursal(admin, actual.sucursal);
      if (errReesc) return { success: false, error: errReesc };

      await this.registrarAuditoria(
        userId,
        'solicitud',
        id,
        'sacar_cola',
        { estado: 'priorizada', posicion_prioridad: actual.posicion_prioridad ?? null },
        { estado: 'aprobada', posicion_prioridad: null }
      );

      return { success: true };
    } catch (err: unknown) {
      return { success: false, error: mensajeErrorUsuario(err, 'Error inesperado al sacar de la cola') };
    }
  }

  /**
   * Brecha 010: aplica el cambio solo si la solicitud sigue en `estadoEsperado`
   * (el estado leído y validado antes). Si otro usuario la cambió entretanto,
   * PostgREST devuelve 0 filas y se informa un conflicto en lugar de aplicar
   * una transición sobre un estado distinto.
   */
  private static async actualizarSiEstado(
    admin: ReturnType<typeof createAdminClient>,
    id: string,
    estadoEsperado: string,
    cambios: Record<string, unknown>
  ): Promise<string | null> {
    const { data, error } = await admin
      .from('solicitud')
      .update(cambios)
      .eq('id', id)
      .eq('estado', estadoEsperado)
      .select('id');

    if (error) return mensajeErrorUsuario(error, 'No se pudo actualizar la solicitud.');
    if (Array.isArray(data) && data.length === 0) return MENSAJE_CONFLICTO_ESTADO;
    return null;
  }

  /** Solicitud a la que pertenece un documento (para los guards de acceso). */
  static async getSolicitudIdDeDocumento(documentoId: string): Promise<string | null> {
    try {
      const admin = createAdminClient();
      const { data } = await admin
        .from('solicitud_documento')
        .select('solicitud_id')
        .eq('id', documentoId)
        .maybeSingle();
      return (data as { solicitud_id: string } | null)?.solicitud_id ?? null;
    } catch (err) {
      console.error('Error en getSolicitudIdDeDocumento:', err);
      return null;
    }
  }

  /** Solicitud a la que pertenece una reserva solicitud_vehiculo. */
  static async getSolicitudIdDeReserva(solicitudVehiculoId: string): Promise<string | null> {
    try {
      const admin = createAdminClient();
      const { data } = await admin
        .from('solicitud_vehiculo')
        .select('solicitud_id')
        .eq('id', solicitudVehiculoId)
        .maybeSingle();
      return (data as { solicitud_id: string } | null)?.solicitud_id ?? null;
    } catch (err) {
      console.error('Error en getSolicitudIdDeReserva:', err);
      return null;
    }
  }

  static async getColaPriorizada(sucursalId: number): Promise<Array<{ id: string; posicion_prioridad: number }>> {
    try {
      const admin = createAdminClient();
      const { data, error } = await admin
        .from('solicitud')
        .select('id, posicion_prioridad')
        .eq('sucursal', sucursalId)
        .eq('estado', 'priorizada')
        .not('posicion_prioridad', 'is', null)
        .order('posicion_prioridad', { ascending: true });

      if (error || !data) return [];
      return (data as unknown as Array<{ id: string; posicion_prioridad: number }>).map((r) => ({
        id: r.id,
        posicion_prioridad: r.posicion_prioridad,
      }));
    } catch (err) {
      console.error('Error en getColaPriorizada:', err);
      return [];
    }
  }

  // Reescribe una cola completa en posiciones 1..N sin usar posiciones negativas:
  // primero deja todo en NULL (los NULL no chocan con la UNIQUE) y luego asigna.
  // Si una llamada se corta a la mitad quedan NULL (reparables) y nunca -1/-2.
  private static async reescribirCola(
    admin: ReturnType<typeof createAdminClient>,
    ids: string[],
    posiciones: Array<{ id: string; pos: number }>
  ): Promise<string | null> {
    const { error: eNull } = await admin
      .from('solicitud')
      .update({ posicion_prioridad: null })
      .in('id', ids);
    if (eNull) return mensajeErrorUsuario(eNull, 'No se pudo actualizar la cola de prioridades.');

    for (const p of posiciones) {
      const { error: ePos } = await admin
        .from('solicitud')
        .update({ posicion_prioridad: p.pos })
        .eq('id', p.id);
      if (ePos) return mensajeErrorUsuario(ePos, 'No se pudo actualizar la cola de prioridades.');
    }
    return null;
  }

  // Lee la cola actual de la sucursal y la compacta a posiciones 1..N.
  private static async renumerarColaSucursal(
    admin: ReturnType<typeof createAdminClient>,
    sucursalId: number
  ): Promise<string | null> {
    const { error: eJunk } = await admin
      .from('solicitud')
      .update({ posicion_prioridad: null })
      .eq('sucursal', sucursalId)
      .neq('estado', 'priorizada')
      .not('posicion_prioridad', 'is', null);
    if (eJunk) return mensajeErrorUsuario(eJunk, 'No se pudo actualizar la cola de prioridades.');

    const cola = await SolicitudesService.getColaPriorizada(sucursalId);
    if (cola.length === 0) return null;
    const ids = cola.map((c) => c.id);
    return SolicitudesService.reescribirCola(admin, ids, ids.map((id2, i) => ({ id: id2, pos: i + 1 })));
  }

  static async cancelarSolicitud(id: string, motivo: string, userId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const admin = createAdminClient();

      const actual = await this.getSolicitudById(id);
      if (!actual) return { success: false, error: 'Solicitud no encontrada.' };

      if (!ESTADOS_PRE_DESPACHO.includes(actual.estado)) {
        return {
          success: false,
          error: `No se puede cancelar una solicitud en estado "${actual.estado}".`,
        };
      }

      const errEstado = await SolicitudesService.actualizarSiEstado(admin, id, actual.estado, {
        estado: 'cancelada',
        motivo_cancelacion: motivo.trim(),
        posicion_prioridad: null,
      });
      if (errEstado) return { success: false, error: errEstado };

      if (actual.posicion_prioridad !== null) {
        const errReesc = await SolicitudesService.renumerarColaSucursal(admin, actual.sucursal);
        if (errReesc) return { success: false, error: errReesc };
      }

      await this.registrarAuditoria(userId, 'solicitud', id, 'CAMBIO_ESTADO', { estado: actual.estado }, { estado: 'cancelada', motivo: motivo.trim() });
      return { success: true };
    } catch (err: unknown) {
      return { success: false, error: mensajeErrorUsuario(err, 'Error inesperado al cancelar') };
    }
  }

  static async eliminarSolicitud(id: string, userId?: string): Promise<{ success: boolean; error?: string }> {
    try {
      const admin = createAdminClient();

      const actual = await this.getSolicitudById(id);
      if (!actual) return { success: false, error: 'Solicitud no encontrada.' };

      if (!ESTADOS_PRE_DESPACHO.includes(actual.estado)) {
        return {
          success: false,
          error:
            'Solo se pueden eliminar solicitudes pre-despacho.',
        };
      }

      const { error } = await admin.from('solicitud').delete().eq('id', id);
      if (error) return { success: false, error: mensajeErrorUsuario(error, 'No se pudo completar la operación.') };

      // Brecha 018: la eliminación física también queda auditada.
      if (userId) {
        await this.registrarAuditoria(userId, 'solicitud', id, 'eliminacion', {
          estado: actual.estado,
          sucursal: actual.sucursal,
          ejecutivo_id: actual.ejecutivo_id,
        }, null);
      }

      if (actual.posicion_prioridad !== null) {
        const errReesc = await SolicitudesService.renumerarColaSucursal(admin, actual.sucursal);
        if (errReesc) return { success: false, error: errReesc };
      }

      return { success: true };
    } catch (err: unknown) {
      return { success: false, error: mensajeErrorUsuario(err, 'Error inesperado al eliminar') };
    }
  }

  static async aprobarSolicitud(
    id: string,
    userId: string,
    fecha: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const admin = createAdminClient();

      const fechaEntrega = fecha.trim();
      if (!fechaEntrega) {
        return { success: false, error: 'Debes indicar la fecha límite de entrega propuesta para aprobar la solicitud.' };
      }
      if (isNaN(Date.parse(fechaEntrega))) {
        return { success: false, error: 'La fecha límite de entrega propuesta no es válida.' };
      }
      if (esFechaAnteriorAHoy(fechaEntrega)) {
        return { success: false, error: 'La fecha límite de entrega propuesta no puede ser anterior al día de hoy.' };
      }

      const actual = await this.getSolicitudById(id);
      if (!actual) return { success: false, error: 'Solicitud no encontrada.' };
      if (actual.estado !== 'pendiente_aprobacion') {
        return { success: false, error: 'Solo se pueden aprobar solicitudes pendientes de aprobación.' };
      }

      const ahora = new Date().toISOString();

      const errEstado = await SolicitudesService.actualizarSiEstado(admin, id, actual.estado, {
          estado: 'aprobada',
          fecha_limite: fechaEntrega,
          fecha_confirmacion: ahora,
        });
      if (errEstado) return { success: false, error: errEstado };

      await this.registrarAuditoria(userId, 'solicitud', id, 'aprobacion', { estado: actual.estado }, { estado: 'aprobada', fecha_entrega: fechaEntrega, fecha_confirmacion: ahora });
      return { success: true };
    } catch (err: unknown) {
      return { success: false, error: mensajeErrorUsuario(err, 'Error inesperado al aprobar') };
    }
  }

  static async rechazarSolicitud(
    id: string,
    motivo: string,
    userId: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const admin = createAdminClient();

      const actual = await this.getSolicitudById(id);
      if (!actual) return { success: false, error: 'Solicitud no encontrada.' };
      if (actual.estado !== 'pendiente_aprobacion') {
        return { success: false, error: 'Solo se pueden rechazar solicitudes pendientes de aprobación.' };
      }
      if (!motivo || motivo.trim().length < 5) {
        return { success: false, error: 'El motivo de rechazo debe tener al menos 5 caracteres.' };
      }

      const errEstado = await SolicitudesService.actualizarSiEstado(admin, id, actual.estado, { estado: 'rechazada' });
      if (errEstado) return { success: false, error: errEstado };

      const { error: obsError } = await admin.from('observacion').insert({
        solicitud_id: id,
        usuario_id: userId,
        observacion: `[RECHAZO] ${motivo.trim()}`,
      });

      if (obsError) {
        console.error('Error al guardar observación de rechazo:', obsError);
      }

      await this.registrarAuditoria(userId, 'solicitud', id, 'rechazo', { estado: actual.estado }, { estado: 'rechazada', motivo: motivo.trim() });
      return { success: true };
    } catch (err: unknown) {
      return { success: false, error: mensajeErrorUsuario(err, 'Error inesperado al rechazar') };
    }
  }

  static async agregarObservacion(
    solicitudId: string,
    userId: string,
    texto: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const admin = createAdminClient();

      if (!texto || texto.trim().length < 1) {
        return { success: false, error: 'La observación no puede estar vacía.' };
      }

      // Una solicitud rechazada o cancelada no admite discusión.
      const actual = await this.getSolicitudById(solicitudId);
      if (!actual) return { success: false, error: 'Solicitud no encontrada.' };
      if (!admiteInteraccion(actual.estado)) {
        return { success: false, error: MENSAJE_SOLICITUD_CERRADA };
      }

      const { error } = await admin.from('observacion').insert({
        solicitud_id: solicitudId,
        usuario_id: userId,
        observacion: texto.trim(),
      });

      if (error) return { success: false, error: mensajeErrorUsuario(error, 'No se pudo completar la operación.') };
      return { success: true };
    } catch (err: unknown) {
      return { success: false, error: mensajeErrorUsuario(err, 'Error inesperado al agregar observación') };
    }
  }

  static async getObservaciones(solicitudId: string): Promise<ObservacionEntry[]> {
    try {
      const admin = createAdminClient();
      const { data, error } = await admin
        .from('observacion')
        .select('id, solicitud_id, usuario_id, observacion, created_at, usuario:usuario_id(nombre, apellido)')
        .eq('solicitud_id', solicitudId)
        .order('created_at', { ascending: true });

      if (error || !data) return [];

      return (data as unknown as Array<{
        id: string;
        solicitud_id: string;
        usuario_id: string;
        observacion: string;
        created_at: string;
        usuario: { nombre: string; apellido: string } | null;
      }>).map((row) => ({
        id: row.id,
        solicitud_id: row.solicitud_id,
        usuario_id: row.usuario_id,
        usuario_nombre: persona(row.usuario),
        observacion: row.observacion,
        created_at: row.created_at,
      }));
    } catch (err) {
      console.error('Error en getObservaciones:', err);
      return [];
    }
  }

  static async getAuditoria(solicitudId: string): Promise<AuditoriaEntry[]> {
    try {
      const admin = createAdminClient();
      const { data, error } = await admin
        .from('auditoria')
        .select('id, usuario_id, entidad, entidad_id, accion, valor_anterior, valor_nuevo, created_at, usuario:usuario_id(nombre, apellido)')
        .eq('entidad', 'solicitud')
        .eq('entidad_id', solicitudId)
        .order('created_at', { ascending: false });

      if (error || !data) return [];

      return (data as unknown as Array<{
        id: string;
        usuario_id: string;
        entidad: string;
        entidad_id: string;
        accion: string;
        valor_anterior: unknown;
        valor_nuevo: unknown;
        created_at: string;
        usuario: { nombre: string; apellido: string } | null;
      }>).map((row) => ({
        id: row.id,
        usuario_id: row.usuario_id,
        usuario_nombre: persona(row.usuario),
        entidad: row.entidad,
        entidad_id: row.entidad_id,
        accion: row.accion,
        valor_anterior: row.valor_anterior,
        valor_nuevo: row.valor_nuevo,
        created_at: row.created_at,
      }));
    } catch (err) {
      console.error('Error en getAuditoria:', err);
      return [];
    }
  }

  static async subirDocumentos(
    solicitudId: string,
    usuarioId: string,
    archivos: Array<{ nombre: string; tipo: string; tamano: number; buffer: ArrayBuffer }>
  ): Promise<{ success: boolean; subidos?: number; error?: string }> {
    try {
      if (!archivos.length) return { success: false, error: 'No se seleccionaron archivos.' };

      const admin = createAdminClient();
      const existe = await this.getSolicitudById(solicitudId);
      if (!existe) return { success: false, error: 'La solicitud no existe.' };
      if (!admiteInteraccion(existe.estado)) {
        return { success: false, error: MENSAJE_SOLICITUD_CERRADA };
      }

      for (const a of archivos) {
        if (a.tamano <= 0) return { success: false, error: `El archivo "${a.nombre}" está vacío.` };
        if (a.tamano > MAX_TAMANO_DOCUMENTO) {
          return { success: false, error: `El archivo "${a.nombre}" supera el máximo de 10 MB.` };
        }
        // Brecha 023: MIME declarado, extensión y contenido real deben coincidir.
        const errorContenido = validarContenidoArchivo(a.nombre, a.tipo, a.buffer);
        if (errorContenido) return { success: false, error: errorContenido };
      }

      const subidos: string[] = [];
      try {
        for (const a of archivos) {
          const nombreLimpio = a.nombre.replace(/[\\/:*?"<>|]/g, '_').slice(0, 120);
          const ruta = `${solicitudId}/${crypto.randomUUID()}-${nombreLimpio}`;

          const { error: eSub } = await admin.storage.from(BUCKET_DOCUMENTOS).upload(ruta, a.buffer, {
            contentType: a.tipo,
            upsert: false,
          });
          if (eSub) throw eSub;
          subidos.push(ruta);

          const { error: eRow } = await admin.from('solicitud_documento').insert({
            solicitud_id: solicitudId,
            nombre_archivo: a.nombre.slice(0, 255),
            tipo_mime: a.tipo,
            tamano_bytes: a.tamano,
            ruta_storage: ruta,
            subido_por: usuarioId,
          });
          if (eRow) throw eRow;

          await this.registrarAuditoria(usuarioId, 'solicitud', solicitudId, 'subir_documento', null, {
            nombre_archivo: a.nombre,
            ruta_storage: ruta,
          });
        }
        return { success: true, subidos: subidos.length };
      } catch (err) {
        if (subidos.length) {
          await admin.storage.from(BUCKET_DOCUMENTOS).remove(subidos);
        }
        return { success: false, error: mensajeErrorUsuario(err, 'Error al subir los documentos') };
      }
    } catch (err: unknown) {
      return { success: false, error: mensajeErrorUsuario(err, 'Error inesperado al subir documentos') };
    }
  }

  static async getDocumentos(solicitudId: string): Promise<DocumentoSolicitud[]> {
    try {
      const admin = createAdminClient();
      const { data, error } = await admin
        .from('solicitud_documento')
        .select('id, solicitud_id, nombre_archivo, tipo_mime, tamano_bytes, ruta_storage, subido_por, created_at, usuario:subido_por(nombre, apellido)')
        .eq('solicitud_id', solicitudId)
        .order('created_at', { ascending: true });

      if (error || !data) return [];

      return (data as unknown as Array<{
        id: string;
        solicitud_id: string;
        nombre_archivo: string;
        tipo_mime: string;
        tamano_bytes: number;
        ruta_storage: string;
        subido_por: string | null;
        created_at: string;
        usuario: { nombre: string; apellido: string } | null;
      }>).map((row) => ({
        id: row.id,
        solicitud_id: row.solicitud_id,
        nombre_archivo: row.nombre_archivo,
        tipo_mime: row.tipo_mime,
        tamano_bytes: row.tamano_bytes,
        ruta_storage: row.ruta_storage,
        subido_por: row.subido_por,
        subido_por_nombre: persona(row.usuario),
        created_at: row.created_at,
      }));
    } catch (err) {
      console.error('Error en getDocumentos:', err);
      return [];
    }
  }

  static async eliminarDocumento(
    documentoId: string,
    usuarioId: string,
    rol: UserRole
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const admin = createAdminClient();
      const { data: doc, error: eDoc } = await admin
        .from('solicitud_documento')
        .select('id, solicitud_id, ruta_storage, nombre_archivo, subido_por')
        .eq('id', documentoId)
        .single();
      if (eDoc || !doc) return { success: false, error: 'El documento no existe.' };

      if (rol !== 'administrador' && rol !== 'logistica' && doc.subido_por !== usuarioId) {
        return { success: false, error: 'No tienes permisos para eliminar este documento.' };
      }

      const { error: eRem } = await admin.storage.from(BUCKET_DOCUMENTOS).remove([doc.ruta_storage]);
      if (eRem) return { success: false, error: mensajeErrorUsuario(eRem, 'No se pudo completar la operación.') };

      const { error: eDel } = await admin.from('solicitud_documento').delete().eq('id', documentoId);
      if (eDel) return { success: false, error: mensajeErrorUsuario(eDel, 'No se pudo completar la operación.') };

      await this.registrarAuditoria(usuarioId, 'solicitud', doc.solicitud_id, 'eliminar_documento', {
        id: doc.id,
        nombre_archivo: doc.nombre_archivo,
        ruta_storage: doc.ruta_storage,
      }, null);
      return { success: true };
    } catch (err: unknown) {
      return { success: false, error: mensajeErrorUsuario(err, 'Error inesperado al eliminar el documento') };
    }
  }

  static async getURLDescarga(
    documentoId: string
  ): Promise<{ success: boolean; url?: string; error?: string }> {
    try {
      const admin = createAdminClient();
      const { data: doc, error: eDoc } = await admin
        .from('solicitud_documento')
        .select('ruta_storage, nombre_archivo')
        .eq('id', documentoId)
        .single();
      if (eDoc || !doc) return { success: false, error: 'El documento no existe.' };

      // Brecha 023: forzar descarga como adjunto (Content-Disposition: attachment).
      const { data: sign, error: eSign } = await admin.storage
        .from(BUCKET_DOCUMENTOS)
        .createSignedUrl(doc.ruta_storage, 300, { download: doc.nombre_archivo || true });
      if (eSign || !sign?.signedUrl) {
        if (eSign) console.error('Error al firmar la descarga:', eSign);
        return { success: false, error: 'No se pudo generar el enlace de descarga.' };
      }

      return { success: true, url: sign.signedUrl };
    } catch (err: unknown) {
      return { success: false, error: mensajeErrorUsuario(err, 'Error inesperado al generar la descarga') };
    }
  }

  static async registrarAuditoria(
    usuarioId: string,
    entidad: string,
    entidadId: string,
    accion: string,
    valorAnterior?: unknown,
    valorNuevo?: unknown
  ): Promise<void> {
    try {
      const admin = createAdminClient();
      await admin.from('auditoria').insert({
        usuario_id: usuarioId,
        entidad,
        entidad_id: entidadId,
        accion,
        valor_anterior: valorAnterior || null,
        valor_nuevo: valorNuevo || null,
      });
    } catch (err) {
      console.error('Error al registrar auditoría:', err);
    }
  }

  static async getEjecutivosPorSucursal(sucursalId: number | null): Promise<Array<{ id: string; nombre: string; apellido: string }>> {
    try {
      const admin = createAdminClient();
      let query = admin
        .from('usuario')
        .select('id, nombre, apellido')
        .eq('rol', 'ejecutivo')
        .eq('activo', true);
      if (sucursalId !== null && sucursalId !== undefined) {
        query = query.eq('sucursal_id', sucursalId);
      }
      const { data, error } = await query;

      if (error || !data) return [];
      return data as unknown as Array<{ id: string; nombre: string; apellido: string }>;
    } catch (err) {
      console.error('Error en getEjecutivosPorSucursal:', err);
      return [];
    }
  }

  /**
   * Regla de negocio de la delegación: el Jefe de Local solo puede delegar una
   * solicitud a un ejecutivo de la MISMA sucursal de origen, y ese ejecutivo
   * debe existir, tener rol `ejecutivo` y estar activo.
   *
   * Devuelve `null` cuando la delegación es válida, o el mensaje de error que
   * debe mostrarse al usuario. Nunca lanza: un fallo de BD se traduce a un
   * mensaje para que el action pueda cortar la creación con seguridad.
   */
  static async validarEjecutivoDelegable(
    ejecutivoId: string,
    sucursalOrigenId: number
  ): Promise<string | null> {
    try {
      const admin = createAdminClient();
      const { data, error } = await admin
        .from('usuario')
        .select('id, rol, activo, sucursal_id')
        .eq('id', ejecutivoId)
        .maybeSingle();

      if (error) {
        console.error('Error en validarEjecutivoDelegable:', error);
        return 'No se pudo verificar el ejecutivo seleccionado.';
      }

      if (!data) return 'El ejecutivo seleccionado no existe.';

      const fila = data as unknown as {
        id: string;
        rol: string | null;
        activo: boolean | null;
        sucursal_id: number | null;
      };

      if (fila.rol !== 'ejecutivo') {
        return 'Solo puedes delegar solicitudes a usuarios con rol Ejecutivo.';
      }

      if (!fila.activo) {
        return 'El ejecutivo seleccionado está inactivo.';
      }

      if (fila.sucursal_id !== sucursalOrigenId) {
        return 'Solo puedes delegar a ejecutivos de la sucursal de origen de la solicitud.';
      }

      return null;
    } catch (err) {
      console.error('Error inesperado en validarEjecutivoDelegable:', err);
      return 'No se pudo verificar el ejecutivo seleccionado.';
    }
  }

  static async agregarVehiculo(
    solicitudId: string,
    vehiculoId: string,
    usuarioId: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const admin = createAdminClient();

      const actual = await this.getSolicitudById(solicitudId);
      if (!actual) return { success: false, error: 'Solicitud no encontrada.' };
      if (!ESTADOS_PRE_DESPACHO.includes(actual.estado)) {
        return { success: false, error: 'Los vehículos solo se gestionan pre-despacho.' };
      }

      const { data: reservaActiva } = await admin
        .from('solicitud_vehiculo')
        .select('id, solicitud!inner(estado)')
        .eq('vehiculo_id', vehiculoId)
        .eq('disponibilidad', 'reservado')
        .in('solicitud.estado', [...ESTADOS_ACTIVOS_RESERVA])
        .limit(1);

      if (reservaActiva && reservaActiva.length > 0) {
        return { success: false, error: 'Ese vehículo ya está reservado en otra solicitud activa.' };
      }

      const { data, error } = await admin
        .from('solicitud_vehiculo')
        .insert({
          solicitud_id: solicitudId,
          vehiculo_id: vehiculoId,
          disponibilidad: 'reservado',
        })
        .select('id')
        .single();

      if (error) return { success: false, error: mensajeErrorUsuario(error, 'No se pudo completar la operación.') };

      await this.registrarAuditoria(
        usuarioId,
        'solicitud_vehiculo',
        (data as unknown as { id: string }).id,
        'ASIGNACION_VEHICULO',
        null,
        { solicitud_id: solicitudId, vehiculo_id: vehiculoId }
      );
      return { success: true };
    } catch (err: unknown) {
      return { success: false, error: mensajeErrorUsuario(err, 'Error inesperado al reservar vehículo') };
    }
  }

  static async quitarVehiculo(
    solicitudVehiculoId: string,
    usuarioId: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const admin = createAdminClient();

      const { data: sv } = await admin
        .from('solicitud_vehiculo')
        .select('id, solicitud_id, vehiculo_id')
        .eq('id', solicitudVehiculoId)
        .maybeSingle();

      if (!sv) return { success: false, error: 'Reserva no encontrada.' };

      const svRow = sv as unknown as { solicitud_id: string; vehiculo_id: string };
      const actual = await this.getSolicitudById(svRow.solicitud_id);
      if (!actual) return { success: false, error: 'Solicitud no encontrada.' };
      if (!ESTADOS_PRE_DESPACHO.includes(actual.estado)) {
        return { success: false, error: 'Los vehículos solo se gestionan pre-despacho.' };
      }

      const { count } = await admin
        .from('solicitud_vehiculo')
        .select('id', { count: 'exact', head: true })
        .eq('solicitud_id', svRow.solicitud_id);

      if (count !== null && count <= 1) {
        return { success: false, error: 'Una solicitud debe tener al menos un vehículo asociado.' };
      }

      const { error } = await admin.from('solicitud_vehiculo').delete().eq('id', solicitudVehiculoId);
      if (error) return { success: false, error: mensajeErrorUsuario(error, 'No se pudo completar la operación.') };

      await this.registrarAuditoria(
        usuarioId,
        'solicitud_vehiculo',
        solicitudVehiculoId,
        'CAMBIO_DISPONIBILIDAD_VEHICULO',
        { disponibilidad: 'reservado' },
        { disponibilidad: 'liberado' }
      );
      return { success: true };
    } catch (err: unknown) {
      return { success: false, error: mensajeErrorUsuario(err, 'Error inesperado al liberar vehículo') };
    }
  }

  static async calendarizarSolicitud(
    id: string,
    fechaDespacho: string,
    usuarioId: string,
    rolActor?: UserRole
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const admin = createAdminClient();

      const actual = await this.getSolicitudById(id);
      if (!actual) return { success: false, error: 'Solicitud no encontrada.' };
      if (esFechaAnteriorAHoy(fechaDespacho)) {
        return { success: false, error: 'La fecha de despacho no puede ser anterior al día de hoy.' };
      }
      if (!['priorizada', 'asignada'].includes(actual.estado)) {
        return { success: false, error: 'Solo las solicitudes Priorizadas o Asignadas pueden calendarizarse.' };
      }

      // No se puede calendarizar en una fecha anterior a hoy
      const hoy = new Date();
      const hoyISO = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`;
      if (fechaDespacho.slice(0, 10) < hoyISO) {
        return { success: false, error: 'No puedes programar el traslado en una fecha anterior a hoy.' };
      }

      const errEstado = await SolicitudesService.actualizarSiEstado(admin, id, actual.estado, {
          estado: 'calendarizada',
          fecha_tentativa_despacho: fechaDespacho,
          // Brecha 008: se conserva el encargado ya asignado y un Jefe de Local
          // no queda registrado como encargado de Logística.
          logistica_id: actual.logistica_id ?? (rolActor === 'jefe_local' ? null : usuarioId),
          // Al calendarizar sale de la cola: libera el slot de prioridad
          posicion_prioridad: null,
        });
      if (errEstado) return { success: false, error: errEstado };

      // Compactar la cola restante (1..N) al liberarse el slot
      const errReesc = await SolicitudesService.renumerarColaSucursal(admin, actual.sucursal);
      if (errReesc) return { success: false, error: errReesc };

      await this.registrarAuditoria(
        usuarioId,
        'solicitud',
        id,
        'calendarizacion',
        {
          estado: actual.estado,
          fecha_tentativa_despacho: actual.fecha_tentativa_despacho,
          posicion_prioridad: actual.posicion_prioridad ?? null,
        },
        { estado: 'calendarizada', fecha_tentativa_despacho: fechaDespacho, posicion_prioridad: null }
      );

      return { success: true };
    } catch (err: unknown) {
      return { success: false, error: mensajeErrorUsuario(err, 'Error inesperado al calendarizar') };
    }
  }

  static async descalendarizarSolicitud(
    id: string,
    usuarioId: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const admin = createAdminClient();

      const actual = await this.getSolicitudById(id);
      if (!actual) return { success: false, error: 'Solicitud no encontrada.' };
      if (actual.estado !== 'calendarizada') {
        return { success: false, error: 'Solo las solicitudes Calendarizadas pueden volver a priorizadas.' };
      }

      // Vuelve a la cola: reinsertar al final con una posición libre
      const cola = await this.getColaPriorizada(actual.sucursal);
      const siguiente = (cola[cola.length - 1]?.posicion_prioridad ?? 0) + 1;

      const errEstado = await SolicitudesService.actualizarSiEstado(admin, id, actual.estado, {
          estado: 'priorizada',
          posicion_prioridad: siguiente,
          fecha_tentativa_despacho: null,
          logistica_id: null,
        });
      if (errEstado) return { success: false, error: errEstado };

      await this.registrarAuditoria(
        usuarioId,
        'solicitud',
        id,
        'descalendarizacion',
        { estado: 'calendarizada', fecha_tentativa_despacho: actual.fecha_tentativa_despacho },
        { estado: 'priorizada', posicion_prioridad: siguiente, fecha_tentativa_despacho: null }
      );

      return { success: true };
    } catch (err: unknown) {
      return { success: false, error: mensajeErrorUsuario(err, 'Error inesperado al descalendarizar') };
    }
  }

  /**
   * Logística despacha: `calendarizada` -> `en_transito` (despacho directo,
   * sin estado intermedio `despachada`).
   * Registra `fecha_despacho` + `fecha_inicio_transito` (respaldo en DB:
   * trigger `tr_registrar_fechas_flujo`).
   */
  static async despacharSolicitud(
    id: string,
    usuarioId: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const admin = createAdminClient();

      const actual = await this.getSolicitudById(id);
      if (!actual) return { success: false, error: 'Solicitud no encontrada.' };
      if (actual.estado !== 'calendarizada') {
        return { success: false, error: 'Solo las solicitudes Calendarizadas pueden despacharse.' };
      }

      const ahora = new Date().toISOString();

      const errEstado = await SolicitudesService.actualizarSiEstado(admin, id, actual.estado, {
          estado: 'en_transito',
          fecha_despacho: ahora,
          fecha_inicio_transito: ahora,
          // Libera el slot de la cola: en tránsito ya no compite por prioridad
          posicion_prioridad: null,
        });
      if (errEstado) return { success: false, error: errEstado };

      // Compactar la cola restante (1..N) al liberarse el slot
      const errReesc = await SolicitudesService.renumerarColaSucursal(admin, actual.sucursal);
      if (errReesc) return { success: false, error: errReesc };

      await this.registrarAuditoria(
        usuarioId,
        'solicitud',
        id,
        'despacho',
        { estado: 'calendarizada', fecha_despacho: null },
        { estado: 'en_transito', fecha_despacho: ahora, fecha_inicio_transito: ahora }
      );

      return { success: true };
    } catch (err: unknown) {
      return { success: false, error: mensajeErrorUsuario(err, 'Error inesperado al despachar') };
    }
  }

  /** Revierte el despacho: `en_transito` -> `calendarizada`. */
  static async cancelarDespacharSolicitud(
    id: string,
    usuarioId: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const admin = createAdminClient();

      const actual = await this.getSolicitudById(id);
      if (!actual) return { success: false, error: 'Solicitud no encontrada.' };
      if (actual.estado !== 'en_transito') {
        return { success: false, error: 'Solo las solicitudes En Tránsito pueden volver a Calendarizadas.' };
      }

      const errEstado = await SolicitudesService.actualizarSiEstado(admin, id, actual.estado, {
          estado: 'calendarizada',
          fecha_despacho: null,
          posicion_prioridad: null,
        });
      if (errEstado) return { success: false, error: errEstado };

      await this.registrarAuditoria(
        usuarioId,
        'solicitud',
        id,
        'despacho',
        { estado: actual.estado, fecha_despacho: actual.fecha_despacho },
        { estado: 'calendarizada', fecha_despacho: null }
      );

      return { success: true };
    } catch (err: unknown) {
      return { success: false, error: mensajeErrorUsuario(err, 'Error inesperado al cancelar el despacho') };
    }
  }

  /**
   * Recepción en sucursal destino: `en_transito` -> `entregada` (UI: "Recepcionada").
   *
   * Los vehículos los libera/mueve el trigger de DB
   * `tr_entregar_solicitud_vehiculos` — no se duplica la lógica aquí.
   */
  static async recibirSolicitud(
    id: string,
    usuarioId: string,
    recepcion?: DatosRecepcion
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const admin = createAdminClient();

      const errorRecepcion = validarRecepcion(recepcion);
      if (errorRecepcion) return { success: false, error: errorRecepcion };

      const actual = await this.getSolicitudById(id);
      if (!actual) return { success: false, error: 'Solicitud no encontrada.' };
      if (actual.estado !== 'en_transito') {
        return { success: false, error: 'Solo las solicitudes En Tránsito pueden recibirse.' };
      }

      const usuario = await SolicitudesService.getUsuarioRolSucursal(admin, usuarioId);
      if (!usuario) return { success: false, error: 'Usuario no encontrado.' };

      if (usuario.rol !== 'administrador') {
        if (
          usuario.rol !== 'jefe_local' ||
          !(await this.usuarioPuedeRecibirEn(usuarioId, actual))
        ) {
          return {
            success: false,
            error: 'Solo el jefe de local de la sucursal destino puede recibir la solicitud.',
          };
        }
      }

      const ahora = new Date().toISOString();

      const errEstado = await SolicitudesService.actualizarSiEstado(admin, id, actual.estado, {
          estado: 'entregada',
          fecha_entrega: ahora,
          fecha_recepcion: ahora,
          posicion_prioridad: null,
        });
      if (errEstado) return { success: false, error: errEstado };

      // R13: la recepción queda registrada con sus novedades.
      const textoRecepcion = textoObservacionRecepcion(recepcion);
      if (textoRecepcion) {
        const { error: obsError } = await admin.from('observacion').insert({
          solicitud_id: id,
          usuario_id: usuarioId,
          observacion: textoRecepcion,
        });
        if (obsError) console.error('Error al guardar la observación de recepción:', obsError);
      }

      await this.registrarAuditoria(
        usuarioId,
        'solicitud',
        id,
        'entrega',
        { estado: actual.estado, fecha_entrega: null },
        {
          estado: 'entregada',
          fecha_entrega: ahora,
          fecha_recepcion: ahora,
          con_novedades: recepcion?.conNovedades ?? false,
          observacion: recepcion?.observacion?.trim() || null,
        }
      );

      return { success: true };
    } catch (err: unknown) {
      return { success: false, error: mensajeErrorUsuario(err, 'Error inesperado al recibir') };
    }
  }

  /**
   * R7/R16: Logística cambia la fecha de despacho de una solicitud ya
   * calendarizada sin sacarla de ese estado. La fecha anterior, la nueva y el
   * motivo quedan en la auditoría (`accion = 'recalendarizacion'`), que es la
   * fuente de las métricas de recalendarizaciones.
   */
  static async recalendarizarSolicitud(
    id: string,
    nuevaFecha: string,
    usuarioId: string,
    motivo?: string | null
  ): Promise<{ success: boolean; fechaAnterior?: string | null; error?: string }> {
    try {
      const admin = createAdminClient();

      if (!nuevaFecha || isNaN(Date.parse(nuevaFecha))) {
        return { success: false, error: 'La nueva fecha de despacho no es válida.' };
      }
      if (esFechaAnteriorAHoy(nuevaFecha)) {
        return { success: false, error: 'No puedes programar el traslado en una fecha anterior a hoy.' };
      }

      const actual = await this.getSolicitudById(id);
      if (!actual) return { success: false, error: 'Solicitud no encontrada.' };
      if (actual.estado !== 'calendarizada') {
        return { success: false, error: 'Solo las solicitudes Calendarizadas pueden reprogramarse.' };
      }

      const fechaAnterior = actual.fecha_tentativa_despacho;
      if (fechaAnterior && fechaAnterior.slice(0, 10) === nuevaFecha.slice(0, 10)) {
        return { success: false, error: 'La nueva fecha es igual a la fecha programada.' };
      }

      const errEstado = await SolicitudesService.actualizarSiEstado(admin, id, actual.estado, {
        fecha_tentativa_despacho: nuevaFecha,
      });
      if (errEstado) return { success: false, error: errEstado };

      await this.registrarAuditoria(
        usuarioId,
        'solicitud',
        id,
        'recalendarizacion',
        { fecha_tentativa_despacho: fechaAnterior },
        { fecha_tentativa_despacho: nuevaFecha, motivo: motivo?.trim() || null }
      );

      return { success: true, fechaAnterior };
    } catch (err: unknown) {
      return { success: false, error: mensajeErrorUsuario(err, 'Error inesperado al reprogramar') };
    }
  }

  /**
   * R8: Logística cancela una solicitud en tránsito por una eventualidad.
   * La función SQL `fn_cancelar_solicitud_en_transito` lo hace en una sola
   * transacción: estado `cancelada` con el motivo, reservas liberadas y el
   * vehículo en la ubicación indicada (`null` = sin ubicación, p. ej. en ruta).
   */
  static async cancelarEnTransito(
    id: string,
    motivo: string,
    ubicacionId: number | null,
    usuarioId: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const errorMotivo = validarMotivoCancelacion(motivo);
      if (errorMotivo) return { success: false, error: errorMotivo };

      const actual = await this.getSolicitudById(id);
      if (!actual) return { success: false, error: 'Solicitud no encontrada.' };
      if (actual.estado !== 'en_transito') {
        return { success: false, error: 'Solo las solicitudes En Tránsito pueden cancelarse con esta acción.' };
      }

      const admin = createAdminClient();
      const { error } = await admin.rpc('fn_cancelar_solicitud_en_transito', {
        p_solicitud_id: id,
        p_usuario_id: usuarioId,
        p_motivo: motivo.trim(),
        p_ubicacion: ubicacionId,
      });
      if (error) return { success: false, error: mensajeErrorUsuario(error, 'No se pudo cancelar el traslado.') };

      if (actual.posicion_prioridad !== null) {
        const errReesc = await SolicitudesService.renumerarColaSucursal(admin, actual.sucursal);
        if (errReesc) console.error('No se pudo compactar la cola tras cancelar en tránsito:', errReesc);
      }

      await this.registrarAuditoria(
        usuarioId,
        'solicitud',
        id,
        'cancelacion_transito',
        { estado: 'en_transito' },
        { estado: 'cancelada', motivo: motivo.trim(), ubicacion: ubicacionId }
      );

      return { success: true };
    } catch (err: unknown) {
      return { success: false, error: mensajeErrorUsuario(err, 'Error inesperado al cancelar el traslado') };
    }
  }

  static async finalizarSolicitud(
    id: string,
    usuarioId: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const admin = createAdminClient();

      const actual = await this.getSolicitudById(id);
      if (!actual) return { success: false, error: 'Solicitud no encontrada.' };
      if (actual.estado !== 'entregada') {
        return { success: false, error: 'Solo las solicitudes Recepcionadas pueden entregarse al cliente.' };
      }

      const usuario = await SolicitudesService.getUsuarioRolSucursal(admin, usuarioId);
      if (!usuario) return { success: false, error: 'Usuario no encontrado.' };

      if (usuario.rol !== 'administrador') {
        const esJefeLocalDestino =
          usuario.rol === 'jefe_local' && (await this.usuarioPuedeRecibirEn(usuarioId, actual));
        const esEjecutivoCreador = usuario.rol === 'ejecutivo' && actual.ejecutivo_id === usuarioId;

        if (!esJefeLocalDestino && !esEjecutivoCreador) {
          return {
            success: false,
            error: 'Solo el jefe de local de la sucursal destino o el ejecutivo que creó la solicitud pueden finalizarla.',
          };
        }
      }

      const errEstado = await SolicitudesService.actualizarSiEstado(admin, id, actual.estado, {
          estado: 'finalizada',
          fecha_entrega_cliente: new Date().toISOString(),
          posicion_prioridad: null,
        });
      if (errEstado) return { success: false, error: errEstado };

      await this.registrarAuditoria(
        usuarioId,
        'solicitud',
        id,
        'finalizacion',
        { estado: 'entregada' },
        { estado: 'finalizada' }
      );

      return { success: true };
    } catch (err: unknown) {
      return { success: false, error: mensajeErrorUsuario(err, 'Error inesperado al finalizar') };
    }
  }

  // ---------------------------------------------------------------------------
  // DEV 2 — Asignación de encargado de Logística
  // ---------------------------------------------------------------------------

  /**
   * Logística se auto-asigna (o designa a otro member de logística) como
   * encargado de la solicitud: `aprobada` | `priorizada` -> `asignada`.
   *
   * `logistica_id` ya existía en `public.solicitud` y se reusa como
   * "encargado de la solicitud" (no se crea `encargado_logistica_id`).
   */
  static async asignarEncargadoLogistica(
    id: string,
    logisticaId: string,
    usuarioId?: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const admin = createAdminClient();

      const actual = await this.getSolicitudById(id);
      if (!actual) return { success: false, error: 'Solicitud no encontrada.' };

      if (!ESTADOS_ASIGNABLES.includes(actual.estado as (typeof ESTADOS_ASIGNABLES)[number])) {
        return {
          success: false,
          error: 'Solo las solicitudes Aprobadas o Priorizadas pueden asignarse a un encargado de Logística.',
        };
      }

      const { data: encargado, error: userError } = await admin
        .from('usuario')
        .select('id, rol, activo')
        .eq('id', logisticaId)
        .maybeSingle();

      if (userError || !encargado) {
        return { success: false, error: 'El encargado indicado no existe.' };
      }
      if (encargado.rol !== 'logistica' && encargado.rol !== 'administrador') {
        return { success: false, error: 'El encargado debe tener el rol Logística.' };
      }
      if (encargado.activo === false) {
        return { success: false, error: 'El encargado indicado está inactivo.' };
      }

      const errEstado = await SolicitudesService.actualizarSiEstado(admin, id, actual.estado, { estado: 'asignada', logistica_id: logisticaId });
      if (errEstado) return { success: false, error: errEstado };

      await this.registrarAuditoria(
        usuarioId ?? logisticaId,
        'solicitud',
        id,
        'asignacion_logistica',
        { estado: actual.estado, logistica_id: actual.logistica_id ?? null },
        { estado: 'asignada', logistica_id: logisticaId }
      );

      return { success: true };
    } catch (err: unknown) {
      return { success: false, error: mensajeErrorUsuario(err, 'Error inesperado al asignar el encargado') };
    }
  }

  // ---------------------------------------------------------------------------
  // DEV 2 — Insistencia del Ejecutivo (cooldown 24 h)
  // ---------------------------------------------------------------------------

  /**
   * Registra una insistencia del ejecutivo sobre su propia solicitud.
   * Solo 1 vez cada {@link COOLDOWN_INSISTENCIA_HORAS} horas por solicitud.
   */
  static async insistirSolicitud(
    id: string,
    usuarioId: string,
    mensaje?: string | null
  ): Promise<{
    success: boolean;
    error?: string;
    proxima_insistencia_en_h?: number;
  }> {
    try {
      const admin = createAdminClient();

      const actual = await this.getSolicitudById(id);
      if (!actual) return { success: false, error: 'Solicitud no encontrada.' };
      if (actual.ejecutivo_id !== usuarioId) {
        return { success: false, error: 'Solo puedes insistir sobre tus propias solicitudes.' };
      }
      if (!ESTADOS_INSISTIBLES.includes(actual.estado as (typeof ESTADOS_INSISTIBLES)[number])) {
        return {
          success: false,
          error: `No se puede insistir sobre una solicitud en estado "${actual.estado}".`,
        };
      }

      const cooldown = await this.getUltimaInsistencia(id, usuarioId);
      if (cooldown) {
        const transcurridoHoras = (Date.now() - new Date(cooldown.created_at).getTime()) / 3_600_000;
        const restantes = COOLDOWN_INSISTENCIA_HORAS - transcurridoHoras;
        if (restantes > 0) {
          const horas = Math.floor(restantes);
          const minutos = Math.round((restantes - horas) * 60);
          return {
            success: false,
            error: `Ya insististe sobre esta solicitud. Podrás insistir de nuevo en ${horas}h ${minutos}min.`,
            proxima_insistencia_en_h: Math.ceil(restantes),
          };
        }
      }

      const texto = mensaje?.trim();
      const { error } = await admin.from('insistencia').insert({
        solicitud_id: id,
        usuario_id: usuarioId,
        mensaje: texto && texto.length > 0 ? texto : null,
      });

      if (error) return { success: false, error: mensajeErrorUsuario(error, 'No se pudo completar la operación.') };

      await admin.from('observacion').insert({
        solicitud_id: id,
        usuario_id: usuarioId,
        observacion: `[INSISTENCIA] ${texto && texto.length > 0 ? texto : 'Solicito avanzar el estado de mi solicitud.'}`,
      });

      await this.registrarAuditoria(
        usuarioId,
        'solicitud',
        id,
        'insistencia',
        { estado: actual.estado },
        { estado: actual.estado, mensaje: texto || null }
      );

      return { success: true, proxima_insistencia_en_h: COOLDOWN_INSISTENCIA_HORAS };
    } catch (err: unknown) {
      return { success: false, error: mensajeErrorUsuario(err, 'Error inesperado al insistir') };
    }
  }

  /** Última insistencia del usuario sobre la solicitud, si existe. */
  static async getUltimaInsistencia(
    solicitudId: string,
    usuarioId: string
  ): Promise<InsistenciaEntry | null> {
    try {
      const admin = createAdminClient();
      const { data, error } = await admin
        .from('insistencia')
        .select('id, solicitud_id, usuario_id, mensaje, created_at')
        .eq('solicitud_id', solicitudId)
        .eq('usuario_id', usuarioId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error || !data) return null;
      return data as InsistenciaEntry;
    } catch (err) {
      console.error('Error en getUltimaInsistencia:', err);
      return null;
    }
  }

  /** Historial de insistencias de una solicitud (para la UI y la trazabilidad). */
  static async getInsistencias(solicitudId: string): Promise<InsistenciaEntry[]> {
    try {
      const admin = createAdminClient();
      const { data, error } = await admin
        .from('insistencia')
        .select('id, solicitud_id, usuario_id, mensaje, created_at, usuario:usuario_id(nombre, apellido)')
        .eq('solicitud_id', solicitudId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error al listar insistencias:', error);
        return [];
      }

      return ((data || []) as unknown as Array<Omit<InsistenciaEntry, 'usuario_nombre'> & {
        usuario: { nombre: string; apellido: string } | null;
      }>).map((r) => ({ ...r, usuario_nombre: persona(r.usuario) }));
    } catch (err) {
      console.error('Error en getInsistencias:', err);
      return [];
    }
  }

  /**
   * Horas restantes de cooldown para un ejecutivo sobre su solicitud.
   * `null` = puede insistir ahora mismo.
   */
  static async getCooldownInsistencia(
    solicitudId: string,
    usuarioId: string
  ): Promise<{ horas_restantes: number | null; ultima: string | null }> {
    const ultima = await this.getUltimaInsistencia(solicitudId, usuarioId);
    if (!ultima) return { horas_restantes: null, ultima: null };

    const transcurridoHoras = (Date.now() - new Date(ultima.created_at).getTime()) / 3_600_000;
    const restantes = COOLDOWN_INSISTENCIA_HORAS - transcurridoHoras;
    if (restantes <= 0) return { horas_restantes: null, ultima: ultima.created_at };
    return { horas_restantes: Math.ceil(restantes), ultima: ultima.created_at };
  }
}
