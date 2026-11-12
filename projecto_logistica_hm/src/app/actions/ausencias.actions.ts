'use server';

import { revalidatePath } from 'next/cache';
import { requireProfile, requireRole } from '@/lib/auth/guards';
import { mensajeErrorUsuario } from '@/lib/errores';
import { hoyChile } from '@/lib/ausencias';
import { AusenciaService } from '@/services/ausencia.service';

const MENSAJE_SOLO_ADMIN = 'Solo el administrador gestiona las ausencias de Logística.';
const RUTA = '/admin/ausencias';

export interface AusenciaFormData {
  titularId: string;
  sustitutoId: string;
  desde: string;
  hasta: string;
  motivo?: string | null;
}

/**
 * R9: registra una ausencia de Logística. Si empieza hoy (o antes), se inicia
 * de inmediato: cuenta congelada, traspasos y zonas al sustituto.
 */
export async function crearAusenciaAction(datos: AusenciaFormData) {
  try {
    const profile = await requireProfile();
    requireRole(profile, ['administrador'], MENSAJE_SOLO_ADMIN);
    const res = await AusenciaService.crear(datos, profile.id, hoyChile());
    if (res.success) revalidatePath(RUTA);
    return res;
  } catch (err: unknown) {
    return { success: false, error: mensajeErrorUsuario(err, 'Error inesperado') };
  }
}

/** Cancela una ausencia programada o termina ahora una en curso. */
export async function cancelarAusenciaAction(id: string) {
  try {
    const profile = await requireProfile();
    requireRole(profile, ['administrador'], MENSAJE_SOLO_ADMIN);
    const res = await AusenciaService.cancelar(id, profile.id);
    if (res.success) revalidatePath(RUTA);
    return res;
  } catch (err: unknown) {
    return { success: false, error: mensajeErrorUsuario(err, 'Error inesperado') };
  }
}
