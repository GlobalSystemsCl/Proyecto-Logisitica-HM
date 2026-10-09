import type { SolicitudLista } from '@/types/solicitud.types';

/**
 * Priorización por sucursal: cada sucursal tiene su propia cola y su propia
 * lista "Por priorizar". La cola pertenece a la sucursal de origen de la
 * solicitud (la clave única de la BD es `(sucursal, posicion_prioridad)`).
 *
 * Funciones puras: no tocan la BD ni React.
 */

export interface ColaSucursal {
  /** Priorizadas con posición, ordenadas de la más urgente (1) a la menos. */
  cola: SolicitudLista[];
  /** Aprobadas que todavía no entran a la cola. */
  porPriorizar: SolicitudLista[];
}

export interface ResumenSucursalPrioridad {
  id: number;
  nombre: string;
  enCola: number;
  porPriorizar: number;
}

export function colaDeSucursal(solicitudes: SolicitudLista[], sucursalId: number | null): ColaSucursal {
  if (sucursalId === null) return { cola: [], porPriorizar: [] };
  const deLaSucursal = solicitudes.filter((s) => s.sucursal === sucursalId);
  return {
    cola: deLaSucursal
      .filter((s) => s.estado === 'priorizada' && s.posicion_prioridad !== null)
      .sort((a, b) => (a.posicion_prioridad ?? 0) - (b.posicion_prioridad ?? 0)),
    porPriorizar: deLaSucursal.filter((s) => s.estado === 'aprobada' && s.posicion_prioridad === null),
  };
}

/** Contadores por sucursal para las pestañas, en el orden recibido. */
export function resumenPrioridadPorSucursal(
  solicitudes: SolicitudLista[],
  sucursales: Array<{ id: number; nombre: string | null }>
): ResumenSucursalPrioridad[] {
  return sucursales.map((suc) => {
    const { cola, porPriorizar } = colaDeSucursal(solicitudes, suc.id);
    return {
      id: suc.id,
      nombre: suc.nombre?.trim() || `Sucursal ${suc.id}`,
      enCola: cola.length,
      porPriorizar: porPriorizar.length,
    };
  });
}

/**
 * Sucursal que se muestra al entrar: la primera con trabajo pendiente
 * (algo por priorizar o en cola) o, si ninguna tiene, la primera de la lista.
 */
export function sucursalInicial(resumen: ResumenSucursalPrioridad[]): number | null {
  if (resumen.length === 0) return null;
  const conPendientes = resumen.find((r) => r.porPriorizar > 0) ?? resumen.find((r) => r.enCola > 0);
  return (conPendientes ?? resumen[0]).id;
}
