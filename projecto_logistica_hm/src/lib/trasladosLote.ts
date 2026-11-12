/**
 * R12 (2026-11-11): traslados internos con selección múltiple. Se eligen uno o
 * varios vehículos y se crea un traslado por vehículo (la BD mantiene un
 * vehículo por traslado) con el mismo origen, destino y transporte.
 * Funciones puras.
 */

/** Máximo de vehículos por creación, para que la acción responda a tiempo. */
export const MAX_TRASLADOS_POR_LOTE = 50;

/** Error para el usuario, o null si la selección se puede enviar. */
export function validarLoteTraslados(vehiculoIds: string[]): string | null {
  const unicos = new Set(vehiculoIds.filter(Boolean));
  if (unicos.size === 0) return 'Selecciona al menos un vehículo para trasladar.';
  if (unicos.size > MAX_TRASLADOS_POR_LOTE) {
    return `Puedes crear hasta ${MAX_TRASLADOS_POR_LOTE} traslados a la vez; seleccionaste ${unicos.size}.`;
  }
  return null;
}

export interface OmitidoLote {
  vehiculoId: string;
  error: string;
}

/**
 * Mensaje del resultado: cuántos se crearon y, de los que no, el vehículo
 * (`etiquetas`: id -> chasis o patente) y el motivo, hasta 5.
 */
export function mensajeResultadoLote(
  creados: number,
  omitidos: OmitidoLote[],
  etiquetas: Record<string, string>
): string {
  const partes: string[] = [];
  if (creados > 0) partes.push(creados === 1 ? 'Se creó 1 traslado.' : `Se crearon ${creados} traslados.`);
  if (omitidos.length > 0) {
    const detalle = omitidos
      .slice(0, 5)
      .map((o) => `${etiquetas[o.vehiculoId] ?? 'Vehículo'}: ${o.error}`)
      .join(' · ');
    const resto = omitidos.length > 5 ? ` · y ${omitidos.length - 5} más` : '';
    partes.push(`No se crearon ${omitidos.length}: ${detalle}${resto}`);
  }
  return partes.join(' ');
}
