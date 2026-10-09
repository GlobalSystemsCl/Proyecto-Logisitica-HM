import type { EstadoSolicitud } from '@/types/solicitud.types';

/**
 * Estados cerrados en los que la solicitud ya no admite interacción
 * (observaciones, documentos ni insistencias).
 *
 * Un rechazo no tiene apelación: si el ejecutivo aún necesita el vehículo, crea
 * una solicitud nueva. Así no se abre una "mesa de discusión" sobre una
 * solicitud cerrada, que frenaría el flujo.
 */
export const ESTADOS_SIN_INTERACCION: readonly EstadoSolicitud[] = ['rechazada', 'cancelada'];

/** `true` si la solicitud todavía acepta observaciones y documentos. */
export function admiteInteraccion(estado: EstadoSolicitud | string | null | undefined): boolean {
  if (!estado) return false;
  return !(ESTADOS_SIN_INTERACCION as readonly string[]).includes(estado);
}

export const MENSAJE_SOLICITUD_CERRADA =
  'Esta solicitud está cerrada y no admite observaciones ni documentos. Si aún necesitas el vehículo, crea una nueva solicitud.';
