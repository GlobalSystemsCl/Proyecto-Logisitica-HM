const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const LIMITES_CAMPO_TEXTO = {
  nombre: 100,
  apellido: 100,
  email: 254,
};

/**
 * Política única de contraseñas (brecha 013). Se aplica en registro,
 * establecer clave, creación de usuarios por el administrador y debe
 * replicarse en Supabase Auth (Authentication > Policies > Password).
 */
export const PASSWORD_MIN_LENGTH = 10;
/** La longitud máxima de bcrypt de Supabase Auth es 72 caracteres. */
export const PASSWORD_MAX_LENGTH = 72;

export interface RequisitosPassword {
  longitud: boolean;
  mayuscula: boolean;
  minuscula: boolean;
  numero: boolean;
}

export function requisitosPassword(password: string): RequisitosPassword {
  const valor = password || '';
  return {
    longitud: valor.length >= PASSWORD_MIN_LENGTH && valor.length <= PASSWORD_MAX_LENGTH,
    mayuscula: /[A-ZÁÉÍÓÚÑ]/.test(valor),
    minuscula: /[a-záéíóúñ]/.test(valor),
    numero: /\d/.test(valor),
  };
}

export function validarPassword(password: string): string | null {
  if (!password || password.length < PASSWORD_MIN_LENGTH) {
    return `La contraseña debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres.`;
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    return `La contraseña no puede superar los ${PASSWORD_MAX_LENGTH} caracteres.`;
  }
  const req = requisitosPassword(password);
  if (!req.mayuscula || !req.minuscula || !req.numero) {
    return 'La contraseña debe incluir al menos una mayúscula, una minúscula y un número.';
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
  // Brecha 022: los nombres se usan en correos HTML.
  if (/[<>]/.test(valor)) {
    return `El ${campo} contiene caracteres no permitidos.`;
  }
  return null;
}
