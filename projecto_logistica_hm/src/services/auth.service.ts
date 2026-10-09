import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { UserProfile } from '@/types/auth.types';
import { validarCampoTexto, validarEmailFormato, validarPassword } from '@/lib/validaciones';
import { mensajeErrorUsuario } from '@/lib/errores';
import { esAdminPrincipal } from '@/lib/auth/admin-principal';
import { getAppUrl } from '@/lib/env';
import { mensajeCuentaDesactivada } from '@/lib/soporte';

export const MAX_INTENTOS_FALLIDOS = 5;
export const MINUTOS_BLOQUEO = 15;

/**
 * Brecha 012: el mismo mensaje para correo inexistente, contraseña errónea y
 * cuenta bloqueada, para no revelar qué correos son cuentas del sistema.
 */
export const MENSAJE_LOGIN_FALLIDO =
  `Credenciales inválidas. Tras ${MAX_INTENTOS_FALLIDOS} intentos fallidos el acceso se bloquea por ${MINUTOS_BLOQUEO} minutos.`;
export const MENSAJE_PENDIENTE_APROBACION =
  'Tu cuenta aún no ha sido autorizada por un administrador. Espera la aprobación para poder ingresar al sistema.';

type FilaUsuario = UserProfile & { intentos_fallidos?: number | null };

/**
 * Perfil del usuario autenticado. Envuelto en `React.cache` (brecha 024): en
 * una misma petición de servidor las páginas, layouts y actions que lo piden
 * reutilizan el resultado en vez de repetir 3 consultas cada vez.
 */
const getCurrentUserProfileCached = cache(async (): Promise<UserProfile | null> => {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return null;
    }

    const { data: profile, error: profileError } = await supabase
      .from('usuario')
      .select('*, sucursal:sucursal_id(nombre)')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      // Brechas 025 y 002: un perfil faltante nunca se crea como administrador.
      // Se registra como ejecutivo pendiente de aprobación (inactivo) para que
      // un administrador lo revise, y no se concede acceso.
      const admin = createAdminClient();
      const { error: insertError } = await admin.from('usuario').upsert(
        {
          id: user.id,
          email: user.email!.toLowerCase(),
          nombre: user.user_metadata?.nombre || 'Usuario',
          apellido: user.user_metadata?.apellido || '',
          rol: 'ejecutivo',
          activo: false,
          aprobado: false,
          requiere_cambio_clave: false,
        },
        { onConflict: 'id', ignoreDuplicates: true }
      );

      if (insertError) {
        console.error('Error al registrar perfil faltante:', insertError);
      }
      return null;
    }

    const sucursal = profile.sucursal as
      | { nombre: string | null }
      | Array<{ nombre: string | null }>
      | null;

    const [sucursalesRes, zonasRes] = await Promise.all([
      supabase
        .from('sucursal')
        .select('id, nombre')
        .eq('usuario_id', user.id),
      supabase
        .from('usuario_zona')
        .select('zona_id, zona:zona_id(id, nombre)')
        .eq('usuario_id', user.id),
    ]);

    const sucursales = (sucursalesRes.data || []).map((row: { id: number; nombre: string | null }) => ({
      id: row.id,
      nombre: row.nombre,
    }));
    const zonas = (zonasRes.data || []).map(
      (row: {
        zona_id: number;
        zona: Array<{ id: number; nombre: string }> | { id: number; nombre: string } | null;
      }) => {
        const z = Array.isArray(row.zona) ? row.zona[0] : row.zona;
        return {
          id: row.zona_id,
          nombre: z?.nombre ?? '',
        };
      }
    );

    return {
      ...profile,
      sucursal_nombre: Array.isArray(sucursal) ? sucursal[0]?.nombre ?? null : sucursal?.nombre ?? null,
      sucursales,
      zonas,
    } as UserProfile;
  } catch (error) {
    console.error('Error en getCurrentUserProfile:', error);
    return null;
  }
});

