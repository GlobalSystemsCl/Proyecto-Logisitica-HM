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
