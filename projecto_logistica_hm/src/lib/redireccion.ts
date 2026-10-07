/**
 * Destinos permitidos tras verificar un enlace en /auth/callback (brecha 020).
 * Antes se usaba `next` tal cual, lo que permitía llevar al usuario a
 * cualquier ruta interna tras un enlace de recuperación manipulado.
 */
export const DESTINOS_CALLBACK = ['/establecer-clave', '/dashboard'] as const;
export const DESTINO_CALLBACK_POR_DEFECTO = '/establecer-clave';

export function destinoCallbackSeguro(next: string | null | undefined): string {
  return next && (DESTINOS_CALLBACK as readonly string[]).includes(next) ? next : DESTINO_CALLBACK_POR_DEFECTO;
}
