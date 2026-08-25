import { createAdminClient } from '@/lib/supabase/admin';
import {
  CreateSolicitudInput,
  SolicitudLista,
  VehiculoInventario,
} from '@/types/solicitud.types';

export const ESTADOS_ACTIVOS_RESERVA = [
  'pendiente',
  'priorizada',
  'asignada',
  'calendarizada',
  'en_transito',
] as const;

const ESTADOS_PRE_DESPACHO = ['pendiente', 'priorizada'];

interface SolicitudRawRow {
  id: string;
  sucursal: number;
  estado: SolicitudLista['estado'];
  tipo_solicitud: SolicitudLista['tipo_solicitud'];
  posicion_prioridad: number | null;
  ejecutivo_id: string;
  jefe_local_id: string | null;
  logistica_id: string | null;
  fecha_creacion: string | null;
  fecha_tentativa_despacho: string | null;
  fecha_limite: string | null;
  motivo_cancelacion: string | null;
  suc: { nombre: string | null } | null;
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

export interface SolicitudMinima {
  id: string;
  estado: SolicitudLista['estado'];
  sucursal: number;
  ejecutivo_id: string;
}

export class SolicitudesService {
  static async getSolicitudes(): Promise<SolicitudLista[]> {
    try {
      const admin = createAdminClient();
      const { data, error } = await admin
        .from('solicitud')
        .select(
          `id, sucursal, estado, tipo_solicitud, posicion_prioridad,
           ejecutivo_id, jefe_local_id, logistica_id,
           fecha_creacion, fecha_tentativa_despacho, fecha_limite, motivo_cancelacion,
           suc:sucursal(nombre),
           ejecutivo:ejecutivo_id(nombre, apellido),
           jefe:jefe_local_id(nombre, apellido),
           logistica:logistica_id(nombre, apellido),
           solicitud_vehiculo(id, disponibilidad, vehiculo(patente, marca, modelo, anio, color))`
        )
        .order('fecha_creacion', { ascending: false });

      if (error) {
        console.error('Error al listar solicitudes:', error);
        return [];
      }

      const rows = (data || []) as unknown as SolicitudRawRow[];

      return rows.map((row) => ({
        id: row.id,
        sucursal: row.sucursal,
        sucursal_nombre: row.suc?.nombre ?? null,
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
      }));
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
        .select('id, estado, sucursal, ejecutivo_id')
        .eq('id', id)
        .maybeSingle();

      if (error || !data) return null;
      return data as unknown as SolicitudMinima;
    } catch (err) {
      console.error('Error en getSolicitudById:', err);
      return null;
    }
  }

  static async createSolicitud(
    input: CreateSolicitudInput,
    vehiculoIds: string[]
  ): Promise<{ success: boolean; solicitud?: SolicitudLista; error?: string }> {
    try {
      const admin = createAdminClient();

      const { data, error } = await admin
        .from('solicitud')
        .insert({
          ejecutivo_id: input.ejecutivo_id,
          sucursal: input.sucursal,
          tipo_solicitud: input.tipo_solicitud,
          fecha_limite: input.fecha_limite?.trim() || null,
        })
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

      return { success: true };
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
      if (actual.estado !== 'pendiente') {
        return { success: false, error: 'Solo las solicitudes en estado Pendiente pueden priorizarse.' };
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
            'Regla de negocio: solo se pueden eliminar solicitudes pre-despacho (pendientes o priorizadas). Las canceladas quedan como registro histórico.',
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
