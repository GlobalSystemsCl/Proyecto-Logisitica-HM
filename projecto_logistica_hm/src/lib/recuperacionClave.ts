import { escapeHtml } from '@/lib/html';

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

/** HTML del correo. Todo texto variable se escapa (brecha 022). */
export function htmlCorreoRecuperacion(nombre: string, enlace: string): string {
  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>${escapeHtml(ASUNTO_RECUPERACION)}</title></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;background:#f5f5f5;margin:0;padding:24px 12px;color:#171717">
<table align="center" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border-radius:16px;border:1px solid #e5e5e5;overflow:hidden">
<tr><td style="background:#171717;padding:24px 28px"><h1 style="margin:0;color:#fff;font-size:20px">H.Motores</h1>
<p style="margin:4px 0 0 0;color:#a3a3a3;font-size:12px">Sistema de Gestión y Logística de Vehículos</p></td></tr>
<tr><td style="padding:28px">
<h2 style="margin:0 0 8px 0;font-size:18px">Restablece tu contraseña</h2>
<p style="margin:0 0 16px 0;color:#525252;font-size:14px">Hola, ${escapeHtml(nombre)}. Recibimos una solicitud para restablecer la contraseña de tu cuenta. Haz clic en el botón para elegir una nueva.</p>
<a href="${escapeHtml(enlace)}" style="display:inline-block;background:#171717;color:#fff;text-decoration:none;font-size:14px;font-weight:700;padding:12px 24px;border-radius:10px">Elegir nueva contraseña</a>
<p style="margin:20px 0 0 0;color:#737373;font-size:12px">El enlace vence en ${VIGENCIA_ENLACE} y se puede usar una sola vez. Si no pediste este cambio, ignora este correo: tu contraseña actual sigue funcionando.</p>
</td></tr>
<tr><td style="background:#fafafa;padding:16px 28px;border-top:1px solid #e5e5e5;color:#737373;font-size:11px">Correo automático del Sistema de Logística H.Motores. No respondas a este mensaje.</td></tr>
</table></body></html>`;
}
