/**
 * N° visible de una solicitud: los 8 primeros caracteres del id, en
 * mayúsculas (el mismo que muestra su detalle). Es el único lugar que arma
 * este texto, para que todas las secciones muestren el mismo número.
 */
export function codigoSolicitud(id: string): string {
  return `#${id.slice(0, 8).toUpperCase()}`;
}
