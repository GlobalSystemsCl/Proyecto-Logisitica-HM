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
  /** R5: suma de los slots extra (20 %) y de los extra todavía libres. */
  totalExtra: number;
  extraLibres: number;
  /** R5: sucursales que ya superaron también la capacidad extra. */
  sucursalesExcedidas: string[];
}

/** Porcentaje a partir del cual se considera que hay que prestar atención. */
export const UMBRAL_ATENCION = 0.2;

/**
 * R5: cada sucursal tiene un 20 % extra sobre su capacidad real para
 * estacionar fuera de los slots oficiales (acera, espacios no oficiales).
 * Se redondea siempre hacia arriba a un entero: 3 slots dan 1 extra, 10 dan 2.
 * Es solo un aviso: superar la capacidad no bloquea ninguna operación.
 */
export const PORCENTAJE_SLOTS_EXTRA = 0.2;

export type EstadoCapacidad = 'disponible' | 'usando_extra' | 'excedido' | 'sin_capacidad';

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

/** Slots extra de una sucursal: 20 % de la capacidad real, redondeado hacia arriba. */
export function capacidadExtra(sucursal: SlotSucursalResumen): number {
  return Math.ceil(aNumero(sucursal.slots) * PORCENTAJE_SLOTS_EXTRA);
}

/** Capacidad real más la extra. */
export function capacidadTotal(sucursal: SlotSucursalResumen): number {
  return aNumero(sucursal.slots) + capacidadExtra(sucursal);
}

/** Slots en uso: ocupados más reservados. */
export function usoSlots(sucursal: SlotSucursalResumen): number {
  return aNumero(sucursal.slots_ocupados) + aNumero(sucursal.slots_reservados);
}

/** Extras todavía libres (nunca negativo). */
export function extraLibres(sucursal: SlotSucursalResumen): number {
  const real = aNumero(sucursal.slots);
  return Math.max(capacidadTotal(sucursal) - Math.max(usoSlots(sucursal), real), 0);
}

/**
 * Estado de la capacidad:
 *  - `disponible`: quedan slots reales libres
 *  - `usando_extra`: la capacidad real está completa y se usan (o quedan) extras
 *  - `excedido`: se superó también la capacidad extra
 *  - `sin_capacidad`: la sucursal no tiene slots declarados ni vehículos
 */
export function estadoCapacidad(sucursal: SlotSucursalResumen): EstadoCapacidad {
  const real = aNumero(sucursal.slots);
  const uso = usoSlots(sucursal);
  if (real === 0) return uso > 0 ? 'excedido' : 'sin_capacidad';
  if (uso < real) return 'disponible';
  if (uso <= capacidadTotal(sucursal)) return 'usando_extra';
  return 'excedido';
}

export const ETIQUETA_ESTADO_CAPACIDAD: Record<EstadoCapacidad, string> = {
  disponible: 'Disponible',
  usando_extra: 'Usando slots extra',
  excedido: 'Capacidad excedida',
  sin_capacidad: 'Sin capacidad declarada',
};

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
  let totalExtra = 0;
  let libresExtra = 0;
  const sucursalesCriticas: string[] = [];
  const sucursalesExcedidas: string[] = [];

  for (const sucursal of lista) {
    const libresSucursal = slotsLibres(sucursal);
    libres += libresSucursal;
    total += aNumero(sucursal.slots);
    ocupados += aNumero(sucursal.slots_ocupados) + aNumero(sucursal.slots_reservados);
    if (libresSucursal === 0) {
      sucursalesCriticas.push(nombreSucursal(sucursal));
    }
    totalExtra += capacidadExtra(sucursal);
    libresExtra += extraLibres(sucursal);
    if (aNumero(sucursal.slots) > 0 && estadoCapacidad(sucursal) === 'excedido') {
      sucursalesExcedidas.push(nombreSucursal(sucursal));
    }
  }

  const porcentajeOcupacion = total > 0 ? Math.round((ocupados / total) * 100) : 0;
  const proporcionLibre = total > 0 ? libres / total : 1;
  const criticidad: CriticidadSlots =
    total === 0 ? 'ok' : libres === 0 ? 'critico' : proporcionLibre < UMBRAL_ATENCION ? 'atencion' : 'ok';

  return {
    libres,
    total,
    ocupados,
    criticidad,
    porcentajeOcupacion,
    sucursalesCriticas,
    totalExtra,
    extraLibres: libresExtra,
    sucursalesExcedidas,
  };
}

/** Texto "3/10 (+2 extra)" de una sucursal: libres sobre capacidad real, y extras libres. */
export function textoSlots(sucursal: SlotSucursalResumen): string {
  const base = `${slotsLibres(sucursal)}/${aNumero(sucursal.slots)}`;
  const extra = capacidadExtra(sucursal);
  return extra > 0 ? `${base} (+${extraLibres(sucursal)} extra)` : base;
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
