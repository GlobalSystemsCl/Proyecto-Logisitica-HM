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

export interface CreateSolicitudData {
  sucursal: string;
  tipo_solicitud: TipoSolicitud;
  fecha_limite?: string;
  vehiculo_ids?: string[];
  sucursal_destino?: string;
  direccion_evento?: string;
  titulo_evento?: string;
  ejecutivo_id?: string;
  observacion?: string;
}

export async function createSolicitudAction(data: CreateSolicitudData) {
  try {
    const profile = await getProfileOrThrow();

    if (profile.rol !== 'ejecutivo' && profile.rol !== 'jefe_local' && profile.rol !== 'administrador') {
      return { success: false, error: 'No tienes permisos para crear solicitudes.' };
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
      return { success: false, error: 'La fecha de entrega no es válida.' };
    }
    if (profile.rol !== 'ejecutivo' && !fechaLimite) {
      return { success: false, error: 'Debes indicar la fecha de entrega para la solicitud.' };
    }

    if (data.tipo_solicitud === 'venta') {
      const destino = Number(data.sucursal_destino);
      if (!Number.isInteger(destino) || destino <= 0) {
        return { success: false, error: 'Debes seleccionar una sucursal destino.' };
      }
    }

    if (data.tipo_solicitud === 'evento') {
      if (!data.direccion_evento || data.direccion_evento.trim().length < 3) {
        return { success: false, error: 'La dirección del evento es obligatoria (mínimo 3 caracteres).' };
      }
      if (!data.titulo_evento || data.titulo_evento.trim().length < 3) {
        return { success: false, error: 'El título del evento es obligatorio (mínimo 3 caracteres).' };
      }
    }

    let ejecutivoId: string | null = null;

    if (profile.rol === 'ejecutivo') {
      if (sucursal !== profile.sucursal_id) {
        return { success: false, error: 'Como ejecutivo, solo puedes crear solicitudes en tu sucursal.' };
      }
      ejecutivoId = profile.id;
    } else if (profile.rol === 'jefe_local') {
      if (profile.sucursal_id === null || profile.sucursal_id === undefined) {
        return { success: false, error: 'No tienes una sucursal asignada.' };
      }
      if (data.ejecutivo_id) {
        ejecutivoId = data.ejecutivo_id;
      }
    }

    const jefeLocalId =
      profile.rol === 'jefe_local'
        ? profile.id
        : profile.rol === 'ejecutivo'
          ? await SolicitudesService.getJefeLocalDeSucursal(sucursal)
          : null;

    if (profile.rol === 'ejecutivo' && !jefeLocalId) {
      return {
        success: false,
        error: 'No hay un jefe de local asignado a tu sucursal: no se puede crear la solicitud.',
      };
    }

    const estadoInicial = profile.rol === 'jefe_local' ? 'aprobada' : 'pendiente_aprobacion';

    const vehiculoIds = (data.vehiculo_ids || []).filter((v) => typeof v === 'string' && v.length > 0);

    if (vehiculoIds.length === 0) {
      return { success: false, error: 'Debes seleccionar al menos un vehículo: una solicitud no puede existir sin vehículos.' };
    }

    const result = await SolicitudesService.createSolicitud(
      {
        ejecutivo_id: ejecutivoId,
        jefe_local_id: jefeLocalId,
        estado: estadoInicial,
        sucursal,
        tipo_solicitud: data.tipo_solicitud,
        fecha_limite: fechaLimite,
        sucursal_destino: data.tipo_solicitud === 'venta' ? Number(data.sucursal_destino) : null,
        direccion_evento: data.tipo_solicitud === 'evento' ? data.direccion_evento?.trim() : null,
        titulo_evento: data.tipo_solicitud === 'evento' ? data.titulo_evento?.trim() : null,
        observacion: data.observacion?.trim() || null,
      },
      vehiculoIds,
      profile.id
    );

    if (!result.success) {
      return { success: false, error: result.error || 'Error al crear la solicitud.' };
    }

    revalidatePath('/solicitudes');
    return {
      success: true,
      message:
        profile.rol === 'jefe_local'
          ? 'Solicitud creada y aprobada automáticamente.'
          : 'Solicitud creada. Pendiente de aprobación por el Jefe de Local.',
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error inesperado';
    return { success: false, error: msg };
  }
}

export async function aprobarSolicitudAction(id: string, fecha: string) {
  try {
    const profile = await getProfileOrThrow();

    if (profile.rol !== 'jefe_local' && profile.rol !== 'administrador') {
      return { success: false, error: 'Solo el Jefe de Local o un Administrador pueden aprobar.' };
    }

    const solicitud = await SolicitudesService.getSolicitudById(id);
    if (!solicitud) return { success: false, error: 'Solicitud no encontrada.' };

    if (profile.rol === 'jefe_local') {
      if (profile.sucursal_id === null || profile.sucursal_id === undefined) {
        return { success: false, error: 'No tienes una sucursal asignada.' };
      }
      if (solicitud.sucursal !== profile.sucursal_id) {
        return { success: false, error: 'Solo puedes aprobar solicitudes de tu propia sucursal.' };
      }
    }

    const result = await SolicitudesService.aprobarSolicitud(id, profile.id, fecha);
    if (!result.success) return { success: false, error: result.error };

    revalidatePath('/solicitudes');
    return { success: true, message: 'Solicitud aprobada exitosamente.' };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error inesperado';
    return { success: false, error: msg };
  }
}

export async function rechazarSolicitudAction(id: string, motivo: string) {
  try {
    const profile = await getProfileOrThrow();

    if (profile.rol !== 'jefe_local' && profile.rol !== 'administrador') {
      return { success: false, error: 'Solo el Jefe de Local o un Administrador pueden rechazar.' };
    }

    if (!motivo || motivo.trim().length < 5) {
      return { success: false, error: 'El motivo de rechazo es obligatorio (mínimo 5 caracteres).' };
    }

    const solicitud = await SolicitudesService.getSolicitudById(id);
    if (!solicitud) return { success: false, error: 'Solicitud no encontrada.' };

    if (profile.rol === 'jefe_local') {
      if (profile.sucursal_id === null || profile.sucursal_id === undefined) {
        return { success: false, error: 'No tienes una sucursal asignada.' };
      }
      if (solicitud.sucursal !== profile.sucursal_id) {
        return { success: false, error: 'Solo puedes rechazar solicitudes de tu propia sucursal.' };
      }
    }

    const result = await SolicitudesService.rechazarSolicitud(id, motivo, profile.id);
    if (!result.success) return { success: false, error: result.error };

    revalidatePath('/solicitudes');
    return { success: true, message: 'Solicitud rechazada.' };
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

    const result = await SolicitudesService.priorizarSolicitud(id, profile.id);
    if (!result.success) return { success: false, error: result.error };

    revalidatePath('/solicitudes');
    return { success: true, message: `Solicitud priorizada en la posición #${result.posicion} de la cola.` };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error inesperado';
    return { success: false, error: msg };
  }
}

export async function priorizarEnPosicionAction(id: string, posicion: number) {
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

    const result = await SolicitudesService.priorizarEnPosicion(id, posicion, profile.id);
    if (!result.success) return { success: false, error: result.error };

    revalidatePath('/solicitudes');
    return { success: true, message: `Solicitud priorizada en la posición #${result.posicion} de la cola.` };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error inesperado';
    return { success: false, error: msg };
  }
}

