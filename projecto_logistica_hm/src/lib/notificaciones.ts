import { ETIQUETA_FECHA_LIMITE } from '@/lib/textos';
import { ROL_LABEL, type UserRole } from '@/types/auth.types';
import { renderLayoutCorreo, renderTextoPlano, type AvisoCorreo, type LayoutCorreo } from '@/lib/plantillaCorreo';

/**
 * Correos del flujo de solicitudes y traslados internos (R7, completado el
 * 2026-11-11).
 *
 * Criterio para no saturar: hay correo solo si el destinatario debe actuar,
 * si cambió un plan con el que contaba o si se cerró algo que él inició. El
 * resto va solo a la campana (`lib/notificaciones-app.ts`). Un correo por
 * evento y por persona; nunca a quien hizo la acción. Los topes diarios están
 * en `lib/topeCorreos.ts`.
 *
 * Funciones puras: no tocan la BD, la red ni React.
 */

export type EventoNotificacion =
  | 'solicitud_creada'
  | 'solicitud_aprobada'
  | 'solicitud_rechazada'
  | 'solicitud_calendarizada'
  | 'solicitud_recalendarizada'
  | 'solicitud_descalendarizada'
  | 'solicitud_despachada'
  | 'solicitud_despacho_revertido'
  | 'solicitud_recepcionada'
  | 'solicitud_finalizada'
  | 'solicitud_cancelada'
  | 'solicitud_cancelada_transito'
  | 'solicitud_insistencia'
  | 'traslado_interno_creado'
  | 'traslado_interno_despachado'
  | 'traslado_interno_recepcionado'
  | 'traslado_interno_cancelado';

export type EventoTraslado = Extract<EventoNotificacion, `traslado_interno_${string}`>;

/**
 * Participantes a los que puede ir dirigido un aviso. `jefe_ubicacion` es el
 * Jefe de Local de la sucursal donde está físicamente el vehículo: es quien lo
 * entrega al transportista.
 */
export type RolDestinatario =
  | 'ejecutivo'
  | 'jefe_origen'
  | 'jefe_recepcion'
  | 'jefe_ubicacion'
  | 'logistica_encargado'
  | 'logistica_zona';

/** Quienes cuentan con la fecha de despacho programada. */
const PROGRAMACION: readonly RolDestinatario[] = ['ejecutivo', 'jefe_origen', 'jefe_recepcion', 'jefe_ubicacion'];

/**
 * Destinatarios del correo por evento. En `solicitud_cancelada` y
 * `solicitud_insistencia` es el máximo posible: los reales dependen del estado
 * (`rolesSegunEstado`).
 */
export const DESTINATARIOS_POR_EVENTO: Record<EventoNotificacion, RolDestinatario[]> = {
  solicitud_creada: ['jefe_origen'],
  solicitud_aprobada: ['ejecutivo', 'logistica_zona'],
  solicitud_rechazada: ['ejecutivo'],
  solicitud_calendarizada: [...PROGRAMACION],
  solicitud_recalendarizada: [...PROGRAMACION],
  solicitud_descalendarizada: [...PROGRAMACION],
  solicitud_despachada: ['jefe_recepcion', 'ejecutivo'],
  solicitud_despacho_revertido: ['jefe_recepcion', 'ejecutivo'],
  solicitud_recepcionada: ['ejecutivo', 'logistica_encargado', 'jefe_origen'],
  solicitud_finalizada: ['ejecutivo', 'jefe_origen'],
  solicitud_cancelada: ['ejecutivo', 'jefe_origen', 'jefe_recepcion', 'jefe_ubicacion', 'logistica_encargado', 'logistica_zona'],
  solicitud_cancelada_transito: ['ejecutivo', 'jefe_origen', 'jefe_recepcion', 'logistica_encargado'],
  solicitud_insistencia: ['jefe_origen', 'logistica_encargado', 'logistica_zona'],
  traslado_interno_creado: ['jefe_recepcion', 'jefe_origen'],
  traslado_interno_despachado: ['jefe_recepcion'],
  traslado_interno_recepcionado: ['logistica_encargado'],
  traslado_interno_cancelado: ['jefe_origen', 'jefe_recepcion', 'logistica_encargado'],
};

