import { createAdminClient } from '@/lib/supabase/admin';
import {
  CreateSucursalInput,
  Sucursal,
  SucursalSolicitudItem,
  UpdateSucursalInput,
  VehiculoAsociado,
} from '@/types/sucursal.types';
import { mensajeErrorUsuario } from '@/lib/errores';
import { escaparPatronLike } from '@/lib/busqueda';

interface SolicitudRawRow {
  id: string;
  sucursal: number;
  estado: SucursalSolicitudItem['estado'];
  tipo_solicitud: SucursalSolicitudItem['tipo_solicitud'];
  posicion_prioridad: number | null;
  fecha_creacion: string | null;
  fecha_tentativa_despacho: string | null;
  fecha_limite: string | null;
  motivo_cancelacion: string | null;
  ejecutivo: { id: string; nombre: string; apellido: string } | null;
  jefe: { id: string; nombre: string; apellido: string } | null;
  logistica: { id: string; nombre: string; apellido: string } | null;
  solicitud_vehiculo: Array<{
    id: string;
    disponibilidad: VehiculoAsociado['disponibilidad'];
    vehiculo: {
      patente: string;
      chasis: string;
      marca: string;
      modelo: string;
      anio: number;
      color: string | null;
    } | null;
  }> | null;
}

function formatPersona(p: { nombre: string; apellido: string } | null): string | null {
  if (!p) return null;
  return `${p.nombre} ${p.apellido}`.trim();
}

export class SucursalesService {
  static async getSucursales(): Promise<Sucursal[]> {
    try {
      const admin = createAdminClient();
      const { data, error } = await admin
        .from('sucursal')
        .select('*, encargado:usuario_id(id, nombre, apellido), zona:zona_id(id, nombre)')
        .order('nombre', { ascending: true });

      if (error) {
        console.error('Error al listar sucursales:', error);
        return [];
      }

      return (data || []) as unknown as Sucursal[];
    } catch (err) {
      console.error('Error en getSucursales:', err);
      return [];
    }
  }

  /** Slots de las sucursales indicadas (para badge del navbar / vista de slots). */
  static async getSlotsPorSucursales(ids: number[]): Promise<
    Array<{ id: number; nombre: string | null; slots: number | null; slots_ocupados: number | null; slots_reservados: number | null }>
  > {
    if (!ids || ids.length === 0) return [];
    try {
      const admin = createAdminClient();
      const { data, error } = await admin
        .from('sucursal')
        .select('id, nombre, slots, slots_ocupados, slots_reservados')
        .in('id', ids)
        .order('nombre', { ascending: true });

      if (error) {
        console.error('Error al obtener slots por sucursales:', error);
        return [];
      }
      return (data || []) as unknown as Array<{
        id: number;
        nombre: string | null;
        slots: number | null;
        slots_ocupados: number | null;
        slots_reservados: number | null;
      }>;
    } catch (err) {
      console.error('Error en getSlotsPorSucursales:', err);
      return [];
    }
  }

  static async getSolicitudesPorSucursal(): Promise<SucursalSolicitudItem[]> {
    try {
      const admin = createAdminClient();
      const { data, error } = await admin
        .from('solicitud')
        .select(
          `id, sucursal, estado, tipo_solicitud, posicion_prioridad,
           fecha_creacion, fecha_tentativa_despacho, fecha_limite, motivo_cancelacion,
           ejecutivo:ejecutivo_id(id, nombre, apellido),
           jefe:jefe_local_id(id, nombre, apellido),
           logistica:logistica_id(id, nombre, apellido),
           solicitud_vehiculo(id, disponibilidad, vehiculo(chasis, patente, marca, modelo, anio, color))`
        )
        .order('fecha_creacion', { ascending: false });

      if (error) {
        console.error('Error al obtener solicitudes por sucursal:', error);
        return [];
      }

      const rows = (data || []) as unknown as SolicitudRawRow[];

      return rows.map((row) => ({
        id: row.id,
        sucursal: row.sucursal,
        estado: row.estado,
        tipo_solicitud: row.tipo_solicitud,
        posicion_prioridad: row.posicion_prioridad,
        fecha_creacion: row.fecha_creacion,
        fecha_tentativa_despacho: row.fecha_tentativa_despacho,
        fecha_limite: row.fecha_limite,
        motivo_cancelacion: row.motivo_cancelacion,
        ejecutivo: formatPersona(row.ejecutivo) || 'Sin responsable',
        jefe_local: formatPersona(row.jefe),
        logistica: formatPersona(row.logistica),
        ejecutivo_id: row.ejecutivo?.id ?? null,
        jefe_local_id: row.jefe?.id ?? null,
        logistica_id: row.logistica?.id ?? null,
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
      }));
    } catch (err) {
      console.error('Error en getSolicitudesPorSucursal:', err);
      return [];
    }
  }

