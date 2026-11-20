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
  /** Importación de stock que lo creó (null si se registró a mano o antes del 2026-11-20). */
  importacion_id?: string | null;
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

/** R4: vehículo físicamente en una sucursal (panel de Slots). */
export interface VehiculoEnSucursal {
  id: string;
  chasis: string;
  patente: string | null;
  marca: string;
  modelo: string;
  color: string | null;
  idv: string | null;
  /** Reservado en una solicitud (aún no entregado). */
  reservado: boolean;
}

/**
 * Una importación de stock ("Importar Stock") y su reversión
 * (`importacion_stock`, migración 20261120120000).
 */
export interface ImportacionStock {
  id: string;
  usuario_id: string | null;
  usuario_nombre: string | null;
  archivo: string | null;
  total: number;
  importados: number;
  duplicados: number;
  errores: number;
  created_at: string;
  revertida_at: string | null;
  revertida_por_nombre: string | null;
  vehiculos_eliminados: number | null;
  vehiculos_conservados: number | null;
  /** Vehículos de esta importación que siguen en el inventario. */
  vehiculos_actuales: number;
}
