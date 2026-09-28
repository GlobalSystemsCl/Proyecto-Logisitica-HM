/**
 * Estados de `public.solicitud`. Los valores son los del enum de PostgreSQL
 * `estado_solicitud` (inmutables) — la nomenclatura de negocio vive en los
 * labels de UI (`estadoConfig`).
 *
 * Nomenclatura UI asociada:
 *   pendiente_aprobacion -> "Pendiente"
 *   aprobada             -> "Aprobada"
 *   pendiente            -> (huérfano, no usado en el flujo actual)
 *   priorizada           -> "Priorizada"
 *   asignada             -> "Asignada"
 *   calendarizada        -> "Calendarizada"
 *   despachada           -> "Despachada"   (agregado en DEV 2)
 *   en_transito          -> "En tránsito"
 *   entregada            -> "Recepcionada"
 *   finalizada           -> "Entregado a cliente"
 *   cancelada            -> "Cancelada"
 *   rechazada            -> "Rechazada"
 */
export type EstadoSolicitud =
  | 'pendiente_aprobacion'
  | 'aprobada'
  | 'pendiente'
  | 'priorizada'
  | 'asignada'
  | 'calendarizada'
  | 'despachada'
  | 'en_transito'
  | 'entregada'
  | 'cancelada'
  | 'rechazada'
  | 'finalizada';

export type TipoSolicitud = 'evento' | 'venta';

export type DisponibilidadVehiculo = 'reservado' | 'liberado' | 'vendido';

export interface SucursalEncargado {
  id: string;
  nombre: string;
  apellido: string;
}

export interface Zona {
  id: number;
  nombre: string;
  created_at?: string;
}

export interface Sucursal {
  id: number;
  created_at: string;
  usuario_id: string | null;
  nombre: string | null;
  direccion: string | null;
  slots: number | null;
  slots_ocupados: number | null;
  slots_reservados: number | null;
  zona_id?: number | null;
  zona?: Zona | null;
  encargado?: SucursalEncargado | null;
}

export interface CreateSucursalInput {
  nombre: string;
  direccion?: string | null;
  slots: number;
  zona_id?: number | null;
}

export interface UpdateSucursalInput {
  nombre?: string;
  direccion?: string | null;
  slots?: number;
  zona_id?: number | null;
}

export interface VehiculoAsociado {
  solicitud_vehiculo_id: string;
  disponibilidad: DisponibilidadVehiculo;
  patente: string | null;
  chasis: string;
  marca: string;
  modelo: string;
  anio: number;
  color: string | null;
}

export interface SucursalSolicitudItem {
  id: string;
  sucursal: number;
  estado: EstadoSolicitud;
  tipo_solicitud: TipoSolicitud;
  posicion_prioridad: number | null;
  fecha_creacion: string | null;
  fecha_tentativa_despacho: string | null;
  fecha_limite: string | null;
  motivo_cancelacion: string | null;
  ejecutivo: string;
  jefe_local: string | null;
  logistica: string | null;
  ejecutivo_id: string | null;
  jefe_local_id: string | null;
  logistica_id: string | null;
  vehiculos: VehiculoAsociado[];
}
