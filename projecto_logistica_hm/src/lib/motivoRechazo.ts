import type { ObservacionEntry } from '@/types/solicitud.types';

/**
 * El motivo de rechazo de una solicitud **no tiene columna propia**: se guarda
 * como una observación con el prefijo `[RECHAZO] ` (`SolicitudesService.rechazarSolicitud`)
 * y además queda en la auditoría (`accion = 'rechazo'`, `valor_nuevo.motivo`).
 * Este módulo es la única fuente de verdad para leer ese motivo.
 *
 * Funciones puras: no tocan la BD ni React.
 */

export const PREFIJO_RECHAZO = '[RECHAZO]';

export interface MotivoRechazo {
  /** Motivo sin el prefijo `[RECHAZO]`, recortado. */
  motivo: string;
  /** Usuario que registró la observación del rechazo. */
  usuario_id: string | null;
  usuario_nombre: string | null;
  /** Fecha del registro del rechazo. */
  created_at: string;
}

/**
 * Detecta el prefijo `[RECHAZO]` tolerando espacios y diferencias de caja.
 * `null`/`undefined`/no-cadena devuelven `false` sin lanzar.
 */
export function tienePrefijoRechazo(observacion: string | null | undefined): boolean {
  if (typeof observacion !== 'string') return false;
  return observacion.trimStart().toUpperCase().startsWith(PREFIJO_RECHAZO);
}

/** Devuelve el motivo sin el prefijo, o `null` si la observación no es de rechazo. */
export function quitarPrefijoRechazo(observacion: string | null | undefined): string | null {
  if (!tienePrefijoRechazo(observacion)) return null;
  return (observacion as string).trimStart().slice(PREFIJO_RECHAZO.length).trim();
}

/**
 * Extrae el motivo de rechazo de la lista de observaciones de una solicitud:
 * gana la **más reciente** entre las que llevan el prefijo `[RECHAZO]`.
 * Devuelve `null` si no hay ninguna, para que la UI pueda avisar que el motivo
 * no quedó registrado (solicitudes históricas) en vez de ocultarlo.
 */
export function extraerMotivoRechazo(
  observaciones: ObservacionEntry[] | null | undefined
): MotivoRechazo | null {
  if (!Array.isArray(observaciones) || observaciones.length === 0) return null;

  const candidatas = observaciones.filter(
    (o) => o != null && tienePrefijoRechazo(o.observacion)
  );
  if (candidatas.length === 0) return null;

  const MasReciente = candidatas.reduce((a, b) =>
    new Date(b.created_at).getTime() > new Date(a.created_at).getTime() ? b : a
  );

  const motivo = quitarPrefijoRechazo(MasReciente.observacion);
  if (!motivo) return null;

  return {
    motivo,
    usuario_id: MasReciente.usuario_id ?? null,
    usuario_nombre: MasReciente.usuario_nombre ?? null,
    created_at: MasReciente.created_at,
  };
}
