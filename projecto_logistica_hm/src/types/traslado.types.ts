import type { DisponibilidadVehiculo } from './sucursal.types';

/**
 * Estados de `public.traslado_interno` (enum PostgreSQL `estado_traslado`).
 * Nomenclatura UI: Pendiente -> En tránsito -> Recepcionado.
 */
export type EstadoTraslado = 'pendiente' | 'en_transito' | 'recepcionado';

/**
 * Un traslado interno mueve vehículos YA VENDIDOS entre sucursales.
 * El vehículo nunca cambia de `disponibilidad`: sigue `vendido`.
 * El JL destino solo puede recepcionar; no puede rechazar.
 */
export interface TrasladoVehiculo {
  traslado_vehiculo_id: string;
  disponibilidad: DisponibilidadVehiculo;
  id: string;
  chasis: string;
  patente: string | null;
  marca: string;
  modelo: string;
  anio: number;
  color: string | null;
  ubicacion: number | null;
}

export interface TrasladoInterno {
  id: string;
  origen_id: number;
  origen_nombre: string | null;
  destino_id: number;
  destino_nombre: string | null;
  logistica_id: string;
  logistica_nombre: string | null;
  estado: EstadoTraslado;
  fecha_despacho: string | null;
  fecha_recepcion: string | null;
  observacion: string | null;
  created_at: string;
  updated_at: string;
  vehiculos: TrasladoVehiculo[];
}

export interface CreateTrasladoInput {
  origen_id: number;
  destino_id: number;
  observacion?: string | null;
}

/**
 * Vehículo vendible para un traslado interno: ya está `vendido` y NO está
 * en tránsito en otro traslado.
 */
export interface VehiculoParaTraslado {
  id: string;
  chasis: string;
  patente: string | null;
  marca: string;
  modelo: string;
  anio: number;
  color: string | null;
  ubicacion: number | null;
  ubicacion_nombre: string | null;
  en_traslado_activo: boolean;
}

/** Resultado paginado del listado de vehículos para traslado. */
export interface VehiculosParaTrasladoResult {
  vehiculos: VehiculoParaTraslado[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface ResumenSlotsSucursal {
  id: number;
  nombre: string | null;
  slots: number | null;
  slots_ocupados: number | null;
  slots_reservados: number | null;
  disponibles: number | null;
  zona_nombre: string | null;
}
