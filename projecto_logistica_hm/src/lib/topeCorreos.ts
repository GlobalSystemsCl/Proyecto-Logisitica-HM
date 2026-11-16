import { ZONA_HORARIA } from '@/lib/fechas';

/**
 * Reglas para no saturar los correos (plan del 2026-11-11).
 *
 * El plan gratuito de Brevo permite 300 correos al día. La app se queda bajo
 * ese límite con un tope diario configurable y un tope por usuario. Al
 * llegar a un tope, los avisos no urgentes no se envían por correo (la
 * campana sí se crea). Los urgentes (reprogramaciones, cancelaciones,
 * recepciones con novedades) siempre salen. Además, el mismo aviso de la
 * misma solicitud no se repite a la misma persona dentro de unos minutos
 * (doble clic, reintentos).
 *
 * Funciones puras: no tocan la BD ni la red.
 */

export const TOPE_DIARIO_POR_DEFECTO = 250;
export const TOPE_USUARIO_POR_DEFECTO = 25;
/** Minutos en que el mismo aviso a la misma persona se considera repetido. */
export const VENTANA_DUPLICADO_MIN = 5;

export interface TopesCorreo {
  /** Correos enviados al día en total (todos los usuarios). */
  diario: number;
  /** Correos no urgentes por usuario al día. */
  porUsuario: number;
}

function entero(valor: string | undefined, porDefecto: number): number {
  const n = Number(valor?.trim());
  return Number.isInteger(n) && n >= 0 ? n : porDefecto;
}

/** Topes desde `CORREOS_TOPE_DIARIO` y `CORREOS_TOPE_USUARIO`; un valor inválido usa el de por defecto. */
export function topesDesdeEntorno(env: Record<string, string | undefined> = process.env): TopesCorreo {
  return {
    diario: entero(env.CORREOS_TOPE_DIARIO, TOPE_DIARIO_POR_DEFECTO),
    porUsuario: entero(env.CORREOS_TOPE_USUARIO, TOPE_USUARIO_POR_DEFECTO),
  };
}

export type DecisionEnvio = 'enviar' | 'omitido_tope';

export interface ContextoEnvio {
  urgente: boolean;
  /** Correos ya enviados hoy (todos). */
  enviadosHoy: number;
  /** Correos no urgentes ya enviados hoy a este usuario. */
  enviadosHoyUsuario: number;
  topes: TopesCorreo;
}

export function decidirEnvio(c: ContextoEnvio): DecisionEnvio {
  if (c.urgente) return 'enviar';
  if (c.enviadosHoy >= c.topes.diario) return 'omitido_tope';
  if (c.enviadosHoyUsuario >= c.topes.porUsuario) return 'omitido_tope';
  return 'enviar';
}

/** `true` si el último envío del mismo aviso a la misma persona fue hace menos de la ventana. */
export function esDuplicado(
  ultimoEnvioIso: string | null | undefined,
  ahora: Date = new Date(),
  ventanaMin: number = VENTANA_DUPLICADO_MIN
): boolean {
  if (!ultimoEnvioIso) return false;
  const t = new Date(ultimoEnvioIso).getTime();
  if (isNaN(t)) return false;
  const diferencia = ahora.getTime() - t;
  return diferencia >= 0 && diferencia < ventanaMin * 60_000;
}

/** Desfase de la hora de Chile en ese momento, como "-03:00". */
function desfaseChile(momento: Date): string {
  const parte = new Intl.DateTimeFormat('en-US', { timeZone: ZONA_HORARIA, timeZoneName: 'longOffset' })
    .formatToParts(momento)
    .find((p) => p.type === 'timeZoneName')?.value;
  const m = parte?.match(/GMT([+-]\d{2}:\d{2})/);
  return m ? m[1] : '+00:00';
}

/** Inicio del día de hoy en la hora de Chile, en ISO (UTC). Desde ahí se cuentan los topes. */
export function inicioDelDiaChile(ahora: Date = new Date()): string {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONA_HORARIA,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(ahora);
  const v = (tipo: string) => partes.find((p) => p.type === tipo)?.value ?? '';
  return new Date(`${v('year')}-${v('month')}-${v('day')}T00:00:00${desfaseChile(ahora)}`).toISOString();
}
