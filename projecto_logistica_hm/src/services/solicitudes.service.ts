import { createAdminClient } from '@/lib/supabase/admin';
import {
  CreateSolicitudInput,
  SolicitudLista,
  VehiculoInventario,
  ObservacionEntry,
  AuditoriaEntry,
} from '@/types/solicitud.types';

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
  fecha_limite: string | null;
  motivo_cancelacion: string | null;
  direccion_evento: string | null;
  titulo_evento: string | null;
  suc: { nombre: string | null } | null;
  destino: { nombre: string | null } | null;
  ejecutivo: { nombre: string; apellido: string } | null;
  jefe: { nombre: string; apellido: string } | null;
  logistica: { nombre: string; apellido: string } | null;
  solicitud_vehiculo: Array<{
    id: string;
    disponibilidad: 'reservado' | 'liberado';
    vehiculo: {
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
  fecha_creacion, fecha_tentativa_despacho, fecha_limite, motivo_cancelacion,
  direccion_evento, titulo_evento,
  suc:sucursal!solicitud_sucursal_fkey(nombre),
  destino:sucursal!solicitud_sucursal_destino_fkey(nombre),
  ejecutivo:ejecutivo_id(nombre, apellido),
  jefe:jefe_local_id(nombre, apellido),
  logistica:logistica_id(nombre, apellido),
  solicitud_vehiculo(id, disponibilidad, vehiculo(patente, marca, modelo, anio, color))`;

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
    fecha_limite: row.fecha_limite,
    motivo_cancelacion: row.motivo_cancelacion,
    direccion_evento: row.direccion_evento,
    titulo_evento: row.titulo_evento,
    vehiculos: (row.solicitud_vehiculo || [])
      .filter((sv) => sv.vehiculo)
      .map((sv) => ({
        solicitud_vehiculo_id: sv.id,
        disponibilidad: sv.disponibilidad,
        patente: sv.vehiculo!.patente,
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
  ejecutivo_id: string | null;
  jefe_local_id: string | null;
  tipo_solicitud: SolicitudLista['tipo_solicitud'];
}

export class SolicitudesService {
  static async getSolicitudes(): Promise<SolicitudLista[]> {
    try {
      const admin = createAdminClient();
      const { data, error } = await admin
        .from('solicitud')
        .select(SOLICITUD_SELECT)
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

  static async getVehiculosInventario(): Promise<VehiculoInventario[]> {
    try {
      const admin = createAdminClient();

      const { data: vehiculos, error } = await admin
        .from('vehiculo')
        .select('id, patente, marca, modelo, anio, color')
        .order('patente', { ascending: true });

      if (error) {
        console.error('Error al listar vehículos:', error);
        return [];
      }

      const { data: reservas, error: reservasError } = await admin
        .from('solicitud_vehiculo')
        .select('vehiculo_id, solicitud!inner(estado)')
        .eq('disponibilidad', 'reservado')
        .in('solicitud.estado', [...ESTADOS_ACTIVOS_RESERVA]);

      if (reservasError) {
        console.error('Error al consultar reservas activas:', reservasError);
      }

      const ocupados = new Set<string>(
        (reservas || []).map((r) => (r as unknown as { vehiculo_id: string }).vehiculo_id)
      );

      return ((vehiculos || []) as VehiculoInventario[]).map((v) => ({
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
        .select('id, estado, sucursal, ejecutivo_id, jefe_local_id, tipo_solicitud')
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
    vehiculoIds: string[]
  ): Promise<{ success: boolean; solicitud?: SolicitudLista; error?: string }> {
    try {
      const admin = createAdminClient();

      const insertData: Record<string, unknown> = {
        sucursal: input.sucursal,
        tipo_solicitud: input.tipo_solicitud,
        fecha_limite: input.fecha_limite?.trim() || null,
      };

      if (input.ejecutivo_id) {
        insertData.ejecutivo_id = input.ejecutivo_id;
      }

      if (input.tipo_solicitud === 'venta' && input.sucursal_destino) {
        insertData.sucursal_destino = input.sucursal_destino;
      }

      if (input.tipo_solicitud === 'evento') {
        insertData.direccion_evento = input.direccion_evento?.trim() || null;
        insertData.titulo_evento = input.titulo_evento?.trim() || null;
      }

      const { data, error } = await admin
        .from('solicitud')
        .insert(insertData)
        .select('id')
        .single();

      if (error) {
        return { success: false, error: error.message };
      }

      const solicitudId = (data as unknown as { id: string }).id;

      if (vehiculoIds.length > 0) {
        const { error: svError } = await admin.from('solicitud_vehiculo').insert(
          vehiculoIds.map((vid) => ({
            solicitud_id: solicitudId,
            vehiculo_id: vid,
            disponibilidad: 'reservado' as const,
          }))
        );

        if (svError) {
          return {
            success: true,
            solicitud: undefined,
            error: `Solicitud creada pero falló la reserva de vehículos: ${svError.message}`,
          };
        }
      }

      const solicitud = await this.getSolicitudCompleta(solicitudId);
      return { success: true, solicitud: solicitud || undefined };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error inesperado al crear la solicitud';
      return { success: false, error: msg };
    }
  }

  static async priorizarSolicitud(id: string): Promise<{ success: boolean; posicion?: number; error?: string }> {
    try {
      const admin = createAdminClient();

      const actual = await this.getSolicitudById(id);
      if (!actual) return { success: false, error: 'Solicitud no encontrada.' };
      if (!['pendiente', 'aprobada'].includes(actual.estado)) {
        return { success: false, error: 'Solo las solicitudes Pendientes o Aprobadas pueden priorizarse.' };
      }

      const { data: maxRow } = await admin
        .from('solicitud')
        .select('posicion_prioridad')
        .not('posicion_prioridad', 'is', null)
        .order('posicion_prioridad', { ascending: false })
        .limit(1);

      const siguiente =
        ((maxRow?.[0] as unknown as { posicion_prioridad: number | null } | undefined)
          ?.posicion_prioridad ?? 0) + 1;

      const { error } = await admin
        .from('solicitud')
        .update({ estado: 'priorizada', posicion_prioridad: siguiente })
        .eq('id', id);

      if (error) return { success: false, error: error.message };
      return { success: true, posicion: siguiente };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error inesperado al priorizar';
      return { success: false, error: msg };
    }
  }

  static async cancelarSolicitud(id: string, motivo: string): Promise<{ success: boolean; error?: string }> {
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

      const { error } = await admin
        .from('solicitud')
        .update({ estado: 'cancelada', motivo_cancelacion: motivo.trim() })
        .eq('id', id);

      if (error) return { success: false, error: error.message };
      return { success: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error inesperado al cancelar';
      return { success: false, error: msg };
    }
  }

  static async eliminarSolicitud(id: string): Promise<{ success: boolean; error?: string }> {
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
      if (error) return { success: false, error: error.message };
      return { success: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error inesperado al eliminar';
      return { success: false, error: msg };
    }
  }

  static async aprobarSolicitud(
    id: string,
    userId: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const admin = createAdminClient();

      const actual = await this.getSolicitudById(id);
      if (!actual) return { success: false, error: 'Solicitud no encontrada.' };
      if (actual.estado !== 'pendiente_aprobacion') {
        return { success: false, error: 'Solo se pueden aprobar solicitudes pendientes de aprobación.' };
      }

      const { error } = await admin
        .from('solicitud')
        .update({ estado: 'aprobada' })
        .eq('id', id);

      if (error) return { success: false, error: error.message };

      await this.registrarAuditoria(userId, 'solicitud', id, 'aprobacion', { estado: actual.estado }, { estado: 'aprobada' });
      return { success: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error inesperado al aprobar';
      return { success: false, error: msg };
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

      const { error: updateError } = await admin
        .from('solicitud')
        .update({ estado: 'rechazada' })
        .eq('id', id);

      if (updateError) return { success: false, error: updateError.message };

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
      const msg = err instanceof Error ? err.message : 'Error inesperado al rechazar';
      return { success: false, error: msg };
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

      const { error } = await admin.from('observacion').insert({
        solicitud_id: solicitudId,
        usuario_id: userId,
        observacion: texto.trim(),
      });

      if (error) return { success: false, error: error.message };
      return { success: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error inesperado al agregar observación';
      return { success: false, error: msg };
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

  static async getEjecutivosPorSucursal(sucursalId: number): Promise<Array<{ id: string; nombre: string; apellido: string }>> {
    try {
      const admin = createAdminClient();
      const { data, error } = await admin
        .from('usuario')
        .select('id, nombre, apellido')
        .eq('rol', 'ejecutivo')
        .eq('activo', true)
        .eq('sucursal_id', sucursalId);

      if (error || !data) return [];
      return data as unknown as Array<{ id: string; nombre: string; apellido: string }>;
    } catch (err) {
      console.error('Error en getEjecutivosPorSucursal:', err);
      return [];
    }
  }

  static async agregarVehiculo(
    solicitudId: string,
    vehiculoId: string
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

      const { error } = await admin.from('solicitud_vehiculo').insert({
        solicitud_id: solicitudId,
        vehiculo_id: vehiculoId,
        disponibilidad: 'reservado',
      });

      if (error) return { success: false, error: error.message };
      return { success: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error inesperado al reservar vehículo';
      return { success: false, error: msg };
    }
  }

  static async quitarVehiculo(solicitudVehiculoId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const admin = createAdminClient();

      const { data: sv } = await admin
        .from('solicitud_vehiculo')
        .select('id, solicitud_id')
        .eq('id', solicitudVehiculoId)
        .maybeSingle();

      if (!sv) return { success: false, error: 'Reserva no encontrada.' };

      const solicitudId = (sv as unknown as { solicitud_id: string }).solicitud_id;
      const actual = await this.getSolicitudById(solicitudId);
      if (!actual) return { success: false, error: 'Solicitud no encontrada.' };
      if (!ESTADOS_PRE_DESPACHO.includes(actual.estado)) {
        return { success: false, error: 'Los vehículos solo se gestionan pre-despacho.' };
      }

      const { error } = await admin.from('solicitud_vehiculo').delete().eq('id', solicitudVehiculoId);
      if (error) return { success: false, error: error.message };
      return { success: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error inesperado al liberar vehículo';
      return { success: false, error: msg };
    }
  }
}
