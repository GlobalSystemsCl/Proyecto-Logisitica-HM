'use server';

import { AuthService } from '@/services/auth.service';
import { SolicitudesService } from '@/services/solicitudes.service';
import { UserProfile } from '@/types/auth.types';
import { TipoSolicitud } from '@/types/solicitud.types';
import { revalidatePath } from 'next/cache';

async function getProfileOrThrow(): Promise<UserProfile> {
  const profile = await AuthService.getCurrentUserProfile();
  if (!profile || !profile.activo) {
    throw new Error('Sesión inválida o usuario inactivo.');
  }
  return profile;
}

function puedeGestionarPreDespacho(
  profile: UserProfile,
  solicitud: { sucursal: number; ejecutivo_id: string }
): boolean {
  if (profile.rol === 'administrador') return true;
  if (profile.rol === 'ejecutivo') return solicitud.ejecutivo_id === profile.id;
  if (profile.rol === 'jefe_local') {
    return profile.sucursal_id !== null && profile.sucursal_id !== undefined && solicitud.sucursal === profile.sucursal_id;
  }
  return false;
}

export interface CreateSolicitudData {
  sucursal: string;
  tipo_solicitud: TipoSolicitud;
  fecha_limite?: string;
  vehiculo_ids?: string[];
}

export async function createSolicitudAction(data: CreateSolicitudData) {
  try {
    const profile = await getProfileOrThrow();

    if (profile.rol !== 'ejecutivo' && profile.rol !== 'administrador') {
      return { success: false, error: 'Solo Ejecutivos y Administradores pueden crear solicitudes.' };
    }

    const sucursal = Number(data.sucursal);
    if (!Number.isInteger(sucursal) || sucursal <= 0) {
      return { success: false, error: 'Debes seleccionar la sucursal de origen.' };
    }

    if (data.tipo_solicitud !== 'evento' && data.tipo_solicitud !== 'venta') {
      return { success: false, error: 'Tipo de solicitud inválido.' };
    }

    const fechaLimite = data.fecha_limite?.trim() || null;
    if (fechaLimite && isNaN(Date.parse(fechaLimite))) {
      return { success: false, error: 'La fecha límite no es válida.' };
    }

    const vehiculoIds = (data.vehiculo_ids || []).filter((v) => typeof v === 'string' && v.length > 0);

    const result = await SolicitudesService.createSolicitud(
      {
        ejecutivo_id: profile.id,
        sucursal,
        tipo_solicitud: data.tipo_solicitud,
        fecha_limite: fechaLimite,
      },
      profile.rol === 'administrador' ? vehiculoIds : []
    );

    if (!result.success) {
      return { success: false, error: result.error || 'Error al crear la solicitud.' };
    }

    revalidatePath('/solicitudes');
    return {
      success: true,
      message:
        result.error
          ? result.error
          : `Solicitud creada exitosamente${vehiculoIds.length > 0 && profile.rol === 'administrador' ? ` con ${vehiculoIds.length} vehículo(s) reservado(s)` : ''}.`,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error inesperado';
    return { success: false, error: msg };
  }
}

export async function priorizarSolicitudAction(id: string) {
  try {
    const profile = await getProfileOrThrow();

    if (profile.rol !== 'administrador' && profile.rol !== 'jefe_local') {
      return { success: false, error: 'Solo el Jefe de Local o un Administrador pueden priorizar.' };
    }

    const solicitud = await SolicitudesService.getSolicitudById(id);
    if (!solicitud) return { success: false, error: 'Solicitud no encontrada.' };

    if (
      profile.rol === 'jefe_local' &&
      (profile.sucursal_id === null ||
        profile.sucursal_id === undefined ||
        solicitud.sucursal !== profile.sucursal_id)
    ) {
      return { success: false, error: 'Solo puedes priorizar solicitudes de tu propia sucursal.' };
    }

    const result = await SolicitudesService.priorizarSolicitud(id);
    if (!result.success) return { success: false, error: result.error };

    revalidatePath('/solicitudes');
    return { success: true, message: `Solicitud priorizada en la posición #${result.posicion} de la cola.` };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error inesperado';
    return { success: false, error: msg };
  }
}

export async function cancelarSolicitudAction(id: string, motivo: string) {
  try {
    const profile = await getProfileOrThrow();

    if (!motivo || motivo.trim().length < 5) {
      return { success: false, error: 'El motivo de cancelación es obligatorio (mínimo 5 caracteres).' };
    }

    const solicitud = await SolicitudesService.getSolicitudById(id);
    if (!solicitud) return { success: false, error: 'Solicitud no encontrada.' };

    if (!puedeGestionarPreDespacho(profile, solicitud)) {
      return {
        success: false,
        error: 'No tienes permisos para cancelar esta solicitud.',
      };
    }

    const result = await SolicitudesService.cancelarSolicitud(id, motivo);
    if (!result.success) return { success: false, error: result.error };

    revalidatePath('/solicitudes');
    return { success: true, message: 'Solicitud cancelada. Los vehículos reservados fueron liberados automáticamente.' };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error inesperado';
    return { success: false, error: msg };
  }
}

export async function eliminarSolicitudAction(id: string) {
  try {
    const profile = await getProfileOrThrow();

    const solicitud = await SolicitudesService.getSolicitudById(id);
    if (!solicitud) return { success: false, error: 'Solicitud no encontrada.' };

    if (!puedeGestionarPreDespacho(profile, solicitud)) {
      return { success: false, error: 'No tienes permisos para eliminar esta solicitud.' };
    }

    const result = await SolicitudesService.eliminarSolicitud(id);
    if (!result.success) return { success: false, error: result.error };

    revalidatePath('/solicitudes');
    return { success: true, message: 'Solicitud eliminada definitivamente.' };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error inesperado';
    return { success: false, error: msg };
  }
}

export async function agregarVehiculoAction(solicitudId: string, vehiculoId: string) {
  try {
    const profile = await getProfileOrThrow();

    if (profile.rol !== 'administrador') {
      return { success: false, error: 'Solo el Administrador gestiona las reservas de vehículos en esta versión.' };
    }

    const result = await SolicitudesService.agregarVehiculo(solicitudId, vehiculoId);
    if (!result.success) return { success: false, error: result.error };

    revalidatePath('/solicitudes');
    return { success: true, message: 'Vehículo reservado para esta solicitud.' };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error inesperado';
    return { success: false, error: msg };
  }
}

export async function quitarVehiculoAction(solicitudVehiculoId: string) {
  try {
    const profile = await getProfileOrThrow();

    if (profile.rol !== 'administrador') {
      return { success: false, error: 'Solo el Administrador gestiona las reservas de vehículos en esta versión.' };
    }

    const result = await SolicitudesService.quitarVehiculo(solicitudVehiculoId);
    if (!result.success) return { success: false, error: result.error };

    revalidatePath('/solicitudes');
    return { success: true, message: 'Reserva retirada.' };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error inesperado';
    return { success: false, error: msg };
  }
}
