/**
 * QA #38 (2026-11-12): de dónde sale físicamente una solicitud. La sucursal
 * que pide (`solicitud.sucursal`) no es el origen del viaje: en una venta es
 * también el destino. El origen real es la sucursal donde estaba cada vehículo
 * al pedirlo (`solicitud_vehiculo.sucursal_origen`). Funciones puras.
 */

interface VehiculoConOrigen {
  sucursal_origen?: number | null;
  sucursal_origen_nombre?: string | null;
}

interface SolicitudConOrigen {
  sucursal: number;
  sucursal_nombre?: string | null;
  sucursal_destino_nombre?: string | null;
  titulo_evento?: string | null;
  vehiculos?: VehiculoConOrigen[];
}

export const TEXTO_VARIOS_ORIGENES = 'Varias sucursales';

/**
 * Nombre del origen del viaje: la sucursal de sus vehículos; "Varias
 * sucursales" si salen de más de una; la sucursal que pide si no se conoce
 * (solicitudes recepcionadas antes de guardar el dato).
 */
export function origenSolicitud(s: SolicitudConOrigen): string {
  const conocidos = new Map<number, string>();
  for (const v of s.vehiculos ?? []) {
    if (v.sucursal_origen != null) {
      conocidos.set(v.sucursal_origen, v.sucursal_origen_nombre ?? `Sucursal ${v.sucursal_origen}`);
    }
  }
  if (conocidos.size === 1) return [...conocidos.values()][0];
  if (conocidos.size > 1) return TEXTO_VARIOS_ORIGENES;
  return s.sucursal_nombre ?? `Sucursal ${s.sucursal}`;
}

/** "3 ORIENTE BAIC → 15 NORTE" (o el título del evento como destino). */
export function rutaSolicitud(s: SolicitudConOrigen): string {
  return `${origenSolicitud(s)} → ${s.sucursal_destino_nombre ?? s.titulo_evento ?? 'Evento'}`;
}

/** Origen de un vehículo puntual (filas por vehículo: tránsito, Excel, Movimientos). */
export function origenVehiculo(s: SolicitudConOrigen, v: VehiculoConOrigen | null | undefined): string {
  if (v?.sucursal_origen != null) return v.sucursal_origen_nombre ?? `Sucursal ${v.sucursal_origen}`;
  return s.sucursal_nombre ?? `Sucursal ${s.sucursal}`;
}
