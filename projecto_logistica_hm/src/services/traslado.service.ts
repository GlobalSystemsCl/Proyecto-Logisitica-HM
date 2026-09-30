import { createAdminClient } from '@/lib/supabase/admin';
import { OrganizacionService } from '@/services/organizacion.service';
import { SolicitudesService } from '@/services/solicitudes.service';
import type {
  CreateTrasladoInput,
  EstadoTraslado,
  TrasladoInterno,
  VehiculosParaTrasladoResult,
} from '@/types/traslado.types';

/**
 * Traslados internos: mueven vehículos entre sucursales (sin restricción de
 * estado de venta: cualquier vehículo del sistema puede trasladarse).
 *
 * Diferencias clave respecto de una solicitud normal:
 *  - el vehículo NO cambia de `disponibilidad` (conserva su estado original)
 *  - al recepcionar, `vehiculo.ubicacion` pasa a ser la sucursal destino
 *  - NO validan capacidad de slots del destino (solo informativos)
 *  - el JL destino solo puede recepcionar: no existe acción de rechazo
 *
 * Los contadores de slots y el movimiento de vehículos viven en triggers de BD
 * (migraciones `20260928_traslado_interno.sql` y `20260930_desactivar_validacion_slots.sql`);
 * este servicio solo valida permisos/estado y escribe las filas.
 */
const TRASLADO_SELECT = `id, origen_id, destino_id, logistica_id, estado,
  fecha_despacho, fecha_recepcion, observacion, created_at, updated_at,
  origen:sucursal!traslado_interno_origen_id_fkey(nombre),
  destino:sucursal!traslado_interno_destino_id_fkey(nombre),
  logistica:usuario!traslado_interno_logistica_id_fkey(nombre, apellido),
  traslado_interno_vehiculo(
    id, disponibilidad, vehiculo_id,
    vehiculo:vehiculo_id(id, chasis, patente, marca, modelo, anio, color, ubicacion)
  )`;

interface TrasladoRawRow {
  id: string;
  origen_id: number;
  destino_id: number;
  logistica_id: string;
  estado: EstadoTraslado;
  fecha_despacho: string | null;
  fecha_recepcion: string | null;
  observacion: string | null;
  created_at: string;
  updated_at: string;
  origen: { nombre: string | null } | null;
  destino: { nombre: string | null } | null;
  logistica: { nombre: string; apellido: string } | null;
  traslado_interno_vehiculo: Array<{
    id: string;
    disponibilidad: 'reservado' | 'liberado' | 'vendido';
    vehiculo_id: string;
    vehiculo: {
      id: string;
      chasis: string;
      patente: string | null;
      marca: string;
      modelo: string;
      anio: number;
      color: string | null;
      ubicacion: number | null;
    } | null;
  }> | null;
}

function mapTraslado(row: TrasladoRawRow): TrasladoInterno {
  const logistica = row.logistica
    ? `${row.logistica.nombre} ${row.logistica.apellido}`.trim()
    : null;

  return {
    id: row.id,
    origen_id: row.origen_id,
    origen_nombre: row.origen?.nombre ?? null,
    destino_id: row.destino_id,
    destino_nombre: row.destino?.nombre ?? null,
    logistica_id: row.logistica_id,
    logistica_nombre: logistica,
    estado: row.estado,
    fecha_despacho: row.fecha_despacho,
    fecha_recepcion: row.fecha_recepcion,
    observacion: row.observacion,
    created_at: row.created_at,
    updated_at: row.updated_at,
    vehiculos: (row.traslado_interno_vehiculo || [])
      .filter((tv) => tv.vehiculo)
      .map((tv) => ({
        traslado_vehiculo_id: tv.id,
        disponibilidad: tv.disponibilidad,
        id: tv.vehiculo!.id,
        chasis: tv.vehiculo!.chasis,
        patente: tv.vehiculo!.patente,
        marca: tv.vehiculo!.marca,
        modelo: tv.vehiculo!.modelo,
        anio: tv.vehiculo!.anio,
        color: tv.vehiculo!.color,
        ubicacion: tv.vehiculo!.ubicacion,
      })),
  };
}

