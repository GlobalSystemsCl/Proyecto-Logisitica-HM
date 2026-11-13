/**
 * QA #26 (2026-11-12): una sucursal sin zona queda fuera del alcance de todo
 * usuario de Logística (el alcance se arma por zonas), así que nadie ve sus
 * solicitudes. Funciones puras para el aviso y el filtro de /admin/sucursales.
 */
import { ESTADOS_SOLICITUD_TRASPASABLES } from '@/lib/ausencias';

/** Valor del filtro de zona que muestra solo las sucursales sin zona. */
export const FILTRO_SIN_ZONA = 'sin_zona' as const;

export type FiltroZona = number | 'todas' | typeof FILTRO_SIN_ZONA;

/** `true` si la sucursal pasa el filtro de zona elegido. */
export function coincideFiltroZona(zonaId: number | null | undefined, filtro: FiltroZona): boolean {
  if (filtro === 'todas') return true;
  if (filtro === FILTRO_SIN_ZONA) return zonaId == null;
  return zonaId === filtro;
}

export interface ResumenSinZona {
  /** Cantidad de sucursales sin zona. */
  total: number;
  /** Códigos de las sucursales sin zona con solicitudes que esperan a Logística. */
  conSolicitudesAbiertas: number[];
}

/**
 * Cuenta las sucursales sin zona y marca las que tienen solicitudes en un
 * estado donde Logística todavía debe actuar.
 */
export function resumenSinZona(
  sucursales: Array<{ id: number; zona_id?: number | null }>,
  solicitudes: Array<{ sucursal: number; estado: string }>,
): ResumenSinZona {
  const sinZona = new Set(sucursales.filter((s) => s.zona_id == null).map((s) => s.id));
  const abiertos = new Set<string>(ESTADOS_SOLICITUD_TRASPASABLES);
  const conAbiertas = new Set<number>();
  for (const s of solicitudes) {
    if (sinZona.has(s.sucursal) && abiertos.has(s.estado)) conAbiertas.add(s.sucursal);
  }
  return { total: sinZona.size, conSolicitudesAbiertas: [...conAbiertas].sort((a, b) => a - b) };
}
