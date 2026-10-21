'use server';

import { requireProfile, requireRole } from '@/lib/auth/guards';
import { mensajeErrorUsuario } from '@/lib/errores';
import { UsersService } from '@/services/users.service';
import { CreateUserInput, UserRole } from '@/types/auth.types';
import type { AsignacionMasiva } from '@/lib/activacionMasiva';
import { SucursalesService } from '@/services/sucursales.service';
import { OrganizacionService } from '@/services/organizacion.service';
import { getDominiosPermitidos } from '@/lib/dominios';
import { sucursalesOcupadasPorJefes } from '@/lib/asignaciones';
import {
  TAMANO_LOTE_IMPORTACION,
  inputDesdeFila,
  validarFilasImportacion,
  type FilaPlantilla,
} from '@/lib/importUsuarios';

export interface ResultadoFilaImportacion {
  fila: number;
  email: string;
  ok: boolean;
  error?: string;
  /** Solo si el correo con las credenciales no se pudo enviar (brecha 013). */
  tempPassword?: string;
}
import { revalidatePath } from 'next/cache';

async function verifyAdminPermission() {
  const profile = await requireProfile();
  requireRole(profile, ['administrador'], 'Acceso no autorizado. Se requieren permisos de Administrador.');
  return profile;
}

export interface CreateUserData {
  nombre: string;
  apellido: string;
  email: string;
  rol: UserRole;
  password?: string;
  sucursal_id?: number | null;
  sucursales_ids?: number[];
  zonas_ids?: number[];
}

export async function createUserAction(data: CreateUserData) {
  try {
    await verifyAdminPermission();

    const { nombre, apellido, email, rol, password, sucursal_id, sucursales_ids, zonas_ids } = data;

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
      sucursal_id: sucursal_id ?? null,
      sucursales_ids: sucursales_ids || [],
      zonas_ids: rol === 'logistica' ? zonas_ids || [] : [],
    };

    const result = await UsersService.createUser(input, password);

    if (!result.success) {
      return {
        success: false,
        error: result.error || 'Error al crear el usuario.',
      };
    }

    revalidatePath('/admin/usuarios');
    revalidatePath('/admin/zonas');
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
    const msg = mensajeErrorUsuario(err, 'Error inesperado');
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
    const msg = mensajeErrorUsuario(err, 'Error al cambiar estado');
    return { success: false, error: msg };
  }
}

export async function approveUserAction(userId: string) {
  try {
    await verifyAdminPermission();
    const result = await UsersService.approveUser(userId);

    if (!result.success) {
      return { success: false, error: result.error };
    }

    revalidatePath('/admin/usuarios');
    return { success: true, message: 'Usuario autorizado para ingresar al sistema.' };
  } catch (err: unknown) {
    const msg = mensajeErrorUsuario(err, 'Error al autorizar usuario');
    return { success: false, error: msg };
  }
}

/** Fase F: activa varias cuentas pendientes con un rol y sucursal en común. */
export async function approveUsersBulkAction(ids: string[], asignacion: AsignacionMasiva) {
  try {
    await verifyAdminPermission();
    const result = await UsersService.activarCuentasMasivo(ids, asignacion);
    if (result.activadas.length > 0) revalidatePath('/admin/usuarios');
    return result;
  } catch (err: unknown) {
    return { success: false, activadas: [], fallidas: [], error: mensajeErrorUsuario(err, 'Error al activar las cuentas') };
  }
}

/**
 * Fase F: crea un lote de cuentas desde la carga masiva (máximo
 * `TAMANO_LOTE_IMPORTACION` filas por llamada; el navegador envía los lotes
 * de a uno). Vuelve a validar cada fila con los datos actuales y crea las
 * válidas con `createUser`, que envía las credenciales por correo.
 */
export async function importUsuariosAction(filas: FilaPlantilla[]) {
  try {
    await verifyAdminPermission();
    if (!Array.isArray(filas) || filas.length === 0) {
      return { success: false, error: 'No hay filas para importar.', resultados: [] as ResultadoFilaImportacion[] };
    }
    if (filas.length > TAMANO_LOTE_IMPORTACION) {
      return {
        success: false,
        error: `Envía como máximo ${TAMANO_LOTE_IMPORTACION} filas por lote.`,
        resultados: [] as ResultadoFilaImportacion[],
      };
    }

    const [usuarios, sucursales, zonas] = await Promise.all([
      UsersService.getUsers(),
      SucursalesService.getSucursales(),
      OrganizacionService.getZonas(),
    ]);
    const validadas = validarFilasImportacion(filas, {
      sucursales,
      zonas,
      emailsExistentes: new Set(usuarios.map((u) => u.email.toLowerCase())),
      sucursalesConJefe: sucursalesOcupadasPorJefes(
        usuarios.map((u) => ({ id: u.id, nombre: `${u.nombre} ${u.apellido}`.trim(), rol: u.rol, sucursal_id: u.sucursal_id, sucursales: u.sucursales }))
      ),
      dominios: getDominiosPermitidos(),
    });

    const resultados: ResultadoFilaImportacion[] = [];
    for (const fila of validadas) {
      if (fila.errores.length > 0) {
        resultados.push({ fila: fila.fila, email: fila.email, ok: false, error: fila.errores.join(' ') });
        continue;
      }
      const res = await UsersService.createUser(inputDesdeFila(fila));
      resultados.push(
        res.success
          ? { fila: fila.fila, email: fila.email, ok: true, tempPassword: res.tempPassword }
          : { fila: fila.fila, email: fila.email, ok: false, error: res.error ?? 'No se pudo crear la cuenta.' }
      );
    }

    if (resultados.some((r) => r.ok)) {
      revalidatePath('/admin/usuarios');
      revalidatePath('/admin/zonas');
    }
    return { success: true, resultados };
  } catch (err: unknown) {
    return { success: false, error: mensajeErrorUsuario(err, 'Error al importar usuarios'), resultados: [] as ResultadoFilaImportacion[] };
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
    const msg = mensajeErrorUsuario(err, 'Error al generar nueva contraseña');
    return { success: false, error: msg };
  }
}

export interface UpdateUserData {
  userId: string;
  nombre: string;
  apellido: string;
  rol: UserRole;
  sucursal_id?: number | null;
  sucursales_ids?: number[];
  zonas_ids?: number[];
}

export async function updateUserAction(data: UpdateUserData) {
  try {
    await verifyAdminPermission();

    const { userId, nombre, apellido, rol, sucursal_id, sucursales_ids, zonas_ids } = data;

    if (!userId || !nombre?.trim() || !apellido?.trim() || !rol) {
      return {
        success: false,
        error: 'Todos los campos marcados son obligatorios.',
      };
    }

    const result = await UsersService.updateUser(userId, {
      nombre: nombre.trim(),
      apellido: apellido.trim(),
      rol,
      sucursal_id: sucursal_id ?? null,
      sucursales_ids: sucursales_ids || [],
      zonas_ids: rol === 'logistica' ? zonas_ids || [] : [],
    });

    if (!result.success) {
      return { success: false, error: result.error || 'Error al actualizar usuario.' };
    }

    revalidatePath('/admin/usuarios');
    revalidatePath('/admin/zonas');
    return { success: true, message: 'Usuario actualizado exitosamente.' };
  } catch (err: unknown) {
    const msg = mensajeErrorUsuario(err, 'Error inesperado');
    return { success: false, error: msg };
  }
}
