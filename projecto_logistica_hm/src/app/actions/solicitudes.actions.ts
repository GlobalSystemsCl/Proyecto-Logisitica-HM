'use server';

import { SolicitudesService } from '@/services/solicitudes.service';
import { OrganizacionService } from '@/services/organizacion.service';
import { UsersService } from '@/services/users.service';
import { UserProfile, UsuarioDetalle } from '@/types/auth.types';
import { TipoSolicitud } from '@/types/solicitud.types';
import { esFechaAnteriorAHoy } from '@/lib/fechas';
import { revalidarSolicitudes } from '@/lib/rutas';
import { mensajeErrorUsuario } from '@/lib/errores';
import {
  requireDocumentoAccess,
  requireProfile,
  requireSolicitudAccess,
  requireSolicitudVehiculoAccess,
} from '@/lib/auth/guards';
import { ocultarContacto, puedeVerContacto } from '@/lib/auth/contacto';

/**
 * Dev 2 — Validación multi-sucursal del Jefe Local.
 *
 * Reemplaza la comparación `solicitud.sucursal === profile.sucursal_id`, que
 * solo miraba la sucursal PRINCIPAL e impedía gestionar las sucursales
 * adicionales. Ahora se consulta `OrganizacionService.usuarioTieneSucursal()`
 * (RPC `usuario_tiene_sucursal`, SECURITY DEFINER) que valida la sucursal
 * principal + las que el usuario encabeza como encargado (`sucursal.usuario_id`).
 *
 * Devuelve un mensaje de error, o `null` si tiene permiso.
 */