  static async createSucursal(input: CreateSucursalInput): Promise<{
    success: boolean;
    sucursal?: Sucursal;
    error?: string;
  }> {
    try {
      const admin = createAdminClient();

      const { data: existing } = await admin
        .from('sucursal')
        .select('id, nombre')
        .ilike('nombre', escaparPatronLike(input.nombre.trim()));

      if (existing && existing.length > 0) {
        return {
          success: false,
          error: `Ya existe una sucursal registrada con el nombre "${input.nombre.trim()}".`,
        };
      }

      const { data, error } = await admin
        .from('sucursal')
        .insert({
          nombre: input.nombre.trim(),
          direccion: input.direccion?.trim() || null,
          slots: input.slots,
          zona_id: input.zona_id ?? null,
        })
        .select()
        .single();

      if (error) {
        return { success: false, error: mensajeErrorUsuario(error, 'No se pudo completar la operación.') };
      }

      return { success: true, sucursal: data as Sucursal };
    } catch (err: unknown) {
      const msg = mensajeErrorUsuario(err, 'Error inesperado al crear la sucursal');
      return { success: false, error: msg };
    }
  }

  static async updateSucursal(id: number, input: UpdateSucursalInput): Promise<{
    success: boolean;
    sucursal?: Sucursal;
    error?: string;
  }> {
    try {
      const admin = createAdminClient();

      if (input.nombre !== undefined) {
        const { data: existing } = await admin
          .from('sucursal')
          .select('id')
          .ilike('nombre', escaparPatronLike(input.nombre.trim()))
          .neq('id', id);

        if (existing && existing.length > 0) {
          return {
            success: false,
            error: `Ya existe otra sucursal con el nombre "${input.nombre.trim()}".`,
          };
        }
      }

      const updateData: Record<string, unknown> = {};
      if (input.nombre !== undefined) updateData.nombre = input.nombre.trim();
      if (input.direccion !== undefined) updateData.direccion = input.direccion?.trim() || null;
      if (input.slots !== undefined) updateData.slots = input.slots;
      if (input.zona_id !== undefined) updateData.zona_id = input.zona_id ?? null;

      const { data, error } = await admin
        .from('sucursal')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        return { success: false, error: mensajeErrorUsuario(error, 'No se pudo completar la operación.') };
      }

      return { success: true, sucursal: data as Sucursal };
    } catch (err: unknown) {
      const msg = mensajeErrorUsuario(err, 'Error inesperado al actualizar la sucursal');
      return { success: false, error: msg };
    }
  }

  /**
   * Elimina una sucursal solo si nada depende de ella (brecha 016).
   *
   * Antes la FK `solicitud.sucursal` era ON DELETE CASCADE: borrar la sucursal
   * borraba sus solicitudes (incluidas ventas finalizadas), observaciones,
   * reservas y metadatos de documentos, y dejaba archivos huérfanos en Storage.
   * Ahora la FK es RESTRICT y aquí se valida antes cada dependencia para dar un
   * mensaje claro.
   */
  static async deleteSucursal(id: number): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {
      const admin = createAdminClient();

      const dependencias: Array<{ cantidad: number | null; mensaje: string }> = [];

      const { count: usuarios, error: eUsuarios } = await admin
        .from('usuario')
        .select('id', { count: 'exact', head: true })
        .eq('sucursal_id', id);
      if (eUsuarios) return { success: false, error: mensajeErrorUsuario(eUsuarios, 'No se pudo verificar la sucursal.') };
      dependencias.push({ cantidad: usuarios, mensaje: 'usuario(s) con esta sucursal asignada' });

      const { count: solicitudes, error: eSolicitudes } = await admin
        .from('solicitud')
        .select('id', { count: 'exact', head: true })
        .or(`sucursal.eq.${id},sucursal_destino.eq.${id}`);
      if (eSolicitudes) return { success: false, error: mensajeErrorUsuario(eSolicitudes, 'No se pudo verificar la sucursal.') };
      dependencias.push({ cantidad: solicitudes, mensaje: 'solicitud(es) de origen o destino' });

      const { count: vehiculos, error: eVehiculos } = await admin
        .from('vehiculo')
        .select('id', { count: 'exact', head: true })
        .eq('ubicacion', id);
      if (eVehiculos) return { success: false, error: mensajeErrorUsuario(eVehiculos, 'No se pudo verificar la sucursal.') };
      dependencias.push({ cantidad: vehiculos, mensaje: 'vehículo(s) ubicados en ella' });

      const { count: traslados, error: eTraslados } = await admin
        .from('traslado_interno')
        .select('id', { count: 'exact', head: true })
        .or(`origen_id.eq.${id},destino_id.eq.${id}`);
      if (eTraslados) return { success: false, error: mensajeErrorUsuario(eTraslados, 'No se pudo verificar la sucursal.') };
      dependencias.push({ cantidad: traslados, mensaje: 'traslado(s) interno(s)' });

      const bloqueos = dependencias
        .filter((d) => (d.cantidad || 0) > 0)
        .map((d) => `${d.cantidad} ${d.mensaje}`);

      if (bloqueos.length > 0) {
        return {
          success: false,
          error: `No se puede eliminar la sucursal: tiene ${bloqueos.join(', ')}. Reasigna o cierra esos registros primero.`,
        };
      }

      const { error: deleteError } = await admin.from('sucursal').delete().eq('id', id);

      if (deleteError) {
        return { success: false, error: mensajeErrorUsuario(deleteError, 'No se pudo eliminar la sucursal.') };
      }

      return { success: true };
    } catch (err: unknown) {
      return { success: false, error: mensajeErrorUsuario(err, 'Error inesperado al eliminar la sucursal') };
    }
  }
}