/** Urgentes: cambian un plan ya comunicado. Salen siempre, aunque se haya llegado al tope diario. */
export const EVENTOS_URGENTES: ReadonlySet<EventoNotificacion> = new Set([
  'solicitud_recalendarizada',
  'solicitud_despacho_revertido',
  'solicitud_cancelada_transito',
  'traslado_interno_cancelado',
]);

export function esEventoDeTraslado(evento: string): evento is EventoTraslado {
  return evento.startsWith('traslado_interno_');
}

/**
 * Cancelación antes del tránsito: solo se avisa a quien ya sabía de la
 * solicitud según hasta dónde avanzó. Logística de la zona solo recibe si la
 * solicitud no tenía encargado (lo decide quien carga los participantes).
 */
export function destinatariosCancelacion(estadoAnterior: string | null | undefined): RolDestinatario[] {
  switch (estadoAnterior) {
    case 'aprobada':
    case 'pendiente':
    case 'priorizada':
    case 'asignada':
      return ['ejecutivo', 'jefe_origen', 'logistica_encargado', 'logistica_zona'];
    case 'calendarizada':
      return ['ejecutivo', 'jefe_origen', 'jefe_recepcion', 'jefe_ubicacion', 'logistica_encargado', 'logistica_zona'];
    default:
      return ['ejecutivo', 'jefe_origen'];
  }
}

/**
 * Insistencia del Ejecutivo: avisa a quien tiene la solicitud detenida. El
 * Jefe de Local aprueba y prioriza; desde la cola, la programa Logística (el
 * encargado o, si no hay, la de la zona).
 */
export function destinatariosInsistencia(estado: string | null | undefined): RolDestinatario[] {
  switch (estado) {
    case 'pendiente_aprobacion':
    case 'aprobada':
      return ['jefe_origen'];
    case 'priorizada':
    case 'asignada':
    case 'calendarizada':
      return ['logistica_encargado', 'logistica_zona'];
    default:
      return [];
  }
}

/** Destinatarios que dependen del estado, o `null` si el evento usa su lista fija. */
export function rolesSegunEstado(
  evento: string,
  datos?: { estado?: string | null; estadoAnterior?: string | null }
): RolDestinatario[] | null {
  if (evento === 'solicitud_cancelada') return destinatariosCancelacion(datos?.estadoAnterior);
  if (evento === 'solicitud_insistencia') return destinatariosInsistencia(datos?.estado);
  return null;
}

/** Roles que reciben el correo de este evento, con los datos del caso. */
export function rolesCorreo(evento: EventoNotificacion, datos?: Partial<DatosCorreo>): RolDestinatario[] {
  return rolesSegunEstado(evento, datos) ?? DESTINATARIOS_POR_EVENTO[evento];
}

/** La recepción de un traslado interno solo genera correo si hubo novedades. */
export function correoAplica(evento: EventoNotificacion, datos: Partial<DatosCorreo>): boolean {
  if (evento === 'traslado_interno_recepcionado') return datos.conNovedades === true;
  return true;
}

/** Urgente por el evento o por una recepción con novedades. */
export function esUrgente(evento: EventoNotificacion, datos: Partial<DatosCorreo>): boolean {
  if (EVENTOS_URGENTES.has(evento)) return true;
  return (evento === 'solicitud_recepcionada' || evento === 'traslado_interno_recepcionado') && datos.conNovedades === true;
}

/** Quién hizo la acción, para mostrarlo en el correo ("Ana Soto (Jefe de Local)"). */
export function textoActor(perfil: { nombre: string; apellido: string; rol: string }): string {
  const nombre = `${perfil.nombre ?? ''} ${perfil.apellido ?? ''}`.trim();
  const rol = ROL_LABEL[perfil.rol as UserRole] ?? perfil.rol;
  return nombre ? `${nombre} (${rol})` : rol;
}

export interface Destinatario {
  id: string;
  email: string;
  nombre: string;
}

/** Destinatario con el papel por el que recibe el aviso (define su enlace, R2). */
export type DestinatarioConRol = Destinatario & { rol: RolDestinatario };

/**
 * Une los destinatarios de cada rol sin repetir correos y sin incluir a quien
 * realizó la acción (no se le avisa de lo que él mismo hizo). Si alguien
 * aparece en dos papeles, queda con el primero del orden del evento.
 */
