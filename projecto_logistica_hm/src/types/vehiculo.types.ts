export interface Vehiculo {
  id: string;
  chasis: string;
  patente: string;
  marca: string;
  modelo: string;
  anio: number;
  color: string | null;
  created_at: string;
  updated_at: string;
}

export interface VehiculoConDisponibilidad extends Vehiculo {
  estado_disponibilidad: 'reservado' | 'liberado';
  solicitud_id: string | null;
}

export interface CreateVehiculoInput {
  chasis: string;
  patente: string;
  marca: string;
  modelo: string;
  anio: number;
  color?: string;
}

export interface UpdateVehiculoInput {
  chasis?: string;
  patente?: string;
  marca?: string;
  modelo?: string;
  anio?: number;
  color?: string | null;
}
