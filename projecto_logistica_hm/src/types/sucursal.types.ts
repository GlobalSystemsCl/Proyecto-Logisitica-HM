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
  /** Id interno. En casi todas coincide con el código; ver `codigo`. */
  id: number;
  /** Código visible ("101", "119A", "119B"); arma el n° de sus solicitudes. */
  codigo?: string | null;
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
  /** false = desactivada: solo la ve el administrador (`lib/sucursalActiva.ts`). */
  activa?: boolean | null;
}

export interface CreateSucursalInput {
  /** Código visible ("101" o "119B"); no cambia. */
  codigo: string;
  /** Id con que se crea: el número del código si no tiene letra; si tiene, lo da la BD. */
  id: number | null;
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
  /** R15: guía de despacho del vehículo (se ingresa al despachar). */
  numero_guia?: string | null;
  /** QA #38: sucursal desde la que sale el vehículo (nula si no se conoce). */
  sucursal_origen?: number | null;
  sucursal_origen_nombre?: string | null;
  patente: string | null;
  chasis: string;
  marca: string;
  modelo: string;
  anio: number;
  color: string | null;
  /** Sucursal donde está el vehículo (`vehiculo.ubicacion`): de ahí lo retira el transportista. */
  ubicacion?: number | null;
}

export interface SucursalSolicitudItem {
  id: string;
  sucursal: number;
  numero: number | null;
  codigo_sucursal?: string | null;
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
