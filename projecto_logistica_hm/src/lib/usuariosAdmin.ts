/**
 * Conteos y filtro por estado de la tabla de `/admin/usuarios`.
 *
 * Una cuenta autoregistrada queda con `aprobado = false` y `activo = false`
 * hasta que el administrador la activa. Antes el contador de pendientes exigía
 * `activo = true` y por eso siempre daba 0 (fase F).
 */

export type EstadoUsuarioFiltro = 'todos' | 'pendientes' | 'activos' | 'inactivos';

export const ESTADOS_USUARIO_FILTRO: readonly EstadoUsuarioFiltro[] = ['todos', 'pendientes', 'activos', 'inactivos'];

interface UsuarioEstado {
  activo: boolean;
  aprobado?: boolean | null;
}

export function esPendiente(u: UsuarioEstado): boolean {
  return u.aprobado === false;
}

export function cumpleEstado(u: UsuarioEstado, estado: EstadoUsuarioFiltro): boolean {
  switch (estado) {
    case 'pendientes':
      return esPendiente(u);
    case 'activos':
      return u.activo && !esPendiente(u);
    case 'inactivos':
      return !u.activo && !esPendiente(u);
    default:
      return true;
  }
}

/** Conteos de las tarjetas: activos, pendientes e inactivos suman el total. */
export function contarUsuarios(usuarios: UsuarioEstado[]) {
  return {
    total: usuarios.length,
    activos: usuarios.filter((u) => cumpleEstado(u, 'activos')).length,
    pendientes: usuarios.filter((u) => cumpleEstado(u, 'pendientes')).length,
    inactivos: usuarios.filter((u) => cumpleEstado(u, 'inactivos')).length,
  };
}

/** Estado inicial desde `?estado=` (la notificación de usuario nuevo abre `pendientes`). */
export function estadoDesdeParam(valor: string | null | undefined): EstadoUsuarioFiltro {
  return ESTADOS_USUARIO_FILTRO.includes(valor as EstadoUsuarioFiltro) ? (valor as EstadoUsuarioFiltro) : 'todos';
}