export function resolverDestinatarios(
  evento: EventoNotificacion,
  porRol: Partial<Record<RolDestinatario, Destinatario[]>>,
  actorId: string | null,
  datos?: Partial<DatosCorreo>
): DestinatarioConRol[] {
  const vistos = new Set<string>();
  const resultado: DestinatarioConRol[] = [];
  for (const rol of rolesCorreo(evento, datos)) {
    for (const d of porRol[rol] ?? []) {
      const email = d.email?.trim().toLowerCase();
      if (!email || d.id === actorId || vistos.has(email)) continue;
      vistos.add(email);
      resultado.push({ ...d, email, rol });
    }
  }
  return resultado;
}

export interface DatosCorreo {
  /** N° visible tal cual: `codigoSolicitud` (101-15) o `codigoTraslado` (#ABCD1234). */
  codigo: string;
  origen: string;
  destino: string;
  vehiculos: string[];
  ejecutivo?: string | null;
  fechaLimite?: string | null;
  fechaProgramada?: string | null;
  fechaAnterior?: string | null;
  fechaCreacion?: string | null;
  /** Momentos reales, con hora de Chile (`formatFechaHora`). */
  fechaHoraDespacho?: string | null;
  fechaRecepcion?: string | null;
  fechaEntrega?: string | null;
  transportista?: string | null;
  /** Sucursal(es) donde está el vehículo y se retira. */
  retiroEn?: string | null;
  motivo?: string | null;
  ubicacionFinal?: string | null;
  conNovedades?: boolean;
  observacion?: string | null;
  /** Estado actual (insistencia) y estado antes de cancelar. */
  estado?: string | null;
  estadoAnterior?: string | null;
  /** Texto del usuario: mensaje de la insistencia o de la observación. */
  mensaje?: string | null;
  canceladoPor?: string | null;
}

export interface Plantilla {
  asunto: string;
  titulo: string;
  intro: string;
  detalles: Array<[string, string]>;
  urgente: boolean;
  etiqueta: AvisoCorreo;
  /** Paso de la barra de avance (`PASOS_SOLICITUD`), o `null` sin barra. */
  paso: number | null;
  textoBoton: string;
  vistaPrevia: string;
}

const ETIQUETA_ESTADO: Record<string, string> = {
  pendiente_aprobacion: 'Pendiente de aprobación',
  aprobada: 'Aprobada',
  pendiente: 'Pendiente',
  priorizada: 'En la cola de prioridades',
  asignada: 'Asignada a Logística',
  calendarizada: 'Programada',
  despachada: 'En tránsito',
  en_transito: 'En tránsito',
  entregada: 'Recepcionada',
  finalizada: 'Entregada al cliente',
  cancelada: 'Cancelada',
  rechazada: 'Rechazada',
};

export function etiquetaEstadoSolicitud(estado: string | null | undefined): string {
  if (!estado) return '—';
  return ETIQUETA_ESTADO[estado] ?? estado;
}

/** Paso de la barra de avance según el estado de la solicitud. */
export function pasoDeEstado(estado: string | null | undefined): number | null {
  switch (estado) {
    case 'pendiente_aprobacion':
      return 0;
    case 'aprobada':
    case 'pendiente':
    case 'priorizada':
    case 'asignada':
      return 1;
    case 'calendarizada':
      return 2;
    case 'despachada':
    case 'en_transito':
      return 3;
    case 'entregada':
      return 4;
    case 'finalizada':
      return 5;
    default:
      return null;
  }
}

const PASO_POR_EVENTO: Partial<Record<EventoNotificacion, number>> = {
  solicitud_creada: 0,
  solicitud_aprobada: 1,
  solicitud_calendarizada: 2,
  solicitud_recalendarizada: 2,
  solicitud_descalendarizada: 1,
  solicitud_despachada: 3,
  solicitud_despacho_revertido: 2,
  solicitud_recepcionada: 4,
  solicitud_finalizada: 5,
};

function pasoDelEvento(evento: EventoNotificacion, d: DatosCorreo): number | null {
  if (evento === 'solicitud_insistencia') return pasoDeEstado(d.estado);
  return PASO_POR_EVENTO[evento] ?? null;
}

