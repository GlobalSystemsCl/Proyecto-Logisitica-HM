const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

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
