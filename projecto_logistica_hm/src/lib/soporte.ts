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

/**
 * Mensaje al terminar el registro (fase F). La cuenta queda pendiente de
 * aprobación: el administrador la activa y puede corregir rol y sucursal.
 */
export function mensajeRegistroPendiente(sucursal: string | null): string {
  const email = getSoporteEmail();
  const donde = sucursal ? ` en la sucursal ${sucursal}` : '';
  const contacto = email ? `escribe al administrador a ${email}` : 'contacta al administrador';
  return (
    `Tu solicitud de acceso quedó registrada con el perfil Ejecutivo (vendedor)${donde}. ` +
    `El administrador debe activarla antes de que puedas ingresar. ` +
    `Si el rol o la sucursal no corresponden, ${contacto}.`
  );
}
