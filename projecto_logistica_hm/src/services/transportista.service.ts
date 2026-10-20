import { createAdminClient } from '@/lib/supabase/admin';
import { mensajeErrorUsuario } from '@/lib/errores';
import { normalizarRut } from '@/lib/rut';
import type { Transportista } from '@/types/transportista.types';

/** Largo del nombre que acepta la BD (`transportista_nombre_largo`). */
export const NOMBRE_TRANSPORTISTA_MIN = 3;
export const NOMBRE_TRANSPORTISTA_MAX = 120;

export const MENSAJE_TRANSPORTISTA_REQUERIDO = 'Indica el transportista del traslado.';
export const MENSAJE_TRANSPORTISTA_INVALIDO = 'El transportista no existe o está inactivo.';

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
