import { escapeHtml } from '@/lib/html';
import { ETIQUETA_FECHA_LIMITE } from '@/lib/textos';

/**
 * Notificaciones por correo de las operaciones críticas (R7).
 *
 * Criterio para no saturar: un correo por evento y por destinatario, solo en
 * hitos del flujo (crear, aprobar, rechazar, programar, reprogramar, despachar,
 * recibir y cancelar en tránsito). Reordenar la cola, observaciones o
 * documentos NO generan correos.
 *
 * Funciones puras: no tocan la BD, la red ni React.
 */

export type EventoNotificacion =
  | 'solicitud_creada'
  | 'solicitud_aprobada'
  | 'solicitud_rechazada'
  | 'solicitud_calendarizada'
  | 'solicitud_recalendarizada'
  | 'solicitud_despachada'
  | 'solicitud_recepcionada'
  | 'solicitud_cancelada_transito'
  | 'traslado_interno_cancelado';

/** Participantes a los que puede ir dirigido un correo. */
export type RolDestinatario =
  | 'ejecutivo'
  | 'jefe_origen'
  | 'jefe_recepcion'
  | 'logistica_encargado'
  | 'logistica_zona';

export const DESTINATARIOS_POR_EVENTO: Record<EventoNotificacion, RolDestinatario[]> = {
  solicitud_creada: ['jefe_origen'],
  solicitud_aprobada: ['ejecutivo', 'logistica_zona'],
  solicitud_rechazada: ['ejecutivo'],
  solicitud_calendarizada: ['ejecutivo', 'jefe_origen', 'jefe_recepcion'],
  solicitud_recalendarizada: ['ejecutivo', 'jefe_origen', 'jefe_recepcion'],
  solicitud_despachada: ['jefe_recepcion'],
  solicitud_recepcionada: ['ejecutivo', 'logistica_encargado'],
  solicitud_cancelada_transito: ['ejecutivo', 'jefe_origen', 'jefe_recepcion', 'logistica_encargado'],
  traslado_interno_cancelado: ['jefe_origen', 'jefe_recepcion', 'logistica_encargado'],
};

export const EVENTOS_URGENTES: ReadonlySet<EventoNotificacion> = new Set([
  'solicitud_recalendarizada',
  'solicitud_cancelada_transito',
  'traslado_interno_cancelado',
]);

export interface Destinatario {
  id: string;
  email: string;
  nombre: string;
}

/**
 * Une los destinatarios de cada rol sin repetir correos y sin incluir a quien
 * realizó la acción (no se le avisa de lo que él mismo hizo).
 */
export function resolverDestinatarios(
  evento: EventoNotificacion,
  porRol: Partial<Record<RolDestinatario, Destinatario[]>>,
  actorId: string | null
): Destinatario[] {
  const vistos = new Set<string>();
  const resultado: Destinatario[] = [];
  for (const rol of DESTINATARIOS_POR_EVENTO[evento]) {
    for (const d of porRol[rol] ?? []) {
      const email = d.email?.trim().toLowerCase();
      if (!email || d.id === actorId || vistos.has(email)) continue;
      vistos.add(email);
      resultado.push({ ...d, email });
    }
  }
  return resultado;
}

export interface DatosCorreo {
  /** Identificador corto visible (por ejemplo, los 8 primeros caracteres del UUID). */
  codigo: string;
  origen: string;
  destino: string;
  vehiculos: string[];
  fechaLimite?: string | null;
  fechaProgramada?: string | null;
  fechaAnterior?: string | null;
  motivo?: string | null;
  ubicacionFinal?: string | null;
  conNovedades?: boolean;
  observacion?: string | null;
}

export interface Plantilla {
  asunto: string;
  titulo: string;
  intro: string;
  detalles: Array<[string, string]>;
  urgente: boolean;
}

function lineaFecha(etiqueta: string, valor: string | null | undefined): [string, string] | null {
  return valor ? [etiqueta, valor] : null;
}

