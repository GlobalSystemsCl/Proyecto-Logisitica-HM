const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const LIMITES_CAMPO_TEXTO = {
  nombre: 100,
  apellido: 100,
  email: 254,
};

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 72;

/** La longitud maxima de bcrypt de Supabase Auth es 72 caracteres. */
export function validarPasswordRegistro(password: string): string | null {
  if (!password || password.length < PASSWORD_MIN_LENGTH) {
    return `La contraseña debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres.`;
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    return `La contraseña no puede superar los ${PASSWORD_MAX_LENGTH} caracteres.`;
  }
  return null;
}

export function validarEmailFormato(email: string): string | null {
  if (!email?.trim()) {
    return 'El correo electrónico es obligatorio.';
  }
  if (email.trim().length > LIMITES_CAMPO_TEXTO.email) {
    return `El correo no puede superar los ${LIMITES_CAMPO_TEXTO.email} caracteres.`;
  }
  if (!EMAIL_REGEX.test(email.trim())) {
    return 'El formato del correo electrónico no es válido.';
  }
  return null;
}

export function validarCampoTexto(
  valor: string,
  campo: string,
  max: number
): string | null {
  if (!valor || !valor.trim()) {
    return `El ${campo} es obligatorio.`;
  }
  if (valor.trim().length > max) {
    return `El ${campo} no puede superar los ${max} caracteres.`;
  }
  return null;
}