import type { VehiculoAsociado } from '@/types/solicitud.types';
import type { DisponibilidadVehiculo } from '@/types/sucursal.types';

/**
 * Etiquetas legibles de un vehículo asociado a una solicitud, para las listas
 * resumidas (cola de prioridades del dashboard y "Cola de Prioridades").
 *
 * `patente` es nullable en la BD, así que no puede ser el único identificador
 * visible: un vehículo sin patente igual tiene marca, modelo y chasis, y antes
 * esas filas se mostraban como "Sin vehículo" aunque el vehículo existiera.
 *
 * Funciones puras: no tocan la BD ni React.
 */

/** `"Toyota Etios"`, o el chasis como respaldo si faltara marca o modelo. */
export function nombreVehiculo(v: VehiculoAsociado): string {
  const marcaModelo = [v.marca, v.modelo].map((p) => p?.trim()).filter(Boolean).join(' ');
  return marcaModelo || v.chasis;
}

/** Nombre del vehículo listo para mostrar en línea: `"Toyota Etios · 2020"`. */
export function nombreVehiculoConAnio(v: VehiculoAsociado): string {
  const anio = typeof v.anio === 'number' && v.anio > 0 ? String(v.anio) : '';
  return [nombreVehiculo(v), anio].filter(Boolean).join(' · ');
}

/**
 * Identificación corta de un vehículo: patente + nombre. La patente puede faltar,
 * en cuyo caso se muestra solo el nombre. Devuelve `null` si no hay nada
 * imprimible, para que la UI decida el texto de reserva.
 */
export function etiquetaVehiculo(v: VehiculoAsociado): string | null {
  const nombre = nombreVehiculo(v);
  if (v.patente && v.patente.trim()) return `${v.patente.trim()} · ${nombre}`;
  return nombre || null;
}
/**
 * Estados de un vehículo tal como los ve el usuario. En la BD el estado
 * disponible se llama `liberado` (lo usan los triggers); en pantalla siempre
 * es "Disponible". "Vendido" corresponde al vehículo entregado al cliente.
 */
export const ETIQUETA_DISPONIBILIDAD: Record<DisponibilidadVehiculo, string> = {
  liberado: 'Disponible',
  reservado: 'Reservado',
  vendido: 'Vendido',
};

export const DESCRIPCION_DISPONIBILIDAD: Record<DisponibilidadVehiculo, string> = {
  liberado: 'Disponible para una nueva solicitud o traslado',
  reservado: 'Reservado en una solicitud activa',
  vendido: 'Vendido: entregado al cliente',
};

/** Etiqueta visible del estado; un valor desconocido se muestra tal cual. */
export function etiquetaDisponibilidad(estado: DisponibilidadVehiculo | string | null | undefined): string {
  if (!estado) return '—';
  return ETIQUETA_DISPONIBILIDAD[estado as DisponibilidadVehiculo] ?? estado;
}
