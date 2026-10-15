import {
  DESTINATARIOS_POR_EVENTO,
  type Destinatario,
  type EventoNotificacion,
  type RolDestinatario,
} from '@/lib/notificaciones';

/**
 * Notificaciones dentro de la app (campana del encabezado) por cada cambio de
 * estado de una solicitud o traslado interno.
 *
 * Complementan a los correos de R7 (`lib/notificaciones.ts`): cubren todos los
 * cambios de estado, no solo los hitos críticos. Los correos no cambian.
 *
 * Funciones puras: no tocan la BD, la red ni React.
 */

export type EventoApp =
  | EventoNotificacion
  | 'solicitud_priorizada'
  | 'solicitud_asignada'
  | 'solicitud_descalendarizada'
  | 'solicitud_despacho_revertido'
  | 'solicitud_finalizada'
  | 'solicitud_cancelada';

/** Valores del enum `public.tipo_notificacion` que usa la app. */
export type TipoNotificacion =
  | 'NUEVA_SOLICITUD'
  | 'SOLICITUD_APROBADA'
  | 'SOLICITUD_RECHAZADA'
  | 'SOLICITUD_PRIORIZADA'
  | 'SOLICITUD_ASIGNADA'
  | 'SOLICITUD_CALENDARIZADA'
  | 'SOLICITUD_RECALENDARIZADA'
  | 'SOLICITUD_DESCALENDARIZADA'
  | 'SOLICITUD_EN_TRANSITO'
  | 'SOLICITUD_DESPACHO_REVERTIDO'
  | 'SOLICITUD_ENTREGADA'
  | 'SOLICITUD_FINALIZADA'
  | 'SOLICITUD_CANCELADA'
  | 'SOLICITUD_CANCELADA_TRANSITO'
  | 'TRASLADO_INTERNO_CANCELADO';

/** Quién recibe la notificación en la app por cada evento (acordado el 2026-10-14). */
export const DESTINATARIOS_APP: Record<EventoApp, RolDestinatario[]> = {
  solicitud_creada: ['jefe_origen'],
  solicitud_aprobada: ['ejecutivo', 'logistica_zona'],
  solicitud_rechazada: ['ejecutivo'],
  solicitud_priorizada: ['ejecutivo'],
  solicitud_asignada: ['logistica_encargado', 'ejecutivo'],
  solicitud_calendarizada: ['ejecutivo', 'jefe_origen', 'jefe_recepcion'],
  solicitud_recalendarizada: ['ejecutivo', 'jefe_origen', 'jefe_recepcion'],
  solicitud_descalendarizada: ['ejecutivo', 'jefe_origen'],
  solicitud_despachada: ['jefe_recepcion', 'ejecutivo'],
  solicitud_despacho_revertido: ['jefe_recepcion', 'ejecutivo'],
  solicitud_recepcionada: ['ejecutivo', 'logistica_encargado'],
  solicitud_finalizada: ['jefe_origen', 'logistica_encargado'],
  solicitud_cancelada: ['ejecutivo', 'jefe_origen', 'logistica_encargado'],
  solicitud_cancelada_transito: ['ejecutivo', 'jefe_origen', 'jefe_recepcion', 'logistica_encargado'],
  traslado_interno_cancelado: ['jefe_origen', 'jefe_recepcion', 'logistica_encargado'],
};

export const TIPO_NOTIFICACION_POR_EVENTO: Record<EventoApp, TipoNotificacion> = {
  solicitud_creada: 'NUEVA_SOLICITUD',
  solicitud_aprobada: 'SOLICITUD_APROBADA',
  solicitud_rechazada: 'SOLICITUD_RECHAZADA',
  solicitud_priorizada: 'SOLICITUD_PRIORIZADA',
  solicitud_asignada: 'SOLICITUD_ASIGNADA',
  solicitud_calendarizada: 'SOLICITUD_CALENDARIZADA',
  solicitud_recalendarizada: 'SOLICITUD_RECALENDARIZADA',
  solicitud_descalendarizada: 'SOLICITUD_DESCALENDARIZADA',
  solicitud_despachada: 'SOLICITUD_EN_TRANSITO',
  solicitud_despacho_revertido: 'SOLICITUD_DESPACHO_REVERTIDO',
  solicitud_recepcionada: 'SOLICITUD_ENTREGADA',
  solicitud_finalizada: 'SOLICITUD_FINALIZADA',
  solicitud_cancelada: 'SOLICITUD_CANCELADA',
  solicitud_cancelada_transito: 'SOLICITUD_CANCELADA_TRANSITO',
  traslado_interno_cancelado: 'TRASLADO_INTERNO_CANCELADO',
};

/** El evento también tiene correo (R7). */
export function esEventoConCorreo(evento: EventoApp): evento is EventoNotificacion {
  return Object.prototype.hasOwnProperty.call(DESTINATARIOS_POR_EVENTO, evento);
}

/**
 * Une los destinatarios de cada rol sin repetir usuarios y sin incluir a quien
 * realizó la acción. A diferencia del correo, se deduplica por id.
 */
export function resolverDestinatariosApp(
  evento: EventoApp,
  porRol: Partial<Record<RolDestinatario, Destinatario[]>>,
  actorId: string | null
): Destinatario[] {
  const vistos = new Set<string>();
  const resultado: Destinatario[] = [];
  for (const rol of DESTINATARIOS_APP[evento]) {
    for (const d of porRol[rol] ?? []) {
      if (!d.id || d.id === actorId || vistos.has(d.id)) continue;
      vistos.add(d.id);
      resultado.push(d);
    }
  }
  return resultado;
}

