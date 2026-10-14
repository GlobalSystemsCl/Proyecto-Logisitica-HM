import type { SolicitudLista } from '@/types/solicitud.types';

/**
 * Quién inició una solicitud (UI: "Iniciada por"): el ejecutivo, jefe de local
 * o administrador que la creó, guardado en `solicitud.creado_por` desde el
 * 2026-10-14.
 *
 * Reemplaza al antiguo "Encargado" (`ejecutivo_id` o, si no había,
 * `jefe_local_id`), que no era el creador: cuando un jefe de local delega,
 * `ejecutivo_id` es el delegado, y `jefe_local_id` se llena siempre con el jefe
 * de la sucursal. Si `creado_por` falta, se usa esa misma deducción.
 *
 * Funciones puras: no tocan la BD ni React.
 */

type DatosIniciador = Pick<
  SolicitudLista,
  'creado_por' | 'creado_por_nombre' | 'ejecutivo_id' | 'ejecutivo_nombre' | 'jefe_local_id' | 'jefe_local_nombre'
>;

export const ETIQUETA_INICIADA_POR = 'Iniciada por';

export function iniciadorId(sol: DatosIniciador): string | null {
  return sol.creado_por ?? sol.ejecutivo_id ?? sol.jefe_local_id ?? null;
}

export function iniciadorNombre(sol: DatosIniciador): string | null {
  if (sol.creado_por) return sol.creado_por_nombre ?? null;
  if (sol.ejecutivo_id) return sol.ejecutivo_nombre ?? null;
  if (sol.jefe_local_id) return sol.jefe_local_nombre ?? null;
  return null;
}
