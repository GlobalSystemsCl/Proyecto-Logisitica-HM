/**
 * Transportista que realiza un traslado (`public.transportista`). El RUT se
 * guarda normalizado: `12345678-9` (ver `lib/rut.ts`).
 */
export interface Transportista {
  id: string;
  nombre: string;
  rut: string;
  activo: boolean;
}

/** Lo que se muestra junto a una solicitud o traslado. */
export type TransportistaResumen = Pick<Transportista, 'id' | 'nombre' | 'rut'>;

/**
 * R10: camión de una empresa de transporte (`public.camion`). La patente se
 * guarda normalizada (`ABCD12`, ver `lib/patente.ts`).
 */
export interface Camion {
  id: string;
  patente: string;
  transportista_id: string;
  /** Transportista (conductor) habitual del camión. */
  conductor_nombre: string | null;
  activo: boolean;
}

/** Empresa de transporte (`public.transportista`) con sus camiones. */
export interface EmpresaTransporte extends Transportista {
  camiones: Camion[];
}

/**
 * R10: lo que Logística indica al programar: la patente del camión y el
 * transportista (conductor) de ese viaje. La empresa sale del camión.
 */
export interface AsignacionTransporte {
  patente: string;
  /** Si viene vacío se usa el transportista habitual del camión. */
  conductorNombre: string | null;
}

/** Datos de transporte guardados en la solicitud o el traslado. */
export interface DatosTransporte {
  transportista_id: string;
  patente_camion: string;
  conductor_nombre: string;
}
