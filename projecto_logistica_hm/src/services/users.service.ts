import { createAdminClient } from '@/lib/supabase/admin';
import { CreateUserInput, UpdateUserInput, UserProfile, UsuarioDetalle } from '@/types/auth.types';
import { EmailService } from '@/services/email.service';

export class UsersService {
  /**
   * Genera una contraseña provisoria segura de 10 caracteres
   */
  static generateTempPassword(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$';
    let pass = 'HM-';
    for (let i = 0; i < 7; i++) {
      pass += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return pass;
  }

  /**
   * Obtiene la lista completa de usuarios
   */
  static async getUsers(): Promise<UserProfile[]> {
    try {
      const admin = createAdminClient();
      const { data, error } = await admin
        .from('usuario')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error al listar usuarios:', error);
        return [];
      }

      return (data || []) as UserProfile[];
    } catch (err) {
      console.error('Error en getUsers:', err);
      return [];
    }
  }

  /**
   * Crea un nuevo usuario con contraseña provisoria de acceso, guarda en BD y envía el correo con Brevo
   */
  static async createUser(
    input: CreateUserInput,
    customPassword?: string
  ): Promise<{
    success: boolean;
    user?: UserProfile;
    tempPassword?: string;
    emailSent?: boolean;
    error?: string;
  }> {
    try {
      const admin = createAdminClient();
      const cleanEmail = input.email.trim().toLowerCase();
      const tempPassword = customPassword?.trim() || this.generateTempPassword();

      // 1. Verificar si ya existe en la base de datos
      const { data: existing } = await admin
        .from('usuario')
        .select('id, email')
        .eq('email', cleanEmail)
        .maybeSingle();

      if (existing) {
        return {
          success: false,
          error: `Ya existe un usuario registrado con el correo ${cleanEmail}.`,
        };
      }

      // 2. Crear usuario en Supabase Auth con la contraseña provisoria
      const { data: createData, error: createError } = await admin.auth.admin.createUser({
        email: cleanEmail,
        password: tempPassword,
        email_confirm: true,
        user_metadata: {
          nombre: input.nombre.trim(),
          apellido: input.apellido.trim(),
          rol: input.rol,
          requiere_cambio_clave: true,
        },
      });

      if (createError) {
        return {
          success: false,
          error: `Error al crear el usuario en Auth: ${createError.message}`,
        };
      }

      const authUserId = createData.user.id;

      // 3. Crear el registro en public.usuario con requiere_cambio_clave = true
      const newProfile = {
        id: authUserId,
        email: cleanEmail,
        nombre: input.nombre.trim(),
        apellido: input.apellido.trim(),
        rol: input.rol,
        activo: true,
        requiere_cambio_clave: true,
        intentos_fallidos: 0,
        bloqueado_hasta: null,
        sucursal_id: input.sucursal_id || null,
      };

      const { data: userProfile, error: dbError } = await admin
        .from('usuario')
        .upsert(newProfile)
        .select()
        .single();

      if (dbError) {
        console.error('Error al insertar en public.usuario:', dbError);
        return {
          success: false,
          error: `Usuario creado en Auth pero falló el registro en base de datos: ${dbError.message}`,
        };
      }

      // 4. Si es jefe_local con sucursal asignada, vincularlo como encargado de la sucursal
      if (input.rol === 'jefe_local' && input.sucursal_id) {
        await admin
          .from('sucursal')
          .update({ usuario_id: authUserId })
          .eq('id', input.sucursal_id);
      }

      // 5. Enviar correo con credenciales a través de Brevo
      const emailResult = await EmailService.sendUserCredentialsEmail({
        toEmail: cleanEmail,
        recipientName: `${input.nombre.trim()} ${input.apellido.trim()}`,
        tempPassword,
        role: input.rol,
      });

      return {
        success: true,
        user: userProfile as UserProfile,
        tempPassword,
        emailSent: emailResult.success,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error inesperado al crear usuario';
      return { success: false, error: msg };
    }
  }

  /**
   * Genera y asigna una nueva contraseña provisoria a un usuario existente y envía el correo con Brevo
   */
  static async resetUserPassword(userId: string): Promise<{
    success: boolean;
    tempPassword?: string;
    emailSent?: boolean;
    error?: string;
  }> {
    try {
      const admin = createAdminClient();
      const tempPassword = this.generateTempPassword();

      // Obtener datos del usuario
      const { data: user, error: fetchError } = await admin
        .from('usuario')
        .select('*')
        .eq('id', userId)
        .single();

      if (fetchError || !user) {
        return { success: false, error: 'Usuario no encontrado en el sistema.' };
      }

      // Actualizar en Supabase Auth
      const { error: authError } = await admin.auth.admin.updateUserById(userId, {
        password: tempPassword,
        user_metadata: {
          requiere_cambio_clave: true,
        },
      });

      if (authError) {
        return { success: false, error: authError.message };
      }

      // Marcar en public.usuario que debe cambiar la clave al ingresar
      const { error: dbError } = await admin
        .from('usuario')
        .update({
          requiere_cambio_clave: true,
          intentos_fallidos: 0,
          bloqueado_hasta: null,
        })
        .eq('id', userId);

      if (dbError) {
        return { success: false, error: dbError.message };
      }

      // Enviar correo con las nuevas credenciales vía Brevo
      const emailResult = await EmailService.sendUserCredentialsEmail({
        toEmail: user.email,
        recipientName: `${user.nombre} ${user.apellido}`,
        tempPassword,
        role: user.rol,
      });

      return {
        success: true,
        tempPassword,
        emailSent: emailResult.success,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al resetear contraseña';
      return { success: false, error: msg };
    }
  }

  /**
   * Activa o desactiva a un usuario
   */
  static async toggleUserStatus(userId: string, activo: boolean, currentAdminId?: string): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {
      if (userId === currentAdminId) {
        return {
          success: false,
          error: 'No puedes desactivar tu propia cuenta de administrador.',
        };
      }

      const admin = createAdminClient();

      const { data: targetUser } = await admin
        .from('usuario')
        .select('email')
        .eq('id', userId)
        .single();

      if (targetUser?.email.toLowerCase() === 'maic.hernandez.dev@gmail.com' && !activo) {
        return {
          success: false,
          error: 'La cuenta del Administrador Principal no puede ser desactivada.',
        };
      }

      const { error } = await admin
        .from('usuario')
        .update({ activo })
        .eq('id', userId);

      if (error) {
        return { success: false, error: error.message };
      }

      return { success: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al cambiar estado del usuario';
      return { success: false, error: msg };
    }
  }

  /**
   * Actualiza datos de un usuario (Nombre, Apellido, Rol)
   */
  static async updateUser(userId: string, input: UpdateUserInput): Promise<{
    success: boolean;
    user?: UserProfile;
    error?: string;
  }> {
    try {
      const admin = createAdminClient();

      const updateData: Partial<UserProfile> = {};
      if (input.nombre !== undefined) updateData.nombre = input.nombre.trim();
      if (input.apellido !== undefined) updateData.apellido = input.apellido.trim();
      if (input.rol !== undefined) updateData.rol = input.rol;
      if (input.activo !== undefined) updateData.activo = input.activo;
      if (input.requiere_cambio_clave !== undefined) updateData.requiere_cambio_clave = input.requiere_cambio_clave;
      if (input.sucursal_id !== undefined) updateData.sucursal_id = input.sucursal_id;
      if (input.telefono !== undefined) updateData.telefono = input.telefono?.trim() || null;

      const { data, error } = await admin
        .from('usuario')
        .update(updateData)
        .eq('id', userId)
        .select()
        .single();

      if (error) {
        return { success: false, error: error.message };
      }

      await admin.auth.admin.updateUserById(userId, {
        user_metadata: {
          nombre: updateData.nombre,
          apellido: updateData.apellido,
          rol: updateData.rol,
        },
      });

      return { success: true, user: data as UserProfile };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al actualizar usuario';
      return { success: false, error: msg };
    }
  }

  /**
   * Obtiene el detalle completo de un usuario (con sucursal) para tarjetas de
   * contacto y popups de datos de usuario en historial/observaciones.
   */
  static async getUsuarioDetalleById(userId: string): Promise<UsuarioDetalle | null> {
    try {
      const admin = createAdminClient();
      const { data, error } = await admin
        .from('usuario')
        .select('id, email, nombre, apellido, rol, activo, telefono, sucursal_id, created_at, sucursal:sucursal_id(nombre)')
        .eq('id', userId)
        .single();

      if (error || !data) {
        console.error('Error en getUsuarioDetalleById:', error);
        return null;
      }

      const row = data as unknown as {
        id: string;
        email: string;
        nombre: string;
        apellido: string;
        rol: UserProfile['rol'];
        activo: boolean;
        telefono: string | null;
        sucursal_id: number | null;
        created_at: string;
        sucursal: { nombre: string | null } | Array<{ nombre: string | null }> | null;
      };

      const sucursalRaw = Array.isArray(row.sucursal) ? row.sucursal[0] : row.sucursal;

      return {
        id: row.id,
        email: row.email,
        nombre: row.nombre,
        apellido: row.apellido,
        rol: row.rol,
        activo: row.activo,
        telefono: row.telefono ?? null,
        sucursal_id: row.sucursal_id ?? null,
        sucursal_nombre: sucursalRaw?.nombre ?? null,
        created_at: row.created_at,
      };
    } catch (err) {
      console.error('Error en getUsuarioDetalleById:', err);
      return null;
    }
  }
}
