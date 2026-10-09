'use server';

import { requireProfile } from '@/lib/auth/guards';
import { mensajeErrorUsuario } from '@/lib/errores';
import { revalidarSolicitudes } from '@/lib/rutas';
import { TrasladoService } from '@/services/traslado.service';
import { OrganizacionService } from '@/services/organizacion.service';
import { SucursalesService } from '@/services/sucursales.service';
import { UserProfile } from '@/types/auth.types';
import type { CreateTrasladoInput } from '@/types/traslado.types';
import type { DatosRecepcion } from '@/lib/recepcion';
import { NotificacionService } from '@/services/notificacion.service';
import { enSegundoPlano } from '@/lib/segundoPlano';

async function getProfileOrThrow(): Promise<UserProfile> {
  return requireProfile();
}

function esLogistica(profile: UserProfile): boolean {
  return profile.rol === 'administrador' || profile.rol === 'logistica';
}

/**
 * Crea un traslado interno entre sucursales moviendo vehículos YA VENDIDOS.
 * Solo Logística / Administrador. Los slots del destino se reservan en BD.
 */
export async function crearTrasladoAction(
  input: CreateTrasladoInput,
  vehiculoIds: string[]
) {
  try {
    const profile = await getProfileOrThrow();

    if (!esLogistica(profile)) {
      return { success: false, error: 'Solo Logística o el Administrador pueden crear traslados internos.' };
    }

    const result = await TrasladoService.crearTraslado(input, vehiculoIds, profile.id);
    if (!result.success) return { success: false, error: result.error };

    revalidarSolicitudes();
    return { success: true, message: 'Traslado interno creado.', traslado: result.traslado };
  } catch (err: unknown) {
    const msg = mensajeErrorUsuario(err, 'Error inesperado');
    return { success: false, error: msg };
  }
}

/** Logística despacha el traslado: pendiente -> en tránsito. */
export async function despacharTrasladoAction(trasladoId: string) {
  try {
    const profile = await getProfileOrThrow();

    if (!esLogistica(profile)) {
      return { success: false, error: 'Solo Logística o el Administrador pueden despachar traslados.' };
    }

    const result = await TrasladoService.despacharTraslado(trasladoId, profile.id);
    if (!result.success) return { success: false, error: result.error };

    revalidarSolicitudes();
    return { success: true, message: 'Traslado despachado.' };
  } catch (err: unknown) {
    const msg = mensajeErrorUsuario(err, 'Error inesperado');
    return { success: false, error: msg };
  }
}

/**
 * El JL de la sucursal destino recepciona el traslado.
 * No existe acción de rechazo: el JL solo puede recepcionar.
 */
export async function recibirTrasladoAction(trasladoId: string, recepcion?: DatosRecepcion) {
  try {
    const profile = await getProfileOrThrow();

    if (!esLogistica(profile) && profile.rol !== 'jefe_local') {
      return { success: false, error: 'No tienes permisos para recepcionar traslados.' };
    }

    const result = await TrasladoService.recibirTraslado(trasladoId, profile.id, recepcion);
    if (!result.success) return { success: false, error: result.error };

    revalidarSolicitudes();
    return { success: true, message: 'Traslado recepcionado en destino.' };
  } catch (err: unknown) {
    const msg = mensajeErrorUsuario(err, 'Error inesperado');
    return { success: false, error: msg };
  }
}

/**
 * R8: Logística cancela un traslado interno en tránsito con un motivo e indica
 * dónde queda el vehículo (`null` = sin ubicación asignada).
 */
export async function cancelarTrasladoAction(trasladoId: string, motivo: string, ubicacionId: number | null) {
  try {
    const profile = await getProfileOrThrow();
    if (profile.rol !== 'logistica') {
      return { success: false, error: 'Solo Logística puede cancelar un traslado en tránsito.' };
    }

    const result = await TrasladoService.cancelarTraslado(trasladoId, profile.id, motivo, ubicacionId);
    if (!result.success) return { success: false, error: result.error };

    enSegundoPlano(async () => {
      const ubicacion = ubicacionId ? await OrganizacionService.getBranch(ubicacionId) : null;
      await NotificacionService.notificarTrasladoInterno('traslado_interno_cancelado', trasladoId, profile.id, {
        motivo: motivo.trim(),
        ubicacionFinal: ubicacion?.nombre ?? null,
      });
    });
    revalidarSolicitudes();
    return { success: true, message: 'Traslado cancelado. Se registró el motivo y la ubicación del vehículo.' };
  } catch (err: unknown) {
    const msg = mensajeErrorUsuario(err, 'Error inesperado');
    return { success: false, error: msg };
  }
}

/** Traslados visibles para el usuario según su rol. */
export async function getTrasladosAction() {
  try {
    const profile = await getProfileOrThrow();

    if (esLogistica(profile)) {
      return await TrasladoService.getTrasladosByLogistica(profile.id);
    }

    if (profile.rol === 'jefe_local') {
      const sucursales = await OrganizacionService.getUserAssignedBranches(profile.id);
      const unicos = [...new Set(sucursales.map((s) => s.id))];
      const listas = await Promise.all(
        unicos.map((sid) => TrasladoService.getTrasladosByDestinoSucursal(sid))
      );
      const todas = listas.flat();
      const porId = new Map(todas.map((t) => [t.id, t]));
      return [...porId.values()].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    }

    return [];
  } catch (err) {
    console.error('Error en getTrasladosAction:', err);
    return [];
  }
}

/** Vehículos para un traslado interno (listado completo, con búsqueda, filtros y paginación). */
export async function getVehiculosParaTrasladoAction(
  q?: string,
  page?: number,
  pageSize?: number,
  opciones?: { sucursalId?: number | null; marca?: string | null }
) {
  try {
    const profile = await getProfileOrThrow();
    if (!esLogistica(profile)) {
      return { vehiculos: [], total: 0, page: 1, pageSize: 12, totalPages: 0 };
    }
    return await TrasladoService.getVehiculosParaTraslado(q, page, pageSize, opciones);
  } catch {
    return { vehiculos: [], total: 0, page: 1, pageSize: 12, totalPages: 0 };
  }
}

/** Sucursales con su capacidad de slots, para el formulario de traslado. */
export async function getSucursalesTrasladoAction() {
  try {
    const profile = await getProfileOrThrow();
    if (!esLogistica(profile) && profile.rol !== 'jefe_local') return [];
    return await SucursalesService.getSucursales();
  } catch {
    return [];
  }
}
