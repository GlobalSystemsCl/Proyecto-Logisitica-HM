import { createAdminClient } from '@/lib/supabase/admin';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  CreateSolicitudInput,
  SolicitudLista,
  VehiculoInventario,
  ObservacionEntry,
  AuditoriaEntry,
  DocumentoSolicitud,
} from '@/types/solicitud.types';
import { UserRole } from '@/types/auth.types';
import { DisponibilidadVehiculo } from '@/types/sucursal.types';
import { esFechaAnteriorAHoy } from '@/lib/fechas';

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

const BUCKET_DOCUMENTOS = 'solicitud-documentos';
const MAX_TAMANO_DOCUMENTO = 10 * 1024 * 1024;
const MIMES_DOCUMENTOS = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/csv',
  'application/zip',
]);

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
  direccion_evento, titulo_evento,
  suc:sucursal!solicitud_sucursal_fkey(nombre),
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
    motivo_cancelacion: row.motivo_cancelacion,
    direccion_evento: row.direccion_evento,
    titulo_evento: row.titulo_evento,
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

  static usuarioEnSucursalRecepcion(
    sucursalUsuario: number | null,
    solicitud: SolicitudMinima
  ): boolean {
    if (sucursalUsuario === null) return false;
    return solicitud.sucursal_destino !== null
      ? sucursalUsuario === solicitud.sucursal_destino
      : sucursalUsuario === solicitud.sucursal;
  }

  static async getJefeLocalDeSucursal(sucursalId: number): Promise<string | null> {
    try {
      const admin = createAdminClient();
      const { data, error } = await admin
        .from('usuario')
        .select('id')
        .eq('rol', 'jefe_local')
        .eq('sucursal_id', sucursalId)
        .limit(1);

      if (error) {
        console.error('Error al consultar jefe de local de la sucursal:', error);
        return null;
      }

      return (data && data.length > 0 ? (data[0] as { id: string }).id : null) ?? null;
    } catch (err) {
      console.error('Error en getJefeLocalDeSucursal:', err);
      return null;
    }
  }

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
        .select('id, chasis, patente, marca, modelo, anio, color')
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

      const { data: vendidos, error: vendidosError } = await admin
        .from('solicitud_vehiculo')
        .select('vehiculo_id')
        .eq('disponibilidad', 'vendido');

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
        .select('id, estado, sucursal, sucursal_destino, ejecutivo_id, jefe_local_id, tipo_solicitud, posicion_prioridad')
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
          error: `No se pudo verificar la disponibilidad de los vehículos: ${reservasError.message}`,
        };
      }

      if (reservasActivas && reservasActivas.length > 0) {
        return {
          success: false,
          error: 'Uno o más vehículos seleccionados ya están reservados en otra solicitud activa.',
        };
      }

      if (input.tipo_solicitud === 'venta' && input.sucursal_destino) {
        const { data: sucursal, error: sucError } = await admin
          .from('sucursal')
          .select('slots, slots_ocupados')
          .eq('id', input.sucursal_destino)
          .single();

        if (!sucError && sucursal) {
          const slotsDisponibles = Math.max((sucursal.slots ?? 0) - (sucursal.slots_ocupados ?? 0), 0);
          if (vehiculoIds.length > slotsDisponibles) {
            return {
              success: false,
              error: `No hay slots disponibles en la sucursal destino. Disponibles: ${slotsDisponibles}, solicitados: ${vehiculoIds.length}.`,
            };
          }
        }
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
          error: `No se pudo reservar los vehículos: ${svError.message}`,
        };
      }

      for (const vid of vehiculoIds) {
        await this.registrarAuditoria(usuarioId, 'solicitud_vehiculo', solicitudId, 'ASIGNACION_VEHICULO', null, {
          solicitud_id: solicitudId,
          vehiculo_id: vid,
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
      const msg = err instanceof Error ? err.message : 'Error inesperado al crear la solicitud';
      return { success: false, error: msg };
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

      const { error } = await admin
        .from('solicitud')
        .update({ estado: 'priorizada', posicion_prioridad: siguiente })
        .eq('id', id);

      if (error) return { success: false, error: error.message };

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
      const msg = err instanceof Error ? err.message : 'Error inesperado al priorizar';
      return { success: false, error: msg };
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
        .select('id, estado')
        .in('id', orden);

      if (selError) return { success: false, error: selError.message };

      if (!filas || filas.length !== orden.length) {
        return { success: false, error: 'Algunas solicitudes del orden no existen.' };
      }

      const mapeo = new Map<string, string>((filas as Array<{ id: string; estado: string }>).map((f) => [f.id, f.estado]));
      for (const id of orden) {
        if (mapeo.get(id) !== 'priorizada') {
          return { success: false, error: 'Solo solicitudes priorizadas pueden reordenarse en la cola.' };
        }
      }

      const ant = await this.getColaPriorizada(sucursalId);

      const err = await SolicitudesService.reescribirCola(
        admin,
        orden,
        orden.map((id2, i) => ({ id: id2, pos: i + 1 }))
      );
      if (err) return { success: false, error: err };

      await this.registrarAuditoria(
        userId,
        'solicitud_cola',
        `sucursal_${sucursalId}`,
        'reorden_cola',
        ant,
        orden.map((id) => ({ id, posicion_prioridad: orden.indexOf(id) + 1 }))
      );

      return { success: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error inesperado al reordenar la cola';
      return { success: false, error: msg };
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
      const { error: eEstado } = await admin
        .from('solicitud')
        .update({ estado: 'priorizada' })
        .eq('id', id);
      if (eEstado) return { success: false, error: eEstado.message };

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
      const msg = err instanceof Error ? err.message : 'Error inesperado al priorizar en posición';
      return { success: false, error: msg };
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

      const { error } = await admin
        .from('solicitud')
        .update({ estado: 'aprobada', posicion_prioridad: null })
        .eq('id', id);

      if (error) return { success: false, error: error.message };

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
      const msg = err instanceof Error ? err.message : 'Error inesperado al sacar de la cola';
      return { success: false, error: msg };
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
    if (eNull) return eNull.message;

    for (const p of posiciones) {
      const { error: ePos } = await admin
        .from('solicitud')
        .update({ posicion_prioridad: p.pos })
        .eq('id', p.id);
      if (ePos) return ePos.message;
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
    if (eJunk) return eJunk.message;

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

      const { error } = await admin
        .from('solicitud')
        .update({ estado: 'cancelada', motivo_cancelacion: motivo.trim(), posicion_prioridad: null })
        .eq('id', id);

      if (error) return { success: false, error: error.message };

      if (actual.posicion_prioridad !== null) {
        const errReesc = await SolicitudesService.renumerarColaSucursal(admin, actual.sucursal);
        if (errReesc) return { success: false, error: errReesc };
      }

      await this.registrarAuditoria(userId, 'solicitud', id, 'CAMBIO_ESTADO', { estado: actual.estado }, { estado: 'cancelada', motivo: motivo.trim() });
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

      if (actual.posicion_prioridad !== null) {
        const errReesc = await SolicitudesService.renumerarColaSucursal(admin, actual.sucursal);
        if (errReesc) return { success: false, error: errReesc };
      }

      return { success: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error inesperado al eliminar';
      return { success: false, error: msg };
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
        return { success: false, error: 'Debes indicar la fecha de entrega para aprobar la solicitud.' };
      }
      if (isNaN(Date.parse(fechaEntrega))) {
        return { success: false, error: 'La fecha de entrega no es válida.' };
      }
      if (esFechaAnteriorAHoy(fechaEntrega)) {
        return { success: false, error: 'La fecha de entrega no puede ser anterior al día de hoy.' };
      }

      const actual = await this.getSolicitudById(id);
      if (!actual) return { success: false, error: 'Solicitud no encontrada.' };
      if (actual.estado !== 'pendiente_aprobacion') {
        return { success: false, error: 'Solo se pueden aprobar solicitudes pendientes de aprobación.' };
      }

      const { error } = await admin
        .from('solicitud')
        .update({ estado: 'aprobada', fecha_limite: fechaEntrega })
        .eq('id', id);

      if (error) return { success: false, error: error.message };

      await this.registrarAuditoria(userId, 'solicitud', id, 'aprobacion', { estado: actual.estado }, { estado: 'aprobada', fecha_entrega: fechaEntrega });
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

      for (const a of archivos) {
        if (a.tamano <= 0) return { success: false, error: `El archivo "${a.nombre}" está vacío.` };
        if (a.tamano > MAX_TAMANO_DOCUMENTO) {
          return { success: false, error: `El archivo "${a.nombre}" supera el máximo de 10 MB.` };
        }
        if (!MIMES_DOCUMENTOS.has(a.tipo)) {
          return { success: false, error: `El tipo del archivo "${a.nombre}" no está permitido.` };
        }
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
          if (eSub) throw new Error(eSub.message);
          subidos.push(ruta);

          const { error: eRow } = await admin.from('solicitud_documento').insert({
            solicitud_id: solicitudId,
            nombre_archivo: a.nombre.slice(0, 255),
            tipo_mime: a.tipo,
            tamano_bytes: a.tamano,
            ruta_storage: ruta,
            subido_por: usuarioId,
          });
          if (eRow) throw new Error(eRow.message);

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
        const msg = err instanceof Error ? err.message : 'Error al subir los documentos';
        return { success: false, error: msg };
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error inesperado al subir documentos';
      return { success: false, error: msg };
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
      if (eRem) return { success: false, error: eRem.message };

      const { error: eDel } = await admin.from('solicitud_documento').delete().eq('id', documentoId);
      if (eDel) return { success: false, error: eDel.message };

      await this.registrarAuditoria(usuarioId, 'solicitud', doc.solicitud_id, 'eliminar_documento', {
        id: doc.id,
        nombre_archivo: doc.nombre_archivo,
        ruta_storage: doc.ruta_storage,
      }, null);
      return { success: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error inesperado al eliminar el documento';
      return { success: false, error: msg };
    }
  }

  static async getURLDescarga(
    documentoId: string
  ): Promise<{ success: boolean; url?: string; error?: string }> {
    try {
      const admin = createAdminClient();
      const { data: doc, error: eDoc } = await admin
        .from('solicitud_documento')
        .select('ruta_storage')
        .eq('id', documentoId)
        .single();
      if (eDoc || !doc) return { success: false, error: 'El documento no existe.' };

      const { data: sign, error: eSign } = await admin.storage
        .from(BUCKET_DOCUMENTOS)
        .createSignedUrl(doc.ruta_storage, 300);
      if (eSign || !sign?.signedUrl) {
        return { success: false, error: eSign?.message || 'No se pudo generar el enlace de descarga.' };
      }

      return { success: true, url: sign.signedUrl };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error inesperado al generar la descarga';
      return { success: false, error: msg };
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

      if (actual.tipo_solicitud === 'venta' && actual.sucursal_destino) {
        const { count } = await admin
          .from('solicitud_vehiculo')
          .select('id', { count: 'exact', head: true })
          .eq('solicitud_id', solicitudId)
          .eq('disponibilidad', 'reservado');

        const vehiculosEnSolicitud = count ?? 0;
        const { data: sucursal, error: sucError } = await admin
          .from('sucursal')
          .select('slots, slots_ocupados')
          .eq('id', actual.sucursal_destino)
          .single();

        if (!sucError && sucursal) {
          const slotsDisponibles = Math.max((sucursal.slots ?? 0) - (sucursal.slots_ocupados ?? 0), 0);
          if (vehiculosEnSolicitud >= slotsDisponibles) {
            return {
              success: false,
              error: `No hay slots disponibles en la sucursal destino. Disponibles: ${slotsDisponibles}.`,
            };
          }
        }
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

      if (error) return { success: false, error: error.message };

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
      const msg = err instanceof Error ? err.message : 'Error inesperado al reservar vehículo';
      return { success: false, error: msg };
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
      if (error) return { success: false, error: error.message };

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
      const msg = err instanceof Error ? err.message : 'Error inesperado al liberar vehículo';
      return { success: false, error: msg };
    }
  }

  static async calendarizarSolicitud(
    id: string,
    fechaDespacho: string,
    usuarioId: string
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

      const { error } = await admin
        .from('solicitud')
        .update({
          estado: 'calendarizada',
          fecha_tentativa_despacho: fechaDespacho,
          logistica_id: usuarioId,
          // Al calendarizar sale de la cola: libera el slot de prioridad
          posicion_prioridad: null,
        })
        .eq('id', id);

      if (error) return { success: false, error: error.message };

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
      const msg = err instanceof Error ? err.message : 'Error inesperado al calendarizar';
      return { success: false, error: msg };
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

      const { error } = await admin
        .from('solicitud')
        .update({
          estado: 'priorizada',
          posicion_prioridad: siguiente,
          fecha_tentativa_despacho: null,
          logistica_id: null,
        })
        .eq('id', id);

      if (error) return { success: false, error: error.message };

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
      const msg = err instanceof Error ? err.message : 'Error inesperado al descalendarizar';
      return { success: false, error: msg };
    }
  }

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

      const { error } = await admin
        .from('solicitud')
        .update({
          estado: 'en_transito',
          fecha_despacho: ahora,
          // Libera el slot de la cola: despachada ya no compite por prioridad
          posicion_prioridad: null,
        })
        .eq('id', id);

      if (error) return { success: false, error: error.message };

      // Compactar la cola restante (1..N) al liberarse el slot
      const errReesc = await SolicitudesService.renumerarColaSucursal(admin, actual.sucursal);
      if (errReesc) return { success: false, error: errReesc };

      await this.registrarAuditoria(
        usuarioId,
        'solicitud',
        id,
        'despacho',
        { estado: 'calendarizada', fecha_despacho: null },
        { estado: 'en_transito', fecha_despacho: ahora }
      );

      return { success: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error inesperado al despachar';
      return { success: false, error: msg };
    }
  }

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

      const { error } = await admin
        .from('solicitud')
        .update({
          estado: 'calendarizada',
          fecha_despacho: null,
          posicion_prioridad: null,
        })
        .eq('id', id);

      if (error) return { success: false, error: error.message };

      await this.registrarAuditoria(
        usuarioId,
        'solicitud',
        id,
        'despacho',
        { estado: 'en_transito', fecha_despacho: actual.fecha_despacho },
        { estado: 'calendarizada', fecha_despacho: null }
      );

      return { success: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error inesperado al cancelar el despacho';
      return { success: false, error: msg };
    }
  }

  static async recibirSolicitud(
    id: string,
    usuarioId: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const admin = createAdminClient();

      const actual = await this.getSolicitudById(id);
      if (!actual) return { success: false, error: 'Solicitud no encontrada.' };
      if (actual.estado !== 'en_transito') {
        return { success: false, error: 'Solo las solicitudes En Tránsito pueden recibirse.' };
      }

      const usuario = await SolicitudesService.getUsuarioRolSucursal(admin, usuarioId);
      if (!usuario) return { success: false, error: 'Usuario no encontrado.' };

      if (usuario.rol !== 'administrador') {
        if (usuario.rol !== 'jefe_local' || !SolicitudesService.usuarioEnSucursalRecepcion(usuario.sucursal_id, actual)) {
          return {
            success: false,
            error: 'Solo el jefe de local de la sucursal destino puede recibir la solicitud.',
          };
        }
      }

      const ahora = new Date().toISOString();

      const { error } = await admin
        .from('solicitud')
        .update({
          estado: 'entregada',
          fecha_entrega: ahora,
          posicion_prioridad: null,
        })
        .eq('id', id);

      if (error) return { success: false, error: error.message };

      await this.registrarAuditoria(
        usuarioId,
        'solicitud',
        id,
        'entrega',
        { estado: 'en_transito', fecha_entrega: null },
        { estado: 'entregada', fecha_entrega: ahora }
      );

      return { success: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error inesperado al recibir';
      return { success: false, error: msg };
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
        return { success: false, error: 'Solo las solicitudes Entregadas pueden finalizarse.' };
      }

      const usuario = await SolicitudesService.getUsuarioRolSucursal(admin, usuarioId);
      if (!usuario) return { success: false, error: 'Usuario no encontrado.' };

      if (usuario.rol !== 'administrador') {
        const esJefeLocalDestino =
          usuario.rol === 'jefe_local' && SolicitudesService.usuarioEnSucursalRecepcion(usuario.sucursal_id, actual);
        const esEjecutivoCreador = usuario.rol === 'ejecutivo' && actual.ejecutivo_id === usuarioId;

        if (!esJefeLocalDestino && !esEjecutivoCreador) {
          return {
            success: false,
            error: 'Solo el jefe de local de la sucursal destino o el ejecutivo que creó la solicitud pueden finalizarla.',
          };
        }
      }

      const { error } = await admin
        .from('solicitud')
        .update({ estado: 'finalizada', posicion_prioridad: null })
        .eq('id', id);

      if (error) return { success: false, error: error.message };

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
      const msg = err instanceof Error ? err.message : 'Error inesperado al finalizar';
      return { success: false, error: msg };
    }
  }
}