function fila(etiqueta: string, valor: string | null | undefined): [string, string] | null {
  const v = valor?.trim();
  return v ? [etiqueta, v] : null;
}

interface TextoEvento {
  asunto: string;
  titulo: string;
  intro: string;
  etiqueta: AvisoCorreo;
  extra: Array<[string, string] | null>;
}

export function plantillaCorreo(evento: EventoNotificacion, d: DatosCorreo): Plantilla {
  const urgente = esUrgente(evento, d);
  const prefijo = urgente ? '[URGENTE] ' : '';
  const c = d.codigo;
  const traslado = esEventoDeTraslado(evento);
  const novedades = d.conNovedades === true;

  const base: Array<[string, string] | null> = [
    [traslado ? 'Traslado interno' : 'Solicitud', c],
    ['Ruta', `${d.origen} → ${d.destino}`],
    d.vehiculos.length > 0 ? ['Vehículo(s)', d.vehiculos.join(', ')] : null,
    traslado ? null : fila(ETIQUETA_FECHA_LIMITE, d.fechaLimite),
  ];

  const textos: Record<EventoNotificacion, TextoEvento> = {
    solicitud_creada: {
      asunto: `Nueva solicitud ${c} pendiente de aprobación`,
      titulo: 'Nueva solicitud por aprobar',
      intro: 'Se creó una solicitud en tu sucursal que espera tu aprobación.',
      etiqueta: { texto: 'Por aprobar', tono: 'aviso' },
      extra: [fila('Ejecutivo', d.ejecutivo)],
    },
    solicitud_aprobada: {
      asunto: `Solicitud ${c} aprobada`,
      titulo: 'Solicitud aprobada',
      intro: 'El Jefe de Local aprobó la solicitud. Logística ya puede programar el traslado.',
      etiqueta: { texto: 'Aprobada', tono: 'exito' },
      extra: [],
    },
    solicitud_rechazada: {
      asunto: `Solicitud ${c} rechazada`,
      titulo: 'Solicitud rechazada',
      intro: 'La solicitud fue rechazada. El rechazo es definitivo: si aún necesitas el vehículo, crea una nueva solicitud.',
      etiqueta: { texto: 'Rechazada', tono: 'alerta' },
      extra: [fila('Motivo', d.motivo)],
    },
    solicitud_calendarizada: {
      asunto: `Traslado de la solicitud ${c} programado${d.fechaProgramada ? ` para el ${d.fechaProgramada}` : ''}`,
      titulo: 'Traslado programado',
      intro: 'Logística programó la fecha de despacho del traslado.',
      etiqueta: { texto: 'Programada', tono: 'info' },
      extra: [fila('Fecha de despacho', d.fechaProgramada), fila('Transportista', d.transportista), fila('Retiro en', d.retiroEn)],
    },
    solicitud_recalendarizada: {
      asunto: `${prefijo}Traslado de la solicitud ${c} reprogramado`,
      titulo: 'Traslado reprogramado',
      intro: 'Logística cambió la fecha de despacho del traslado. Revisa la nueva fecha.',
      etiqueta: { texto: 'Reprogramada', tono: 'aviso' },
      extra: [
        fila('Fecha anterior', d.fechaAnterior),
        fila('Nueva fecha de despacho', d.fechaProgramada),
        fila('Transportista', d.transportista),
        fila('Retiro en', d.retiroEn),
        fila('Motivo', d.motivo),
      ],
    },
    solicitud_descalendarizada: {
      asunto: `Solicitud ${c} sin fecha de despacho`,
      titulo: 'Programación quitada',
      intro: 'Logística quitó la fecha de despacho: la solicitud volvió a la cola de prioridades y se programará de nuevo.',
      etiqueta: { texto: 'Sin fecha', tono: 'aviso' },
      extra: [fila('Fecha anulada', d.fechaAnterior)],
    },
    solicitud_despachada: {
      asunto: `Solicitud ${c} en camino`,
      titulo: 'Vehículo en camino',
      intro: `El traslado fue despachado y va en camino a ${d.destino}. Quien recibe debe registrar la recepción al llegar.`,
      etiqueta: { texto: 'En camino', tono: 'info' },
      extra: [fila('Salida', d.fechaHoraDespacho), fila('Transportista', d.transportista)],
    },
    solicitud_despacho_revertido: {
      asunto: `${prefijo}Despacho de la solicitud ${c} revertido`,
      titulo: 'Despacho revertido',
      intro: 'Logística revirtió el despacho: el vehículo no salió y la solicitud volvió a quedar programada.',
      etiqueta: { texto: 'Despacho revertido', tono: 'aviso' },
      extra: [fila('Fecha de despacho programada', d.fechaProgramada), fila('Transportista', d.transportista)],
    },
    solicitud_recepcionada: {
      asunto: `${prefijo}Solicitud ${c} recibida en destino${novedades ? ' con novedades' : ''}`,
      titulo: novedades ? 'Vehículo recibido con novedades' : 'Vehículo recibido',
      intro: novedades
        ? 'El vehículo llegó a destino, pero se registraron novedades en la recepción.'
        : 'El vehículo llegó a destino y quedó listo para la entrega al cliente.',
      etiqueta: novedades ? { texto: 'Recibida con novedades', tono: 'aviso' } : { texto: 'Recibida', tono: 'exito' },
      extra: [fila('Recibida', d.fechaRecepcion), fila('Observación de la recepción', d.observacion)],
    },
    solicitud_finalizada: {
      asunto: `Solicitud ${c} finalizada`,
      titulo: 'Solicitud finalizada',
      intro: 'El vehículo se entregó al cliente y la solicitud quedó cerrada.',
      etiqueta: { texto: 'Finalizada', tono: 'exito' },
      extra: [fila('Entregada al cliente', d.fechaEntrega)],
    },
    solicitud_cancelada: {
      asunto: `Solicitud ${c} cancelada`,
      titulo: 'Solicitud cancelada',
      intro: 'La solicitud fue cancelada: ya no habrá traslado.',
      etiqueta: { texto: 'Cancelada', tono: 'alerta' },
      extra: [
        fila('Motivo', d.motivo),
        fila('Cancelada por', d.canceladoPor),
        d.estadoAnterior ? ['Estado al cancelar', etiquetaEstadoSolicitud(d.estadoAnterior)] : null,
      ],
    },
    solicitud_cancelada_transito: {
      asunto: `${prefijo}Traslado de la solicitud ${c} cancelado en tránsito`,
      titulo: 'Traslado cancelado',
      intro: 'Logística canceló el traslado mientras estaba en tránsito.',
      etiqueta: { texto: 'Cancelada en tránsito', tono: 'alerta' },
      extra: [fila('Motivo', d.motivo), ['Ubicación del vehículo', d.ubicacionFinal || 'Sin sucursal asignada']],
    },
    solicitud_insistencia: {
      asunto: `El ejecutivo pide avanzar la solicitud ${c}`,
      titulo: 'Insistencia del ejecutivo',
      intro: 'El ejecutivo pide que su solicitud avance. Revisa si puedes gestionarla hoy.',
      etiqueta: { texto: 'Insistencia', tono: 'aviso' },
      extra: [
        ['Estado actual', etiquetaEstadoSolicitud(d.estado)],
        fila('Creada', d.fechaCreacion),
        fila('Ejecutivo', d.ejecutivo),
        fila('Mensaje del ejecutivo', d.mensaje),
      ],
    },
    traslado_interno_creado: {
      asunto: `Nuevo traslado interno ${c}: ${d.origen} → ${d.destino}`,
      titulo: 'Nuevo traslado interno',
      intro: 'Logística creó un traslado interno entre sucursales. La sucursal de origen prepara el vehículo y la de destino lo recibe.',
      etiqueta: { texto: 'Traslado interno', tono: 'info' },
      extra: [fila('Transportista', d.transportista), fila('Observación', d.observacion)],
    },
    traslado_interno_despachado: {
      asunto: `Traslado interno ${c} en camino`,
      titulo: 'Traslado interno en camino',
      intro: 'El traslado interno fue despachado y va en camino. Registra la recepción cuando llegue.',
      etiqueta: { texto: 'En camino', tono: 'info' },
      extra: [fila('Salida', d.fechaHoraDespacho), fila('Transportista', d.transportista)],
    },
    traslado_interno_recepcionado: {
      asunto: `${prefijo}Traslado interno ${c} recibido${novedades ? ' con novedades' : ''}`,
      titulo: novedades ? 'Traslado recibido con novedades' : 'Traslado interno recibido',
      intro: novedades
        ? 'El traslado interno llegó a destino, pero se registraron novedades en la recepción.'
        : 'El traslado interno llegó a destino.',
      etiqueta: novedades ? { texto: 'Recibido con novedades', tono: 'aviso' } : { texto: 'Recibido', tono: 'exito' },
      extra: [fila('Recibido', d.fechaRecepcion), fila('Observación de la recepción', d.observacion)],
    },
    traslado_interno_cancelado: {
      asunto: `${prefijo}Traslado interno ${c} cancelado en tránsito`,
      titulo: 'Traslado interno cancelado',
      intro: 'Logística canceló el traslado interno mientras estaba en tránsito.',
      etiqueta: { texto: 'Cancelado', tono: 'alerta' },
      extra: [fila('Motivo', d.motivo), ['Ubicación del vehículo', d.ubicacionFinal || 'Sin sucursal asignada']],
    },
  };

  const t = textos[evento];
  const detalles = [...base, ...t.extra].filter((x): x is [string, string] => x !== null);
  return {
    asunto: `[H.Motores] ${t.asunto}`,
    titulo: t.titulo,
    intro: t.intro,
    detalles,
    urgente,
    etiqueta: t.etiqueta,
    paso: traslado ? null : pasoDelEvento(evento, d),
    textoBoton: `${traslado ? 'Ver traslado' : 'Ver solicitud'} ${c}`,
    vistaPrevia: `${t.titulo}: ${c} (${d.origen} → ${d.destino})`,
  };
}

