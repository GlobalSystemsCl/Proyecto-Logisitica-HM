/**
 * Dominios de correo permitidos para crear cuentas (registro, creación por el
 * administrador y carga masiva). El login no se restringe: las cuentas que ya
 * existen con otro dominio siguen entrando.
 *
 * Se configura con `DOMINIOS_CORREO_PERMITIDOS` (separados por coma). Sin la
 * variable rige `hmotores.cl`; con `*` no se restringe (útil en desarrollo).
 */

export const DOMINIOS_POR_DEFECTO = ['hmotores.cl'];

/** Lista de dominios, o `null` si no hay restricción. */
export function parsearDominios(valor: string | undefined | null): string[] | null {
  const texto = valor?.trim();
  if (!texto) return DOMINIOS_POR_DEFECTO;
  if (texto === '*') return null;
  const dominios = [
    ...new Set(
      texto
        .split(',')
        .map((d) => d.trim().toLowerCase().replace(/^@/, ''))
        .filter(Boolean)
    ),
  ];
  return dominios.length > 0 ? dominios : DOMINIOS_POR_DEFECTO;
}

export function getDominiosPermitidos(): string[] | null {
  return parsearDominios(process.env.DOMINIOS_CORREO_PERMITIDOS);
}

export function esCorreoPermitido(email: string, dominios: string[] | null): boolean {
  if (dominios === null) return true;
  const dominio = email.trim().toLowerCase().split('@')[1] ?? '';
  return dominios.includes(dominio);
}

export function textoDominios(dominios: string[]): string {
  return dominios.map((d) => `@${d}`).join(', ');
}

/** Mensaje de error si el correo no es de un dominio permitido, o `null`. */
export function validarDominioCorreo(email: string, dominios: string[] | null = getDominiosPermitidos()): string | null {
  if (esCorreoPermitido(email, dominios)) return null;
  return `Solo se pueden crear cuentas con correo corporativo (${textoDominios(dominios ?? [])}).`;
}
