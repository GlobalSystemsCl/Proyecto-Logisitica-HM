import { createAdminClient } from '@/lib/supabase/admin';
import { CreateUserInput, UpdateUserInput, UserProfile, UsuarioDetalle, UsuarioSucursalAsignada, UsuarioZonaAsignada } from '@/types/auth.types';
import { EmailService } from '@/services/email.service';
import type { SupabaseClient } from '@supabase/supabase-js';
import { randomInt } from 'crypto';
import { validarCampoTexto, validarPassword } from '@/lib/validaciones';
import { esAdminPrincipal } from '@/lib/auth/admin-principal';
import { mensajeErrorUsuario } from '@/lib/errores';

export class UsersService {
  /**
   * Genera una contraseña provisoria de 16 caracteres con un generador
   * criptográfico (brecha 013; antes: prefijo fijo + 7 caracteres con
   * Math.random). Incluye siempre mayúscula, minúscula y número para cumplir
   * la política de `validarPassword`.
   */
  static generateTempPassword(): string {
    const mayusculas = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    const minusculas = 'abcdefghijkmnpqrstuvwxyz';
    const numeros = '23456789';
    const simbolos = '!@#$%*-_';
    const todos = mayusculas + minusculas + numeros + simbolos;
    const elegir = (set: string) => set.charAt(randomInt(set.length));

    const chars = [elegir(mayusculas), elegir(minusculas), elegir(numeros)];
    while (chars.length < 16) chars.push(elegir(todos));

    // Mezcla Fisher-Yates para que los obligatorios no queden al inicio.
    for (let i = chars.length - 1; i > 0; i--) {
      const j = randomInt(i + 1);
      [chars[i], chars[j]] = [chars[j], chars[i]];
    }
    return chars.join('');
  }

  /**
   * Obtiene la lista completa de usuarios (incluye sucursales a cargo y zonas asignadas)
   */
  static async getUsers(): Promise<UserProfile[]> {
    try {
      const admin = createAdminClient();
      const [usuariosRes, sucursalesRes, zonasRes] = await Promise.all([
        admin
          .from('usuario')
          .select('*, sucursal:sucursal_id(id, nombre)')
          .order('created_at', { ascending: false }),
        admin
          .from('sucursal')
          .select('id, nombre, usuario_id')
          .not('usuario_id', 'is', null),
        admin
          .from('usuario_zona')
          .select('usuario_id, zona_id, zona:zona_id(id, nombre)'),
      ]);

      if (usuariosRes.error) {
        console.error('Error al listar usuarios:', usuariosRes.error);
        return [];
      }

      const sucursalesPorUsuario = new Map<string, Array<{ id: number; nombre: string | null }>>();
      (sucursalesRes.data || []).forEach((row: {
        usuario_id: string;
        id: number;
        nombre: string | null;
      }) => {
        if (!row.usuario_id || !row.id) return;
        const lista = sucursalesPorUsuario.get(row.usuario_id) || [];
        lista.push({ id: row.id, nombre: row.nombre });
        sucursalesPorUsuario.set(row.usuario_id, lista);
      });

      const zonasPorUsuario = new Map<string, Array<{ id: number; nombre: string }>>();
      (zonasRes.data || []).forEach((row: {
        usuario_id: string;
        zona_id: number;
        zona: Array<{ id: number; nombre: string }> | { id: number; nombre: string } | null;
      }) => {
        if (!row.zona_id) return;
        const z = Array.isArray(row.zona) ? row.zona[0] : row.zona;
        const lista = zonasPorUsuario.get(row.usuario_id) || [];
        lista.push({ id: row.zona_id, nombre: z?.nombre ?? '' });
        zonasPorUsuario.set(row.usuario_id, lista);
      });

      return (usuariosRes.data || []).map((u) => {
        const row = u as UserProfile & {
          sucursal_id: number | null;
          sucursal_nombre: string | null;
          sucursal?: { id: number; nombre: string | null } | Array<{ id: number; nombre: string | null }> | null;
        };

        const principalId = row.sucursal_id ?? null;
        const principalRaw =
          row.sucursal !== undefined && row.sucursal !== null
            ? Array.isArray(row.sucursal)
              ? row.sucursal[0]
              : row.sucursal
            : null;

        const mapa = new Map<number, { id: number; nombre: string | null }>(
          (sucursalesPorUsuario.get(row.id) || []).map((s) => [s.id, s])
        );
        if (principalId !== null) {
          mapa.set(principalId, { id: principalId, nombre: principalRaw?.nombre ?? null });
        }

        delete row.sucursal;
        return {
          ...row,
          sucursales: Array.from(mapa.values()),
          zonas: zonasPorUsuario.get(row.id) || [],
        };
      });
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

      const errorNombre =
        validarCampoTexto(input.nombre, 'nombre', 100) || validarCampoTexto(input.apellido, 'apellido', 100);
      if (errorNombre) return { success: false, error: errorNombre };

      // Brecha 013: la contraseña elegida por el admin cumple la misma política.
      const custom = customPassword?.trim();
      if (custom) {
        const errorPassword = validarPassword(custom);
        if (errorPassword) return { success: false, error: errorPassword };
      }
      const tempPassword = custom || this.generateTempPassword();

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
        // Brecha 002: el rol no viaja en user_metadata; lo fija el upsert siguiente.
        user_metadata: {
          nombre: input.nombre.trim(),
          apellido: input.apellido.trim(),
        },
      });

