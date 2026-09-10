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

export function formatFecha(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  const dia = d.getUTCDate();
  const mes = d.getUTCMonth() + 1;
  const anio = d.getUTCFullYear();
  return `${dia}/${String(mes).padStart(2, '0')}/${anio}`;
}

export function formatFechaLarga(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  const dia = d.getUTCDate();
  const mes = MESES[d.getUTCMonth()];
  const anio = d.getUTCFullYear();
  return `${dia} de ${mes} de ${anio}`;
}
