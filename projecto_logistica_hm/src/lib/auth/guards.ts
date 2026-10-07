import { AuthService } from '@/services/auth.service';
import { SolicitudesService, type SolicitudMinima } from '@/services/solicitudes.service';
import { OrganizacionService } from '@/services/organizacion.service';
import { ErrorUsuario } from '@/lib/errores';
import type { UserProfile, UserRole } from '@/types/auth.types';

/**
 * Guards de autorización para Server Actions (brechas 004, 006, 008 y 009).
 *
 * Las Server Actions son endpoints POST públicos: cada una debe validar sesión,
 * estado de la cuenta, rol y, cuando opera sobre una solicitud, que el usuario
 * tenga alcance sobre ella. Antes cada action lo hacía a mano (o no lo hacía).
 */

export const MENSAJE_SESION_INVALIDA = 'Sesión inválida o usuario inactivo.';
export const MENSAJE_CAMBIO_CLAVE = 'Debes establecer una nueva contraseña antes de continuar.';
export const MENSAJE_SIN_ACCESO_SOLICITUD = 'No tienes acceso a esta solicitud.';

/** Perfil autenticado, activo, aprobado y sin contraseña temporal pendiente. */
export async function requireProfile(): Promise<UserProfile> {
  const profile = await AuthService.getCurrentUserProfile();
  if (!profile || !profile.activo || profile.aprobado === false) {
    throw new ErrorUsuario(MENSAJE_SESION_INVALIDA);
  }
  if (profile.requiere_cambio_clave) {
    throw new ErrorUsuario(MENSAJE_CAMBIO_CLAVE);
  }
  return profile;
}

export function requireRole(profile: UserProfile, roles: UserRole[], mensaje?: string): void {
  if (!roles.includes(profile.rol)) {
    throw new ErrorUsuario(mensaje ?? 'No tienes permisos para realizar esta acción.');
  }
}

/** Sucursales del usuario: la principal más las que encabeza como encargado. */
export function sucursalesDelPerfil(profile: UserProfile): number[] {
  const ids = new Set<number>();
  if (typeof profile.sucursal_id === 'number') ids.add(profile.sucursal_id);
  (profile.sucursales || []).forEach((s) => {
    if (typeof s.id === 'number') ids.add(s.id);
  });
  return Array.from(ids);
}

/**
 * Regla de visibilidad de una solicitud. Es la misma de
 * `SolicitudesService.getSolicitudesFiltradas`, más los participantes directos:
 *   - administrador: todas
 *   - operaciones: ninguna
 *   - participante (ejecutivo, jefe o logística asignados): la suya
 *   - jefe_local: sucursal origen o destino entre sus sucursales
 *   - logistica: sucursal origen dentro de sus zonas
 *
 * `zonaOrigenId` es la zona de la sucursal origen (solo se usa para logística).
 */
export function puedeAccederSolicitud(
  profile: UserProfile,
  solicitud: Pick<SolicitudMinima, 'sucursal' | 'sucursal_destino' | 'ejecutivo_id' | 'jefe_local_id' | 'logistica_id'>,
  zonaOrigenId: number | null
): boolean {
  if (profile.rol === 'administrador') return true;
  if (profile.rol === 'operaciones') return false;

  if (profile.rol === 'ejecutivo') {
    return solicitud.ejecutivo_id === profile.id;
  }

  if (solicitud.jefe_local_id === profile.id || solicitud.logistica_id === profile.id) {
    return true;
  }

  if (profile.rol === 'jefe_local') {
    const propias = sucursalesDelPerfil(profile);
    return (
      propias.includes(solicitud.sucursal) ||
      (solicitud.sucursal_destino !== null && propias.includes(solicitud.sucursal_destino))
    );
  }

  if (profile.rol === 'logistica') {
    if (zonaOrigenId === null) return false;
    return (profile.zonas || []).some((z) => z.id === zonaOrigenId);
  }

  return false;
}

/**
 * Carga la solicitud y verifica que el usuario tenga alcance sobre ella.
 * Lanza `ErrorUsuario` si no existe o no tiene acceso; no distingue ambos
 * casos hacia afuera para no confirmar la existencia de IDs ajenos.
 */
export async function requireSolicitudAccess(
  profile: UserProfile,
  solicitudId: string
): Promise<SolicitudMinima> {
  if (!solicitudId) throw new ErrorUsuario('Solicitud inválida.');

  const solicitud = await SolicitudesService.getSolicitudById(solicitudId);
  if (!solicitud) throw new ErrorUsuario(MENSAJE_SIN_ACCESO_SOLICITUD);

  let zonaOrigenId: number | null = null;
  if (profile.rol === 'logistica') {
    const sucursal = await OrganizacionService.getBranch(solicitud.sucursal);
    zonaOrigenId = sucursal?.zona_id ?? null;
  }

  if (!puedeAccederSolicitud(profile, solicitud, zonaOrigenId)) {
    throw new ErrorUsuario(MENSAJE_SIN_ACCESO_SOLICITUD);
  }
  return solicitud;
}

/** Igual que `requireSolicitudAccess`, partiendo de un documento. */
export async function requireDocumentoAccess(
  profile: UserProfile,
  documentoId: string
): Promise<SolicitudMinima> {
  if (!documentoId) throw new ErrorUsuario('Documento inválido.');
  const solicitudId = await SolicitudesService.getSolicitudIdDeDocumento(documentoId);
  if (!solicitudId) throw new ErrorUsuario('Documento no encontrado.');
  return requireSolicitudAccess(profile, solicitudId);
}

/** Igual que `requireSolicitudAccess`, partiendo de un vínculo solicitud_vehiculo. */
export async function requireSolicitudVehiculoAccess(
  profile: UserProfile,
  solicitudVehiculoId: string
): Promise<SolicitudMinima> {
  if (!solicitudVehiculoId) throw new ErrorUsuario('Reserva inválida.');
  const solicitudId = await SolicitudesService.getSolicitudIdDeReserva(solicitudVehiculoId);
  if (!solicitudId) throw new ErrorUsuario('Reserva no encontrada.');
  return requireSolicitudAccess(profile, solicitudId);
}
