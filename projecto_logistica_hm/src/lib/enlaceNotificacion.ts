/**
 * Lectura de los enlaces de las notificaciones (R2): `?solicitud=<id>` y
 * `?traslado=<id>`. Funciones puras.
 */

/** Primer valor de un parámetro de `searchParams`, o null si falta o está vacío. */
export function idDesdeParam(valor: string | string[] | undefined): string | null {
  const v = Array.isArray(valor) ? valor[0] : valor;
  const limpio = v?.trim();
  return limpio ? limpio : null;
}

/** La misma URL sin un parámetro (para no reabrir el detalle al recargar). */
export function urlSinParametro(url: string, parametro: string): string {
  const u = new URL(url);
  u.searchParams.delete(parametro);
  return `${u.pathname}${u.search}${u.hash}`;
}
