export interface SendCredentialsParams {
  toEmail: string;
  recipientName: string;
  tempPassword: string;
  role: string;
  loginUrl?: string;
}

export class EmailService {
  private static readonly BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email';

  /**
   * Envía correo con las credenciales de acceso iniciales utilizando la API de Brevo
   */
  static async sendUserCredentialsEmail(params: SendCredentialsParams): Promise<{
    success: boolean;
    error?: string;
    messageId?: string;
  }> {
    try {
      const apiKey = process.env.BREVO_API_KEY;
      const senderEmail = process.env.BREVO_SENDER_EMAIL || 'globalsystemschile@gmail.com';
      const senderName = process.env.BREVO_SENDER_NAME || 'H.Motores - Gestión de Vehículos';
      const appUrl = params.loginUrl || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000/login';

      if (!apiKey) {
        console.warn('⚠️ BREVO_API_KEY no está configurada.');
        return { success: false, error: 'Falta la clave API de Brevo en el entorno.' };
      }

      const roleLabels: Record<string, string> = {
        administrador: 'Administrador',
        jefe_local: 'Jefe de Local',
        ejecutivo: 'Ejecutivo',
        logistica: 'Logística',
      };

      const rolFormat = roleLabels[params.role] || params.role;

      const htmlContent = `
        <!DOCTYPE html>
        <html lang="es">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Credenciales de Acceso - H.Motores</title>
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0f172a; margin: 0; padding: 30px 15px; color: #f8fafc;">
          <table align="center" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; background-color: #1e293b; border-radius: 16px; border: 1px solid #334155; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.5);">
            <!-- Header con banner corporativo -->
            <tr>
              <td style="background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%); padding: 35px 30px; text-align: center;">
                <h1 style="color: #ffffff; margin: 0; font-size: 26px; font-weight: 800; letter-spacing: -0.5px;">H.Motores</h1>
                <p style="color: #dbeafe; margin: 6px 0 0 0; font-size: 13px; font-weight: 500; text-transform: uppercase; letter-spacing: 1px;">Sistema de Gestión y Logística de Vehículos</p>
              </td>
            </tr>

            <!-- Contenido principal -->
            <tr>
              <td style="padding: 35px 30px;">
                <h2 style="color: #f8fafc; font-size: 20px; font-weight: 700; margin: 0 0 12px 0;">¡Hola, ${params.recipientName}!</h2>
                <p style="color: #94a3b8; font-size: 14px; line-height: 1.6; margin: 0 0 25px 0;">
                  Se ha creado tu cuenta corporativa para acceder a la plataforma interna de gestión y traslado de vehículos de H.Motores.
                </p>

                <!-- Tarjeta de Credenciales -->
                <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #0f172a; border-radius: 12px; border: 1px solid #334155; margin-bottom: 25px;">
                  <tr>
                    <td style="padding: 20px;">
                      <table width="100%" cellpadding="0" cellspacing="0">
                        <tr>
                          <td style="padding: 6px 0; color: #64748b; font-size: 12px; text-transform: uppercase; font-weight: 600;">Correo Electrónico:</td>
                        </tr>
                        <tr>
                          <td style="padding: 0 0 14px 0; color: #38bdf8; font-size: 15px; font-weight: 700; font-family: monospace;">${params.toEmail}</td>
                        </tr>
                        <tr>
                          <td style="padding: 6px 0; color: #64748b; font-size: 12px; text-transform: uppercase; font-weight: 600;">Rol Asignado:</td>
                        </tr>
                        <tr>
                          <td style="padding: 0 0 14px 0; color: #c084fc; font-size: 14px; font-weight: 600;">${rolFormat}</td>
                        </tr>
                        <tr>
                          <td style="padding: 6px 0; color: #64748b; font-size: 12px; text-transform: uppercase; font-weight: 600;">Contraseña Provisoria de Acceso:</td>
                        </tr>
                        <tr>
                          <td style="padding: 0 0 4px 0; color: #f59e0b; font-size: 20px; font-weight: 800; letter-spacing: 2px; font-family: monospace;">${params.tempPassword}</td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>

                <!-- Nota de seguridad importante -->
                <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #1e1b4b; border-radius: 10px; border: 1px solid #4338ca; margin-bottom: 30px;">
                  <tr>
                    <td style="padding: 14px 16px;">
                      <p style="margin: 0; color: #a5b4fc; font-size: 12px; line-height: 1.5;">
                        🔒 <strong>Primer Ingreso Obligatorio:</strong> Al ingresar con esta contraseña provisoria, el sistema te solicitará inmediatamente que definas tu propia <strong>contraseña personal definitiva</strong> para mayor seguridad.
                      </p>
                    </td>
                  </tr>
                </table>

                <!-- Botón de Ingreso -->
                <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 25px;">
                  <tr>
                    <td align="center">
                      <a href="${appUrl}" target="_blank" style="display: inline-block; background-color: #2563eb; color: #ffffff; text-decoration: none; font-size: 14px; font-weight: 700; padding: 14px 32px; border-radius: 10px; box-shadow: 0 4px 12px rgba(37, 99, 235, 0.4);">
                        Ingresar a la Plataforma &rarr;
                      </a>
                    </td>
                  </tr>
                </table>

                <p style="color: #64748b; font-size: 12px; line-height: 1.5; text-align: center; margin: 0;">
                  Si el botón no funciona, puedes copiar y pegar el siguiente enlace en tu navegador:<br>
                  <a href="${appUrl}" style="color: #60a5fa; word-break: break-all;">${appUrl}</a>
                </p>
              </td>
            </tr>

            <!-- Footer -->
            <tr>
              <td style="background-color: #0f172a; padding: 20px 30px; border-top: 1px solid #334155; text-align: center;">
                <p style="color: #64748b; font-size: 11px; margin: 0;">
                  Este es un correo automático enviado por el Sistema de Logística H.Motores.<br>
                  Por seguridad, no compartas tus credenciales con terceros.
                </p>
              </td>
            </tr>
          </table>
        </body>
        </html>
      `;

      const response = await fetch(this.BREVO_API_URL, {
        method: 'POST',
        headers: {
          'accept': 'application/json',
          'api-key': apiKey,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          sender: {
            name: senderName,
            email: senderEmail,
          },
          to: [
            {
              email: params.toEmail,
              name: params.recipientName,
            },
          ],
          subject: 'Tus credenciales de acceso - Sistema de Gestión de Vehículos H.Motores',
          htmlContent,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('❌ Error de Brevo API:', errorData);
        return {
          success: false,
          error: errorData.message || `Error HTTP ${response.status} al enviar correo con Brevo.`,
        };
      }

      const responseData = await response.json();
      console.log('✅ Correo enviado con éxito vía Brevo. ID:', responseData.messageId);

      return {
        success: true,
        messageId: responseData.messageId,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al conectar con la API de Brevo';
      console.error('❌ Excepción en EmailService:', msg);
      return { success: false, error: msg };
    }
  }
}
