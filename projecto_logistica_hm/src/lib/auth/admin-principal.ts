/**
 * Administrador principal (brecha 025).
 *
 * Antes su correo estaba escrito literal en 7 lugares del código y en el
 * trigger `handle_new_auth_user`, que además le asignaba rol administrador a
 * quien se registrara con ese correo. Ahora se configura en un solo lugar con
 * la variable de entorno `ADMIN_PRINCIPAL_EMAIL` (solo servidor) y únicamente
 * se usa para impedir que esa cuenta se desactive o se autoregistre. Nunca
 * otorga rol ni permisos.
 */
export function getAdminPrincipalEmail(): string | null {
  const email = process.env.ADMIN_PRINCIPAL_EMAIL?.trim().toLowerCase();
  return email ? email : null;
}

export function esAdminPrincipal(email: string | null | undefined): boolean {
  const principal = getAdminPrincipalEmail();
  if (!principal || !email) return false;
  return email.trim().toLowerCase() === principal;
}
