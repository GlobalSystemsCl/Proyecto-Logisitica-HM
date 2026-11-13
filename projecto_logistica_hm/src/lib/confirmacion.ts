/**
 * QA #33 (2026-11-12): opciones del diálogo de confirmación propio que
 * reemplaza a `window.confirm` (bloquea el navegador y no sigue el estilo de
 * la app). Función pura; el componente está en `components/Confirmacion.tsx`.
 */

export interface OpcionesConfirmacion {
  titulo: string;
  mensaje: string;
  textoConfirmar: string;
  textoCancelar: string;
  /** Acción destructiva o irreversible: el botón se muestra en rojo. */
  peligro: boolean;
  /** Solo informa (reemplazo de `alert`): un único botón "Entendido". */
  soloAviso: boolean;
}

export type EntradaConfirmacion = string | (Partial<OpcionesConfirmacion> & { mensaje: string });

/** Opciones de un aviso que solo se cierra (reemplazo de `window.alert`). */
export function opcionesAviso(mensaje: string, titulo = 'Atención'): OpcionesConfirmacion {
  return { ...opcionesConfirmacion({ mensaje, titulo, textoConfirmar: 'Entendido' }), soloAviso: true };
}

/** Completa las opciones con los textos por defecto. */
export function opcionesConfirmacion(entrada: EntradaConfirmacion): OpcionesConfirmacion {
  const o = typeof entrada === 'string' ? { mensaje: entrada } : entrada;
  return {
    titulo: o.titulo?.trim() || 'Confirmar acción',
    mensaje: o.mensaje,
    textoConfirmar: o.textoConfirmar?.trim() || 'Confirmar',
    textoCancelar: o.textoCancelar?.trim() || 'Cancelar',
    peligro: o.peligro ?? false,
    soloAviso: o.soloAviso ?? false,
  };
}
