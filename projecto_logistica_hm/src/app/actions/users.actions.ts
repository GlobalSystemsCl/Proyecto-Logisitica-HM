'use server';

import { AuthService } from '@/services/auth.service';
import { UsersService } from '@/services/users.service';
import { CreateUserInput, UserRole } from '@/types/auth.types';
import { revalidatePath } from 'next/cache';

async function verifyAdminPermission() {
  const profile = await AuthService.getCurrentUserProfile();
  if (!profile || profile.rol !== 'administrador' || !profile.activo) {
    throw new Error('Acceso no autorizado. Se requieren permisos de Administrador.');
  }
  return profile;
}

export interface CreateUserData {
  nombre: string;
  apellido: string;
  email: string;
  rol: UserRole;
  password?: string;
}

export async function createUserAction(data: CreateUserData) {
  try {
    await verifyAdminPermission();

    const { nombre, apellido, email, rol, password } = data;

    if (!nombre?.trim() || !apellido?.trim() || !email?.trim() || !rol) {
      return {
        success: false,
        error: 'Todos los campos marcados son obligatorios.',
      };
    }

    const input: CreateUserInput = {
      nombre: nombre.trim(),
      apellido: apellido.trim(),
      email: email.trim().toLowerCase(),
      rol,
    };

    const result = await UsersService.createUser(input, password);

    if (!result.success) {
      return {
        success: false,
        error: result.error || 'Error al crear el usuario.',
      };
    }

    revalidatePath('/admin/usuarios');
    return {
      success: true,
      message: result.emailSent
        ? `Usuario ${input.email} creado y credenciales enviadas a su correo vía Brevo.`
        : `Usuario ${input.email} creado exitosamente.`,
      email: input.email,
      tempPassword: result.tempPassword,
      emailSent: result.emailSent,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error inesperado';
    return { success: false, error: msg };
  }
}

export async function toggleUserStatusAction(userId: string, nuevoEstado: boolean) {
  try {
    const admin = await verifyAdminPermission();
    const result = await UsersService.toggleUserStatus(userId, nuevoEstado, admin.id);

    if (!result.success) {
      return { success: false, error: result.error };
    }

    revalidatePath('/admin/usuarios');
    return { success: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error al cambiar estado';
    return { success: false, error: msg };
  }
}

export async function resetUserPasswordAction(userId: string, email: string) {
  try {
    await verifyAdminPermission();
    const result = await UsersService.resetUserPassword(userId);

    if (!result.success) {
      return { success: false, error: result.error };
    }

    revalidatePath('/admin/usuarios');
    return {
      success: true,
      message: result.emailSent
        ? `Nueva contraseña enviada exitosamente a ${email} vía Brevo.`
        : `Nueva contraseña provisoria generada para ${email}.`,
      email,
      tempPassword: result.tempPassword,
      emailSent: result.emailSent,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error al generar nueva contraseña';
    return { success: false, error: msg };
  }
}
