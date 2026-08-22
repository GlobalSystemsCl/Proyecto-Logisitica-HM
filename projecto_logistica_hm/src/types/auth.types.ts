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
  sucursal_id?: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateUserInput {
  email: string;
  nombre: string;
  apellido: string;
  rol: UserRole;
  sucursal_id?: string | null;
}

export interface UpdateUserInput {
  nombre?: string;
  apellido?: string;
  rol?: UserRole;
  activo?: boolean;
  requiere_cambio_clave?: boolean;
  sucursal_id?: string | null;
}

export interface AuthState {
  user: UserProfile | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}
