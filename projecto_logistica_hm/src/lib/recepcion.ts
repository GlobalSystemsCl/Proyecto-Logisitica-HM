/**
 * Registro de la recepción en la sucursal destino (R13) y de la cancelación
 * de un traslado en tránsito (R8).
 *
 * En una solicitud, la recepción queda como observación con el prefijo
 * `[RECEPCIÓN]` (mismo patrón que `[RECHAZO]`) y en la auditoría. En un
 * traslado interno queda en columnas propias (`recepcion_con_novedades`,
 * `observacion_recepcion`).
 *
 * Funciones puras: no tocan la BD ni React.
 */

export const PREFIJO_RECEPCION = '[RECEPCIÓN]';
export const MAX_OBSERVACION_RECEPCION = 500;
export const MIN_MOTIVO_CANCELACION = 5;
export const MAX_MOTIVO_CANCELACION = 500;

export interface DatosRecepcion {
  /** `true` si el vehículo llegó con daños, faltantes u otra novedad. */
  conNovedades: boolean;
  observacion?: string | null;
}

/** Mensaje de error para el usuario, o `null` si los datos son válidos. */
export function validarRecepcion(datos: DatosRecepcion | null | undefined): string | null {
  if (!datos) return null;
  const observacion = datos.observacion?.trim() ?? '';
  if (datos.conNovedades && observacion.length === 0) {
    return 'Describe la novedad con la que llegó el vehículo.';
  }
  if (observacion.length > MAX_OBSERVACION_RECEPCION) {
    return `La observación no puede superar los ${MAX_OBSERVACION_RECEPCION} caracteres.`;
  }
  return null;
}

/**
 * Texto de la observación que se guarda en la solicitud, o `null` si no hay
 * nada que registrar (recepción sin novedades y sin comentario).
 */
export function textoObservacionRecepcion(datos: DatosRecepcion | null | undefined): string | null {
  if (!datos) return null;
  const observacion = datos.observacion?.trim() ?? '';
  if (datos.conNovedades) return `${PREFIJO_RECEPCION} Con novedades: ${observacion}`;
  if (observacion) return `${PREFIJO_RECEPCION} Sin novedades: ${observacion}`;
  return null;
}

/** Mensaje de error del motivo de una cancelación, o `null` si es válido. */
export function validarMotivoCancelacion(motivo: string | null | undefined): string | null {
  const texto = motivo?.trim() ?? '';
  if (texto.length < MIN_MOTIVO_CANCELACION) {
    return `El motivo de la cancelación es obligatorio (mínimo ${MIN_MOTIVO_CANCELACION} caracteres).`;
  }
  if (texto.length > MAX_MOTIVO_CANCELACION) {
    return `El motivo no puede superar los ${MAX_MOTIVO_CANCELACION} caracteres.`;
  }
  return null;
}
