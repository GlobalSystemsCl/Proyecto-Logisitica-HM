/**
 * Textos de negocio compartidos por varias pantallas. Centralizarlos evita
 * que el mismo concepto aparezca con nombres distintos.
 */

/**
 * `solicitud.fecha_limite`: fecha que propone el ejecutivo al crear la
 * solicitud y que el Jefe de Local acepta o modifica al aprobarla.
 */
export const ETIQUETA_FECHA_LIMITE = 'Fecha límite de entrega propuesta';

/**
 * Las dos acciones de Logística que deshacen un paso del traslado. No son
 * redundantes (nunca aparecen en la misma tarjeta):
 *   - volver_a_cola: `calendarizada` → `priorizada`. Quita la fecha y la
 *     Logística asignada; la solicitud vuelve al final de la cola.
 *   - revertir_despacho: `en_transito` → `calendarizada`. El vehículo no
 *     salió; conserva la fecha programada.
 * Antes se llamaban "Descalendarizar" y "Deshacer despacho".
 */
export type AccionDeshacerTraslado = 'volver_a_cola' | 'revertir_despacho';

export const ACCIONES_DESHACER_TRASLADO: Record<AccionDeshacerTraslado, { etiqueta: string; ayuda: string }> = {
  volver_a_cola: {
    etiqueta: 'Volver a la cola',
    ayuda: 'Quita la fecha programada y devuelve la solicitud a la cola de prioridades de su sucursal.',
  },
  revertir_despacho: {
    etiqueta: 'Revertir despacho',
    ayuda: 'El vehículo no salió: vuelve a Programada y conserva la fecha de despacho.',
  },
};

/** Pregunta de confirmación antes de ejecutar la acción. */
export function textoConfirmacionDeshacer(accion: AccionDeshacerTraslado, codigo: string): string {
  const { etiqueta, ayuda } = ACCIONES_DESHACER_TRASLADO[accion];
  return `¿${etiqueta} la solicitud ${codigo}?

${ayuda}`;
}

/**
 * QA #5 / #11: nombre único de cada tipo de solicitud en toda la app. Una
 * "venta" no es un traslado entre locales: lleva el vehículo a la sala de
 * venta de la sucursal que lo pide.
 */
export const ETIQUETA_TIPO_SOLICITUD: Record<'evento' | 'venta', string> = {
  venta: 'Sala de venta',
  evento: 'Evento',
};

/** Etiqueta del tipo; si llega un valor desconocido, lo muestra tal cual. */
export function etiquetaTipoSolicitud(tipo: string | null | undefined): string {
  if (!tipo) return '';
  return ETIQUETA_TIPO_SOLICITUD[tipo as 'evento' | 'venta'] ?? tipo;
}

/** QA #42: confirmación de "Entregar a cliente" (es irreversible), igual en la lista y en el panel. */
export function confirmacionEntregaCliente(codigo: string) {
  return {
    titulo: 'Entregar al cliente',
    mensaje: `¿Confirmas la entrega al cliente de la solicitud ${codigo}? El vehículo sale del inventario y no se puede deshacer.`,
    textoConfirmar: 'Sí, entregar',
    peligro: true,
  };
}
