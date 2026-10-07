/**
 * Reglas de acceso por ruta según el estado de la cuenta (brechas 003 y 009).
 *
 * Función pura: el middleware le entrega la ruta, si hay sesión y el estado
 * leído de `public.usuario`, y aplica la decisión. Antes el middleware solo
 * miraba `user_metadata.aprobado`, que el propio usuario puede modificar con
 * `supabase.auth.updateUser`, y no revisaba `activo` ni `requiere_cambio_clave`.
 */

export const RUTAS_AUTH = ['/login', '/recuperar-clave', '/auth/callback', '/registro'];
export const RUTA_ESTABLECER_CLAVE = '/establecer-clave';

export interface EstadoCuenta {
  activo: boolean;
  aprobado: boolean;
  requiere_cambio_clave: boolean;
}

export type DecisionAcceso =
  | { accion: 'continuar'; cerrarSesion?: boolean }
  | { accion: 'redirigir'; destino: string; error?: string; cerrarSesion?: boolean };

export function esRutaAuth(path: string): boolean {
  return RUTAS_AUTH.includes(path);
}

/**
 * Motivo por el que una cuenta no puede usar el sistema, o `null` si puede.
 * Una fila inexistente cuenta como desactivada.
 */
export function motivoCuentaBloqueada(
  cuenta: EstadoCuenta | null
): 'pendiente_aprobacion' | 'account_deactivated' | null {
  if (!cuenta) return 'account_deactivated';
  if (cuenta.aprobado === false) return 'pendiente_aprobacion';
  if (cuenta.activo === false) return 'account_deactivated';
  return null;
}

export function decidirAcceso(
  path: string,
  autenticado: boolean,
  cuenta: EstadoCuenta | null
): DecisionAcceso {
  const rutaAuth = esRutaAuth(path);
  const rutaClave = path === RUTA_ESTABLECER_CLAVE;
  const rutaPublica = rutaAuth || path === '/';

  if (!autenticado) {
    if (rutaPublica || rutaClave) return { accion: 'continuar' };
    return { accion: 'redirigir', destino: '/login' };
  }

  // Cuenta desactivada, no aprobada o sin perfil: se cierra la sesión.
  const motivo = motivoCuentaBloqueada(cuenta);
  if (motivo) {
    if (rutaAuth) return { accion: 'continuar', cerrarSesion: true };
    return { accion: 'redirigir', destino: '/login', error: motivo, cerrarSesion: true };
  }

  // Contraseña temporal: solo puede ir a establecerla (o completar un enlace).
  if (cuenta!.requiere_cambio_clave && !rutaClave && path !== '/auth/callback') {
    return { accion: 'redirigir', destino: RUTA_ESTABLECER_CLAVE };
  }

  // El callback debe poder verificar enlaces aunque ya exista una sesión.
  if (rutaAuth && path !== '/auth/callback') {
    return { accion: 'redirigir', destino: '/dashboard' };
  }

  return { accion: 'continuar' };
}
