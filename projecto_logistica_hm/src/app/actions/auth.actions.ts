'use server';

import { AuthService } from '@/services/auth.service';
import { redirect } from 'next/navigation';

export async function loginAction(prevState: unknown, formData: FormData) {
  const email = formData.get('email') as string;
  const password = formData.get('password') as string;

  if (!email || !password) {
    return {
      success: false,
      error: 'Por favor completa todos los campos.',
    };
  }

  const result = await AuthService.signIn(email, password);

  if (!result.success) {
    return {
      success: false,
      error: result.error || 'Error al iniciar sesión.',
    };
  }

  if (result.requiresPasswordChange) {
    redirect('/establecer-clave');
  }

  redirect('/dashboard');
}

export async function logoutAction() {
  await AuthService.signOut();
  redirect('/login');
}

export async function requestPasswordResetAction(prevState: unknown, formData: FormData) {
  const email = formData.get('email') as string;

  if (!email) {
    return {
      success: false,
      error: 'Por favor ingresa tu correo electrónico.',
    };
  }

  const result = await AuthService.sendPasswordResetEmail(email);

  if (!result.success) {
    return {
      success: false,
      error: result.error || 'No se pudo enviar el correo de recuperación.',
    };
  }

  return {
    success: true,
    message: 'Te hemos enviado un correo con el enlace para restablecer tu contraseña. Revisa tu bandeja de entrada o spam.',
  };
}

export async function updatePasswordAction(prevState: unknown, formData: FormData) {
  const password = formData.get('password') as string;
  const confirmPassword = formData.get('confirmPassword') as string;

  if (!password || !confirmPassword) {
    return {
      success: false,
      error: 'Por favor completa ambos campos de contraseña.',
    };
  }

  if (password !== confirmPassword) {
    return {
      success: false,
      error: 'Las contraseñas no coinciden.',
    };
  }

  if (password.length < 8) {
    return {
      success: false,
      error: 'La contraseña debe tener al menos 8 caracteres.',
    };
  }

  const result = await AuthService.updatePassword(password);

  if (!result.success) {
    return {
      success: false,
      error: result.error || 'Error al establecer la nueva contraseña.',
    };
  }

  redirect('/dashboard?msg=password_updated');
}