export class TrasladoService {
  /**
   * Crea un traslado interno con los vehículos indicados.
   * No valida capacidad de slots del destino, ni restringe el estado de venta
   * del vehículo (cualquier vehículo puede trasladarse).
   */
  static async crearTraslado(
    input: CreateTrasladoInput,
    vehiculosIds: string[],
    logisticaId: string
  ): Promise<{ success: boolean; traslado?: TrasladoInterno; error?: string }> {
    try {
      const admin = createAdminClient();

      if (vehiculosIds.length === 0) {
        return { success: false, error: 'Debes seleccionar al menos un vehículo para el traslado.' };
      }
      if (input.origen_id === input.destino_id) {
        return { success: false, error: 'El origen y el destino del traslado deben ser distintos.' };
      }

      const { data: sucursales, error: sucError } = await admin
        .from('sucursal')
        .select('id')
        .in('id', [input.origen_id, input.destino_id]);

      if (sucError) return { success: false, error: sucError.message };
      if (!sucursales || sucursales.length !== 2) {
        return { success: false, error: 'La sucursal de origen o destino no existe.' };
      }

      const { data: vendedor, error: userError } = await admin
        .from('usuario')
        .select('id, rol, activo')
        .eq('id', logisticaId)
        .maybeSingle();

      if (userError || !vendedor) return { success: false, error: 'Usuario no encontrado.' };
      if (vendedor.rol !== 'logistica' && vendedor.rol !== 'administrador') {
        return { success: false, error: 'Solo Logística o el Administrador pueden crear traslados.' };
      }
      if (vendedor.activo === false) return { success: false, error: 'El usuario está inactivo.' };

      const { data: enTraslado, error: trasError } = await admin
        .from('traslado_interno_vehiculo')
        .select('vehiculo_id, traslado:traslado_interno!inner(estado)')
        .in('vehiculo_id', vehiculosIds)
        .in('traslado.estado', ['pendiente', 'en_transito']);

      if (trasError) {
        console.error('Error al verificar traslados activos:', trasError);
      }
      const yaEnTraslado = new Set(
        ((enTraslado || []) as unknown as Array<{ vehiculo_id: string }>).map((t) => t.vehiculo_id)
      );
      if (yaEnTraslado.size > 0) {
        return { success: false, error: 'Alguno de los vehículos ya tiene un traslado pendiente o en curso.' };
      }

      const { data: traslado, error: insertError } = await admin
        .from('traslado_interno')
        .insert({
          origen_id: input.origen_id,
          destino_id: input.destino_id,
          logistica_id: logisticaId,
          estado: 'pendiente',
          observacion: input.observacion?.trim() || null,
        })
        .select('id')
        .single();

      if (insertError || !traslado) {
        return { success: false, error: insertError?.message ?? 'No se pudo crear el traslado.' };
      }

      const trasladoId = (traslado as { id: string }).id;

      const { error: vehError } = await admin
        .from('traslado_interno_vehiculo')
        .insert(vehiculosIds.map((vehiculoId) => ({ traslado_id: trasladoId, vehiculo_id: vehiculoId })));

      if (vehError) {
        // rollback: el traslado se crea sin vehículos, se elimina
        await admin.from('traslado_interno').delete().eq('id', trasladoId);
        return { success: false, error: vehError.message };
      }

      await SolicitudesService.registrarAuditoria(
        logisticaId,
        'traslado_interno',
        trasladoId,
        'creacion',
        null,
        {
          origen_id: input.origen_id,
          destino_id: input.destino_id,
          vehiculos: vehiculosIds.length,
          estado: 'pendiente',
        }
      );

      const creado = await TrasladoService.getTrasladoById(trasladoId);
      return { success: true, traslado: creado ?? undefined };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error inesperado al crear el traslado';
      return { success: false, error: msg };
    }
  }

