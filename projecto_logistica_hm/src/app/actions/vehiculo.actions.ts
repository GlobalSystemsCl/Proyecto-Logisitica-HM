'use server';

import { AuthService } from '@/services/auth.service';
import { VehiculoService } from '@/services/vehiculo.service';
import { CreateVehiculoInput, UpdateVehiculoInput } from '@/types/vehiculo.types';
import { revalidatePath } from 'next/cache';

async function verifyVehiculoPermission() {
  const profile = await AuthService.getCurrentUserProfile();
  if (!profile || !profile.activo) {
    throw new Error('Acceso no autorizado. Se requiere una cuenta activa.');
  }
  const allowedRoles = ['administrador', 'jefe_local', 'logistica'];
  if (!allowedRoles.includes(profile.rol)) {
    throw new Error('No tienes permisos para gestionar vehículos.');
  }
  return profile;
}

export async function createVehiculoAction(data: CreateVehiculoInput) {
  try {
    await verifyVehiculoPermission();

    if (!data.chasis?.trim() || !data.patente?.trim() || !data.marca?.trim() || !data.modelo?.trim() || !data.anio) {
      return {
        success: false,
        error: 'Todos los campos marcados son obligatorios.',
      };
    }

    const result = await VehiculoService.createVehiculo(data);

    if (!result.success) {
      return { success: false, error: result.error };
    }

    revalidatePath('/admin/vehiculos');
    return {
      success: true,
      message: `Vehículo ${result.vehiculo?.marca} ${result.vehiculo?.modelo} registrado exitosamente.`,
      vehiculo: result.vehiculo,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error inesperado';
    return { success: false, error: msg };
  }
}

export async function updateVehiculoAction(id: string, data: UpdateVehiculoInput) {
  try {
    await verifyVehiculoPermission();

    const result = await VehiculoService.updateVehiculo(id, data);

    if (!result.success) {
      return { success: false, error: result.error };
    }

    revalidatePath('/admin/vehiculos');
    return {
      success: true,
      message: 'Vehículo actualizado exitosamente.',
      vehiculo: result.vehiculo,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error inesperado';
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

    const result = await VehiculoService.deleteVehiculo(id);

    if (!result.success) {
      return { success: false, error: result.error };
    }

    revalidatePath('/admin/vehiculos');
    return {
      success: true,
      message: 'Vehículo eliminado exitosamente.',
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error inesperado';
    return { success: false, error: msg };
  }
}