async function validarSucursalJefeLocal(
  profile: UserProfile,
  sucursalId: number
): Promise<string | null> {
  if (profile.rol === 'administrador') return null;

  if (profile.sucursal_id === null || profile.sucursal_id === undefined) {
    const tieneAlguna = await OrganizacionService.getUserAssignedBranches(profile.id);
    if (tieneAlguna.length === 0) {
      return 'No tienes ninguna sucursal asignada.';
    }
  }

  const ok = await OrganizacionService.usuarioTieneSucursal(profile.id, sucursalId);
  if (!ok) {
    return 'Solo puedes gestionar solicitudes de tus sucursales asignadas.';
  }
  return null;
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
    const profile = await requireProfile();

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
      return { success: false, error: 'La fecha límite de entrega propuesta no es válida.' };
    }
    if (fechaLimite && esFechaAnteriorAHoy(fechaLimite)) {
      return { success: false, error: 'La fecha límite de entrega propuesta no puede ser anterior al día de hoy.' };
    }
    if (!fechaLimite) {
      return { success: false, error: 'Debes indicar la fecha límite de entrega propuesta.' };
    }

    if (data.tipo_solicitud === 'venta') {
      const destino = Number(data.sucursal_destino);
      if (!Number.isInteger(destino) || destino <= 0) {
        return { success: false, error: 'Debes seleccionar una sucursal destino.' };
      }
      if (profile.rol === 'ejecutivo' && destino !== profile.sucursal_id) {
        return { success: false, error: 'Como ejecutivo, solo puedes pedir vehículos a tu propia sucursal.' };
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
      const errorSucursal = await validarSucursalJefeLocal(profile, sucursal);
      if (errorSucursal) return { success: false, error: errorSucursal };
      if (data.ejecutivo_id) {
        const errorDelegacion = await SolicitudesService.validarEjecutivoDelegable(
          data.ejecutivo_id,
          sucursal
        );
        if (errorDelegacion) return { success: false, error: errorDelegacion };
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

    revalidarSolicitudes();
    return {
      success: true,
      solicitudId: result.solicitud?.id,
      message:
        profile.rol === 'jefe_local'
          ? 'Solicitud creada y aprobada automáticamente.'
          : 'Solicitud creada. Pendiente de aprobación por el Jefe de Local.',
    };
  } catch (err: unknown) {
    return { success: false, error: mensajeErrorUsuario(err, 'Error inesperado') };
  }
}

export async function aprobarSolicitudAction(id: string, fecha: string) {
  try {
    const profile = await requireProfile();

    if (profile.rol !== 'jefe_local' && profile.rol !== 'administrador') {
      return { success: false, error: 'Solo el Jefe de Local o un Administrador pueden aprobar.' };
    }

    if (!fecha || isNaN(Date.parse(fecha))) {
      return { success: false, error: 'La fecha límite de entrega propuesta no es válida.' };
    }
    if (esFechaAnteriorAHoy(fecha)) {
      return { success: false, error: 'La fecha límite de entrega propuesta no puede ser anterior al día de hoy.' };
    }

    const solicitud = await SolicitudesService.getSolicitudById(id);
    if (!solicitud) return { success: false, error: 'Solicitud no encontrada.' };

    if (profile.rol === 'jefe_local') {
      const errorSucursal = await validarSucursalJefeLocal(profile, solicitud.sucursal);
      if (errorSucursal) return { success: false, error: errorSucursal };
    }

    const result = await SolicitudesService.aprobarSolicitud(id, profile.id, fecha);
    if (!result.success) return { success: false, error: result.error };

    revalidarSolicitudes();
    return { success: true, message: 'Solicitud aprobada exitosamente.' };
  } catch (err: unknown) {
    return { success: false, error: mensajeErrorUsuario(err, 'Error inesperado') };
  }
}

export async function rechazarSolicitudAction(id: string, motivo: string) {
  try {
    const profile = await requireProfile();

    if (profile.rol !== 'jefe_local' && profile.rol !== 'administrador') {
      return { success: false, error: 'Solo el Jefe de Local o un Administrador pueden rechazar.' };
    }

    if (!motivo || motivo.trim().length < 5) {
      return { success: false, error: 'El motivo de rechazo es obligatorio (mínimo 5 caracteres).' };
    }

    const solicitud = await SolicitudesService.getSolicitudById(id);
    if (!solicitud) return { success: false, error: 'Solicitud no encontrada.' };

    if (profile.rol === 'jefe_local') {
      const errorSucursal = await validarSucursalJefeLocal(profile, solicitud.sucursal);
      if (errorSucursal) {
        return { success: false, error: errorSucursal.replace('gestionar', 'rechazar') };
      }
    }

    const result = await SolicitudesService.rechazarSolicitud(id, motivo, profile.id);
    if (!result.success) return { success: false, error: result.error };

    revalidarSolicitudes();
    return { success: true, message: 'Solicitud rechazada.' };
  } catch (err: unknown) {
    return { success: false, error: mensajeErrorUsuario(err, 'Error inesperado') };
  }
}

export async function priorizarSolicitudAction(id: string) {
  try {
    const profile = await requireProfile();

    if (profile.rol !== 'administrador' && profile.rol !== 'jefe_local') {
      return { success: false, error: 'Solo el Jefe de Local o un Administrador pueden priorizar.' };
    }

    const solicitud = await SolicitudesService.getSolicitudById(id);
    if (!solicitud) return { success: false, error: 'Solicitud no encontrada.' };

    if (profile.rol === 'jefe_local') {
      const errorSucursal = await validarSucursalJefeLocal(profile, solicitud.sucursal);
      if (errorSucursal) {
        return { success: false, error: errorSucursal.replace('gestionar', 'priorizar') };
      }
    }

    const result = await SolicitudesService.priorizarSolicitud(id, profile.id);
    if (!result.success) return { success: false, error: result.error };

    revalidarSolicitudes();
    return { success: true, message: `Solicitud priorizada en la posición #${result.posicion} de la cola.` };
  } catch (err: unknown) {
    return { success: false, error: mensajeErrorUsuario(err, 'Error inesperado') };
  }
}

export async function priorizarEnPosicionAction(id: string, posicion: number) {
  try {
    const profile = await requireProfile();

    if (profile.rol !== 'administrador' && profile.rol !== 'jefe_local') {
      return { success: false, error: 'Solo el Jefe de Local o un Administrador pueden priorizar.' };
    }

    const solicitud = await SolicitudesService.getSolicitudById(id);
    if (!solicitud) return { success: false, error: 'Solicitud no encontrada.' };

    if (profile.rol === 'jefe_local') {
      const errorSucursal = await validarSucursalJefeLocal(profile, solicitud.sucursal);
      if (errorSucursal) {
        return { success: false, error: errorSucursal.replace('gestionar', 'priorizar') };
      }
    }

    const result = await SolicitudesService.priorizarEnPosicion(id, posicion, profile.id);
    if (!result.success) return { success: false, error: result.error };

    revalidarSolicitudes();
    return { success: true, message: `Solicitud priorizada en la posición #${result.posicion} de la cola.` };
  } catch (err: unknown) {
    return { success: false, error: mensajeErrorUsuario(err, 'Error inesperado') };
  }
}

export async function reordenarColaAction(sucursalId: number, orden: string[]) {
  try {
    const profile = await requireProfile();

    if (profile.rol !== 'administrador' && profile.rol !== 'jefe_local') {
      return { success: false, error: 'Solo el Jefe de Local o un Administrador pueden reordenar la cola.' };
    }

    if (profile.rol === 'jefe_local') {
      const errorSucursal = await validarSucursalJefeLocal(profile, sucursalId);
      if (errorSucursal) {
        return { success: false, error: errorSucursal.replace('gestionar', 'reordenar la cola de') };
      }
    }

    const result = await SolicitudesService.reordenarCola(sucursalId, orden, profile.id);
    if (!result.success) return { success: false, error: result.error };

    revalidarSolicitudes();
    return { success: true, message: 'Cola de prioridades actualizada.' };
  } catch (err: unknown) {
    return { success: false, error: mensajeErrorUsuario(err, 'Error inesperado') };
  }
}

export async function sacarDeColaAction(id: string) {
  try {
    const profile = await requireProfile();

    if (profile.rol !== 'administrador' && profile.rol !== 'jefe_local') {
      return { success: false, error: 'Solo el Jefe de Local o un Administrador pueden sacar de la cola.' };
    }

    const solicitud = await SolicitudesService.getSolicitudById(id);
    if (!solicitud) return { success: false, error: 'Solicitud no encontrada.' };

    if (profile.rol === 'jefe_local') {
      const errorSucursal = await validarSucursalJefeLocal(profile, solicitud.sucursal);
      if (errorSucursal) {
        return { success: false, error: errorSucursal.replace('gestionar', 'sacar de la cola solicitudes de tus') };
      }
    }

    const result = await SolicitudesService.sacarDeCola(id, profile.id);
    if (!result.success) return { success: false, error: result.error };

    revalidarSolicitudes();
    return { success: true, message: 'Solicitud sacada de la cola de prioridades.' };
  } catch (err: unknown) {
    return { success: false, error: mensajeErrorUsuario(err, 'Error inesperado') };
  }
}

export async function cancelarSolicitudAction(id: string, motivo: string) {
  try {
    const profile = await requireProfile();

    if (!motivo || motivo.trim().length < 5) {
      return { success: false, error: 'El motivo de cancelación es obligatorio (mínimo 5 caracteres).' };
    }

    // Brecha 008: logística solo cancela dentro de sus zonas (antes, cualquiera).
    const solicitud = await requireSolicitudAccess(profile, id);

    const esEncargado =
      profile.rol === 'administrador' ||
      (profile.rol === 'jefe_local' &&
        (await OrganizacionService.usuarioTieneSucursal(profile.id, solicitud.sucursal))) ||
      (profile.rol === 'ejecutivo' && solicitud.ejecutivo_id === profile.id) ||
      profile.rol === 'logistica';

    if (!esEncargado) {
      return { success: false, error: 'No tienes permisos para cancelar esta solicitud.' };
    }

    const result = await SolicitudesService.cancelarSolicitud(id, motivo, profile.id);
    if (!result.success) return { success: false, error: result.error };

    revalidarSolicitudes();
    return { success: true, message: 'Solicitud cancelada.' };
  } catch (err: unknown) {
    return { success: false, error: mensajeErrorUsuario(err, 'Error inesperado') };
  }
}

export async function eliminarSolicitudAction(id: string) {
  try {
    const profile = await requireProfile();

    const solicitud = await SolicitudesService.getSolicitudById(id);
    if (!solicitud) return { success: false, error: 'Solicitud no encontrada.' };

    const esEncargado =
      profile.rol === 'administrador' ||
      (profile.rol === 'jefe_local' &&
        (await validarSucursalJefeLocal(profile, solicitud.sucursal)) === null) ||
      (profile.rol === 'ejecutivo' && solicitud.ejecutivo_id === profile.id);

    if (!esEncargado) {
      return { success: false, error: 'No tienes permisos para eliminar esta solicitud.' };
    }

    const result = await SolicitudesService.eliminarSolicitud(id, profile.id);
    if (!result.success) return { success: false, error: result.error };

    revalidarSolicitudes();
    return { success: true, message: 'Solicitud eliminada definitivamente.' };
  } catch (err: unknown) {
    return { success: false, error: mensajeErrorUsuario(err, 'Error inesperado') };
  }
}

export async function agregarVehiculoAction(solicitudId: string, vehiculoId: string) {
  try {
    const profile = await requireProfile();

    if (profile.rol !== 'administrador' && profile.rol !== 'jefe_local' && profile.rol !== 'logistica') {
      return { success: false, error: 'No tienes permisos para gestionar vehículos.' };
    }

    await requireSolicitudAccess(profile, solicitudId);

    const result = await SolicitudesService.agregarVehiculo(solicitudId, vehiculoId, profile.id);
    if (!result.success) return { success: false, error: result.error };

    revalidarSolicitudes();
    return { success: true, message: 'Vehículo reservado para esta solicitud.' };
  } catch (err: unknown) {
    return { success: false, error: mensajeErrorUsuario(err, 'Error inesperado') };
  }
}

export async function quitarVehiculoAction(solicitudVehiculoId: string) {
  try {
    const profile = await requireProfile();

    if (profile.rol !== 'administrador' && profile.rol !== 'jefe_local' && profile.rol !== 'logistica') {
      return { success: false, error: 'No tienes permisos para gestionar vehículos.' };
    }

    await requireSolicitudVehiculoAccess(profile, solicitudVehiculoId);

    const result = await SolicitudesService.quitarVehiculo(solicitudVehiculoId, profile.id);
    if (!result.success) return { success: false, error: result.error };

    revalidarSolicitudes();
    return { success: true, message: 'Reserva retirada.' };
  } catch (err: unknown) {
    return { success: false, error: mensajeErrorUsuario(err, 'Error inesperado') };
  }
}

export async function agregarObservacionAction(solicitudId: string, texto: string) {
  try {
    const profile = await requireProfile();

    if (!texto || texto.trim().length < 1) {
      return { success: false, error: 'La observación no puede estar vacía.' };
    }

    await requireSolicitudAccess(profile, solicitudId);

    const result = await SolicitudesService.agregarObservacion(solicitudId, profile.id, texto);
    if (!result.success) return { success: false, error: result.error };

    revalidarSolicitudes();
    return { success: true, message: 'Observación agregada.' };
  } catch (err: unknown) {
    return { success: false, error: mensajeErrorUsuario(err, 'Error inesperado') };
  }
}

/** Brecha 004: antes no verificaba sesión ni alcance (endpoint público). */
export async function getObservacionesAction(solicitudId: string) {
  try {
    const profile = await requireProfile();
    await requireSolicitudAccess(profile, solicitudId);
    return await SolicitudesService.getObservaciones(solicitudId);
  } catch {
    return [];
  }
}

/** Brecha 004: antes no verificaba sesión ni alcance (endpoint público). */
export async function getAuditoriaAction(solicitudId: string) {
  try {
    const profile = await requireProfile();
    await requireSolicitudAccess(profile, solicitudId);
    return await SolicitudesService.getAuditoria(solicitudId);
  } catch {
    return [];
  }
}

/**
 * Devuelve el detalle de contacto de un usuario (nombre, rol, sucursal,
 * teléfono y correo) para tarjetas y popups de datos de usuario.
 *
 * Brecha 006: email y teléfono solo se entregan si hay relación de trabajo
 * (ver `puedeVerContacto`). Si se indica `solicitudId` y el usuario consultado
 * participa en esa solicitud (a la que quien consulta tiene acceso), también.
 */
export async function getUsuarioDetalleAction(
  usuarioId: string,
  solicitudId?: string
): Promise<UsuarioDetalle | null> {
  try {
    const profile = await requireProfile();
    if (!usuarioId) return null;

    const detalle = await UsersService.getUsuarioDetalleById(usuarioId);
    if (!detalle) return null;

    let participante = false;
    if (solicitudId) {
      try {
        const sol = await requireSolicitudAccess(profile, solicitudId);
        participante = [sol.ejecutivo_id, sol.jefe_local_id, sol.logistica_id].includes(usuarioId);
      } catch {
        participante = false;
      }
    }

    return puedeVerContacto(profile, detalle, participante) ? detalle : ocultarContacto(detalle);
  } catch (err: unknown) {
    console.error('Error en getUsuarioDetalleAction:', err);
    return null;
  }
}

/**
 * Lista los candidatos a Ejecutivo para delegar una solicitud.
 *
 * Sin este guard cualquier usuario autenticado (incluido un ejecutivo) podía
 * enumerar todos los ejecutivos de la empresa. Solo el Jefe de Local (dentro de
 * su alcance) y el administrador pueden consultarla.
 */
export async function getEjecutivosPorSucursalAction(sucursalId: number | null): Promise<
  Array<{ id: string; nombre: string; apellido: string }>
> {
  try {
    const profile = await requireProfile();

    if (profile.rol !== 'administrador' && profile.rol !== 'jefe_local') {
      return [];
    }

    if (profile.rol === 'jefe_local' && sucursalId !== null && sucursalId !== undefined) {
      const errorSucursal = await validarSucursalJefeLocal(profile, sucursalId);
      if (errorSucursal) return [];
    }

    return await SolicitudesService.getEjecutivosPorSucursal(sucursalId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error inesperado';
    console.error('Error en getEjecutivosPorSucursalAction:', msg);
    return [];
  }
}

export async function calendarizarSolicitudAction(solicitudId: string, fechaDespacho: string) {
  try {
    const profile = await requireProfile();

    if (profile.rol !== 'administrador' && profile.rol !== 'logistica' && profile.rol !== 'jefe_local') {
      return { success: false, error: 'No tienes permisos para calendarizar solicitudes.' };
    }

    if (!fechaDespacho || isNaN(Date.parse(fechaDespacho))) {
      return { success: false, error: 'La fecha de despacho no es válida.' };
    }
    if (esFechaAnteriorAHoy(fechaDespacho)) {
      return { success: false, error: 'La fecha de despacho no puede ser anterior al día de hoy.' };
    }

    await requireSolicitudAccess(profile, solicitudId);

    const result = await SolicitudesService.calendarizarSolicitud(
      solicitudId,
      fechaDespacho,
      profile.id,
      profile.rol
    );
    if (!result.success) return { success: false, error: result.error };

    revalidarSolicitudes();
    return { success: true, message: 'Solicitud calendarizada exitosamente.' };
  } catch (err: unknown) {
    return { success: false, error: mensajeErrorUsuario(err, 'Error inesperado') };
  }
}

export async function descalendarizarSolicitudAction(solicitudId: string) {
  try {
    const profile = await requireProfile();

    if (profile.rol !== 'administrador' && profile.rol !== 'logistica' && profile.rol !== 'jefe_local') {
      return { success: false, error: 'No tienes permisos para descalendarizar solicitudes.' };
    }

    await requireSolicitudAccess(profile, solicitudId);

    const result = await SolicitudesService.descalendarizarSolicitud(solicitudId, profile.id);
    if (!result.success) return { success: false, error: result.error };

    revalidarSolicitudes();
    return { success: true, message: 'Solicitud devuelta a priorizada.' };
  } catch (err: unknown) {
    return { success: false, error: mensajeErrorUsuario(err, 'Error inesperado') };
  }
}

export async function despacharSolicitudAction(solicitudId: string) {
  try {
    const profile = await requireProfile();

    if (profile.rol !== 'administrador' && profile.rol !== 'logistica') {
      return { success: false, error: 'No tienes permisos para despachar solicitudes.' };
    }

    await requireSolicitudAccess(profile, solicitudId);

    const result = await SolicitudesService.despacharSolicitud(solicitudId, profile.id);
    if (!result.success) return { success: false, error: result.error };

    revalidarSolicitudes();
    return { success: true, message: 'Solicitud despachada.' };
  } catch (err: unknown) {
    return { success: false, error: mensajeErrorUsuario(err, 'Error inesperado') };
  }
}

export async function cancelarDespachoSolicitudAction(solicitudId: string) {
  try {
    const profile = await requireProfile();

    if (profile.rol !== 'administrador' && profile.rol !== 'logistica') {
      return { success: false, error: 'No tienes permisos para cancelar el despacho de solicitudes.' };
    }

    await requireSolicitudAccess(profile, solicitudId);

    const result = await SolicitudesService.cancelarDespacharSolicitud(solicitudId, profile.id);
    if (!result.success) return { success: false, error: result.error };

    revalidarSolicitudes();
    return { success: true, message: 'Despacho cancelado: la solicitud volvió a Calendarizada.' };
  } catch (err: unknown) {
    return { success: false, error: mensajeErrorUsuario(err, 'Error inesperado') };
  }
}

export async function recibirSolicitudAction(solicitudId: string) {
  try {
    const profile = await requireProfile();

    if (profile.rol !== 'administrador' && profile.rol !== 'jefe_local') {
      return { success: false, error: 'No tienes permisos para recibir solicitudes.' };
    }

    await requireSolicitudAccess(profile, solicitudId);

    const result = await SolicitudesService.recibirSolicitud(solicitudId, profile.id);
    if (!result.success) return { success: false, error: result.error };

    revalidarSolicitudes();
    return { success: true, message: 'Solicitud recibida en destino.' };
  } catch (err: unknown) {
    return { success: false, error: mensajeErrorUsuario(err, 'Error inesperado') };
  }
}

export async function finalizarSolicitudAction(solicitudId: string) {
  try {
    const profile = await requireProfile();

    if (profile.rol === 'logistica') {
      return { success: false, error: 'No tienes permisos para finalizar solicitudes.' };
    }

    await requireSolicitudAccess(profile, solicitudId);

    const result = await SolicitudesService.finalizarSolicitud(solicitudId, profile.id);
    if (!result.success) return { success: false, error: result.error };

    revalidarSolicitudes();
    return { success: true, message: 'Solicitud finalizada.' };
  } catch (err: unknown) {
    return { success: false, error: mensajeErrorUsuario(err, 'Error inesperado') };
  }
}

// ---------------------------------------------------------------------------
// DEV 2 — Asignación de encargado de Logística
// ---------------------------------------------------------------------------

/**
 * Logística (o admin) asigna un encargado a una solicitud Aprobada/Priorizada.
 * Si no se indica `logisticaId`, el usuario se auto-asigna.
 *
 * Reutiliza `solicitud.logistica_id` como "encargado de la solicitud".
 */
export async function asignarEncargadoAction(solicitudId: string, logisticaId?: string) {
  try {
    const profile = await requireProfile();

    if (profile.rol !== 'administrador' && profile.rol !== 'logistica') {
      return { success: false, error: 'Solo Logística o el Administrador pueden asignar el encargado.' };
    }

    await requireSolicitudAccess(profile, solicitudId);

    const encargadoId = logisticaId && logisticaId.trim() !== '' ? logisticaId.trim() : profile.id;
    const result = await SolicitudesService.asignarEncargadoLogistica(solicitudId, encargadoId, profile.id);
    if (!result.success) return { success: false, error: result.error };

    revalidarSolicitudes();
    return { success: true, message: 'Encargado de solicitud asignado.' };
  } catch (err: unknown) {
    return { success: false, error: mensajeErrorUsuario(err, 'Error inesperado') };
  }
}

/** Lista de usuarios de Logística activos, para el selector de encargado. */
export async function getEncargadosLogisticaAction(): Promise<
  Array<{ id: string; nombre: string; apellido: string; sucursal_nombre: string | null }>
> {
  try {
    const profile = await requireProfile();
    if (profile.rol !== 'administrador' && profile.rol !== 'logistica') return [];

    const usuarios = await UsersService.getUsers();
    return usuarios
      .filter((u) => u.rol === 'logistica' && u.activo)
      .map((u) => ({
        id: u.id,
        nombre: u.nombre,
        apellido: u.apellido,
        sucursal_nombre: u.sucursal_nombre ?? null,
      }));
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// DEV 2 — Insistencia del Ejecutivo (cooldown 24 h)
// ---------------------------------------------------------------------------

/** El Ejecutivo insiste para desbloquear el avance de su solicitud. */
export async function insistirSolicitudAction(solicitudId: string, mensaje?: string) {
  try {
    const profile = await requireProfile();

    if (profile.rol !== 'ejecutivo') {
      return { success: false, error: 'Solo el Ejecutivo puede insistir sobre una solicitud.' };
    }

    await requireSolicitudAccess(profile, solicitudId);

    const result = await SolicitudesService.insistirSolicitud(solicitudId, profile.id, mensaje);
    if (!result.success) {
      return {
        success: false,
        error: result.error,
        horas_restantes: result.proxima_insistencia_en_h ?? null,
      };
    }

    revalidarSolicitudes();
    return {
      success: true,
      message: 'Insistencia registrada. Se notificó al equipo responsable.',
      horas_restantes: result.proxima_insistencia_en_h ?? null,
    };
  } catch (err: unknown) {
    return { success: false, error: mensajeErrorUsuario(err, 'Error inesperado') };
  }
}

/** Horas restantes de cooldown del Ejecutivo para una solicitud (`null` = puede). */
export async function getCooldownInsistenciaAction(solicitudId: string) {
  try {
    const profile = await requireProfile();
    if (profile.rol !== 'ejecutivo') return { horas_restantes: null, ultima: null };
    return await SolicitudesService.getCooldownInsistencia(solicitudId, profile.id);
  } catch {
    return { horas_restantes: null, ultima: null };
  }
}

/** Historial de insistencias de una solicitud. */
export async function getInsistenciasAction(solicitudId: string) {
  try {
    const profile = await requireProfile();
    await requireSolicitudAccess(profile, solicitudId);
    return await SolicitudesService.getInsistencias(solicitudId);
  } catch {
    return [];
  }
}

export async function subirDocumentosSolicitudAction(solicitudId: string, formData: FormData) {
  try {
    if (!solicitudId) return { success: false, error: 'Solicitud inválida.' };
    const profile = await requireProfile();
    await requireSolicitudAccess(profile, solicitudId);

    const archivos = formData.getAll('archivos') as File[];
    if (!archivos.length) return { success: false, error: 'No se seleccionaron archivos.' };

    const preparados = await Promise.all(
      archivos.map(async (f) => ({
        nombre: f.name,
        tipo: f.type,
        tamano: f.size,
        buffer: await f.arrayBuffer(),
      }))
    );

    const result = await SolicitudesService.subirDocumentos(solicitudId, profile.id, preparados);
    if (!result.success) return { success: false, error: result.error };

    return { success: true, message: 'Documentos subidos correctamente.' };
  } catch (err: unknown) {
    return { success: false, error: mensajeErrorUsuario(err, 'Error inesperado al subir documentos') };
  }
}

export async function getDocumentosSolicitudAction(solicitudId: string) {
  try {
    const profile = await requireProfile();
    await requireSolicitudAccess(profile, solicitudId);
    return await SolicitudesService.getDocumentos(solicitudId);
  } catch {
    return [];
  }
}

export async function eliminarDocumentoSolicitudAction(documentoId: string) {
  try {
    if (!documentoId) return { success: false, error: 'Documento inválido.' };
    const profile = await requireProfile();
    // Brecha 006: además del rol, alcance sobre la solicitud del documento.
    await requireDocumentoAccess(profile, documentoId);
    return await SolicitudesService.eliminarDocumento(documentoId, profile.id, profile.rol);
  } catch (err: unknown) {
    return { success: false, error: mensajeErrorUsuario(err, 'Error inesperado al eliminar el documento') };
  }
}

export async function descargarDocumentoSolicitudAction(documentoId: string) {
  try {
    if (!documentoId) return { success: false, error: 'Documento inválido.' };
    const profile = await requireProfile();
    await requireDocumentoAccess(profile, documentoId);
    return await SolicitudesService.getURLDescarga(documentoId);
  } catch (err: unknown) {
    return { success: false, error: mensajeErrorUsuario(err, 'Error inesperado al generar la descarga') };
  }
}