      if (createError) {
        return {
          success: false,
          error: mensajeErrorUsuario(createError, 'Error al crear el usuario.'),
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
        aprobado: true,
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
          error: mensajeErrorUsuario(
            dbError,
            'El usuario se creó, pero no se pudo completar su perfil. Revísalo en la lista de usuarios.'
          ),
        };
      }

      // 4. Asignar sucursales a cargo (encargado) y zonas de logística
      await this.setSucursalesEncargadas(admin, authUserId, input.rol, [
        ...(input.sucursal_id ? [input.sucursal_id] : []),
        ...(input.sucursales_ids || []),
      ]);
      await this.setZonasAsignadas(admin, authUserId, input.rol, input.zonas_ids || []);

      // 5. Enviar correo con credenciales a través de Brevo
      const emailResult = await EmailService.sendUserCredentialsEmail({
        toEmail: cleanEmail,
        recipientName: `${input.nombre.trim()} ${input.apellido.trim()}`,
        tempPassword,
        role: input.rol,
      });

      // Brecha 013: la contraseña solo vuelve al navegador si el correo falló.
      return {
        success: true,
        user: userProfile as UserProfile,
        tempPassword: emailResult.success ? undefined : tempPassword,
        emailSent: emailResult.success,
      };
    } catch (err: unknown) {
      const msg = mensajeErrorUsuario(err, 'Error inesperado al crear usuario');
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
      });

      if (authError) {
        return { success: false, error: mensajeErrorUsuario(authError, 'No se pudo completar la operación.') };
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
        return { success: false, error: mensajeErrorUsuario(dbError, 'No se pudo completar la operación.') };
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
        tempPassword: emailResult.success ? undefined : tempPassword,
        emailSent: emailResult.success,
      };
    } catch (err: unknown) {
      const msg = mensajeErrorUsuario(err, 'Error al resetear contraseña');
      return { success: false, error: msg };
    }
  }

  /**
   * Autoriza a un usuario autoregistrado para que pueda ingresar al sistema.
   * Lo marca aprobado y activo (brecha 003). El middleware y las funciones de
   * RLS leen ese estado desde public.usuario, no desde user_metadata.
   */
  static async approveUser(userId: string): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {
      const admin = createAdminClient();

      const { data, error } = await admin
        .from('usuario')
        .update({ aprobado: true, activo: true })
        .eq('id', userId)
        .select('id')
        .single();

      if (error || !data) {
        return {
          success: false,
          error: error ? mensajeErrorUsuario(error, 'No se pudo autorizar al usuario.') : 'No se pudo autorizar al usuario.',
        };
      }

      // Por si la cuenta tenía un bloqueo previo en Auth.
      const { error: authError } = await admin.auth.admin.updateUserById(userId, { ban_duration: 'none' });
      if (authError) console.error('No se pudo quitar el bloqueo en Auth al aprobar:', authError);

      return { success: true };
    } catch (err: unknown) {
      const msg = mensajeErrorUsuario(err, 'Error inesperado al autorizar usuario');
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
        .select('email, aprobado')
        .eq('id', userId)
        .single();

      if (esAdminPrincipal(targetUser?.email) && !activo) {
        return {
          success: false,
          error: 'La cuenta del Administrador Principal no puede ser desactivada.',
        };
      }

      if (activo && targetUser?.aprobado === false) {
        return {
          success: false,
          error: 'La cuenta aún no está autorizada. Usa la opción "Autorizar" para habilitarla.',
        };
      }

      const { error } = await admin
        .from('usuario')
        .update({ activo })
        .eq('id', userId);

      if (error) {
        return { success: false, error: mensajeErrorUsuario(error, 'No se pudo completar la operación.') };
      }

      // Brecha 009: bloquear en Supabase Auth para que no pueda renovar la
      // sesión ni operar contra Auth. El middleware ya corta el acceso a la app
      // en el siguiente request; esto cubre el uso directo de la API de Auth.
      const { error: banError } = await admin.auth.admin.updateUserById(userId, {
        ban_duration: activo ? 'none' : '876000h',
      });
      if (banError) {
        console.error('No se pudo actualizar el bloqueo en Auth:', banError);
      }

      return { success: true };
    } catch (err: unknown) {
      const msg = mensajeErrorUsuario(err, 'Error al cambiar estado del usuario');
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

      const errorNombre =
        (input.nombre !== undefined && validarCampoTexto(input.nombre, 'nombre', 100)) ||
        (input.apellido !== undefined && validarCampoTexto(input.apellido, 'apellido', 100));
      if (errorNombre) return { success: false, error: errorNombre };

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
        return { success: false, error: mensajeErrorUsuario(error, 'No se pudo completar la operación.') };
      }

      await admin.auth.admin.updateUserById(userId, {
        user_metadata: {
          nombre: updateData.nombre,
          apellido: updateData.apellido,
        },
      });

      // Sucursales a cargo (encargado de local) y zonas de logística
      if (
        input.sucursales_ids !== undefined ||
        input.sucursal_id !== undefined ||
        input.rol !== undefined
      ) {
        const principal =
          input.sucursal_id !== undefined ? input.sucursal_id : (data as UserProfile).sucursal_id ?? null;

        let aCargo = input.sucursales_ids;
        if (aCargo === undefined) {
          const { data: encargadas } = await admin
            .from('sucursal')
            .select('id')
            .eq('usuario_id', userId);
          aCargo = (encargadas || []).map((s: { id: number }) => s.id);
        }

        const idsFinal = new Set<number>((aCargo || []).filter(Boolean));
        if (principal) idsFinal.add(principal);
        const rolFinal = input.rol ?? (data as UserProfile).rol ?? 'ejecutivo';
        await this.setSucursalesEncargadas(admin, userId, rolFinal, Array.from(idsFinal));
      }
      if (input.zonas_ids !== undefined || input.rol !== undefined) {
        const rolFinal = input.rol ?? (data as UserProfile).rol ?? 'ejecutivo';
        if (rolFinal === 'logistica') {
          if (input.zonas_ids !== undefined) {
            await this.setZonasAsignadas(admin, userId, rolFinal, input.zonas_ids);
          }
        } else {
          await this.setZonasAsignadas(admin, userId, rolFinal, []);
        }
      }

      return { success: true, user: data as UserProfile };
    } catch (err: unknown) {
      const msg = mensajeErrorUsuario(err, 'Error al actualizar usuario');
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

      const [usuarioRes, encargadasRes, zonasRes] = await Promise.all([
        admin
          .from('usuario')
          .select('id, email, nombre, apellido, rol, activo, telefono, sucursal_id, created_at, sucursal:sucursal_id(nombre)')
          .eq('id', userId)
          .single(),
        admin.from('sucursal').select('id, nombre').eq('usuario_id', userId),
        admin.from('usuario_zona').select('zona_id, zona:zona_id(id, nombre)').eq('usuario_id', userId),
      ]);

      if (usuarioRes.error || !usuarioRes.data) {
        console.error('Error en getUsuarioDetalleById:', usuarioRes.error);
        return null;
      }

      const row = usuarioRes.data as unknown as {
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

      // Sucursales del usuario: el mapa une la principal (pertenencia) + las que
      // está a cargo (encargado de local), para que el detalle muestre ambas.
      const mapa = new Map<number, UsuarioSucursalAsignada>();
      ((encargadasRes.data as Array<{ id: number; nombre: string | null }> | null) || []).forEach((s) => {
        if (!s.id) return;
        mapa.set(s.id, { id: s.id, nombre: s.nombre ?? null });
      });
      if (row.sucursal_id !== null) {
        mapa.set(row.sucursal_id, { id: row.sucursal_id, nombre: sucursalRaw?.nombre ?? null });
      }

      const zonas: UsuarioZonaAsignada[] = ((zonasRes.data as Array<{
        zona_id: number;
        zona: { id: number; nombre: string | null } | Array<{ id: number; nombre: string | null }> | null;
      }> | null) || []).map((z) => {
        const raw = Array.isArray(z.zona) ? z.zona[0] : z.zona;
        return { id: z.zona_id, nombre: raw?.nombre ?? `Zona ${z.zona_id}` };
      });

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
        sucursales: Array.from(mapa.values()),
        zonas,
        created_at: row.created_at,
      };
    } catch (err) {
      console.error('Error en getUsuarioDetalleById:', err);
      return null;
    }
  }

  /**
   * Reemplaza las sucursales de las que un usuario es encargado
   * (`sucursal.usuario_id`). Solo los roles `jefe_local` y `administrador`
   * pueden quedar a cargo de sucursales; a cualquier otro rol se le
   * desmarcan todas. La lista recibe las sucursales a cargo finales.
   */
  private static async setSucursalesEncargadas(
    admin: SupabaseClient,
    userId: string,
    rol: string,
    sucursales: number[]
  ): Promise<void> {
    try {
      await admin.from('sucursal').update({ usuario_id: null }).eq('usuario_id', userId);

      const puedeSerEncargado = rol === 'jefe_local' || rol === 'administrador';
      if (!puedeSerEncargado) return;

      const ids = Array.from(new Set(sucursales.filter((id): id is number => Boolean(id))));
      if (ids.length === 0) return;

      await admin.from('sucursal').update({ usuario_id: userId }).in('id', ids);
    } catch (err) {
      console.error('Error en setSucursalesEncargadas:', err);
    }
  }

  /**
   * Reemplaza las zonas asignadas (N:M) de un usuario. Únicamente los usuarios
   * de rol `logistica` pueden quedar encargados por zonas territoriales: a
   * cualquier otro rol se le limpian todas las asignaciones existentes.
   */
  private static async setZonasAsignadas(
    admin: SupabaseClient,
    userId: string,
    rol: string,
    zonas_ids: number[]
  ): Promise<void> {
    try {
      await admin.from('usuario_zona').delete().eq('usuario_id', userId);

      const soloLogistica = rol === 'logistica';
      if (!soloLogistica) return;

      const ids = (zonas_ids || []).filter(Boolean);
      if (ids.length > 0) {
        const filas = ids.map((zona_id) => ({ usuario_id: userId, zona_id }));
        await admin.from('usuario_zona').insert(filas);
      }
    } catch (err) {
      console.error('Error en setZonasAsignadas:', err);
    }
  }
}
