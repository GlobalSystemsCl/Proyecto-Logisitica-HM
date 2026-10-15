const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

export function hoyISO(): string {
  const d = new Date();
  const anio = d.getFullYear();
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${anio}-${mes}-${dia}`;
}

export function esFechaAnteriorAHoy(fecha: string | null | undefined): boolean {
  if (!fecha) return false;
  const iso = fecha.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  return iso < hoyISO();
}

/** Zona horaria en que se muestran las fechas con hora (registros del sistema). */
export const ZONA_HORARIA = 'America/Santiago';

/**
 * Día, mes y año a mostrar. Hay dos tipos de valores:
 *  - fechas sin hora (fecha límite, despacho programado): se guardan como
 *    medianoche UTC o "YYYY-MM-DD" y se leen en UTC para no correrlas un día;
 *  - fechas con hora (creación, recepción, historial): se muestran en la hora
 *    de Chile, para que lo ocurrido después de las 21:00 no aparezca al día
 *    siguiente.
 */
export function partesFecha(iso: string): { dia: number; mes: number; anio: number } | null {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  const sinHora =
    /^\d{4}-\d{2}-\d{2}$/.test(iso.trim()) ||
    (d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0 && d.getUTCMilliseconds() === 0);
  if (sinHora) {
    return { dia: d.getUTCDate(), mes: d.getUTCMonth() + 1, anio: d.getUTCFullYear() };
  }
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONA_HORARIA,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(d);
  const valor = (tipo: string) => Number(partes.find((p) => p.type === tipo)?.value);
  return { dia: valor('day'), mes: valor('month'), anio: valor('year') };
}

export function formatFecha(iso: string | null | undefined): string {
  if (!iso) return '—';
  const p = partesFecha(iso);
  if (!p) return '—';
  return `${p.dia}/${String(p.mes).padStart(2, '0')}/${p.anio}`;
}

export function formatFechaLarga(iso: string | null | undefined): string {
  if (!iso) return '—';
  const p = partesFecha(iso);
  if (!p) return '—';
  return `${p.dia} de ${MESES[p.mes - 1]} de ${p.anio}`;
}
