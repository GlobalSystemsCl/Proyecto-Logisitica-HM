'use server';

import { revalidatePath } from 'next/cache';
import { AuthService } from '@/services/auth.service';
import { TrasladoService } from '@/services/traslado.service';
import { OrganizacionService } from '@/services/organizacion.service';
import { SucursalesService } from '@/services/sucursales.service';
import { UserProfile } from '@/types/auth.types';
import type { CreateTrasladoInput } from '@/types/traslado.types';

async function getProfileOrThrow(): Promise<UserProfile> {
  const profile = await AuthService.getCurrentUserProfile();
  if (!profile || !profile.activo) {
    throw new Error('Sesión inválida o usuario inactivo.');
  }
  return profile;
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

    revalidatePath('/solicitudes/traslados');
    return { success: true, message: 'Traslado interno creado.', traslado: result.traslado };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error inesperado';
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

    revalidatePath('/solicitudes/traslados');
    return { success: true, message: 'Traslado despachado.' };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error inesperado';
    return { success: false, error: msg };
  }
}

/**
 * El JL de la sucursal destino recepciona el traslado.
 * No existe acción de rechazo: el JL solo puede recepcionar.
 */
export async function recibirTrasladoAction(trasladoId: string) {
  try {
    const profile = await getProfileOrThrow();

    if (!esLogistica(profile) && profile.rol !== 'jefe_local') {
      return { success: false, error: 'No tienes permisos para recepcionar traslados.' };
    }

    const result = await TrasladoService.recibirTraslado(trasladoId, profile.id);
    if (!result.success) return { success: false, error: result.error };

    revalidatePath('/solicitudes/traslados');
    return { success: true, message: 'Traslado recepcionado en destino.' };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error inesperado';
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

/** Vehículos ya vendidos disponibles para un traslado interno. */
export async function getVehiculosParaTrasladoAction() {
  try {
    const profile = await getProfileOrThrow();
    if (!esLogistica(profile)) return [];
    return await TrasladoService.getVehiculosParaTraslado();
  } catch {
    return [];
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