  /** Logística despacha: `pendiente` -> `en_transito` (+ `fecha_despacho`). */
  static async despacharTraslado(
    trasladoId: string,
    logisticaId: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const admin = createAdminClient();

      const actual = await TrasladoService.getTrasladoById(trasladoId);
      if (!actual) return { success: false, error: 'Traslado no encontrado.' };
      if (actual.estado === 'en_transito') return { success: true };
      if (actual.estado !== 'pendiente') {
        return { success: false, error: 'Solo los traslados Pendientes pueden despacharse.' };
      }
      if (actual.logistica_id !== logisticaId) {
        const { data: user } = await admin.from('usuario').select('rol').eq('id', logisticaId).maybeSingle();
        if (!user || user.rol !== 'administrador') {
          return { success: false, error: 'Solo el encargado del traslado o el Administrador pueden despacharlo.' };
        }
      }

      const ahora = new Date().toISOString();
      const { error } = await admin
        .from('traslado_interno')
        .update({ estado: 'en_transito', fecha_despacho: ahora })
        .eq('id', trasladoId);

      if (error) return { success: false, error: error.message };

      await SolicitudesService.registrarAuditoria(
        logisticaId,
        'traslado_interno',
        trasladoId,
        'despacho',
        { estado: 'pendiente' },
        { estado: 'en_transito', fecha_despacho: ahora }
      );

      return { success: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error inesperado al despachar el traslado';
      return { success: false, error: msg };
    }
  }

  /**
   * JL de la sucursal destino recepciona: `en_transito` -> `recepcionado`.
   * NO existe acción de rechazo para el JL (solo aviso).
   */
  static async recibirTraslado(
    trasladoId: string,
    jefeLocalId: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const admin = createAdminClient();

      const actual = await TrasladoService.getTrasladoById(trasladoId);
      if (!actual) return { success: false, error: 'Traslado no encontrado.' };
      if (actual.estado === 'recepcionado') return { success: true };
      if (actual.estado !== 'en_transito') {
        return { success: false, error: 'Solo los traslados En tránsito pueden receptarse.' };
      }

      const { data: user, error: userError } = await admin
        .from('usuario')
        .select('rol')
        .eq('id', jefeLocalId)
        .maybeSingle();

      if (userError || !user) return { success: false, error: 'Usuario no encontrado.' };

      if (user.rol !== 'administrador') {
        const tieneSucursal = await OrganizacionService.usuarioTieneSucursal(
          jefeLocalId,
          actual.destino_id
        );
        if (user.rol !== 'jefe_local' || !tieneSucursal) {
          return {
            success: false,
            error: 'Solo el jefe de local de la sucursal destino puede recepcionar el traslado.',
          };
        }
      }

      const ahora = new Date().toISOString();
      const { error } = await admin
        .from('traslado_interno')
        .update({ estado: 'recepcionado', fecha_recepcion: ahora })
        .eq('id', trasladoId);

      if (error) return { success: false, error: error.message };

      await SolicitudesService.registrarAuditoria(
        jefeLocalId,
        'traslado_interno',
        trasladoId,
        'recepcion',
        { estado: 'en_transito' },
        { estado: 'recepcionado', fecha_recepcion: ahora }
      );

      return { success: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error inesperado al recepcionar el traslado';
      return { success: false, error: msg };
    }
  }

  /** Traslados de los que Logística es encargado (admin: todos). */
  static async getTrasladosByLogistica(logisticaId: string): Promise<TrasladoInterno[]> {
    try {
      const admin = createAdminClient();
      const { data: user } = await admin.from('usuario').select('rol').eq('id', logisticaId).maybeSingle();
      const verTodos = user?.rol === 'administrador';

      let query = admin.from('traslado_interno').select(TRASLADO_SELECT);
      if (!verTodos) query = query.eq('logistica_id', logisticaId);

      const { data, error } = await query.order('created_at', { ascending: false });
      if (error) {
        console.error('Error al listar traslados de logística:', error);
        return [];
      }
      return ((data || []) as unknown as TrasladoRawRow[]).map(mapTraslado);
    } catch (err) {
      console.error('Error en getTrasladosByLogistica:', err);
      return [];
    }
  }