const PAPEL_SOLICITUD: Record<RolDestinatario, string> = {
  ejecutivo: 'el Ejecutivo de esta solicitud',
  jefe_origen: 'Jefe de Local de la sucursal de esta solicitud',
  jefe_recepcion: 'Jefe de Local de la sucursal que recibe el vehículo',
  jefe_ubicacion: 'Jefe de Local de la sucursal donde está el vehículo',
  logistica_encargado: 'el encargado de Logística de esta solicitud',
  logistica_zona: 'parte de Logística de la zona de esta solicitud',
};

const PAPEL_TRASLADO: Partial<Record<RolDestinatario, string>> = {
  jefe_origen: 'Jefe de Local de la sucursal de origen del traslado',
  jefe_recepcion: 'Jefe de Local de la sucursal de destino del traslado',
  logistica_encargado: 'el encargado de Logística de este traslado',
};

/** Pie del correo: por qué lo recibe esta persona. */
export function motivoEnvio(evento: EventoNotificacion, rol: RolDestinatario | null | undefined): string | null {
  if (!rol) return null;
  const papel = esEventoDeTraslado(evento) ? PAPEL_TRASLADO[rol] : PAPEL_SOLICITUD[rol];
  return papel ? `Recibes este correo porque eres ${papel}.` : null;
}

