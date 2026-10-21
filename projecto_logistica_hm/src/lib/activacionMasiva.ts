import type { UserRole } from '@/types/auth.types';

/**
 * Activación masiva de cuentas pendientes (fase F). El administrador elige un
 * rol y una sucursal en común (o mantiene la que cada usuario declaró al
 * registrarse) y las activa de una vez.
 *
 * Jefe de local y administrador quedan fuera: el jefe tiene sucursales a cargo
 * propias (una sucursal no puede tener dos jefes) y el administrador es un
 * permiso que se da de a uno. Esas cuentas se activan individualmente.
 */

export const MAX_ACTIVACION_MASIVA = 100;

export const ROLES_ACTIVACION_MASIVA: readonly UserRole[] = ['ejecutivo', 'logistica', 'operaciones'];

/** `'registro'`: cada cuenta conserva la sucursal que declaró al registrarse. */
export type SucursalMasiva = 'registro' | number;

export interface AsignacionMasiva {
  rol: UserRole;
  sucursal: SucursalMasiva;
  /** Obligatoria para Logística. */
  zonaId?: number | null;
}

/** Error de la asignación en común, o `null` si es válida. */
export function validarAsignacionMasiva(a: AsignacionMasiva, cantidad: number): string | null {
  if (cantidad === 0) return 'Selecciona al menos una cuenta.';
  if (cantidad > MAX_ACTIVACION_MASIVA) {
    return `Puedes activar hasta ${MAX_ACTIVACION_MASIVA} cuentas a la vez.`;
  }
  if (!ROLES_ACTIVACION_MASIVA.includes(a.rol)) {
    return 'La activación masiva solo admite Ejecutivo, Logística u Operaciones. Activa las demás cuentas de a una.';
  }
  if (a.sucursal !== 'registro' && !(Number.isInteger(a.sucursal) && a.sucursal > 0)) {
    return 'La sucursal elegida no es válida.';
  }
  if (a.rol === 'logistica' && !(Number.isInteger(a.zonaId) && (a.zonaId as number) > 0)) {
    return 'Elige la zona de Logística.';
  }
  return null;
}

export interface AsignacionUsuario {
  rol: UserRole;
  sucursal_id: number | null;
  sucursales_ids: number[];
  zonas_ids: number[];
}

/** Asignación de una cuenta: la sucursal en común o la que declaró al registrarse. */
export function asignacionParaUsuario(a: AsignacionMasiva, sucursalRegistro: number | null | undefined): AsignacionUsuario {
  return {
    rol: a.rol,
    sucursal_id: a.sucursal === 'registro' ? sucursalRegistro ?? null : a.sucursal,
    sucursales_ids: [],
    zonas_ids: a.rol === 'logistica' && a.zonaId ? [a.zonaId] : [],
  };
}

/** Ids únicos y no vacíos, en el orden recibido. */
export function idsUnicos(ids: string[]): string[] {
  return [...new Set(ids.filter((id) => typeof id === 'string' && id.trim() !== ''))];
}
