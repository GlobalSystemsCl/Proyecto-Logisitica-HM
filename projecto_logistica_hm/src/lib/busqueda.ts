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

/** Minúsculas y sin tildes, para comparar textos que escribe el usuario. */
export function plano(texto: string): string {
  return texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

/**
 * QA #14: filtra sucursales por código o nombre (sin importar tildes ni
 * mayúsculas). El código es el visible (`sucursal.codigo`, "119B"); sin él,
 * el id. Conserva siempre la elegida, para que el selector no la pierda.
 */
export function filtrarSucursales<T extends { id: number; nombre: string | null; codigo?: string | null }>(
  sucursales: T[],
  termino: string,
  elegidaId?: number | null,
): T[] {
  const t = plano(termino);
  if (!t) return sucursales;
  return sucursales.filter(
    (s) =>
      s.id === elegidaId ||
      plano(s.codigo ?? String(s.id)).startsWith(t) ||
      plano(s.nombre ?? '').includes(t),
  );
}

/**
 * Texto de una sucursal en un selector: código visible y nombre
 * ("101 · 15 NORTE-VIÑA DEL MAR"). Los usuarios conocen su sucursal por el código.
 */
export function etiquetaSucursal(s: { id: number; nombre: string | null; codigo?: string | null }): string {
  const codigo = (s.codigo ?? '').trim() || String(s.id);
  const nombre = (s.nombre ?? '').trim();
  return nombre ? `${codigo} · ${nombre}` : codigo;
}
