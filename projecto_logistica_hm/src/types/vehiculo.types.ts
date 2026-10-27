export interface Vehiculo {
  id: string;
  chasis: string;
  patente: string | null;
  /** "Tipo de vehículo" del Excel de stock (VN). */
  tipo_vehiculo: string | null;
  /** "Marca" del Excel: código del catálogo (HY, TO...). */
  marca_codigo: string | null;
  /** "Marca completa" del Excel (HYUNDAI). */
  marca: string;
  modelo: string;
  /** "IDV" del Excel: identificador del vehículo en el sistema de la empresa. */
  idv: string | null;
  /** El Excel de stock no lo trae: queda null en los vehículos importados. */
  anio: number | null;
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
  /** R2: destino si el vehículo va en camino (solicitud o traslado interno en tránsito). */
  en_transito_hacia?: string | null;
}

export interface CreateVehiculoInput {
  chasis: string;
  patente?: string | null;
  tipo_vehiculo?: string | null;
  marca_codigo?: string | null;
  marca: string;
  modelo: string;
  idv?: string | null;
  anio?: number | null;
  color?: string;
  precio?: number | null;
  ubicacion?: number | null;
}

export interface UpdateVehiculoInput {
  chasis?: string;
  patente?: string | null;
  tipo_vehiculo?: string | null;
  marca_codigo?: string | null;
  marca?: string;
  modelo?: string;
  idv?: string | null;
  anio?: number | null;
  color?: string | null;
  precio?: number | null;
  ubicacion?: number | null;
}

export interface Marca {
  id: number;
  codigo: string;
  nombre: string;
  created_at?: string;
}

export interface CreateMarcaInput {
  codigo: string;
  nombre: string;
}

export interface UpdateMarcaInput {
  codigo?: string;
  nombre?: string;
}