import type { DisponibilidadVehiculo } from './sucursal.types';
import type { AsignacionTransporte, TransportistaResumen } from './transportista.types';

/**
 * Estados de `public.traslado_interno` (enum PostgreSQL `estado_traslado`).
 * Nomenclatura UI: Pendiente -> En tránsito -> Recepcionado.
 */
export type EstadoTraslado = 'pendiente' | 'en_transito' | 'recepcionado' | 'cancelado';

/**
 * Un traslado interno mueve vehículos en estado `liberado` entre sucursales
 * (solo movimiento de inventario). Al crearse la fila queda `reservado` y al
 * recepcionar vuelve a `liberado`. El estado `vendido` es exclusivo del flujo
 * de solicitudes de ejecutivos. El JL destino solo puede recepcionar.
 */
export interface TrasladoVehiculo {
  traslado_vehiculo_id: string;
  disponibilidad: DisponibilidadVehiculo;
  /** R15: guía de despacho del vehículo (se ingresa al despachar). */
  numero_guia?: string | null;
  id: string;
  chasis: string;
  patente: string | null;
  marca: string;
  modelo: string;
  anio: number;
  color: string | null;
  ubicacion: number | null;
}

/** QA #49: foto o documento de un traslado interno (`traslado_documento`). */
export interface DocumentoTraslado {
  id: string;
  traslado_id: string;
  nombre_archivo: string;
  tipo_mime: string;
  tamano_bytes: number;
  ruta_storage: string;
  subido_por: string | null;
  subido_por_nombre?: string | null;
  created_at: string;
}

export interface TrasladoInterno {
  id: string;
  /** QA #48: correlativo visible (T-15); lo asigna la BD. */
  numero?: number | null;
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
  /** R8: motivo y fecha de la cancelación en tránsito. */
  motivo_cancelacion: string | null;
  fecha_cancelacion: string | null;
  /** R13: registro de la recepción en destino. */
  recepcion_con_novedades: boolean | null;
  observacion_recepcion: string | null;
  /** Empresa de transporte (obligatoria desde el 2026-10-20; los anteriores no tienen). */
  transportista: TransportistaResumen | null;
  /** R10: patente del camión y transportista (conductor) usados (desde el 2026-11-11). */
  patente_camion: string | null;
  conductor_nombre: string | null;
  /** R14: los traslados nuevos llevan un solo vehículo; los históricos pueden tener varios. */
  vehiculos: TrasladoVehiculo[];
}

export interface CreateTrasladoInput {
  origen_id: number;
  destino_id: number;
  observacion?: string | null;
  /** Obligatorio (R10): patente del camión y transportista del viaje. */
  transporte: AsignacionTransporte | null;
}

/**
 * Vehículo trasladable: está en estado `liberado` (inventario disponible) y NO
 * está en tránsito en otro traslado.
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
