import type { UserProfile, UsuarioDetalle } from '@/types/auth.types';

/**
 * Datos de contacto (email y teléfono) de otros usuarios — brecha 006.
 *
 * `getUsuarioDetalleAction` devolvía email, teléfono, sucursales y zonas de
 * cualquier usuario a cualquier usuario autenticado. Nombre, rol y sucursal
 * siguen visibles (se usan en historial y listados), pero el contacto solo se
 * entrega cuando hay una relación de trabajo.
 */

const ROLES_COORDINACION = new Set(['administrador', 'jefe_local', 'logistica']);

export function puedeVerContacto(
  viewer: UserProfile,
  target: UsuarioDetalle,
  esParticipanteDeSolicitudVisible: boolean
): boolean {
  if (viewer.rol === 'administrador') return true;
  if (viewer.id === target.id) return true;
  if (esParticipanteDeSolicitudVisible) return true;
  if (ROLES_COORDINACION.has(target.rol)) return true;

  const sucursalesViewer = new Set<number>();
  if (typeof viewer.sucursal_id === 'number') sucursalesViewer.add(viewer.sucursal_id);
  (viewer.sucursales || []).forEach((s) => sucursalesViewer.add(s.id));

  const sucursalesTarget: number[] = [
    ...(typeof target.sucursal_id === 'number' ? [target.sucursal_id] : []),
    ...(target.sucursales || []).map((s) => s.id),
  ];
  if (sucursalesTarget.some((id) => sucursalesViewer.has(id))) return true;

  const zonasViewer = new Set((viewer.zonas || []).map((z) => z.id));
  return (target.zonas || []).some((z) => zonasViewer.has(z.id));
}

export function ocultarContacto(detalle: UsuarioDetalle): UsuarioDetalle {
  return { ...detalle, email: '', telefono: null, contacto_oculto: true };
}
