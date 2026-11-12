import { renderLayoutCorreo, renderTextoPlano, type LayoutCorreo } from '@/lib/plantillaCorreo';

/**
 * Correo de recuperación de contraseña (E2, 2026-11-03).
 *
 * Supabase nunca llegó a enviar estos correos: el proyecto usa su SMTP por
 * defecto, que solo entrega a direcciones del equipo. Ahora el servidor genera
 * el enlace con `auth.admin.generateLink` y lo envía con Brevo. El enlace lleva
 * `token_hash` al callback (`verifyOtp`), así que funciona aunque se abra en
 * otro navegador o en el celular (el flujo PKCE anterior no).
 *
 * Funciones puras: no tocan la BD ni la red.
 */

export const ASUNTO_RECUPERACION = '[H.Motores] Restablece tu contraseña';

/** Duración por defecto de los enlaces de Supabase Auth (`mailer_otp_exp`). */
export const VIGENCIA_ENLACE = '1 hora';

/** Enlace al callback que verifica el token y lleva a establecer la clave. */
export function enlaceRecuperacion(appUrl: string, tokenHash: string): string {
  const params = new URLSearchParams({ token_hash: tokenHash, type: 'recovery', next: '/establecer-clave' });
  return `${appUrl.replace(/\/+$/, '')}/auth/callback?${params.toString()}`;
}

function layoutRecuperacion(nombre: string, enlace: string, appUrl: string): LayoutCorreo {
  return {
    asunto: ASUNTO_RECUPERACION,
    vistaPrevia: `Elige una nueva contraseña. El enlace vence en ${VIGENCIA_ENLACE}.`,
    etiqueta: { texto: 'Seguridad de la cuenta', tono: 'info' },
    titulo: 'Restablece tu contraseña',
    nombre,
    parrafos: ['Recibimos una solicitud para restablecer la contraseña de tu cuenta. Haz clic en el botón para elegir una nueva.'],
    boton: { texto: 'Elegir nueva contraseña', url: enlace },
    notas: [
      `El enlace vence en ${VIGENCIA_ENLACE} y se puede usar una sola vez. Si no pediste este cambio, ignora este correo: tu contraseña actual sigue funcionando.`,
    ],
    appUrl,
  };
}

/** HTML del correo. Todo texto variable se escapa (brecha 022). */
export function htmlCorreoRecuperacion(nombre: string, enlace: string, appUrl: string): string {
  return renderLayoutCorreo(layoutRecuperacion(nombre, enlace, appUrl));
}

/** Versión de texto plano del correo. */
export function textoCorreoRecuperacion(nombre: string, enlace: string, appUrl: string): string {
  return renderTextoPlano(layoutRecuperacion(nombre, enlace, appUrl));
}
