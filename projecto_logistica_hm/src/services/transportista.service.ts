import { createAdminClient } from '@/lib/supabase/admin';
import { mensajeErrorUsuario } from '@/lib/errores';
import { normalizarRut } from '@/lib/rut';
import { formatearPatente, normalizarPatente, validarPatente } from '@/lib/patente';
import type {
  AsignacionTransporte,
  Camion,
  DatosTransporte,
  EmpresaTransporte,
  Transportista,
} from '@/types/transportista.types';

/** Largo del nombre que acepta la BD (`transportista_nombre_largo`). */
export const NOMBRE_TRANSPORTISTA_MIN = 3;
export const NOMBRE_TRANSPORTISTA_MAX = 120;

/** Nombre del conductor sin espacios de más, o null si viene vacío. */
export function limpiarConductor(nombre: string | null | undefined): string | null {
  const limpio = (nombre ?? '').trim().replace(/\s+/g, ' ');
  return limpio || null;
}

/** El conductor es opcional; si viene, entre 3 y 120 caracteres (`camion_conductor_largo`). */
export function validarConductor(nombre: string | null | undefined): string | null {
  const limpio = limpiarConductor(nombre);
  if (limpio === null) return null;
  return limpio.length < 3 || limpio.length > 120
    ? 'El nombre del transportista debe tener entre 3 y 120 caracteres.'
    : null;
}

export const MENSAJE_TRANSPORTISTA_REQUERIDO = 'Indica el transportista del traslado.';
export const MENSAJE_TRANSPORTISTA_INVALIDO = 'El transportista no existe o está inactivo.';
export const MENSAJE_TRANSPORTE_REQUERIDO = 'Indica la patente del camión y el transportista del traslado.';

/**
 * Catálogo de transportistas (pedido del cliente, 2026-10-19): Logística
 * registra quién hace cada traslado para revisar después su factura.
 */
export class TransportistaService {
  /** Transportistas activos, por nombre. */
  static async listarActivos(): Promise<Transportista[]> {
    try {
      const admin = createAdminClient();
      const { data, error } = await admin
        .from('transportista')
        .select('id, nombre, rut, activo')
        .eq('activo', true)
        .order('nombre', { ascending: true });

      if (error) {
        console.error('Error al listar transportistas:', error);
        return [];
      }
      return (data || []) as Transportista[];
    } catch (err) {
      console.error('Error en listarActivos:', err);
      return [];
    }
  }

  /**
   * Registra un transportista. Valida el nombre y el dígito verificador del
   * RUT, y lo guarda normalizado. Si el RUT ya existe, lo informa.
   */
  static async crear(
    nombre: string,
    rut: string,
    usuarioId: string
  ): Promise<{ success: boolean; transportista?: Transportista; error?: string }> {
    const limpio = (nombre || '').trim().replace(/\s+/g, ' ');
    if (limpio.length < NOMBRE_TRANSPORTISTA_MIN || limpio.length > NOMBRE_TRANSPORTISTA_MAX) {
      return {
        success: false,
        error: `El nombre del transportista debe tener entre ${NOMBRE_TRANSPORTISTA_MIN} y ${NOMBRE_TRANSPORTISTA_MAX} caracteres.`,
      };
    }
    const rutNormal = normalizarRut(rut);
    if (!rutNormal) return { success: false, error: 'El RUT no es válido. Revisa el dígito verificador.' };

    try {
      const admin = createAdminClient();
      const { data, error } = await admin
        .from('transportista')
        .insert({ nombre: limpio, rut: rutNormal, creado_por: usuarioId })
        .select('id, nombre, rut, activo')
        .single();

      if (error) {
        if (error.code === '23505') return { success: false, error: 'Ya existe un transportista con ese RUT.' };
        return { success: false, error: mensajeErrorUsuario(error, 'No se pudo registrar el transportista.') };
      }
      return { success: true, transportista: data as Transportista };
    } catch (err: unknown) {
      return { success: false, error: mensajeErrorUsuario(err, 'Error inesperado al registrar el transportista.') };
    }
  }

