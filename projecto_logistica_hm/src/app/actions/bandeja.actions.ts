'use server';

import { requireProfile } from '@/lib/auth/guards';
import { mensajeErrorUsuario } from '@/lib/errores';
import { NotificacionService, type BandejaNotificaciones } from '@/services/notificacion.service';

/**
 * Bandeja de notificaciones en la app (campana del encabezado). Cada usuario
 * solo lee y marca las suyas: el id del usuario sale de la sesión, nunca del
 * cliente.
 */

const BANDEJA_VACIA: BandejaNotificaciones = { items: [], noLeidas: 0 };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function getBandejaNotificacionesAction(): Promise<BandejaNotificaciones> {
  try {
    const profile = await requireProfile();
    return await NotificacionService.getBandeja(profile.id);
  } catch {
    return BANDEJA_VACIA;
  }
}

export async function marcarNotificacionLeidaAction(
  notificacionId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const profile = await requireProfile();
    if (typeof notificacionId !== 'string' || !UUID_RE.test(notificacionId)) {
      return { success: false, error: 'Notificación no válida.' };
    }
    const ok = await NotificacionService.marcarLeida(profile.id, notificacionId);
    return ok ? { success: true } : { success: false, error: 'No se pudo marcar la notificación como leída.' };
  } catch (err: unknown) {
    return { success: false, error: mensajeErrorUsuario(err, 'Error inesperado') };
  }
}

export async function marcarTodasNotificacionesLeidasAction(): Promise<{ success: boolean; error?: string }> {
  try {
    const profile = await requireProfile();
    const ok = await NotificacionService.marcarTodasLeidas(profile.id);
    return ok ? { success: true } : { success: false, error: 'No se pudieron marcar las notificaciones como leídas.' };
  } catch (err: unknown) {
    return { success: false, error: mensajeErrorUsuario(err, 'Error inesperado') };
  }
}
