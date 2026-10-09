'use server';

import { requireProfile, requireRole } from '@/lib/auth/guards';
import { mensajeErrorUsuario } from '@/lib/errores';
import { VehiculoService } from '@/services/vehiculo.service';
import { SolicitudesService } from '@/services/solicitudes.service';
import { accionCambioVehiculo, diferenciasVehiculo, resumenVehiculo } from '@/lib/auditoriaVehiculo';
import { randomUUID } from 'crypto';
import { CreateVehiculoInput, UpdateVehiculoInput } from '@/types/vehiculo.types';
import { revalidatePath } from 'next/cache';

async function verifyVehiculoPermission() {
  const profile = await requireProfile();
  requireRole(
    profile,
    ['administrador', 'jefe_local', 'logistica', 'operaciones'],
    'No tienes permisos para gestionar vehículos.'
  );
  return profile;
}

/**
 * R2: registra en la auditoría un cambio del inventario con su autor. Es
 * best-effort como el resto de la auditoría: un fallo no revierte la operación.
 */
async function auditarVehiculo(
  usuarioId: string,
  entidadId: string,
  accion: string,
  anterior: unknown,
  nuevo: unknown
): Promise<void> {
  await SolicitudesService.registrarAuditoria(usuarioId, 'vehiculo', entidadId, accion, anterior, nuevo);
}

export async function createVehiculoAction(data: CreateVehiculoInput) {
  try {
    const profile = await verifyVehiculoPermission();

    if (
      !data.chasis?.trim() ||
      !data.marca?.trim() ||
      !data.modelo?.trim() ||
      !data.anio
    ) {
      return {
        success: false,
        error: 'Todos los campos marcados son obligatorios (la patente es opcional).',
      };
    }

    const result = await VehiculoService.createVehiculo(data);

    if (!result.success) {
      return { success: false, error: result.error };
    }

    if (result.vehiculo?.id) {
      await auditarVehiculo(profile.id, result.vehiculo.id, 'creacion', null, resumenVehiculo(result.vehiculo));
    }

    revalidatePath('/admin/vehiculos');
    return {
      success: true,
      message: `Vehículo ${result.vehiculo?.marca} ${result.vehiculo?.modelo} registrado exitosamente.`,
      vehiculo: result.vehiculo,
    };
  } catch (err: unknown) {
    const msg = mensajeErrorUsuario(err, 'Error inesperado');
    return { success: false, error: msg };
  }
}

export async function updateVehiculoAction(id: string, data: UpdateVehiculoInput) {
  try {
    const profile = await verifyVehiculoPermission();

    const anterior = await VehiculoService.getVehiculoById(id);
    const result = await VehiculoService.updateVehiculo(id, data);

    if (!result.success) {
      return { success: false, error: result.error };
    }

    const cambios = diferenciasVehiculo(anterior, result.vehiculo);
    if (cambios) {
      await auditarVehiculo(profile.id, id, accionCambioVehiculo(cambios), cambios.anterior, cambios.nuevo);
    }

    revalidatePath('/admin/vehiculos');
    return {
      success: true,
      message: 'Vehículo actualizado exitosamente.',
      vehiculo: result.vehiculo,
    };
  } catch (err: unknown) {
    const msg = mensajeErrorUsuario(err, 'Error inesperado');
    return { success: false, error: msg };
  }
}

export async function deleteVehiculoAction(id: string) {
  try {
    const profile = await verifyVehiculoPermission();

    if (profile.rol !== 'administrador') {
      return {
        success: false,
        error: 'Solo los administradores pueden eliminar vehículos.',
      };
    }

    const anterior = await VehiculoService.getVehiculoById(id);
    const result = await VehiculoService.deleteVehiculo(id);

    if (!result.success) {
      return { success: false, error: result.error };
    }

    await auditarVehiculo(profile.id, id, 'eliminacion', resumenVehiculo(anterior), null);

    revalidatePath('/admin/vehiculos');
    return {
      success: true,
      message: 'Vehículo eliminado exitosamente.',
    };
  } catch (err: unknown) {
    const msg = mensajeErrorUsuario(err, 'Error inesperado');
    return { success: false, error: msg };
  }
}

export interface ImportVehiculosData {
  csv: string;
  anioPorDefecto?: number;
}

export async function importVehiculosAction(data: ImportVehiculosData) {
  try {
    const profile = await verifyVehiculoPermission();

    if (!data.csv?.trim()) {
      return { success: false, error: 'Debes pegar o subir el contenido CSV del stock.' };
    }

    const result = await VehiculoService.importVehiculosCSV(data.csv, {
      anioPorDefecto: data.anioPorDefecto,
    });

    if (!result.success && !result.importados) {
      return { success: false, error: result.error || result.mensaje || 'Error al importar.' };
    }

    // Un registro por importación (no uno por vehículo, para no saturar la auditoría).
    await auditarVehiculo(profile.id, randomUUID(), 'importacion', null, {
      total: result.total ?? 0,
      importados: result.importados ?? 0,
      duplicados: result.duplicados ?? 0,
      errores: result.errores ?? 0,
    });

    revalidatePath('/admin/vehiculos');
    return {
      success: true,
      mensaje: result.mensaje,
      total: result.total,
      importados: result.importados,
      duplicados: result.duplicados,
      errores: result.errores,
      marcasProcesadas: result.marcasProcesadas,
    };
  } catch (err: unknown) {
    const msg = mensajeErrorUsuario(err, 'Error inesperado');
    return { success: false, error: msg };
  }
}
