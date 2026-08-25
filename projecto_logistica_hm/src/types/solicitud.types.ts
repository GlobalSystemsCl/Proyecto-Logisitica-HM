import type {
  EstadoSolicitud,
  TipoSolicitud,
  VehiculoAsociado,
} from './sucursal.types';

export type { EstadoSolicitud, TipoSolicitud, VehiculoAsociado };

export interface SolicitudLista {
  id: string;
  sucursal: number;
  sucursal_nombre: string | null;
  estado: EstadoSolicitud;
  tipo_solicitud: TipoSolicitud;
  posicion_prioridad: number | null;
  ejecutivo_id: string;
  ejecutivo_nombre: string | null;
  jefe_local_id: string | null;
  jefe_local_nombre: string | null;
  logistica_id: string | null;
  logistica_nombre: string | null;
  fecha_creacion: string | null;
  fecha_tentativa_despacho: string | null;
  fecha_limite: string | null;
  motivo_cancelacion: string | null;
  vehiculos: VehiculoAsociado[];
}

export interface CreateSolicitudInput {
  ejecutivo_id: string;
  sucursal: number;
  tipo_solicitud: TipoSolicitud;
  fecha_limite?: string | null;
}

export interface VehiculoInventario {
  id: string;
  patente: string;
  marca: string;
  modelo: string;
  anio: number;
  color: string | null;
  reservado_en_activa: boolean;
}
