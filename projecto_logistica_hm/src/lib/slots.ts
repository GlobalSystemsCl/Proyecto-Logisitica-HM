/**
 * Cálculo de disponibilidad de slots de estacionamiento por sucursal.
 *
 * La BD mantiene `sucursal.slots`, `slots_ocupados` y `slots_reservados`;
 * los triggers `fn_incrementar_slots_ocupados`, `fn_decrementar_slots_ocupados`
 * y `fn_liberar_slots_rechazo_cancelacion` los actualizan. Este módulo es la
 * única fuente del cálculo de "libres" para la UI, de modo que el indicador del
 * dashboard y el panel `/logistica/slots` no puedan discrepar.
 *
 * Funciones puras: no tocan la BD ni React.
 */

/** Resumen de slots de una sucursal, tal como lo devuelve la capa de datos. */
export interface SlotSucursalResumen {
  nombre: string | null;
  slots: number | null;
  slots_ocupados: number | null;
  slots_reservados: number | null;
}

export type CriticidadSlots = 'ok' | 'atencion' | 'critico';

export interface ResumenSlots {
  /** Suma de slots libres de todas las sucursales. */
  libres: number;
  /** Suma de la capacidad total declarada. */
  total: number;
  /** Suma de los slots ocupados o reservados. */
  ocupados: number;
  /** `critico` sin ningún slot libre, `atencion` con menos del 20 % libre. */
  criticidad: CriticidadSlots;
  /** Porcentaje de ocupación redondeado (0-100), o 0 si no hay capacidad. */
  porcentajeOcupacion: number;
  /** Sucursal sin ningún slot libre, si existe. */
  sucursalesCriticas: string[];
}

/** Porcentaje a partir del cual se considera que hay que prestar atención. */
export const UMBRAL_ATENCION = 0.2;

function aNumero(valor: number | null | undefined): number {
  return typeof valor === 'number' && Number.isFinite(valor) ? valor : 0;
}

/**
 * Slots libres de una sucursal: capacidad menos lo ocupado y lo reservado,
 * nunca negativo. Normaliza `null`/`undefined`/no finitos a 0 para no producir
 * `NaN` en la UI.
 */
export function slotsLibres(sucursal: SlotSucursalResumen): number {
  const total = aNumero(sucursal.slots);
  const ocupados = aNumero(sucursal.slots_ocupados);
  const reservados = aNumero(sucursal.slots_reservados);
  return Math.max(total - ocupados - reservados, 0);
}

/** Nombre legible de la sucursal, con respaldo cuando el nombre es nulo. */
export function nombreSucursal(sucursal: SlotSucursalResumen): string {
  const nombre = sucursal.nombre?.trim();
  return nombre && nombre.length > 0 ? nombre : 'Sucursal sin nombre';
}

/** Consolidado de slots de varias sucursales para el indicador del dashboard. */
export function resumenSlots(sucursales: SlotSucursalResumen[] | null | undefined): ResumenSlots {
  const lista = Array.isArray(sucursales) ? sucursales : [];

  let libres = 0;
  let total = 0;
  let ocupados = 0;
  const sucursalesCriticas: string[] = [];

  for (const sucursal of lista) {
    const libresSucursal = slotsLibres(sucursal);
    libres += libresSucursal;
    total += aNumero(sucursal.slots);
    ocupados += aNumero(sucursal.slots_ocupados) + aNumero(sucursal.slots_reservados);
    if (libresSucursal === 0) {
      sucursalesCriticas.push(nombreSucursal(sucursal));
    }
  }

  const porcentajeOcupacion = total > 0 ? Math.round((ocupados / total) * 100) : 0;
  const proporcionLibre = total > 0 ? libres / total : 1;
  const criticidad: CriticidadSlots =
    total === 0 ? 'ok' : libres === 0 ? 'critico' : proporcionLibre < UMBRAL_ATENCION ? 'atencion' : 'ok';

  return { libres, total, ocupados, criticidad, porcentajeOcupacion, sucursalesCriticas };
}

/** Texto "3/10" de una sucursal: libres sobre capacidad. */
export function textoSlots(sucursal: SlotSucursalResumen): string {
  return `${slotsLibres(sucursal)}/${aNumero(sucursal.slots)}`;
}

/**
 * Ordena las sucursales por disponibilidad ascendente: primero las que tienen
 * menos slots libres, que son las que requieren decisión.
 */
export function ordenarPorDisponibilidad(
  sucursales: SlotSucursalResumen[]
): SlotSucursalResumen[] {
  return [...sucursales].sort((a, b) => slotsLibres(a) - slotsLibres(b));
}
