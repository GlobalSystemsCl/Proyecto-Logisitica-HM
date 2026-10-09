import { VehiculoConDisponibilidad } from '@/types/vehiculo.types';

/** Valor del filtro de ubicación/marca/estado que desactiva ese filtro. */
export const FILTRO_TODAS = 'todas';
/** Valor del filtro de ubicación para los vehículos sin sucursal asignada (en viaje / container). */
export const FILTRO_EN_VIAJE = 'en_viaje';
/** R2: valor del filtro de estado para los vehículos que van en camino a otra sucursal. */
export const FILTRO_EN_TRANSITO = 'en_transito';

export interface FiltrosVehiculos {
  busqueda: string;
  marca: string;
  disponibilidad: string;
  /** `todas`, `en_viaje` o el id de la sucursal serializado como string. */
  ubicacion: string;
  /** Límite inferior de fecha de registro en `YYYY-MM-DD`. Vacío = sin límite. */
  fechaDesde: string;
  /** Límite superior de fecha de registro en `YYYY-MM-DD`. Vacío = sin límite. */
  fechaHasta: string;
}

export const FILTROS_INICIALES: FiltrosVehiculos = {
  busqueda: '',
  marca: FILTRO_TODAS,
  disponibilidad: FILTRO_TODAS,
  ubicacion: FILTRO_TODAS,
  fechaDesde: '',
  fechaHasta: '',
};

export interface MetricasVehiculos {
  total: number;
  reservados: number;
  vendidos: number;
  disponibles: number;
}

/**
 * Convierte un timestamp ISO a su fecha calendario local (`YYYY-MM-DD`).
 * Devuelve `null` si el valor no es una fecha parseable.
 */
export function aFechaLocal(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const anio = d.getFullYear();
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${anio}-${mes}-${dia}`;
}

/**
 * Indica si una fecha calendario local cae dentro del rango `[desde, hasta]`
 * (ambos extremos inclusivos). Sin límites, todo coincide. Una fecha no
 * parseable nunca coincide con un rango acotado.
 */
export function coincideRangoFecha(
  fechaLocal: string | null,
  desde: string,
  hasta: string,
): boolean {
  if (!desde && !hasta) return true;
  if (fechaLocal === null) return false;
  if (desde && fechaLocal < desde) return false;
  if (hasta && fechaLocal > hasta) return false;
  return true;
}

/** Indica si el vehículo pertenece a la sucursal seleccionada o al grupo "en viaje". */
export function coincideUbicacion(ubicacion: number | null, filtro: string): boolean {
  if (filtro === FILTRO_TODAS) return true;
  if (filtro === FILTRO_EN_VIAJE) return ubicacion === null;
  const id = Number(filtro);
  if (!Number.isInteger(id)) return false;
  return ubicacion === id;
}

/**
 * Indica si el estado de disponibilidad del vehículo pasa el filtro.
 * `en_transito` (R2) selecciona los vehículos que van en camino.
 */
export function coincideDisponibilidad(
  estado: VehiculoConDisponibilidad['estado_disponibilidad'],
  filtro: string,
  enTransitoHacia: string | null = null,
): boolean {
  if (filtro === FILTRO_TODAS) return true;
  if (filtro === FILTRO_EN_TRANSITO) return enTransitoHacia !== null;
  return estado === filtro;
}

/** Indica si el vehículo coincide con la búsqueda libre por chasis, patente, marca o modelo. */
export function coincideBusqueda(vehiculo: VehiculoConDisponibilidad, busqueda: string): boolean {
  const termino = busqueda.trim().toLowerCase();
  if (!termino) return true;
  return (
    vehiculo.chasis.toLowerCase().includes(termino) ||
    (vehiculo.patente ?? '').toLowerCase().includes(termino) ||
    vehiculo.marca.toLowerCase().includes(termino) ||
    vehiculo.modelo.toLowerCase().includes(termino)
  );
}

/** Aplica todos los filtros de la tabla de vehículos. */
export function filtrarVehiculos(
  vehiculos: VehiculoConDisponibilidad[],
  filtros: FiltrosVehiculos,
): VehiculoConDisponibilidad[] {
  return vehiculos.filter((v) => {
    if (!coincideBusqueda(v, filtros.busqueda)) return false;
    if (filtros.marca !== FILTRO_TODAS && v.marca !== filtros.marca) return false;
    if (!coincideDisponibilidad(v.estado_disponibilidad, filtros.disponibilidad, v.en_transito_hacia ?? null)) return false;
    if (!coincideUbicacion(v.ubicacion, filtros.ubicacion)) return false;
    return coincideRangoFecha(aFechaLocal(v.created_at), filtros.fechaDesde, filtros.fechaHasta);
  });
}

/** Cuenta el total y el desglose por estado de disponibilidad del conjunto recibido. */
export function contarPorDisponibilidad(vehiculos: VehiculoConDisponibilidad[]): MetricasVehiculos {
  const total = vehiculos.length;
  const reservados = vehiculos.filter((v) => v.estado_disponibilidad === 'reservado').length;
  const vendidos = vehiculos.filter((v) => v.estado_disponibilidad === 'vendido').length;
  return { total, reservados, vendidos, disponibles: total - reservados - vendidos };
}

/** Indica si hay al menos un filtro distinto del estado inicial, para mostrar "Limpiar filtros". */
export function hayFiltrosActivos(filtros: FiltrosVehiculos): boolean {
  return (
    filtros.busqueda !== FILTROS_INICIALES.busqueda ||
    filtros.marca !== FILTROS_INICIALES.marca ||
    filtros.disponibilidad !== FILTROS_INICIALES.disponibilidad ||
    filtros.ubicacion !== FILTROS_INICIALES.ubicacion ||
    filtros.fechaDesde !== FILTROS_INICIALES.fechaDesde ||
    filtros.fechaHasta !== FILTROS_INICIALES.fechaHasta
  );
}