export interface OpcionesCorreo {
  nombre: string;
  /** Enlace absoluto a la pantalla de acción (`rutaAccion`). */
  enlace: string;
  /** URL pública de la app (logo). */
  appUrl: string;
  motivoEnvio?: string | null;
}

function layout(p: Plantilla, o: OpcionesCorreo): LayoutCorreo {
  return {
    asunto: p.asunto,
    vistaPrevia: p.vistaPrevia,
    etiqueta: p.etiqueta,
    titulo: p.titulo,
    nombre: o.nombre,
    parrafos: [p.intro],
    aviso: p.urgente ? { texto: 'Aviso urgente: requiere tu atención.', tono: 'alerta' } : null,
    paso: p.paso,
    detalles: p.detalles,
    boton: { texto: p.textoBoton, url: o.enlace },
    motivoEnvio: o.motivoEnvio ?? null,
    appUrl: o.appUrl,
  };
}

/** HTML del correo. Todo texto variable se escapa (brecha 022). */
export function renderCorreoHtml(p: Plantilla, o: OpcionesCorreo): string {
  return renderLayoutCorreo(layout(p, o));
}

/** Versión de texto plano del correo. */
export function renderCorreoTexto(p: Plantilla, o: OpcionesCorreo): string {
  return renderTextoPlano(layout(p, o));
}