  /**
   * R10: empresas de transporte (activas e inactivas) con sus camiones, por
   * nombre, para la pantalla de gestión de Logística.
   */
  static async listarEmpresas(): Promise<EmpresaTransporte[]> {
    try {
      const admin = createAdminClient();
      const { data, error } = await admin
        .from('transportista')
        .select('id, nombre, rut, activo, camiones:camion(id, patente, transportista_id, conductor_nombre, activo)')
        .order('nombre', { ascending: true });
      if (error) {
        console.error('Error al listar empresas de transporte:', error);
        return [];
      }
      return ((data || []) as EmpresaTransporte[]).map((e) => ({
        ...e,
        camiones: [...(e.camiones ?? [])].sort((a, b) => a.patente.localeCompare(b.patente)),
      }));
    } catch (err) {
      console.error('Error en listarEmpresas:', err);
      return [];
    }
  }

  /** Cambia el nombre o el estado de una empresa. Una inactiva no se ofrece al programar. */
  static async actualizarEmpresa(
    id: string,
    cambios: { nombre?: string; activo?: boolean }
  ): Promise<{ success: boolean; error?: string }> {
    const datos: Record<string, unknown> = {};
    if (cambios.nombre !== undefined) {
      const limpio = cambios.nombre.trim().replace(/\s+/g, ' ');
      if (limpio.length < NOMBRE_TRANSPORTISTA_MIN || limpio.length > NOMBRE_TRANSPORTISTA_MAX) {
        return {
          success: false,
          error: `El nombre de la empresa debe tener entre ${NOMBRE_TRANSPORTISTA_MIN} y ${NOMBRE_TRANSPORTISTA_MAX} caracteres.`,
        };
      }
      datos.nombre = limpio;
    }
    if (cambios.activo !== undefined) datos.activo = cambios.activo;
    if (Object.keys(datos).length === 0) return { success: true };
    try {
      const { error } = await createAdminClient().from('transportista').update(datos).eq('id', id);
      if (error) return { success: false, error: mensajeErrorUsuario(error, 'No se pudo actualizar la empresa.') };
      return { success: true };
    } catch (err: unknown) {
      return { success: false, error: mensajeErrorUsuario(err, 'Error inesperado al actualizar la empresa.') };
    }
  }

  /** Registra un camión de una empresa. La patente queda normalizada y es única. */
  static async crearCamion(
    transportistaId: string,
    patente: string,
    conductorNombre: string | null,
    usuarioId: string
  ): Promise<{ success: boolean; camion?: Camion; error?: string }> {
    const errorPatente = validarPatente(patente);
    if (errorPatente) return { success: false, error: errorPatente };
    const errorConductor = validarConductor(conductorNombre);
    if (errorConductor) return { success: false, error: errorConductor };
    if (!transportistaId) return { success: false, error: 'Indica la empresa del camión.' };
    try {
      const { data, error } = await createAdminClient()
        .from('camion')
        .insert({
          transportista_id: transportistaId,
          patente: normalizarPatente(patente),
          conductor_nombre: limpiarConductor(conductorNombre),
          creado_por: usuarioId,
        })
        .select('id, patente, transportista_id, conductor_nombre, activo')
        .single();
      if (error) {
        if (error.code === '23505') return { success: false, error: `Ya existe un camión con la patente ${formatearPatente(patente)}.` };
        return { success: false, error: mensajeErrorUsuario(error, 'No se pudo registrar el camión.') };
      }
      return { success: true, camion: data as Camion };
    } catch (err: unknown) {
      return { success: false, error: mensajeErrorUsuario(err, 'Error inesperado al registrar el camión.') };
    }
  }