export class AuthService {
  /**
   * Actualiza los datos editables del perfil del usuario autenticado
   * (nombre, apellido, teléfono). El rol, sucursal y correo no son editables desde el perfil.
   */
  static async updateProfile(
    data: { nombre: string; apellido: string; telefono?: string | null }
  ): Promise<{ success: boolean; error?: string; profile?: UserProfile }> {
    try {
      const supabase = await createClient();
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        return { success: false, error: 'Sesión no válida. Inicia sesión nuevamente.' };
      }

      const nombre = data.nombre?.trim();
      const apellido = data.apellido?.trim();

      if (!nombre || !apellido) {
        return { success: false, error: 'El nombre y el apellido son obligatorios.' };
      }

      const errorNombre = validarCampoTexto(nombre, 'nombre', 100) || validarCampoTexto(apellido, 'apellido', 100);
      if (errorNombre) return { success: false, error: errorNombre };

      const telefono = data.telefono?.trim() || null;

      const admin = createAdminClient();
      const { data: updated, error: updateError } = await admin
        .from('usuario')
        .update({
          nombre,
          apellido,
          telefono,
        })
        .eq('id', user.id)
        .select()
        .single();

      if (updateError) {
        return { success: false, error: mensajeErrorUsuario(updateError, 'No se pudo actualizar el perfil.') };
      }

      return { success: true, profile: updated as UserProfile };
    } catch (err: unknown) {
      return { success: false, error: mensajeErrorUsuario(err, 'Error inesperado al actualizar el perfil.') };
    }
  }

  /**
   * Obtiene el perfil del usuario autenticado actualmente.
   * Devuelve `null` si no hay sesión o si la sesión no tiene perfil.
   */
  static getCurrentUserProfile = getCurrentUserProfileCached;

  /**
   * Registro autogestionado (ruta /registro). Crea al usuario como 'ejecutivo'
   * inactivo y no aprobado: no puede usar el sistema hasta que un
   * administrador lo autorice (brecha 003). El rol nunca se toma del cliente
   * (brecha 002).
   */
  static async register(data: {
    nombre: string;
    apellido: string;
    email: string;
    password: string;
    sucursal_id?: number | null;
  }): Promise<{ success: boolean; error?: string }> {
    try {
      const admin = createAdminClient();
      const cleanEmail = data.email.trim().toLowerCase();
      const sucursalId = data.sucursal_id ?? null;

      // Verificaciones de formato y saneamiento
      const errorNombre = validarCampoTexto(data.nombre, 'nombre', 100);
      if (errorNombre) return { success: false, error: errorNombre };

      const errorApellido = validarCampoTexto(data.apellido, 'apellido', 100);
      if (errorApellido) return { success: false, error: errorApellido };

      const errorEmail = validarEmailFormato(data.email);
      if (errorEmail) return { success: false, error: errorEmail };

      const errorPassword = validarPassword(data.password);
      if (errorPassword) return { success: false, error: errorPassword };

      // El administrador principal no puede autoregistrarse: su cuenta la
      // crea el administrador vía panel (o el seed).
      if (esAdminPrincipal(cleanEmail)) {
        return {
          success: false,
          error: 'El correo del Administrador Principal no puede registrarse de forma autónoma.',
        };
      }

      const { data: existing } = await admin
        .from('usuario')
        .select('id')
        .eq('email', cleanEmail)
        .maybeSingle();

      if (existing) {
        return { success: false, error: 'Ya existe un usuario registrado con ese correo.' };
      }

      // Validar que la sucursal seleccionada exista
      if (sucursalId !== null) {
        const { data: sucursal } = await admin
          .from('sucursal')
          .select('id')
          .eq('id', sucursalId)
          .maybeSingle();
        if (!sucursal) {
          return { success: false, error: 'La sucursal seleccionada no es válida.' };
        }
      }

      const supabase = await createClient();
      const { data: authData, error: signUpError } = await supabase.auth.signUp({
        email: cleanEmail,
        password: data.password,
        options: {
          data: {
            nombre: data.nombre.trim(),
            apellido: data.apellido.trim(),
            sucursal_id: sucursalId,
          },
        },
      });

      // Traducir errores conocidos de Supabase (especialmente el de email duplicado,
      // que se dispara incluso cuando la fila de perfil quedó huérfana).
      if (signUpError) {
        const msg = signUpError.message.toLowerCase();
        const already =
          msg.includes('already registered') ||
          msg.includes('already been registered') ||
          signUpError.code === 'user_already_exists' ||
          signUpError.code === 'email_address_not_authorized';
        if (already) {
          return { success: false, error: 'Ya existe un usuario registrado con ese correo.' };
        }
        return { success: false, error: mensajeErrorUsuario(signUpError, 'No se pudo crear la cuenta.') };
      }

      if (!authData.user) {
        return { success: false, error: 'No se pudo crear la cuenta. Intenta nuevamente.' };
      }

      // Confirmar email y asegurar el perfil base en public.usuario
      await admin.auth.admin.updateUserById(authData.user.id, { email_confirm: true });

      const { error: perfilError } = await admin.from('usuario').upsert({
        id: authData.user.id,
        email: cleanEmail,
        nombre: data.nombre.trim(),
        apellido: data.apellido.trim(),
        rol: 'ejecutivo',
        activo: false,
        aprobado: false,
        requiere_cambio_clave: false,
        sucursal_id: sucursalId,
      });

      if (perfilError) {
        return {
          success: false,
          error: mensajeErrorUsuario(perfilError, 'No se pudo completar el registro. Contacta al administrador.'),
        };
      }

      return { success: true };
    } catch (err: unknown) {
      return { success: false, error: mensajeErrorUsuario(err, 'Error inesperado al registrar usuario') };
    }
  }

  /**
   * Incrementa el contador de intentos fallidos de forma atómica (brechas 010
   * y 012) con la RPC `fn_registrar_intento_fallido`. Si la RPC aún no existe
   * en la BD, usa la actualización anterior (no atómica) para no romper el login.
   */
  static async registrarIntentoFallido(
    admin: ReturnType<typeof createAdminClient>,
    usuario: FilaUsuario
  ): Promise<void> {
    const { error } = await admin.rpc('fn_registrar_intento_fallido', {
      p_usuario_id: usuario.id,
      p_max_intentos: MAX_INTENTOS_FALLIDOS,
      p_minutos_bloqueo: MINUTOS_BLOQUEO,
    });

    if (!error) return;

    console.error('RPC fn_registrar_intento_fallido no disponible, usando respaldo:', error);
    const nextAttempts = (usuario.intentos_fallidos || 0) + 1;
    await admin
      .from('usuario')
      .update({
        intentos_fallidos: nextAttempts,
        bloqueado_hasta:
          nextAttempts >= MAX_INTENTOS_FALLIDOS
            ? new Date(Date.now() + MINUTOS_BLOQUEO * 60 * 1000).toISOString()
            : null,
      })
      .eq('id', usuario.id);
  }

  /**
   * Inicia sesión validando bloqueo por intentos, aprobación y estado activo.
   */
  static async signIn(email: string, password: string): Promise<{
    success: boolean;
    error?: string;
    profile?: UserProfile;
    requiresPasswordChange?: boolean;
  }> {
    const admin = createAdminClient();
    const cleanEmail = email.trim().toLowerCase();

    // 1. Bloqueo temporal: no se intenta la contraseña mientras dure.
    const { data: existingUser } = await admin
      .from('usuario')
      .select('*')
      .eq('email', cleanEmail)
      .single();

    const usuarioPrevio = existingUser as FilaUsuario | null;
    if (usuarioPrevio?.bloqueado_hasta && new Date(usuarioPrevio.bloqueado_hasta).getTime() > Date.now()) {
      return { success: false, error: MENSAJE_LOGIN_FALLIDO };
    }

    // 2. Intentar autenticar con Supabase Auth
    const supabase = await createClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: cleanEmail,
      password,
    });

    if (error || !data.user) {
      if (usuarioPrevio) {
        await AuthService.registrarIntentoFallido(admin, usuarioPrevio);
      }
      return { success: false, error: MENSAJE_LOGIN_FALLIDO };
    }

    // 3. Perfil del usuario autenticado. El estado de la cuenta solo se revela
    //    a quien ya demostró conocer la contraseña.
    const { data: userProfile } = await admin
      .from('usuario')
      .select('*')
      .eq('id', data.user.id)
      .single();

    const profile = userProfile as UserProfile | null;

    if (!profile) {
      // Brecha 025: sin perfil nunca se concede acceso ni rol administrador.
      await admin.from('usuario').upsert(
        {
          id: data.user.id,
          email: cleanEmail,
          nombre: data.user.user_metadata?.nombre || 'Usuario',
          apellido: data.user.user_metadata?.apellido || '',
          rol: 'ejecutivo',
          activo: false,
          aprobado: false,
          requiere_cambio_clave: false,
        },
        { onConflict: 'id', ignoreDuplicates: true }
      );
      await supabase.auth.signOut();
      return { success: false, error: MENSAJE_PENDIENTE_APROBACION };
    }

    if (profile.aprobado === false) {
      await supabase.auth.signOut();
      return { success: false, error: MENSAJE_PENDIENTE_APROBACION };
    }

    if (!profile.activo) {
      await supabase.auth.signOut();
      return { success: false, error: mensajeCuentaDesactivada() };
    }

    // Resetear contador de intentos fallidos
    await admin
      .from('usuario')
      .update({
        intentos_fallidos: 0,
        bloqueado_hasta: null,
      })
      .eq('id', data.user.id);

    return {
      success: true,
      profile,
      requiresPasswordChange: profile.requiere_cambio_clave,
    };
  }

  /**
   * Cierra la sesión activa
   */
  static async signOut(): Promise<void> {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }

  /**
   * Envía correo de recuperación de contraseña.
   *
   * Brecha 012: la respuesta es la misma exista o no la cuenta, y una cuenta
   * desactivada o no aprobada simplemente no recibe el correo.
   */
  static async sendPasswordResetEmail(email: string, redirectToUrl?: string): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {
      const supabase = await createClient();
      const cleanEmail = email.trim().toLowerCase();

      const admin = createAdminClient();
      const { data: user } = await admin
        .from('usuario')
        .select('activo, aprobado')
        .eq('email', cleanEmail)
        .single();

      const fila = user as { activo: boolean; aprobado?: boolean } | null;
      if (!fila || !fila.activo || fila.aprobado === false) {
        return { success: true };
      }

      const redirect = redirectToUrl || `${getAppUrl()}/auth/callback?next=/establecer-clave`;

      const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
        redirectTo: redirect,
      });

      if (error) {
        console.error('Error al enviar el correo de recuperación:', error);
        return { success: false, error: 'No se pudo enviar el correo en este momento. Intenta más tarde.' };
      }

      return { success: true };
    } catch (err: unknown) {
      return {
        success: false,
        error: mensajeErrorUsuario(err, 'Error inesperado al enviar correo de recuperación'),
      };
    }
  }

  /**
   * Establece o actualiza la contraseña del usuario actualmente autenticado
   */
  static async updatePassword(newPassword: string): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {
      const errorPolitica = validarPassword(newPassword);
      if (errorPolitica) {
        return { success: false, error: errorPolitica };
      }

      const supabase = await createClient();
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        return {
          success: false,
          error: 'Sesión no válida o expirada. Por favor solicita un nuevo enlace.',
        };
      }

      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (updateError) {
        if (updateError.code === 'same_password') {
          return { success: false, error: 'La nueva contraseña debe ser distinta de la anterior.' };
        }
        if (updateError.code === 'weak_password') {
          return { success: false, error: 'La contraseña es demasiado débil o aparece en filtraciones conocidas.' };
        }
        return { success: false, error: mensajeErrorUsuario(updateError, 'No se pudo actualizar la contraseña.') };
      }

      // Marcar que ya no requiere cambio de clave
      const admin = createAdminClient();
      await admin
        .from('usuario')
        .update({
          requiere_cambio_clave: false,
          intentos_fallidos: 0,
          bloqueado_hasta: null,
        })
        .eq('id', user.id);

      return { success: true };
    } catch (err: unknown) {
      return { success: false, error: mensajeErrorUsuario(err, 'Error al actualizar la contraseña.') };
    }
  }
}
