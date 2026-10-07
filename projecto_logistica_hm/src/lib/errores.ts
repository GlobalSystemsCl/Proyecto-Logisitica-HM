/**
 * Traducción de errores a mensajes seguros para el usuario (brecha 020).
 *
 * Antes services y actions devolvían `error.message` de Postgres, PostgREST o
 * Storage tal cual, revelando tablas, columnas, constraints y triggers. Ahora:
 *   - `ErrorUsuario`: mensajes escritos por nosotros, se muestran tal cual.
 *   - Errores de Postgres con código conocido: mensaje genérico traducido.
 *   - `P0001` (RAISE EXCEPTION de nuestros triggers): mensaje de negocio, se muestra.
 *   - Cualquier otro: se registra el detalle en el servidor y se devuelve el
 *     mensaje de respaldo con un identificador para soporte.
 */
export class ErrorUsuario extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ErrorUsuario';
  }
}

interface ErrorConCodigo {
  code?: string;
  message?: string;
}

const MENSAJES_POR_CODIGO: Record<string, string> = {
  '23505': 'Ya existe un registro con esos datos.',
  '23503': 'La operación no es posible porque hay datos relacionados.',
  '23502': 'Faltan datos obligatorios.',
  '23514': 'Los datos no cumplen las reglas del sistema.',
  '22P02': 'Alguno de los datos enviados no tiene un formato válido.',
  '42501': 'No tienes permisos para realizar esta operación.',
};

function generarIdSoporte(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

export function mensajeErrorUsuario(err: unknown, fallback: string): string {
  if (err instanceof ErrorUsuario) return err.message;

  const conCodigo = (err && typeof err === 'object' ? err : {}) as ErrorConCodigo;
  const codigo = conCodigo.code;

  if (codigo === 'P0001' && conCodigo.message) {
    return conCodigo.message;
  }

  if (codigo && MENSAJES_POR_CODIGO[codigo]) {
    console.error(`[error ${codigo}] ${fallback}`, err);
    return MENSAJES_POR_CODIGO[codigo];
  }

  const id = generarIdSoporte();
  console.error(`[soporte ${id}] ${fallback}`, err);
  return `${fallback} (código de soporte ${id})`;
}