  /** Traslados que llegan a la sucursal indicada (JL destino o admin). */
  static async getTrasladosByDestinoSucursal(sucursalId: number): Promise<TrasladoInterno[]> {
    try {
      const admin = createAdminClient();
      const { data, error } = await admin
        .from('traslado_interno')
        .select(TRASLADO_SELECT)
        .eq('destino_id', sucursalId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error al listar traslados por destino:', error);
        return [];
      }
      return ((data || []) as unknown as TrasladoRawRow[]).map(mapTraslado);
    } catch (err) {
      console.error('Error en getTrasladosByDestinoSucursal:', err);
      return [];
    }
  }

  static async getTrasladoById(id: string): Promise<TrasladoInterno | null> {
    try {
      const admin = createAdminClient();
      const { data, error } = await admin
        .from('traslado_interno')
        .select(TRASLADO_SELECT)
        .eq('id', id)
        .maybeSingle();

      if (error || !data) return null;
      return mapTraslado(data as unknown as TrasladoRawRow);
    } catch (err) {
      console.error('Error en getTrasladoById:', err);
      return null;
    }
  }

  /**
   * Vehículos para un traslado: listado completo de `vehiculo`, con búsqueda
   * por patente o chasis, filtros por sucursal y marca, y paginación.
   * Marca `en_traslado_activo` a los que ya integran un traslado pendiente/en
   * tránsito para deshabilitarlos en la UI.
   */
  static async getVehiculosParaTraslado(
    q = '',
    page = 1,
    pageSize = 12,
    opciones?: { sucursalId?: number | null; marca?: string | null }
  ): Promise<VehiculosParaTrasladoResult> {
    const vacio: VehiculosParaTrasladoResult = { vehiculos: [], total: 0, page, pageSize, totalPages: 0 };
    try {
      const admin = createAdminClient();

      const filtro = q.trim();
      page = Math.max(1, page);
      pageSize = Math.min(Math.max(1, pageSize), 100);

      let query = admin
        .from('vehiculo')
        .select(
          'id, chasis, patente, marca, modelo, anio, color, ubicacion, sucursal:ubicacion(nombre)',
          { count: 'exact' }
        );

      if (opciones?.sucursalId) {
        query = query.eq('ubicacion', opciones.sucursalId);
      }
      if (opciones?.marca) {
        query = query.eq('marca', opciones.marca);
      }
      if (filtro) {
        const seguro = filtro.replace(/%/g, '');
        query = query.or(`patente.ilike.%${seguro}%,chasis.ilike.%${seguro}%`);
      }

      const { data, error, count } = await query
        .order('patente', { ascending: true })
        .range((page - 1) * pageSize, page * pageSize - 1);

      if (error) {
        console.error('Error al listar vehículos para traslado:', error);
        return vacio;
      }

      const total = count ?? 0;
      const filas = (data || []) as unknown as Array<{
        id: string;
        chasis: string;
        patente: string | null;
        marca: string;
        modelo: string;
        anio: number;
        color: string | null;
        ubicacion: number | null;
        sucursal: { nombre: string | null } | null;
      }>;

      const ids = filas.map((v) => v.id);
      const ocupados = new Set<string>();

      if (ids.length > 0) {
        const { data: enTraslado } = await admin
          .from('traslado_interno_vehiculo')
          .select('vehiculo_id, traslado:traslado_interno!inner(estado)')
          .in('vehiculo_id', ids)
          .in('traslado.estado', ['pendiente', 'en_transito']);

        for (const t of (enTraslado || []) as unknown as Array<{ vehiculo_id: string }>) {
          ocupados.add(t.vehiculo_id);
        }
      }

      return {
        vehiculos: filas.map((v) => ({
          id: v.id,
          chasis: v.chasis,
          patente: v.patente,
          marca: v.marca,
          modelo: v.modelo,
          anio: v.anio,
          color: v.color,
          ubicacion: v.ubicacion,
          ubicacion_nombre: v.sucursal?.nombre ?? null,
          en_traslado_activo: ocupados.has(v.id),
        })),
        total,
        page,
        pageSize,
        totalPages: total === 0 ? 0 : Math.max(1, Math.ceil(total / pageSize)),
      };
    } catch (err) {
      console.error('Error en getVehiculosParaTraslado:', err);
      return vacio;
    }
  }
}
