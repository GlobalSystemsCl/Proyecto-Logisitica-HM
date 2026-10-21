/**
 * Lectura completa de consultas de PostgREST, que corta cada respuesta en
 * 1000 filas aunque se pida `limit(100000)`.
 */

export const TAMANO_PAGINA_POSTGREST = 1000;

export interface ConsultaPaginable {
  range: (desde: number, hasta: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
}

/**
 * Recupera TODAS las filas de una consulta paginando con `.range()`.
 *
 * La consulta DEBE venir ordenada por una columna única (o terminar con `id`
 * como desempate): `range()` es un `OFFSET/LIMIT` y, sin un orden total,
 * Postgres puede repetir una fila en dos páginas y saltarse otra.
 *
 * Devuelve `null` si alguna página falla (tras notificar a `onError`).
 */
export async function obtenerTodasLasFilas<T = Record<string, unknown>>(
  consulta: ConsultaPaginable,
  onError: (error: { message: string }) => void,
  tamanoPagina = TAMANO_PAGINA_POSTGREST
): Promise<T[] | null> {
  const filas: T[] = [];

  for (let desde = 0; ; desde += tamanoPagina) {
    const { data, error } = await consulta.range(desde, desde + tamanoPagina - 1);
    if (error) {
      onError(error);
      return null;
    }
    const pagina = (data as T[] | null) ?? [];
    filas.push(...pagina);
    if (pagina.length < tamanoPagina) break;
  }

  return filas;
}

/** Parte una lista en grupos del tamaño indicado (lotes o consultas `in`). */
export function enLotes<T>(items: T[], tamano: number): T[][] {
  const lotes: T[][] = [];
  for (let i = 0; i < items.length; i += tamano) lotes.push(items.slice(i, i + tamano));
  return lotes;
}
