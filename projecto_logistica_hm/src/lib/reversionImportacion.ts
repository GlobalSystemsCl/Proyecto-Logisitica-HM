import type { UserRole } from '@/types/auth.types';
import type { ImportacionStock } from '@/types/vehiculo.types';

/**
 * Reversión de una importación de stock (admin/vehículos): borra los
 * vehículos que creó esa importación y que no se usan en ninguna solicitud ni
 * traslado (`fn_revertir_importacion_stock`, migración 20261120120000).
 *
 * Funciones puras: no tocan la BD ni React.
 */

/** Texto que hay que escribir en el modal para confirmar. */
export const TEXTO_CONFIRMAR_REVERSION = 'CONFIRMAR';

/** Importaciones que se listan en el modal de reversión. */
export const LIMITE_IMPORTACIONES_LISTADAS = 10;

/** `true` si lo escrito es la palabra de confirmación (sin importar mayúsculas ni espacios al borde). */
export function confirmacionReversionValida(texto: string | null | undefined): boolean {
  return (texto ?? '').trim().toUpperCase() === TEXTO_CONFIRMAR_REVERSION;
}

/**
 * Motivo por el que no se puede revertir, o null si se puede. El
 * administrador revierte cualquiera; Logística solo las que subió.
 */
export function motivoNoRevertible(
  imp: Pick<ImportacionStock, 'revertida_at' | 'vehiculos_actuales' | 'usuario_id'>,
  viewer: { id: string; rol: UserRole },
): string | null {
  if (imp.revertida_at) return 'Esta importación ya se revirtió.';
  if (imp.vehiculos_actuales <= 0) return 'No quedan vehículos de esta importación en el inventario.';
  if (viewer.rol === 'administrador') return null;
  if (viewer.rol === 'logistica' && imp.usuario_id === viewer.id) return null;
  if (viewer.rol === 'logistica') return 'Solo el administrador puede revertir importaciones de otro usuario.';
  return 'No tienes permisos para revertir importaciones.';
}

/** Mensaje para el usuario según el error que levanta la función de la BD. */
export function mensajeErrorReversion(mensajeBd: string | null | undefined): string {
  const m = mensajeBd ?? '';
  if (m.includes('IMPORTACION_YA_REVERTIDA')) return 'Esta importación ya se revirtió.';
  if (m.includes('IMPORTACION_NO_EXISTE')) return 'La importación no existe.';
  return 'No se pudo revertir la importación. Intenta de nuevo.';
}

/** Resumen del resultado para el aviso final. */
export function textoResultadoReversion(eliminados: number, conservados: number): string {
  const base = `Importación revertida: ${eliminados} vehículo(s) eliminado(s) del inventario.`;
  if (conservados === 0) return base;
  return `${base} ${conservados} se conservaron porque ya se usan en una solicitud o un traslado.`;
}
