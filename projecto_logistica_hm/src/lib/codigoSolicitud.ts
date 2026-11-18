/**
 * N° visible de una solicitud: `<código de la sucursal de origen>-<correlativo>`
 * (p. ej. `101-15` o `119B-3`). El código de sucursal es `sucursal.codigo`,
 * copiado en `solicitud.codigo_sucursal` al crearla (migración 20261118120000:
 * número + letra para Lonquén/Torquemada y sus acopios). Si no viene, se usa
 * `sucursal.id`, que coincide con el código en las demás sucursales. El
 * correlativo, `solicitud.numero`, lo asigna la BD por sucursal (20261024120000). Es el único lugar que arma este
 * texto, para que todas las secciones muestren el mismo número.
 *
 * Funciones puras: no tocan la BD ni React.
 */

export interface DatosCodigoSolicitud {
  id: string;
  /** Sucursal de origen (id). */
  sucursal: number | null;
  /** Código visible de la sucursal de origen ("101", "119A"); si falta, se usa el id. */
  codigo_sucursal?: string | null;
  /** Correlativo dentro de la sucursal de origen. */
  numero?: number | null;
}

export function codigoSolicitud(s: DatosCodigoSolicitud): string {
  if (s.sucursal != null && s.numero != null) return `${s.codigo_sucursal || s.sucursal}-${s.numero}`;
  // Sin número (sin sucursal de origen): el uuid corto que se usaba antes.
  return codigoUuid(s.id);
}

/** Los 8 primeros caracteres del uuid, en mayúsculas: "#529ACF6B". */
function codigoUuid(id: string): string {
  return `#${id.slice(0, 8).toUpperCase()}`;
}

/**
 * N° visible de un traslado interno: "T-15" (QA #48, migración 20261113110000;
 * correlativo global que asigna la BD). Sin número, o si solo se recibe el id,
 * el uuid corto que se usaba antes.
 */
export function codigoTraslado(t: string | { id: string; numero?: number | null }): string {
  if (typeof t === 'string') return codigoUuid(t);
  return t.numero != null ? `T-${t.numero}` : codigoUuid(t.id);
}

/**
 * `true` si lo buscado es el comienzo del n° visible (`101-1` encuentra
 * `101-1` y `101-15`) o parte del uuid, que sigue sirviendo para los enlaces
 * antiguos.
 */
export function coincideCodigoSolicitud(s: DatosCodigoSolicitud, termino: string): boolean {
  const t = termino.trim().toLowerCase().replace(/^#/, '').replace(/\s+/g, '');
  if (!t) return true;
  if (codigoSolicitud(s).toLowerCase().replace(/^#/, '').startsWith(t)) return true;
  return s.id.toLowerCase().includes(t);
}