  /** Cambia el conductor habitual o el estado de un camión. */
  static async actualizarCamion(
    id: string,
    cambios: { conductorNombre?: string | null; activo?: boolean }
  ): Promise<{ success: boolean; error?: string }> {
    const datos: Record<string, unknown> = {};
    if (cambios.conductorNombre !== undefined) {
      const errorConductor = validarConductor(cambios.conductorNombre);
      if (errorConductor) return { success: false, error: errorConductor };
      datos.conductor_nombre = limpiarConductor(cambios.conductorNombre);
    }
    if (cambios.activo !== undefined) datos.activo = cambios.activo;
    if (Object.keys(datos).length === 0) return { success: true };
    try {
      const { error } = await createAdminClient().from('camion').update(datos).eq('id', id);
      if (error) return { success: false, error: mensajeErrorUsuario(error, 'No se pudo actualizar el camión.') };
      return { success: true };
    } catch (err: unknown) {
      return { success: false, error: mensajeErrorUsuario(err, 'Error inesperado al actualizar el camión.') };
    }
  }

  /**
   * R10: convierte lo que indica Logística al programar (patente y
   * transportista) en los datos a guardar. El camión y su empresa deben estar
   * registrados y activos; el transportista, si no se indica, es el habitual
   * del camión, y es obligatorio.
   */
  static async resolverTransporte(
    asignacion: AsignacionTransporte | null | undefined
  ): Promise<{ ok: true; datos: DatosTransporte } | { ok: false; error: string }> {
    if (!asignacion) return { ok: false, error: MENSAJE_TRANSPORTE_REQUERIDO };
    const errorPatente = validarPatente(asignacion.patente);
    if (errorPatente) return { ok: false, error: errorPatente };
    const errorConductor = validarConductor(asignacion.conductorNombre);
    if (errorConductor) return { ok: false, error: errorConductor };

    const patente = normalizarPatente(asignacion.patente);
    try {
      const { data, error } = await createAdminClient()
        .from('camion')
        .select('id, patente, conductor_nombre, activo, transportista_id, empresa:transportista_id(id, activo)')
        .eq('patente', patente)
        .maybeSingle();
      if (error) return { ok: false, error: mensajeErrorUsuario(error, 'No se pudo verificar el camión.') };
      const camion = data as
        | { conductor_nombre: string | null; activo: boolean; transportista_id: string; empresa: { activo: boolean } | null }
        | null;
      if (!camion) {
        return { ok: false, error: `La patente ${formatearPatente(patente)} no está registrada. Regístrala con su empresa de transporte.` };
      }
      if (!camion.activo || camion.empresa?.activo === false) {
        return { ok: false, error: `El camión ${formatearPatente(patente)} o su empresa están desactivados.` };
      }
      const conductor = limpiarConductor(asignacion.conductorNombre) ?? camion.conductor_nombre;
      if (!conductor) return { ok: false, error: 'Indica el nombre del transportista que maneja el camión.' };
      return { ok: true, datos: { transportista_id: camion.transportista_id, patente_camion: patente, conductor_nombre: conductor } };
    } catch (err: unknown) {
      return { ok: false, error: mensajeErrorUsuario(err, 'Error inesperado al verificar el camión.') };
    }
  }

  /**
   * Verifica que el transportista exista y esté activo antes de asignarlo.
   * Devuelve el mensaje de error, o `null` si se puede usar.
   */
  static async validarAsignable(id: string | null | undefined): Promise<string | null> {
    if (!id) return MENSAJE_TRANSPORTISTA_REQUERIDO;
    const admin = createAdminClient();
    const { data, error } = await admin
      .from('transportista')
      .select('id, activo')
      .eq('id', id)
      .maybeSingle();
    if (error) return mensajeErrorUsuario(error, 'No se pudo verificar el transportista.');
    if (!data || data.activo === false) return MENSAJE_TRANSPORTISTA_INVALIDO;
    return null;
  }
}
