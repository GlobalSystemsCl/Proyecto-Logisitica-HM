import { getAppUrl } from '@/lib/env';
import { renderLayoutCorreo, renderTextoPlano, type LayoutCorreo } from '@/lib/plantillaCorreo';

export interface SendCredentialsParams {
  toEmail: string;
  recipientName: string;
  tempPassword: string;
  role: string;
  loginUrl?: string;
  /** `nueva`: cuenta recién creada (por defecto). `restablecida`: el administrador generó otra clave. */
  motivo?: 'nueva' | 'restablecida';
}

export interface EnviarCorreoParams {
  toEmail: string;
  toName: string;
  asunto: string;
  html: string;
  /** Versión de texto plano (mejora la entrega). */
  texto?: string;
}

export interface ResultadoEnvio {
  success: boolean;
  error?: string;
  messageId?: string;
}

const ETIQUETA_ROL: Record<string, string> = {
  administrador: 'Administrador',
  jefe_local: 'Jefe de Local',
  ejecutivo: 'Ejecutivo',
  logistica: 'Logística',
};

export const ASUNTO_CREDENCIALES = '[H.Motores] Tus credenciales de acceso';
export const ASUNTO_CLAVE_RESTABLECIDA = '[H.Motores] Tu nueva contraseña provisoria';

/**
 * Correo con la contraseña provisoria (cuenta nueva o clave restablecida por
 * el administrador). Función pura: el escape lo hace la plantilla.
 */
export function layoutCredenciales(params: SendCredentialsParams, appUrl: string): LayoutCorreo {
  const nueva = (params.motivo ?? 'nueva') === 'nueva';
  const loginUrl = params.loginUrl || `${appUrl.replace(/\/+$/, '')}/login`;
  return {
    asunto: nueva ? ASUNTO_CREDENCIALES : ASUNTO_CLAVE_RESTABLECIDA,
    vistaPrevia: nueva
      ? 'Tu cuenta en el Sistema de Logística HMotores está lista.'
      : 'El administrador generó una nueva contraseña provisoria para tu cuenta.',
    etiqueta: { texto: nueva ? 'Cuenta creada' : 'Contraseña restablecida', tono: 'info' },
    titulo: nueva ? 'Tu cuenta está lista' : 'Nueva contraseña provisoria',
    nombre: params.recipientName,
    parrafos: [
      nueva
        ? 'Se creó tu cuenta corporativa para entrar a la plataforma de gestión y traslado de vehículos de HMotores.'
        : 'El administrador generó una nueva contraseña provisoria para tu cuenta. La anterior ya no funciona.',
    ],
    detalles: [
      ['Correo', params.toEmail],
      ['Rol', ETIQUETA_ROL[params.role] || params.role],
      ['Contraseña provisoria', params.tempPassword],
    ],
    detallesMonoespaciados: ['Correo', 'Contraseña provisoria'],
    aviso: {
      texto: 'Al entrar con esta contraseña provisoria, el sistema te pedirá que elijas tu contraseña personal.',
      tono: 'aviso',
    },
    boton: { texto: 'Ingresar a la plataforma', url: loginUrl },
    notas: ['Por seguridad, no compartas tus credenciales con nadie.'],
    appUrl,
  };
}

export class EmailService {
  private static readonly BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email';

  /**
   * Envía un correo HTML con la API de Brevo. El HTML debe venir ya escapado.
   * Nunca lanza: los errores vuelven en `{ success: false }` para que quien
   * notifique no interrumpa la operación principal.
   */
  static async enviarCorreo(params: EnviarCorreoParams): Promise<ResultadoEnvio> {
    try {
      const apiKey = process.env.BREVO_API_KEY;
      const senderEmail = process.env.BREVO_SENDER_EMAIL || 'globalsystemschile@gmail.com';
      const senderName = process.env.BREVO_SENDER_NAME || 'H.Motores - Gestión de Vehículos';

      if (!apiKey) {
        console.warn('⚠️ BREVO_API_KEY no está configurada.');
        return { success: false, error: 'Falta la clave API de Brevo en el entorno.' };
      }

      const response = await fetch(this.BREVO_API_URL, {
        method: 'POST',
        headers: {
          'accept': 'application/json',
          'api-key': apiKey,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          sender: { name: senderName, email: senderEmail },
          to: [{ email: params.toEmail, name: params.toName }],
          subject: params.asunto,
          htmlContent: params.html,
          ...(params.texto ? { textContent: params.texto } : {}),
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
      return { success: true, messageId: responseData.messageId };
    } catch (err: unknown) {
      console.error('❌ Excepción en EmailService:', err);
      return { success: false, error: 'Error al conectar con la API de Brevo' };
    }
  }

  /**
   * Envía la contraseña provisoria (cuenta nueva o restablecida) con Brevo.
   */
  static async sendUserCredentialsEmail(params: SendCredentialsParams): Promise<{
    success: boolean;
    error?: string;
    messageId?: string;
  }> {
    try {
      const layout = layoutCredenciales(params, getAppUrl());

      const resultado = await this.enviarCorreo({
        toEmail: params.toEmail,
        toName: params.recipientName,
        asunto: layout.asunto,
        html: renderLayoutCorreo(layout),
        texto: renderTextoPlano(layout),
      });
      if (resultado.success) console.log('✅ Correo enviado con éxito vía Brevo. ID:', resultado.messageId);
      return resultado;
    } catch (err: unknown) {
      const msg = 'Error al conectar con la API de Brevo';
      console.error('❌ Excepción en EmailService:', err);
      return { success: false, error: msg };
    }
  }
}
