import { recibirSolicitudAction, subirDocumentosSolicitudAction } from '@/app/actions/solicitudes.actions';
import type { DatosRecepcion } from '@/lib/recepcion';

/**
 * Recibe una solicitud en destino y, si hay fotos, las adjunta como documentos
 * de la solicitud. Lo usan el calendario de logística y la bandeja de
 * recepciones.
 *
 * Devuelve `null` si la recepción quedó registrada, o el mensaje de error. Si
 * la recepción se registra pero las fotos fallan, se informa sin revertir.
 */
export async function recibirSolicitudConFotos(
  solicitudId: string,
  datos: DatosRecepcion,
  fotos: File[]
): Promise<{ error: string | null; aviso: string | null }> {
  const resultado = await recibirSolicitudAction(solicitudId, datos);
  if (!resultado.success) return { error: resultado.error ?? 'No se pudo registrar la recepción.', aviso: null };

  if (fotos.length === 0) return { error: null, aviso: null };

  const fd = new FormData();
  fotos.forEach((f) => fd.append('archivos', f));
  const subida = await subirDocumentosSolicitudAction(solicitudId, fd);
  if (!subida.success) {
    return {
      error: null,
      aviso: `La recepción quedó registrada, pero no se pudieron adjuntar las fotos: ${subida.error ?? 'error desconocido'}`,
    };
  }
  return { error: null, aviso: null };
}
