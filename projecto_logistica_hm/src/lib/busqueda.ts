/**
 * Saneamiento de texto del usuario para filtros de PostgREST (brecha 021).
 */

/**
 * Término de búsqueda de patente o chasis. Ambos son alfanuméricos (con
 * guiones), así que se descarta cualquier otro carácter. Así no se pueden
 * inyectar condiciones en `.or()` con comas, paréntesis o puntos (antes solo
 * se quitaba `%`).
 */
export function sanitizarTerminoBusqueda(texto: string | null | undefined, max = 30): string {
  return (texto || '').replace(/[^A-Za-z0-9-]/g, '').slice(0, max);
}

/**
 * Escapa los comodines de LIKE/ILIKE (`\`, `%`, `_`) para comparar un nombre
 * de forma literal sin distinguir mayúsculas. Antes "Zona_1" coincidía con
 * "ZonaX1" y producía falsos "ya existe".
 */
export function escaparPatronLike(texto: string): string {
  return texto.replace(/[\\%_]/g, (c) => `\\${c}`);
}
