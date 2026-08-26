export type EstadoSolicitud =
  | 'pendiente'
  | 'priorizada'
  | 'asignada'
  | 'calendarizada'
  | 'en_transito'
  | 'entregada'
  | 'cancelada'
  | 'finalizada';

export type TipoSolicitud = 'evento' | 'venta';

export type DisponibilidadVehiculo = 'reservado' | 'liberado';

export interface SucursalEncargado {
  id: string;
  nombre: string;
  apellido: string;
}

export interface JefeDeLocal {
  id: string;
  nombre: string;
  apellido: string;
  email: string;
}

export interface Sucursal {
  id: number;
  created_at: string;
  usuario_id: string | null;
  nombre: string | null;
  direccion: string | null;
  slots: number | null;
  slots_ocupados: number | null;
  encargado?: SucursalEncargado | null;
}

export interface CreateSucursalInput {
  nombre: string;
  direccion?: string | null;
  slots: number;
  slots_ocupados: number;
  usuario_id?: string | null;
}

export interface UpdateSucursalInput {
  nombre?: string;
  direccion?: string | null;
  slots?: number;
  slots_ocupados?: number;
  usuario_id?: string | null;
}

export interface VehiculoAsociado {
  solicitud_vehiculo_id: string;
  disponibilidad: DisponibilidadVehiculo;
  patente: string;
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
  vehiculos: VehiculoAsociado[];
}
