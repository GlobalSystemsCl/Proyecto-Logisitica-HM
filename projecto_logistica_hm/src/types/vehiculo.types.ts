export interface Vehiculo {
  id: string;
  chasis: string;
  patente: string;
  marca: string;
  modelo: string;
  anio: number;
  color: string | null;
  precio: number | null;
  ubicacion: number | null;
  created_at: string;
  updated_at: string;
}

export interface VehiculoConDisponibilidad extends Vehiculo {
  estado_disponibilidad: 'reservado' | 'liberado' | 'vendido';
  solicitud_id: string | null;
  ubicacion_nombre?: string | null;
}

export interface CreateVehiculoInput {
  chasis: string;
  patente: string;
  marca: string;
  modelo: string;
  anio: number;
  color?: string;
  precio?: number | null;
  ubicacion?: number | null;
}

export interface UpdateVehiculoInput {
  chasis?: string;
  patente?: string;
  marca?: string;
  modelo?: string;
  anio?: number;
  color?: string | null;
  precio?: number | null;
  ubicacion?: number | null;
}
