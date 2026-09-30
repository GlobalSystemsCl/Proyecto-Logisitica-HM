import { revalidatePath } from 'next/cache';

/**
 * Rutas cuyo render depende del estado de las solicitudes y de los slots de
 * estacionamiento. Cualquier mutación de `solicitud` o `solicitud_vehiculo`
 * debe revalidar **todas** mediante `revalidarSolicitudes()`: omitir el
 * `/dashboard` dejaba el indicador de slots desactualizado.
 */
export const RUTAS_AFECTADAS_POR_SOLICITUDES = [
  '/dashboard',
  '/solicitudes',
  '/solicitudes/aprobaciones',
  '/solicitudes/prioridades',
  '/solicitudes/traslados',
  '/logistica/calendarizaciones',
  '/logistica/slots',
] as const;

export type RutaAfectadaPorSolicitudes = (typeof RUTAS_AFECTADAS_POR_SOLICITUDES)[number];

/** Revalida el conjunto canónico de rutas afectadas por solicitudes y slots. */
export function revalidarSolicitudes(): void {
  for (const ruta of RUTAS_AFECTADAS_POR_SOLICITUDES) {
    revalidatePath(ruta);
  }
}
