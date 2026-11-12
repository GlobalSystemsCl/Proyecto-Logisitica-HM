import type { EstadoSolicitud, TipoSolicitud } from '@/types/sucursal.types';

/**
 * R1 (2026-11-11): venta de vehículos que ya están en la sucursal del vendedor.
 * No hay traslado ni pasa por Logística: al aprobarla queda lista para
 * entregar al cliente. No se mezclan en una solicitud vehículos que están en
 * la sucursal con otros que no (decisión del 2026-11-03). Funciones puras.
 */

export type ClaseVenta = 'sin_traslado' | 'con_traslado' | 'mixta';

export const MENSAJE_MEZCLA_SUCURSAL =
  'No puedes mezclar vehículos que ya están en la sucursal de destino con otros que vienen de otra sucursal: crea dos solicitudes.';

/**
 * Clasifica una solicitud por la ubicación de sus vehículos respecto del
 * destino. Solo las ventas con destino pueden ser "sin traslado": un evento
 * siempre lleva el vehículo a la dirección del evento.
 */
export function clasificarVenta(
  tipo: TipoSolicitud,
  destino: number | null | undefined,
  ubicaciones: Array<number | null | undefined>
): ClaseVenta {
  if (tipo !== 'venta' || !destino || ubicaciones.length === 0) return 'con_traslado';
  const enDestino = ubicaciones.filter((u) => u === destino).length;
  if (enDestino === 0) return 'con_traslado';
  return enDestino === ubicaciones.length ? 'sin_traslado' : 'mixta';
}

/** Estado al aprobar: una venta sin traslado queda lista para entregar (`entregada`). */
export function estadoAlAprobar(sinTraslado: boolean): Extract<EstadoSolicitud, 'aprobada' | 'entregada'> {
  return sinTraslado ? 'entregada' : 'aprobada';
}

/**
 * Error al agregar un vehículo a una solicitud ya creada, o null si calza con
 * su clase: en una sin traslado debe estar en el destino; en una con traslado,
 * no.
 */
export function errorAgregarVehiculo(
  sinTraslado: boolean,
  tipo: TipoSolicitud,
  destino: number | null | undefined,
  ubicacion: number | null | undefined
): string | null {
  const enDestino = tipo === 'venta' && !!destino && ubicacion === destino;
  if (sinTraslado && !enDestino) {
    return 'Esta venta no requiere traslado: solo puedes agregar vehículos que ya estén en la sucursal de destino.';
  }
  if (!sinTraslado && enDestino) return MENSAJE_MEZCLA_SUCURSAL;
  return null;
}

/** Mensaje al crear la solicitud. */
export function mensajeSolicitudCreada(creadaPorJefe: boolean, sinTraslado: boolean): string {
  if (creadaPorJefe) {
    return sinTraslado
      ? 'Solicitud creada y aprobada. El vehículo ya está en la sucursal: no requiere traslado y queda lista para entregar al cliente.'
      : 'Solicitud creada y aprobada automáticamente.';
  }
  return sinTraslado
    ? 'Solicitud creada. El vehículo ya está en tu sucursal: al aprobarla el Jefe de Local, quedará lista para entregar (sin traslado).'
    : 'Solicitud creada. Pendiente de aprobación por el Jefe de Local.';
}

/** Mensaje al aprobar la solicitud. */
export function mensajeSolicitudAprobada(sinTraslado: boolean): string {
  return sinTraslado
    ? 'Solicitud aprobada. El vehículo ya está en la sucursal: queda lista para entregar al cliente, sin traslado.'
    : 'Solicitud aprobada exitosamente.';
}
