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
  sucursal_destino: number | null;
  sucursal_destino_nombre: string | null;
  estado: EstadoSolicitud;
  tipo_solicitud: TipoSolicitud;
  posicion_prioridad: number | null;
  ejecutivo_id: string | null;
  ejecutivo_nombre: string | null;
  jefe_local_id: string | null;
  jefe_local_nombre: string | null;
  logistica_id: string | null;
  logistica_nombre: string | null;
  fecha_creacion: string | null;
  fecha_tentativa_despacho: string | null;
  fecha_limite: string | null;
  motivo_cancelacion: string | null;
  direccion_evento: string | null;
  titulo_evento: string | null;
  vehiculos: VehiculoAsociado[];
}

export interface CreateSolicitudInput {
  ejecutivo_id: string | null;
  jefe_local_id?: string | null;
  estado?: SolicitudLista['estado'];
  sucursal: number;
  tipo_solicitud: TipoSolicitud;
  fecha_limite?: string | null;
  sucursal_destino?: number | null;
  direccion_evento?: string | null;
  titulo_evento?: string | null;
  observacion?: string | null;
}

export interface CreateSolicitudCompletaInput {
  tipo_solicitud: TipoSolicitud;
  sucursal: string;
  sucursal_destino?: string;
  fecha_limite?: string;
  vehiculo_ids?: string[];
  direccion_evento?: string;
  titulo_evento?: string;
}

export interface VehiculoInventario {
  id: string;
  chasis: string;
  patente: string;
  marca: string;
  modelo: string;
  anio: number;
  color: string | null;
  reservado_en_activa: boolean;
}

export interface ObservacionEntry {
  id: string;
  solicitud_id: string;
  usuario_id: string;
  usuario_nombre?: string | null;
  observacion: string;
  created_at: string;
}

export interface AuditoriaEntry {
  id: string;
  usuario_id: string;
  usuario_nombre?: string | null;
  entidad: string;
  entidad_id: string;
  accion: string;
  valor_anterior: unknown;
  valor_nuevo: unknown;
  created_at: string;
}