export interface DatosNotificacionApp {
  /** Identificador corto visible (8 primeros caracteres del UUID). */
  codigo: string;
  origen: string;
  destino: string;
  fechaProgramada?: string | null;
  fechaAnterior?: string | null;
  motivo?: string | null;
  conNovedades?: boolean;
}

export interface TextoNotificacion {
  titulo: string;
  mensaje: string;
}

/** Largo máximo del mensaje guardado (el motivo lo escribe un usuario). */
export const MAX_MENSAJE_NOTIFICACION = 300;

function recortar(texto: string, max: number): string {
  return texto.length <= max ? texto : `${texto.slice(0, max - 1).trimEnd()}…`;
}

export function textoNotificacion(evento: EventoApp, d: DatosNotificacionApp): TextoNotificacion {
  const ref = `#${d.codigo} (${d.origen} → ${d.destino})`;
  const motivo = d.motivo?.trim() ? ` Motivo: ${d.motivo.trim()}` : '';
  const fecha = d.fechaProgramada ? ` para el ${d.fechaProgramada}` : '';

  const textos: Record<EventoApp, TextoNotificacion> = {
    solicitud_creada: { titulo: 'Nueva solicitud por aprobar', mensaje: `La solicitud ${ref} espera tu aprobación.` },
    solicitud_aprobada: { titulo: 'Solicitud aprobada', mensaje: `La solicitud ${ref} fue aprobada.` },
    solicitud_rechazada: { titulo: 'Solicitud rechazada', mensaje: `La solicitud ${ref} fue rechazada.${motivo}` },
    solicitud_priorizada: { titulo: 'Solicitud en la cola', mensaje: `La solicitud ${ref} entró a la cola de prioridades.` },
    solicitud_asignada: { titulo: 'Responsable de Logística asignado', mensaje: `La solicitud ${ref} ya tiene responsable de Logística.` },
    solicitud_calendarizada: { titulo: 'Traslado programado', mensaje: `El traslado de la solicitud ${ref} quedó programado${fecha}.` },
    solicitud_recalendarizada: {
      titulo: 'Traslado reprogramado',
      mensaje: `El traslado de la solicitud ${ref} se reprogramó${fecha}${d.fechaAnterior ? ` (antes: ${d.fechaAnterior})` : ''}.${motivo}`,
    },
    solicitud_descalendarizada: { titulo: 'Programación quitada', mensaje: `La solicitud ${ref} volvió a la cola sin fecha de despacho.` },
    solicitud_despachada: { titulo: 'Vehículo en camino', mensaje: `La solicitud ${ref} fue despachada y va en tránsito.` },
    solicitud_despacho_revertido: { titulo: 'Despacho revertido', mensaje: `Se revirtió el despacho de la solicitud ${ref}: vuelve a estar programada.` },
    solicitud_recepcionada: {
      titulo: d.conNovedades ? 'Recibida con novedades' : 'Vehículo recibido',
      mensaje: `La solicitud ${ref} fue recibida en destino${d.conNovedades ? ' con novedades' : ''}.`,
    },
    solicitud_finalizada: { titulo: 'Solicitud finalizada', mensaje: `La solicitud ${ref} se entregó al cliente y quedó finalizada.` },
    solicitud_cancelada: { titulo: 'Solicitud cancelada', mensaje: `La solicitud ${ref} fue cancelada.${motivo}` },
    solicitud_cancelada_transito: { titulo: 'Traslado cancelado en tránsito', mensaje: `El traslado de la solicitud ${ref} se canceló en tránsito.${motivo}` },
    traslado_interno_cancelado: {
      titulo: 'Traslado interno cancelado',
      mensaje: `El traslado interno #${d.codigo} (${d.origen} → ${d.destino}) se canceló en tránsito.${motivo}`,
    },
  };

  const t = textos[evento];
  return { titulo: t.titulo, mensaje: recortar(t.mensaje, MAX_MENSAJE_NOTIFICACION) };
}

/**
 * Antigüedad legible de una notificación ("Hace 5 min", "Hace 2 h", "Hace 3 días").
 * Más de una semana: la fecha (dd-mm-aaaa). `ahora` se inyecta para los tests.
 */
export function tiempoRelativo(fechaIso: string, ahora: Date = new Date()): string {
  const fecha = new Date(fechaIso);
  if (Number.isNaN(fecha.getTime())) return '';
  const minutos = Math.floor((ahora.getTime() - fecha.getTime()) / 60_000);
  if (minutos < 1) return 'Ahora';
  if (minutos < 60) return `Hace ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `Hace ${horas} h`;
  const dias = Math.floor(horas / 24);
  if (dias < 7) return dias === 1 ? 'Ayer' : `Hace ${dias} días`;
  return fecha.toLocaleDateString('es-CL', { timeZone: 'America/Santiago' });
}

/** Ruta que abre la notificación: el detalle de la solicitud o la bandeja de traslados. */
export function rutaNotificacion(entidad: 'solicitud' | 'traslado_interno', entidadId: string): string {
  return entidad === 'solicitud'
    ? `/solicitudes?solicitud=${encodeURIComponent(entidadId)}`
    : '/solicitudes/traslados';
}
