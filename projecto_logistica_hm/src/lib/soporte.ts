/**
 * Contacto de soporte de la plataforma.
 *
 * El correo se configura con la variable de entorno `NEXT_PUBLIC_SOPORTE_EMAIL`.
 * Es pública porque el mensaje también se muestra en la página de login, que
 * es un componente de cliente (Next.js la incorpora al compilar).
 */
export function getSoporteEmail(): string | null {
  const email = process.env.NEXT_PUBLIC_SOPORTE_EMAIL?.trim();
  return email ? email : null;
}

/**
 * Mensaje para una cuenta desactivada por el administrador. Indica a quién
 * escribir para consultas o para reactivarla.
 */
export function mensajeCuentaDesactivada(): string {
  const email = getSoporteEmail();
  const contacto = email
    ? `escribe a un encargado de la plataforma a ${email}`
    : 'contacta a un encargado de la plataforma';
  return `Tu cuenta fue desactivada. Para consultas o para volver a activarla, ${contacto}.`;
}