export async function reordenarColaAction(sucursalId: number, orden: string[]) {
  try {
    const profile = await getProfileOrThrow();

    if (profile.rol !== 'administrador' && profile.rol !== 'jefe_local') {
      return { success: false, error: 'Solo el Jefe de Local o un Administrador pueden reordenar la cola.' };
    }

    if (profile.rol === 'jefe_local') {
      if (profile.sucursal_id === null || profile.sucursal_id === undefined) {
        return { success: false, error: 'No tienes una sucursal asignada.' };
      }
      if (sucursalId !== profile.sucursal_id) {
        return { success: false, error: 'Solo puedes reordenar la cola de tu propia sucursal.' };
      }
    }

    const result = await SolicitudesService.reordenarCola(sucursalId, orden, profile.id);
    if (!result.success) return { success: false, error: result.error };

    revalidatePath('/solicitudes');
    return { success: true, message: 'Cola de prioridades actualizada.' };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error inesperado';
    return { success: false, error: msg };
  }
}

export async function sacarDeColaAction(id: string) {
  try {
    const profile = await getProfileOrThrow();

    if (profile.rol !== 'administrador' && profile.rol !== 'jefe_local') {
      return { success: false, error: 'Solo el Jefe de Local o un Administrador pueden sacar de la cola.' };
    }

    const solicitud = await SolicitudesService.getSolicitudById(id);
    if (!solicitud) return { success: false, error: 'Solicitud no encontrada.' };

    if (profile.rol === 'jefe_local') {
      if (profile.sucursal_id === null || profile.sucursal_id === undefined) {
        return { success: false, error: 'No tienes una sucursal asignada.' };
      }
      if (solicitud.sucursal !== profile.sucursal_id) {
        return { success: false, error: 'Solo puedes sacar de la cola solicitudes de tu propia sucursal.' };
      }
    }

    const result = await SolicitudesService.sacarDeCola(id, profile.id);
    if (!result.success) return { success: false, error: result.error };

    revalidatePath('/solicitudes');
    return { success: true, message: 'Solicitud sacada de la cola de prioridades.' };
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

    const esEncargado =
      profile.rol === 'administrador' ||
      (profile.rol === 'jefe_local' && solicitud.sucursal === profile.sucursal_id) ||
      (profile.rol === 'ejecutivo' && solicitud.ejecutivo_id === profile.id) ||
      profile.rol === 'logistica';

    if (!esEncargado) {
      return { success: false, error: 'No tienes permisos para cancelar esta solicitud.' };
    }

    const result = await SolicitudesService.cancelarSolicitud(id, motivo, profile.id);
    if (!result.success) return { success: false, error: result.error };

    revalidatePath('/solicitudes');
    return { success: true, message: 'Solicitud cancelada.' };
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

    const esEncargado =
      profile.rol === 'administrador' ||
      (profile.rol === 'jefe_local' && solicitud.sucursal === profile.sucursal_id) ||
      (profile.rol === 'ejecutivo' && solicitud.ejecutivo_id === profile.id);

    if (!esEncargado) {
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

    if (profile.rol !== 'administrador' && profile.rol !== 'jefe_local' && profile.rol !== 'logistica') {
      return { success: false, error: 'No tienes permisos para gestionar vehículos.' };
    }

    const result = await SolicitudesService.agregarVehiculo(solicitudId, vehiculoId, profile.id);
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

    if (profile.rol !== 'administrador' && profile.rol !== 'jefe_local' && profile.rol !== 'logistica') {
      return { success: false, error: 'No tienes permisos para gestionar vehículos.' };
    }

    const result = await SolicitudesService.quitarVehiculo(solicitudVehiculoId, profile.id);
    if (!result.success) return { success: false, error: result.error };

    revalidatePath('/solicitudes');
    return { success: true, message: 'Reserva retirada.' };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error inesperado';
    return { success: false, error: msg };
  }
}

export async function agregarObservacionAction(solicitudId: string, texto: string) {
  try {
    const profile = await getProfileOrThrow();

    if (!texto || texto.trim().length < 1) {
      return { success: false, error: 'La observación no puede estar vacía.' };
    }

    const result = await SolicitudesService.agregarObservacion(solicitudId, profile.id, texto);
    if (!result.success) return { success: false, error: result.error };

    revalidatePath('/solicitudes');
    return { success: true, message: 'Observación agregada.' };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error inesperado';
    return { success: false, error: msg };
  }
}

export async function getObservacionesAction(solicitudId: string) {
  return SolicitudesService.getObservaciones(solicitudId);
}

export async function getAuditoriaAction(solicitudId: string) {
  return SolicitudesService.getAuditoria(solicitudId);
}

export async function getEjecutivosPorSucursalAction(sucursalId: number) {
  return SolicitudesService.getEjecutivosPorSucursal(sucursalId);
}

export async function calendarizarSolicitudAction(solicitudId: string, fechaDespacho: string) {
  try {
    const profile = await getProfileOrThrow();

    if (profile.rol !== 'administrador' && profile.rol !== 'logistica' && profile.rol !== 'jefe_local') {
      return { success: false, error: 'No tienes permisos para calendarizar solicitudes.' };
    }

    if (!fechaDespacho || isNaN(Date.parse(fechaDespacho))) {
      return { success: false, error: 'La fecha de despacho no es válida.' };
    }

    const result = await SolicitudesService.calendarizarSolicitud(solicitudId, fechaDespacho, profile.id);
    if (!result.success) return { success: false, error: result.error };

    revalidatePath('/solicitudes');
    revalidatePath('/solicitudes/calendarizaciones');
    return { success: true, message: 'Solicitud calendarizada exitosamente.' };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error inesperado';
    return { success: false, error: msg };
  }
}

export async function descalendarizarSolicitudAction(solicitudId: string) {
  try {
    const profile = await getProfileOrThrow();

    if (profile.rol !== 'administrador' && profile.rol !== 'logistica' && profile.rol !== 'jefe_local') {
      return { success: false, error: 'No tienes permisos para descalendarizar solicitudes.' };
    }

    const result = await SolicitudesService.descalendarizarSolicitud(solicitudId, profile.id);
    if (!result.success) return { success: false, error: result.error };

    revalidatePath('/solicitudes');
    revalidatePath('/solicitudes/calendarizaciones');
    return { success: true, message: 'Solicitud devuelta a priorizada.' };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error inesperado';
    return { success: false, error: msg };
  }
}

export async function despacharSolicitudAction(solicitudId: string) {
  try {
    const profile = await getProfileOrThrow();

    if (profile.rol !== 'administrador' && profile.rol !== 'logistica') {
      return { success: false, error: 'No tienes permisos para despachar solicitudes.' };
    }

    const result = await SolicitudesService.despacharSolicitud(solicitudId, profile.id);
    if (!result.success) return { success: false, error: result.error };

    revalidatePath('/solicitudes');
    revalidatePath('/solicitudes/calendarizaciones');
    return { success: true, message: 'Solicitud despachada y en tránsito.' };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error inesperado';
    return { success: false, error: msg };
  }
}

export async function recibirSolicitudAction(solicitudId: string) {
  try {
    const profile = await getProfileOrThrow();

    if (profile.rol !== 'administrador' && profile.rol !== 'jefe_local') {
      return { success: false, error: 'No tienes permisos para recibir solicitudes.' };
    }

    const result = await SolicitudesService.recibirSolicitud(solicitudId, profile.id);
    if (!result.success) return { success: false, error: result.error };

    revalidatePath('/solicitudes');
    revalidatePath('/solicitudes/calendarizaciones');
    return { success: true, message: 'Solicitud recibida en destino.' };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error inesperado';
    return { success: false, error: msg };
  }
}
