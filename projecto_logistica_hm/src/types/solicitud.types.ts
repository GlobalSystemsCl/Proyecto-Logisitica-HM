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
  /** Fecha estimada de despacho (UI: "Fecha estimada"). La fija Logística al calendarizar. */
  fecha_tentativa_despacho: string | null;
  /** Fecha real de despacho (la fija Logística al pasar a `despachada`). */
  fecha_despacho: string | null;
  fecha_entrega: string | null;
  /** Fecha/hora límite acordada. La propone el Ejecutivo y la confirma el JL al aprobar. */
  fecha_limite: string | null;
  /** Trazabilidad DEV 2: momento de la aprobación del Jefe Local. */
  fecha_confirmacion: string | null;
  /** Trazabilidad DEV 2: momento del despacho (inicio del tránsito). */
  fecha_inicio_transito: string | null;
  /** Trazabilidad DEV 2: momento de la recepción en la sucursal destino. */
  fecha_recepcion: string | null;
  /** Trazabilidad DEV 2: momento de la entrega al cliente final. */
  fecha_entrega_cliente: string | null;
  motivo_cancelacion: string | null;
  direccion_evento: string | null;
  titulo_evento: string | null;
  /** `sucursal.zona_id` — usado para filtrar el alcance de Logística. */
  sucursal_zona_id: number | null;
  vehiculos: VehiculoAsociado[];
}

export interface InsistenciaEntry {
  id: string;
  solicitud_id: string;
  usuario_id: string;
  usuario_nombre?: string | null;
  mensaje: string | null;
  created_at: string;
}

export interface CreateSolicitudInput {
  ejecutivo_id?: string | null;
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
  ubicacion: number | null;
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

export interface DocumentoSolicitud {
  id: string;
  solicitud_id: string;
  nombre_archivo: string;
  tipo_mime: string;
  tamano_bytes: number;
  ruta_storage: string;
  subido_por: string | null;
  subido_por_nombre?: string | null;
  created_at: string;
}
