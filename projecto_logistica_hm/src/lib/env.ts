/**
 * URL pública de la aplicación (brecha 026, punto 3).
 *
 * Antes, si faltaba `NEXT_PUBLIC_APP_URL`, los enlaces de recuperación de
 * contraseña y los botones de los correos apuntaban a http://localhost:3000.
 * En producción ahora se falla de forma explícita; en desarrollo se mantiene
 * el valor local.
 */
export function getAppUrl(): string {
  const url = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/+$/, '');
  if (url) return url;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Falta la variable de entorno NEXT_PUBLIC_APP_URL.');
  }
  return 'http://localhost:3000';
}
