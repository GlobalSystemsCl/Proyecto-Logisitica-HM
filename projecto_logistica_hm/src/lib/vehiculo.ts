import type { VehiculoAsociado } from '@/types/solicitud.types';

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