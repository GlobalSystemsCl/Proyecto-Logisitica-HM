import { diaChile } from '@/lib/reporteTraslados';
import { esFechaValida } from '@/lib/calendario';

/**
 * R9 (2026-11-12): ausencias de Logística con sustituto. Mientras dura la
 * ausencia (desde y hasta, días inclusive) la cuenta del titular queda
 * congelada, sus solicitudes y traslados en curso pasan al sustituto y este
 * atiende también sus zonas. Al terminar, lo traspasado que siga abierto
 * vuelve solo al titular. Funciones puras.
 */

export type EstadoAusencia = 'programada' | 'activa' | 'finalizada' | 'cancelada';

export const ETIQUETA_ESTADO_AUSENCIA: Record<EstadoAusencia, string> = {
  programada: 'Programada',
  activa: 'En curso',
  finalizada: 'Terminada',
  cancelada: 'Cancelada',
};

/** Estados de solicitud en que Logística todavía tiene trabajo: se traspasan. */
export const ESTADOS_SOLICITUD_TRASPASABLES = [
  'aprobada',
  'pendiente',
  'priorizada',
  'asignada',
  'calendarizada',
  'despachada',
  'en_transito',
] as const;

/** Estados de traslado interno que se traspasan. */
export const ESTADOS_TRASLADO_TRASPASABLES = ['pendiente', 'en_transito'] as const;

/** Día de hoy en Chile (`YYYY-MM-DD`): el cron corre en un servidor en UTC. */
export function hoyChile(ahora: Date = new Date()): string {
  return diaChile(ahora.toISOString()) as string;
}

export interface DatosAusencia {
  titularId: string;
  sustitutoId: string;
  desde: string;
  hasta: string;
}

/** Error para el usuario, o null si la ausencia se puede registrar. */
export function validarAusencia(d: DatosAusencia, hoy: string): string | null {
  if (!d.titularId) return 'Elige al usuario de Logística que se ausenta.';
  if (!d.sustitutoId) return 'Elige al sustituto.';
  if (d.titularId === d.sustitutoId) return 'El sustituto debe ser otra persona.';
  if (!esFechaValida(d.desde) || !esFechaValida(d.hasta)) return 'Indica las fechas desde y hasta.';
  if (d.hasta < d.desde) return 'La fecha hasta no puede ser anterior a la fecha desde.';
  if (d.hasta < hoy) return 'La ausencia ya terminó: la fecha hasta no puede ser anterior a hoy.';
  return null;
}

/**
 * Qué toca hacer hoy con una ausencia: iniciarla (llegó su fecha), terminarla
 * (pasó su fecha hasta) o cerrarla sin efectos (estaba programada y su fecha
 * ya pasó sin que se iniciara).
 */
export function accionPendiente(
  a: { estado: EstadoAusencia; desde: string; hasta: string },
  hoy: string
): 'iniciar' | 'finalizar' | 'vencida' | null {
  if (a.estado === 'programada') {
    if (a.hasta < hoy) return 'vencida';
    return a.desde <= hoy ? 'iniciar' : null;
  }
  if (a.estado === 'activa' && a.hasta < hoy) return 'finalizar';
  return null;
}

/** Zonas del titular que el sustituto todavía no tiene: se le agregan como temporales. */
export function zonasTemporales(zonasTitular: number[], zonasSustituto: number[]): number[] {
  const propias = new Set(zonasSustituto);
  return [...new Set(zonasTitular)].filter((z) => !propias.has(z));
}

/** ¿Se cruzan dos rangos de días (inclusive)? */
export function rangosSeCruzan(a: { desde: string; hasta: string }, b: { desde: string; hasta: string }): boolean {
  return a.desde <= b.hasta && b.desde <= a.hasta;
}