export function plantillaCorreo(evento: EventoNotificacion, d: DatosCorreo): Plantilla {
  const urgente = EVENTOS_URGENTES.has(evento);
  const prefijo = urgente ? '[URGENTE] ' : '';
  const ruta = `${d.origen} → ${d.destino}`;
  const base: Array<[string, string] | null> = [
    ['Solicitud', `#${d.codigo}`],
    ['Traslado', ruta],
    d.vehiculos.length > 0 ? ['Vehículo(s)', d.vehiculos.join(', ')] : null,
    lineaFecha(ETIQUETA_FECHA_LIMITE, d.fechaLimite),
  ];

  const textos: Record<EventoNotificacion, { asunto: string; titulo: string; intro: string; extra: Array<[string, string] | null> }> = {
    solicitud_creada: {
      asunto: `Nueva solicitud #${d.codigo} pendiente de aprobación`,
      titulo: 'Nueva solicitud por aprobar',
      intro: 'Se creó una solicitud en tu sucursal que espera tu aprobación.',
      extra: [],
    },
    solicitud_aprobada: {
      asunto: `Solicitud #${d.codigo} aprobada`,
      titulo: 'Solicitud aprobada',
      intro: 'El Jefe de Local aprobó la solicitud. Logística ya puede programar el traslado.',
      extra: [],
    },
    solicitud_rechazada: {
      asunto: `Solicitud #${d.codigo} rechazada`,
      titulo: 'Solicitud rechazada',
      intro: 'La solicitud fue rechazada. El rechazo es definitivo: si aún necesitas el vehículo, crea una nueva solicitud.',
      extra: [d.motivo ? ['Motivo', d.motivo] : null],
    },
    solicitud_calendarizada: {
      asunto: `Traslado de la solicitud #${d.codigo} programado`,
      titulo: 'Traslado programado',
      intro: 'Logística programó la fecha de despacho del traslado.',
      extra: [lineaFecha('Fecha de despacho', d.fechaProgramada)],
    },
    solicitud_recalendarizada: {
      asunto: `${prefijo}Traslado de la solicitud #${d.codigo} reprogramado`,
      titulo: 'Traslado reprogramado',
      intro: 'Logística cambió la fecha de despacho del traslado. Revisa la nueva fecha.',
      extra: [
        lineaFecha('Fecha anterior', d.fechaAnterior),
        lineaFecha('Nueva fecha de despacho', d.fechaProgramada),
        d.motivo ? ['Motivo', d.motivo] : null,
      ],
    },
    solicitud_despachada: {
      asunto: `Solicitud #${d.codigo} en camino a tu sucursal`,
      titulo: 'Vehículo en camino',
      intro: 'El traslado fue despachado y va en camino. Prepara la recepción.',
      extra: [],
    },
    solicitud_recepcionada: {
      asunto: `Solicitud #${d.codigo} recibida en destino${d.conNovedades ? ' con novedades' : ''}`,
      titulo: d.conNovedades ? 'Vehículo recibido con novedades' : 'Vehículo recibido',
      intro: d.conNovedades
        ? 'El vehículo llegó a destino, pero se registraron novedades en la recepción.'
        : 'El vehículo llegó a destino y quedó listo para la entrega al cliente.',
      extra: [d.observacion ? ['Observación de la recepción', d.observacion] : null],
    },
    solicitud_cancelada_transito: {
      asunto: `${prefijo}Traslado de la solicitud #${d.codigo} cancelado en tránsito`,
      titulo: 'Traslado cancelado',
      intro: 'Logística canceló el traslado mientras estaba en tránsito.',
      extra: [
        d.motivo ? ['Motivo', d.motivo] : null,
        ['Ubicación del vehículo', d.ubicacionFinal || 'Sin sucursal asignada'],
      ],
    },
    traslado_interno_cancelado: {
      asunto: `${prefijo}Traslado interno #${d.codigo} cancelado en tránsito`,
      titulo: 'Traslado interno cancelado',
      intro: 'Logística canceló el traslado interno mientras estaba en tránsito.',
      extra: [
        d.motivo ? ['Motivo', d.motivo] : null,
        ['Ubicación del vehículo', d.ubicacionFinal || 'Sin sucursal asignada'],
      ],
    },
  };

  const t = textos[evento];
  const detalles = [...base, ...t.extra].filter((x): x is [string, string] => x !== null);
  if (evento === 'traslado_interno_cancelado') detalles[0] = ['Traslado interno', `#${d.codigo}`];
  return { asunto: `[H.Motores] ${t.asunto}`, titulo: t.titulo, intro: t.intro, detalles, urgente };
}

/** HTML del correo. Todo texto variable se escapa (brecha 022). */
export function renderCorreoHtml(p: Plantilla, nombreDestinatario: string, enlace: string): string {
  const filas = p.detalles
    .map(
      ([k, v]) =>
        `<tr><td style="padding:6px 12px 6px 0;color:#737373;font-size:13px;vertical-align:top;white-space:nowrap">${escapeHtml(k)}</td>` +
        `<td style="padding:6px 0;color:#171717;font-size:14px;font-weight:600">${escapeHtml(v)}</td></tr>`
    )
    .join('');
  const banda = p.urgente
    ? '<p style="margin:0 0 16px 0;padding:10px 14px;border-radius:10px;background:#fef2f2;border:1px solid #fecaca;color:#991b1b;font-size:13px;font-weight:700">Aviso urgente: requiere tu atención</p>'
    : '';
  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>${escapeHtml(p.asunto)}</title></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;background:#f5f5f5;margin:0;padding:24px 12px;color:#171717">
<table align="center" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border-radius:16px;border:1px solid #e5e5e5;overflow:hidden">
<tr><td style="background:#171717;padding:24px 28px"><h1 style="margin:0;color:#fff;font-size:20px">H.Motores</h1>
<p style="margin:4px 0 0 0;color:#a3a3a3;font-size:12px">Sistema de Gestión y Logística de Vehículos</p></td></tr>
<tr><td style="padding:28px">${banda}
<h2 style="margin:0 0 8px 0;font-size:18px">${escapeHtml(p.titulo)}</h2>
<p style="margin:0 0 16px 0;color:#525252;font-size:14px">Hola, ${escapeHtml(nombreDestinatario)}. ${escapeHtml(p.intro)}</p>
<table cellpadding="0" cellspacing="0" style="margin-bottom:20px">${filas}</table>
<a href="${escapeHtml(enlace)}" style="display:inline-block;background:#171717;color:#fff;text-decoration:none;font-size:14px;font-weight:700;padding:12px 24px;border-radius:10px">Ver en la plataforma</a>
</td></tr>
<tr><td style="background:#fafafa;padding:16px 28px;border-top:1px solid #e5e5e5;color:#737373;font-size:11px">Correo automático del Sistema de Logística H.Motores. No respondas a este mensaje.</td></tr>
</table></body></html>`;
}
