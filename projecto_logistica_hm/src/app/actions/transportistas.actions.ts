'use server';

import { requireProfile, requireRole } from '@/lib/auth/guards';
import { mensajeErrorUsuario } from '@/lib/errores';
import { TransportistaService } from '@/services/transportista.service';
import type { Transportista } from '@/types/transportista.types';

const MENSAJE_SOLO_LOGISTICA = 'Solo Logística o el Administrador gestionan transportistas.';

/** Transportistas activos para elegir al programar un traslado. */
export async function getTransportistasAction(): Promise<Transportista[]> {
  try {
    const profile = await requireProfile();
    requireRole(profile, ['logistica', 'administrador'], MENSAJE_SOLO_LOGISTICA);
    return await TransportistaService.listarActivos();
  } catch (err: unknown) {
    console.error('Error en getTransportistasAction:', err);
    return [];
  }
}

/** Registra un transportista nuevo (nombre y RUT). */
export async function crearTransportistaAction(nombre: string, rut: string) {
  try {
    const profile = await requireProfile();
    requireRole(profile, ['logistica', 'administrador'], MENSAJE_SOLO_LOGISTICA);
    return await TransportistaService.crear(nombre, rut, profile.id);
  } catch (err: unknown) {
    return { success: false, error: mensajeErrorUsuario(err, 'Error inesperado') };
  }
}
