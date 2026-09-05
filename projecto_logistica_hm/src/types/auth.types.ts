export type UserRole = 'administrador' | 'ejecutivo' | 'jefe_local' | 'logistica';

export interface UserProfile {
  id: string;
  email: string;
  nombre: string;
  apellido: string;
  rol: UserRole;
  activo: boolean;
  requiere_cambio_clave: boolean;
  intentos_fallidos?: number;
  bloqueado_hasta?: string | null;
  sucursal_id?: number | null;
  telefono?: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Detalle completo de un usuario para mostrar en tarjetas de contacto
 * (Contacto responsable del detalle de solicitud) y popups de datos de usuario
 * (historial de cambios y observaciones).
 */
export interface UsuarioDetalle {
  id: string;
  email: string;
  nombre: string;
  apellido: string;
  rol: UserRole;
  activo: boolean;
  telefono: string | null;
  sucursal_id: number | null;
  sucursal_nombre: string | null;
  created_at: string;
}

export const ROL_LABEL: Record<UserRole, string> = {
  administrador: 'Administrador',
  ejecutivo: 'Ejecutivo',
  jefe_local: 'Jefe de Local',
  logistica: 'Logística',
};

export function nombreCompletoUsuario(u: { nombre: string; apellido: string } | null): string {
  return u ? `${u.nombre} ${u.apellido}`.trim() : '';
}

export interface CreateUserInput {
  email: string;
  nombre: string;
  apellido: string;
  rol: UserRole;
  sucursal_id?: number | null;
}

export interface UpdateUserInput {
  nombre?: string;
  apellido?: string;
  rol?: UserRole;
  activo?: boolean;
  requiere_cambio_clave?: boolean;
  sucursal_id?: number | null;
  telefono?: string | null;
}

export interface AuthState {
  user: UserProfile | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}
