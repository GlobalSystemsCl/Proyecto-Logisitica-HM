import type { SolicitudLista } from '@/types/solicitud.types';
import type { TrasladoInterno } from '@/types/traslado.types';
import { codigoTraslado, coincideCodigoSolicitud } from '@/lib/codigoSolicitud';
import { iniciadorNombre } from '@/lib/iniciador';
import { plano } from '@/lib/busqueda';

/**
 * Buscador de las bandejas de Aprobaciones y Recepciones: por quien inició la
 * solicitud, por su N° (101-15) o por la sucursal (código o nombre, de origen
 * o de destino). Sin importar tildes ni mayúsculas.
 *
 * Funciones puras: no tocan la BD ni React.
 */

/** `true` si el término es el comienzo del código o parte del nombre de la sucursal. */
function coincideSucursal(id: number | null | undefined, nombre: string | null | undefined, t: string): boolean {
  return (id != null && String(id).startsWith(t)) || plano(nombre ?? '').includes(t);
}

export function coincideBusquedaBandeja(sol: SolicitudLista, termino: string): boolean {
  const t = plano(termino);
  if (!t) return true;
  return (
    coincideCodigoSolicitud(sol, t) ||
    plano(iniciadorNombre(sol) ?? '').includes(t) ||
    coincideSucursal(sol.sucursal, sol.sucursal_nombre, t) ||
    coincideSucursal(sol.sucursal_destino, sol.sucursal_destino_nombre, t)
  );
}

/**
 * Lo mismo para un traslado interno de Recepciones: su N° (T-15), la sucursal
 * de origen o destino y el usuario de Logística que lo creó.
 */
export function coincideBusquedaTraslado(t: TrasladoInterno, termino: string): boolean {
  const texto = plano(termino);
  if (!texto) return true;
  return (
    plano(codigoTraslado(t)).replace(/^#/, '').startsWith(texto.replace(/^#/, '')) ||
    plano(t.logistica_nombre ?? '').includes(texto) ||
    coincideSucursal(t.origen_id, t.origen_nombre, texto) ||
    coincideSucursal(t.destino_id, t.destino_nombre, texto)
  );
}
