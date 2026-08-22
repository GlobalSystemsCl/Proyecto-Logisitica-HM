import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { UserProfile } from '@/types/auth.types';

export class AuthService {
  /**
   * Obtiene el perfil del usuario autenticado actualmente
   */
  static async getCurrentUserProfile(): Promise<UserProfile | null> {
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
        .select('*')
        .eq('id', user.id)
        .single();

      if (profileError || !profile) {
        // Si no existe perfil en la tabla usuario pero sí en auth, crear o sincronizar
        const admin = createAdminClient();
        const isAdminEmail = user.email?.toLowerCase() === 'maic.hernandez.dev@gmail.com';
        const newProfile = {
          id: user.id,
          email: user.email!,
          nombre: user.user_metadata?.nombre || (isAdminEmail ? 'Maic' : 'Usuario'),
          apellido: user.user_metadata?.apellido || (isAdminEmail ? 'Hernández' : ''),
          rol: isAdminEmail ? 'administrador' : user.user_metadata?.rol || 'ejecutivo',
          activo: true,
          requiere_cambio_clave: false,
        };

        const { data: inserted, error: insertError } = await admin
          .from('usuario')
          .upsert(newProfile)
          .select()
          .single();

        if (insertError) {
          console.error('Error al sincronizar perfil de usuario:', insertError);
          return null;
        }

        return inserted as UserProfile;
      }

      return profile as UserProfile;
    } catch (error) {
      console.error('Error en getCurrentUserProfile:', error);
      return null;
    }
  }

  /**
   * Inicia sesión validando estado activo y protección contra intentos excesivos
   */
  static async signIn(email: string, password: string): Promise<{
    success: boolean;
    error?: string;
    profile?: UserProfile;
    requiresPasswordChange?: boolean;
  }> {
    const admin = createAdminClient();
    const cleanEmail = email.trim().toLowerCase();

    // 1. Consultar estado en la tabla usuario
    const { data: existingUser } = await admin
      .from('usuario')
      .select('*')
      .eq('email', cleanEmail)
      .single();

    if (existingUser) {
      // Verificar si la cuenta está desactivada
      if (existingUser.activo === false) {
        return {
          success: false,
          error: 'Esta cuenta ha sido desactivada por el administrador. Contacta a soporte o a tu jefatura.',
        };
      }

      // Verificar si la cuenta está bloqueada temporalmente por intentos excesivos
      if (existingUser.bloqueado_hasta) {
        const lockTime = new Date(existingUser.bloqueado_hasta).getTime();
        const now = Date.now();
        if (lockTime > now) {
          const remainingMinutes = Math.ceil((lockTime - now) / (1000 * 60));
          return {
            success: false,
            error: `Cuenta bloqueada temporalmente por múltiples intentos fallidos. Intenta nuevamente en ${remainingMinutes} minuto(s).`,
          };
        }
      }
    }

    // 2. Intentar autenticar con Supabase Auth
    const supabase = await createClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: cleanEmail,
      password,
    });

    if (error) {
      // Manejar intento fallido
      if (existingUser) {
        const nextAttempts = (existingUser.intentos_fallidos || 0) + 1;
        let bloqueadoHasta: string | null = null;

        if (nextAttempts >= 5) {
          // Bloquear por 15 minutos tras 5 intentos
          const lockDate = new Date(Date.now() + 15 * 60 * 1000);
          bloqueadoHasta = lockDate.toISOString();
        }

        await admin
          .from('usuario')
          .update({
            intentos_fallidos: nextAttempts,
            bloqueado_hasta: bloqueadoHasta,
          })
          .eq('id', existingUser.id);

        if (nextAttempts >= 5) {
          return {
            success: false,
            error: 'Has superado el límite de 5 intentos fallidos. Tu cuenta ha sido bloqueada por 15 minutos por seguridad.',
          };
        }

        const remainingAttempts = 5 - nextAttempts;
        return {
          success: false,
          error: `Credenciales inválidas. Te quedan ${remainingAttempts} intento(s) antes del bloqueo temporal.`,
        };
      }

      return {
        success: false,
        error: 'Credenciales inválidas. Verifica tu correo y contraseña.',
      };
    }

    if (!data.user) {
      return {
        success: false,
        error: 'No se pudo iniciar sesión. Intenta nuevamente.',
      };
    }

    // 3. Obtener o asegurar perfil del usuario autenticado
    let profile: UserProfile | null = null;
    const { data: userProfile } = await admin
      .from('usuario')
      .select('*')
      .eq('id', data.user.id)
      .single();

    if (!userProfile) {
      const isAdmin = cleanEmail === 'maic.hernandez.dev@gmail.com';
      const { data: created } = await admin
        .from('usuario')
        .upsert({
          id: data.user.id,
          email: cleanEmail,
          nombre: data.user.user_metadata?.nombre || (isAdmin ? 'Maic' : 'Usuario'),
          apellido: data.user.user_metadata?.apellido || (isAdmin ? 'Hernández' : ''),
          rol: isAdmin ? 'administrador' : 'ejecutivo',
          activo: true,
          requiere_cambio_clave: false,
          intentos_fallidos: 0,
          bloqueado_hasta: null,
        })
        .select()
        .single();
      profile = created as UserProfile;
    } else {
      profile = userProfile as UserProfile;
      // Resetear contador de intentos fallidos
      await admin
        .from('usuario')
        .update({
          intentos_fallidos: 0,
          bloqueado_hasta: null,
        })
        .eq('id', data.user.id);
    }

    // Verificar si sigue activo
    if (profile && !profile.activo) {
      await supabase.auth.signOut();
      return {
        success: false,
        error: 'Esta cuenta ha sido desactivada por el administrador.',
      };
    }

    return {
      success: true,
      profile: profile || undefined,
      requiresPasswordChange: profile?.requiere_cambio_clave,
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
   * Envía correo de recuperación de contraseña
   */
  static async sendPasswordResetEmail(email: string, redirectToUrl?: string): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {
      const supabase = await createClient();
      const cleanEmail = email.trim().toLowerCase();

      // Verificar si el usuario existe y está activo
      const admin = createAdminClient();
      const { data: user } = await admin
        .from('usuario')
        .select('activo')
        .eq('email', cleanEmail)
        .single();

      if (user && !user.activo) {
        return {
          success: false,
          error: 'No se puede restablecer la contraseña de una cuenta desactivada. Contacta al administrador.',
        };
      }

      const redirect = redirectToUrl || `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/auth/callback?next=/establecer-clave`;

      const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
        redirectTo: redirect,
      });

      if (error) {
        return { success: false, error: error.message };
      }

      return { success: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error inesperado al enviar correo de recuperación';
      return { success: false, error: msg };
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
      if (newPassword.length < 8) {
        return {
          success: false,
          error: 'La contraseña debe tener al menos 8 caracteres.',
        };
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
        return { success: false, error: updateError.message };
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
      const msg = err instanceof Error ? err.message : 'Error al actualizar la contraseña.';
      return { success: false, error: msg };
    }
  }
}
