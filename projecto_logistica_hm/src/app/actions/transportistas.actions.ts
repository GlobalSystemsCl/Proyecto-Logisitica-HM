'use server';

import { requireProfile, requireRole } from '@/lib/auth/guards';
import { mensajeErrorUsuario } from '@/lib/errores';
import { TransportistaService } from '@/services/transportista.service';
import { revalidatePath } from 'next/cache';
import type { EmpresaTransporte, Transportista } from '@/types/transportista.types';

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
    const res = await TransportistaService.crear(nombre, rut, profile.id);
    if (res.success) revalidatePath(RUTA_GESTION);
    return res;
  } catch (err: unknown) {
    return { success: false, error: mensajeErrorUsuario(err, 'Error inesperado') };
  }
}

const RUTA_GESTION = '/logistica/transportistas';

/** R10: empresas de transporte con sus camiones (pantalla de gestión). */
export async function listarEmpresasTransporteAction(): Promise<EmpresaTransporte[]> {
  try {
    const profile = await requireProfile();
    requireRole(profile, ['logistica', 'administrador'], MENSAJE_SOLO_LOGISTICA);
    return await TransportistaService.listarEmpresas();
  } catch (err: unknown) {
    console.error('Error en listarEmpresasTransporteAction:', err);
    return [];
  }
}

/** Cambia el nombre o activa/desactiva una empresa de transporte. */
export async function actualizarEmpresaTransporteAction(id: string, cambios: { nombre?: string; activo?: boolean }) {
  try {
    const profile = await requireProfile();
    requireRole(profile, ['logistica', 'administrador'], MENSAJE_SOLO_LOGISTICA);
    const res = await TransportistaService.actualizarEmpresa(id, cambios);
    if (res.success) revalidatePath(RUTA_GESTION);
    return res;
  } catch (err: unknown) {
    return { success: false, error: mensajeErrorUsuario(err, 'Error inesperado') };
  }
}

/** Registra un camión (patente y transportista habitual) de una empresa. */
export async function crearCamionAction(transportistaId: string, patente: string, conductorNombre: string | null) {
  try {
    const profile = await requireProfile();
    requireRole(profile, ['logistica', 'administrador'], MENSAJE_SOLO_LOGISTICA);
    const res = await TransportistaService.crearCamion(transportistaId, patente, conductorNombre, profile.id);
    if (res.success) revalidatePath(RUTA_GESTION);
    return res;
  } catch (err: unknown) {
    return { success: false, error: mensajeErrorUsuario(err, 'Error inesperado') };
  }
}

/** Cambia el transportista habitual o activa/desactiva un camión. */
export async function actualizarCamionAction(id: string, cambios: { conductorNombre?: string | null; activo?: boolean }) {
  try {
    const profile = await requireProfile();
    requireRole(profile, ['logistica', 'administrador'], MENSAJE_SOLO_LOGISTICA);
    const res = await TransportistaService.actualizarCamion(id, cambios);
    if (res.success) revalidatePath(RUTA_GESTION);
    return res;
  } catch (err: unknown) {
    return { success: false, error: mensajeErrorUsuario(err, 'Error inesperado') };
  }
}
