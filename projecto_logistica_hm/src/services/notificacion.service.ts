import { createAdminClient } from '@/lib/supabase/admin';
import { EmailService } from '@/services/email.service';
import { SolicitudesService } from '@/services/solicitudes.service';
import { TrasladoService } from '@/services/traslado.service';
import { OrganizacionService } from '@/services/organizacion.service';
import {
  correoAplica,
  motivoEnvio,
  plantillaCorreo,
  renderCorreoHtml,
  renderCorreoTexto,
  resolverDestinatarios,
  rolesCorreo,
  type DatosCorreo,
  type Destinatario,
  type DestinatarioConRol,
  type EventoNotificacion,
  type EventoTraslado,
  type RolDestinatario,
} from '@/lib/notificaciones';
import {
  TIPO_NOTIFICACION_POR_EVENTO,
  TIPO_NUEVO_USUARIO,
  esEventoConCorreo,
  resolverDestinatariosApp,
  rolesApp,
  rutaAccion,
  textoNotificacion,
  textoNotificacionNuevoUsuario,
  rutaNuevoUsuario,
  type DatosNotificacionApp,
  type DatosNuevoUsuario,
  type EventoApp,
} from '@/lib/notificaciones-app';
import { decidirEnvio, esDuplicado, inicioDelDiaChile, topesDesdeEntorno } from '@/lib/topeCorreos';
import { etiquetaVehiculo } from '@/lib/vehiculo';
import { formatFecha, formatFechaHora } from '@/lib/fechas';
import { getAppUrl } from '@/lib/env';
import { codigoSolicitud, codigoTraslado } from '@/lib/codigoSolicitud';
import type { SolicitudLista } from '@/types/solicitud.types';

export interface ResultadoNotificacion {
  /** Correos enviados y fallidos (R7). */
  enviados: number;
  fallidos: number;
  /** Correos no enviados por el tope diario o por repetidos. */
  omitidos: number;
  /** Notificaciones creadas en la app (campana). */
  enApp: number;
}

const SIN_ENVIOS: ResultadoNotificacion = { enviados: 0, fallidos: 0, omitidos: 0, enApp: 0 };

type Entidad = 'solicitud' | 'traslado_interno';

/** Estado de cada intento en `correo_envio`. */
export type EstadoCorreoEnvio = 'enviado' | 'fallido' | 'omitido_tope' | 'duplicado';

interface RegistroCorreo {
  evento: EventoNotificacion;
  entidad: Entidad;
  entidad_id: string;
  usuario_id: string;
  email: string;
  estado: EstadoCorreoEnvio;
  urgente: boolean;
  message_id: string | null;
  error: string | null;
}

/** Envíos de hoy que necesitan los topes y el anti-duplicado. */
export interface ControlEnvio {
  enviadosHoy: number;
  /** Correos no urgentes enviados hoy, por usuario. */
  noUrgentesHoy: Map<string, number>;
  /** Último envío de este mismo aviso (evento + entidad), por usuario. */
  ultimoEnvio: Map<string, string>;
}

/** Notificación de la bandeja del usuario. */
export interface NotificacionApp {
  id: string;
  tipo: string;
  titulo: string;
  mensaje: string;
  leida: boolean;
  ruta: string | null;
  created_at: string;
}

export interface BandejaNotificaciones {
  items: NotificacionApp[];
  noLeidas: number;
}

/** Cantidad de notificaciones que muestra la campana. */
export const LIMITE_BANDEJA = 20;

/** Eventos cuyo correo muestra desde qué sucursal se retira el vehículo. */
const EVENTOS_CON_RETIRO: ReadonlySet<EventoApp> = new Set(['solicitud_calendarizada', 'solicitud_recalendarizada']);

/**
 * Avisos del flujo: correo en los hitos (`lib/notificaciones`) y notificación
 * en la app (campana) en todos los cambios de estado.
 *
 * Carga solo los participantes que el evento necesita, arma el correo, aplica
 * el tope diario y el anti-duplicado (`lib/topeCorreos`, tabla
 * `correo_envio`), lo envía con Brevo e inserta una fila en `notificacion` por
 * destinatario. Nunca lanza: un fallo no debe afectar la operación que lo
 * originó (se llama desde `after`).
 */
export class NotificacionService {
  /**
   * Usuarios activos con correo, por id. Si se indican `roles`, solo los que
   * tienen alguno de esos roles.
   */
  static async usuariosPorIds(
    ids: Array<string | null | undefined>,
    roles?: string[]
  ): Promise<Destinatario[]> {
    const unicos = [...new Set(ids.filter((id): id is string => Boolean(id)))];
    if (unicos.length === 0) return [];
    const admin = createAdminClient();
    const { data, error } = await admin
      .from('usuario')
      .select('id, email, nombre, apellido, rol, activo')
      .in('id', unicos);
    if (error || !data) return [];
    return (data as Array<{ id: string; email: string; nombre: string; apellido: string; rol: string; activo: boolean }>)
      .filter((u) => u.activo !== false && u.email && (!roles || roles.includes(u.rol)))
      .map((u) => ({ id: u.id, email: u.email, nombre: `${u.nombre} ${u.apellido}`.trim() }));
  }

  /**
   * Jefes de Local de una sucursal: los que la tienen como principal y su
   * encargado (si el encargado es Jefe de Local).
   */
  static async jefesDeSucursal(sucursalId: number | null | undefined): Promise<Destinatario[]> {
    if (!sucursalId) return [];
    const admin = createAdminClient();
    const [principal, encargado] = await Promise.all([
      admin.from('usuario').select('id').eq('rol', 'jefe_local').eq('sucursal_id', sucursalId),
      admin.from('sucursal').select('usuario_id').eq('id', sucursalId).maybeSingle(),
    ]);
    const ids = ((principal.data as Array<{ id: string }> | null) ?? []).map((u) => u.id);
    const encargadoId = (encargado.data as { usuario_id: string | null } | null)?.usuario_id;
    return NotificacionService.usuariosPorIds([...ids, encargadoId], ['jefe_local']);
  }

  /**
   * Jefes de Local de las sucursales donde están los vehículos (quienes los
   * entregan al transportista), sin repetir.
   */
  static async jefesDeSucursales(sucursalIds: number[]): Promise<Destinatario[]> {
    const unicas = [...new Set(sucursalIds.filter((id) => Number.isInteger(id) && id > 0))];
    if (unicas.length === 0) return [];
    const listas = await Promise.all(unicas.map((id) => NotificacionService.jefesDeSucursal(id)));
    const porId = new Map(listas.flat().map((d) => [d.id, d]));
    return [...porId.values()];
  }

  /** Usuarios de Logística asignados a la zona de una sucursal. */
  static async logisticaDeSucursal(sucursalId: number | null | undefined): Promise<Destinatario[]> {
    if (!sucursalId) return [];
    const sucursal = await OrganizacionService.getBranch(sucursalId);
    if (!sucursal?.zona_id) return [];
    const admin = createAdminClient();
    const { data } = await admin.from('usuario_zona').select('usuario_id').eq('zona_id', sucursal.zona_id);
    const ids = ((data as Array<{ usuario_id: string }> | null) ?? []).map((r) => r.usuario_id);
    return NotificacionService.usuariosPorIds(ids, ['logistica']);
  }

  /**
   * Correos enviados hoy (hora de Chile) en total y a estos usuarios. Si la
   * consulta falla (por ejemplo, sin la tabla `correo_envio`), devuelve `null`
   * y el envío sigue sin topes: no se pierde un aviso por un fallo del registro.
   */
  static async controlEnvio(
    evento: EventoNotificacion,
    entidadId: string,
    usuarioIds: string[]
  ): Promise<ControlEnvio | null> {
    try {
      const admin = createAdminClient();
      const desde = inicioDelDiaChile();
      const [total, propios] = await Promise.all([
        admin
          .from('correo_envio')
          .select('id', { count: 'exact', head: true })
          .eq('estado', 'enviado')
          .gte('created_at', desde),
        admin
          .from('correo_envio')
          .select('usuario_id, evento, entidad_id, urgente, created_at')
          .eq('estado', 'enviado')
          .in('usuario_id', usuarioIds)
          .gte('created_at', desde),
      ]);
      if (total.error || propios.error) {
        console.warn('[correos] No se pudo leer el registro de envíos; se envía sin topes.', total.error ?? propios.error);
        return null;
      }
      const noUrgentesHoy = new Map<string, number>();
      const ultimoEnvio = new Map<string, string>();
      const filas = (propios.data ?? []) as Array<{
        usuario_id: string;
        evento: string;
        entidad_id: string;
        urgente: boolean | null;
        created_at: string;
      }>;
      for (const r of filas) {
        if (!r.urgente) noUrgentesHoy.set(r.usuario_id, (noUrgentesHoy.get(r.usuario_id) ?? 0) + 1);
        if (r.evento === evento && r.entidad_id === entidadId) {
          const previo = ultimoEnvio.get(r.usuario_id);
          if (!previo || r.created_at > previo) ultimoEnvio.set(r.usuario_id, r.created_at);
        }
      }
      return { enviadosHoy: total.count ?? 0, noUrgentesHoy, ultimoEnvio };
    } catch (err) {
      console.warn('[correos] Error al leer el registro de envíos; se envía sin topes.', err);
      return null;
    }
  }

  /** Guarda el resultado de cada intento. Un fallo solo se registra en el log. */
  static async registrarEnvios(registros: RegistroCorreo[]): Promise<void> {
    if (registros.length === 0) return;
    try {
      const admin = createAdminClient();
      const { error } = await admin.from('correo_envio').insert(registros);
      if (error) console.error('[correos] No se pudo guardar el registro de envíos:', error);
    } catch (err) {
      console.error('[correos] Error al guardar el registro de envíos:', err);
    }
  }

  /**
   * Envía un correo por destinatario, respetando el tope diario y sin repetir
   * el mismo aviso en pocos minutos. El botón del correo lleva a la misma
   * pantalla de acción que la notificación de la campana (R2).
   */
  static async enviar(
    evento: EventoNotificacion,
    destinatarios: DestinatarioConRol[],
    datos: DatosCorreo,
    entidad: Entidad,
    entidadId: string
  ): Promise<ResultadoNotificacion> {
    if (destinatarios.length === 0) return SIN_ENVIOS;
    const plantilla = plantillaCorreo(evento, datos);
    const appUrl = getAppUrl();
    const topes = topesDesdeEntorno();
    const control = await NotificacionService.controlEnvio(
      evento,
      entidadId,
      destinatarios.map((d) => d.id)
    );

    const registro = (d: DestinatarioConRol, estado: EstadoCorreoEnvio, messageId?: string, error?: string): RegistroCorreo => ({
      evento,
      entidad,
      entidad_id: entidadId,
      usuario_id: d.id,
      email: d.email,
      estado,
      urgente: plantilla.urgente,
      message_id: messageId ?? null,
      error: error ?? null,
    });

    const ahora = new Date();
    let enviadosHoy = control?.enviadosHoy ?? 0;
    const registros: RegistroCorreo[] = [];
    const aEnviar: DestinatarioConRol[] = [];
    for (const d of destinatarios) {
      if (control && esDuplicado(control.ultimoEnvio.get(d.id), ahora)) {
        registros.push(registro(d, 'duplicado'));
        continue;
      }
      // Sin registro legible no hay con qué contar: se envía sin topes.
      const decision = control
        ? decidirEnvio({
            urgente: plantilla.urgente,
            enviadosHoy,
            enviadosHoyUsuario: control.noUrgentesHoy.get(d.id) ?? 0,
            topes,
          })
        : 'enviar';
      if (decision === 'omitido_tope') {
        registros.push(registro(d, 'omitido_tope'));
        continue;
      }
      enviadosHoy += 1;
      aEnviar.push(d);
    }

    const resultados = await Promise.all(
      aEnviar.map((d) => {
        const opciones = {
          nombre: d.nombre,
          enlace: `${appUrl}${rutaAccion(evento, d.rol, entidad, entidadId)}`,
          appUrl,
          motivoEnvio: motivoEnvio(evento, d.rol),
        };
        return EmailService.enviarCorreo({
          toEmail: d.email,
          toName: d.nombre,
          asunto: plantilla.asunto,
          html: renderCorreoHtml(plantilla, opciones),
          texto: renderCorreoTexto(plantilla, opciones),
        });
      })
    );
    resultados.forEach((r, i) =>
      registros.push(registro(aEnviar[i], r.success ? 'enviado' : 'fallido', r.messageId, r.error))
    );

    const enviados = resultados.filter((r) => r.success).length;
    const fallidos = resultados.length - enviados;
    const omitidos = destinatarios.length - aEnviar.length;
    if (fallidos > 0) console.error(`[notificación ${evento}] ${fallidos} correo(s) no se pudieron enviar.`);
    if (omitidos > 0) console.warn(`[notificación ${evento}] ${omitidos} correo(s) omitido(s) por tope diario o repetido.`);
    await NotificacionService.registrarEnvios(registros);
    return { enviados, fallidos, omitidos, enApp: 0 };
  }

  /**
   * Inserta una notificación en la app por destinatario. Devuelve cuántas se
   * crearon (0 si falla: la operación original no se ve afectada).
   */
  static async crearNotificaciones(
    evento: EventoApp,
    destinatarios: DestinatarioConRol[],
    emisorId: string,
    entidad: Entidad,
    entidadId: string,
    datos: DatosNotificacionApp
  ): Promise<number> {
    if (destinatarios.length === 0) return 0;
    const { titulo, mensaje } = textoNotificacion(evento, datos);
    const filas = destinatarios.map((d) => ({
      usuario_id: d.id,
      emisor_id: emisorId,
      tipo: TIPO_NOTIFICACION_POR_EVENTO[evento],
      titulo,
      mensaje,
      entidad,
      entidad_id: entidadId,
      ruta: rutaAccion(evento, d.rol, entidad, entidadId),
    }));
    const admin = createAdminClient();
    const { error } = await admin.from('notificacion').insert(filas);
    if (error) {
      console.error(`[notificación ${evento}] No se pudieron crear las notificaciones en la app:`, error);
      return 0;
    }
    return filas.length;
  }

  /**
   * Avisa a los administradores activos que se registró un usuario nuevo
   * (fase F). Solo en la campana, sin correo. Devuelve cuántas se crearon.
   */
  static async notificarNuevoUsuario(usuario: { id: string } & DatosNuevoUsuario): Promise<number> {
    try {
      const admin = createAdminClient();
      const { data, error } = await admin
        .from('usuario')
        .select('id')
        .eq('rol', 'administrador')
        .eq('activo', true);
      if (error) {
        console.error('[notificación nuevo usuario] No se pudieron leer los administradores:', error);
        return 0;
      }
      const ids = ((data as Array<{ id: string }> | null) ?? []).map((u) => u.id).filter((id) => id !== usuario.id);
      if (ids.length === 0) return 0;

      const { titulo, mensaje } = textoNotificacionNuevoUsuario(usuario);
      const filas = ids.map((id) => ({
        usuario_id: id,
        emisor_id: usuario.id,
        tipo: TIPO_NUEVO_USUARIO,
        titulo,
        mensaje,
        entidad: 'usuario',
        entidad_id: usuario.id,
        ruta: rutaNuevoUsuario(usuario.email),
      }));
      const { error: insertError } = await admin.from('notificacion').insert(filas);
      if (insertError) {
        console.error('[notificación nuevo usuario] No se pudieron crear las notificaciones:', insertError);
        return 0;
      }
      return filas.length;
    } catch (err) {
      console.error('[notificación nuevo usuario] Error inesperado:', err);
      return 0;
    }
  }

  /**
   * Participantes de la solicitud, solo de los papeles que se van a usar. La
   * Logística de la zona se carga en la aprobación y, en cancelaciones e
   * insistencias, solo si la solicitud no tiene encargado.
   */
  static async participantesSolicitud(
    sol: SolicitudLista,
    evento: EventoApp,
    roles: ReadonlySet<RolDestinatario>
  ): Promise<Partial<Record<RolDestinatario, Destinatario[]>>> {
    const usa = (r: RolDestinatario) => roles.has(r);
    const vacio = Promise.resolve([] as Destinatario[]);
    const sucursalRecepcion = sol.sucursal_destino ?? sol.sucursal;
    const zona = usa('logistica_zona') && (evento === 'solicitud_aprobada' || !sol.logistica_id);
    const [ejecutivo, jefeOrigen, jefeRecepcion, jefeUbicacion, logisticaEncargado, logisticaZona] = await Promise.all([
      usa('ejecutivo') ? NotificacionService.usuariosPorIds([sol.ejecutivo_id]) : vacio,
      usa('jefe_origen') ? NotificacionService.jefesDeSucursal(sol.sucursal) : vacio,
      usa('jefe_recepcion') ? NotificacionService.jefesDeSucursal(sucursalRecepcion) : vacio,
      usa('jefe_ubicacion') ? NotificacionService.jefesDeSucursales(ubicacionesDe(sol)) : vacio,
      usa('logistica_encargado') ? NotificacionService.usuariosPorIds([sol.logistica_id]) : vacio,
      zona ? NotificacionService.logisticaDeSucursal(sol.sucursal) : vacio,
    ]);
    return {
      ejecutivo,
      jefe_origen: jefeOrigen,
      jefe_recepcion: jefeRecepcion,
      jefe_ubicacion: jefeUbicacion,
      logistica_encargado: logisticaEncargado,
      logistica_zona: logisticaZona,
    };
  }

  /**
   * Notifica un evento de una solicitud. `extra` completa los datos que no
   * están en la solicitud (motivo, fecha anterior, estado antes de cancelar,
   * mensaje del usuario, etc.).
   */
  static async notificarSolicitud(
    evento: EventoApp,
    solicitudId: string,
    actorId: string | null,
    extra: Partial<DatosCorreo> = {}
  ): Promise<ResultadoNotificacion> {
    try {
      const sol = await SolicitudesService.getSolicitudCompleta(solicitudId);
      if (!sol) return SIN_ENVIOS;

      const estados = { estado: sol.estado, estadoAnterior: extra.estadoAnterior ?? null };
      const conCorreo = esEventoConCorreo(evento) && correoAplica(evento, extra);
      const roles = new Set<RolDestinatario>([
        ...(conCorreo && esEventoConCorreo(evento) ? rolesCorreo(evento, estados) : []),
        // emisor_id es obligatorio: sin actor (procesos automáticos) no hay campana.
        ...(actorId ? rolesApp(evento, estados) : []),
      ]);
      const porRol = await NotificacionService.participantesSolicitud(sol, evento, roles);

      const datos: DatosCorreo = {
        codigo: codigoSolicitud(sol),
        origen: sol.sucursal_nombre ?? `Sucursal ${sol.sucursal}`,
        destino: sol.sucursal_destino_nombre ?? sol.titulo_evento ?? 'Evento',
        vehiculos: sol.vehiculos.map((v) => etiquetaVehiculo(v)).filter((v): v is string => Boolean(v)),
        ejecutivo: sol.ejecutivo_nombre,
        fechaLimite: sol.fecha_limite ? formatFecha(sol.fecha_limite) : null,
        fechaProgramada: sol.fecha_tentativa_despacho ? formatFecha(sol.fecha_tentativa_despacho) : null,
        fechaCreacion: sol.fecha_creacion ? formatFecha(sol.fecha_creacion) : null,
        fechaHoraDespacho: sol.fecha_despacho ? formatFechaHora(sol.fecha_despacho) : null,
        fechaRecepcion: sol.fecha_recepcion ? formatFechaHora(sol.fecha_recepcion) : null,
        fechaEntrega: sol.fecha_entrega_cliente ? formatFechaHora(sol.fecha_entrega_cliente) : null,
        transportista: sol.transportista?.nombre ?? null,
        retiroEn: conCorreo && EVENTOS_CON_RETIRO.has(evento) ? await nombresSucursales(ubicacionesDe(sol)) : null,
        estado: sol.estado,
        ...extra,
      };

      const correo =
        conCorreo && esEventoConCorreo(evento)
          ? await NotificacionService.enviar(evento, resolverDestinatarios(evento, porRol, actorId, datos), datos, 'solicitud', sol.id)
          : SIN_ENVIOS;
      const enApp = actorId
        ? await NotificacionService.crearNotificaciones(
            evento,
            resolverDestinatariosApp(evento, porRol, actorId, datos),
            actorId,
            'solicitud',
            sol.id,
            datos
          )
        : 0;
      return { ...correo, enApp };
    } catch (err) {
      console.error(`[notificación ${evento}] Error inesperado:`, err);
      return SIN_ENVIOS;
    }
  }

  /** Notifica un evento de un traslado interno (crear, despachar, recibir, cancelar). */
  static async notificarTrasladoInterno(
    evento: EventoTraslado,
    trasladoId: string,
    actorId: string | null,
    extra: Partial<DatosCorreo> = {}
  ): Promise<ResultadoNotificacion> {
    try {
      const t = await TrasladoService.getTrasladoById(trasladoId);
      if (!t) return SIN_ENVIOS;

      const [jefeOrigen, jefeRecepcion, logisticaEncargado] = await Promise.all([
        NotificacionService.jefesDeSucursal(t.origen_id),
        NotificacionService.jefesDeSucursal(t.destino_id),
        NotificacionService.usuariosPorIds([t.logistica_id]),
      ]);

      const recepcion = evento === 'traslado_interno_recepcionado';
      const datos: DatosCorreo = {
        codigo: codigoTraslado(t.id),
        origen: t.origen_nombre ?? `Sucursal ${t.origen_id}`,
        destino: t.destino_nombre ?? `Sucursal ${t.destino_id}`,
        vehiculos: t.vehiculos.map((v) => `${v.patente ?? v.chasis} · ${v.marca} ${v.modelo}`),
        transportista: t.transportista?.nombre ?? null,
        fechaHoraDespacho: t.fecha_despacho ? formatFechaHora(t.fecha_despacho) : null,
        fechaRecepcion: t.fecha_recepcion ? formatFechaHora(t.fecha_recepcion) : null,
        conNovedades: t.recepcion_con_novedades === true,
        observacion: (recepcion ? t.observacion_recepcion : t.observacion) ?? null,
        ...extra,
      };

      const porRol = { jefe_origen: jefeOrigen, jefe_recepcion: jefeRecepcion, logistica_encargado: logisticaEncargado };
      const correo = correoAplica(evento, datos)
        ? await NotificacionService.enviar(
            evento,
            resolverDestinatarios(evento, porRol, actorId, datos),
            datos,
            'traslado_interno',
            t.id
          )
        : SIN_ENVIOS;
      const enApp = actorId
        ? await NotificacionService.crearNotificaciones(
            evento,
            resolverDestinatariosApp(evento, porRol, actorId, datos),
            actorId,
            'traslado_interno',
            t.id,
            datos
          )
        : 0;
      return { ...correo, enApp };
    } catch (err) {
      console.error(`[notificación ${evento}] Error inesperado:`, err);
      return SIN_ENVIOS;
    }
  }

  /** Últimas notificaciones del usuario y cuántas no ha leído. */
  static async getBandeja(usuarioId: string, limite = LIMITE_BANDEJA): Promise<BandejaNotificaciones> {
    const admin = createAdminClient();
    const [lista, conteo] = await Promise.all([
      admin
        .from('notificacion')
        .select('id, tipo, titulo, mensaje, leida, ruta, created_at')
        .eq('usuario_id', usuarioId)
        .order('created_at', { ascending: false })
        .limit(limite),
      admin
        .from('notificacion')
        .select('id', { count: 'exact', head: true })
        .eq('usuario_id', usuarioId)
        .eq('leida', false),
    ]);
    if (lista.error) {
      console.error('Error al listar notificaciones:', lista.error);
      return { items: [], noLeidas: 0 };
    }
    return {
      items: (lista.data ?? []) as NotificacionApp[],
      noLeidas: conteo.error ? 0 : conteo.count ?? 0,
    };
  }

  /**
   * Marca como leída una notificación. El filtro por `usuario_id` impide
   * marcar las de otro usuario (la app escribe con service_role).
   */
  static async marcarLeida(usuarioId: string, notificacionId: string): Promise<boolean> {
    const admin = createAdminClient();
    const { error } = await admin
      .from('notificacion')
      .update({ leida: true })
      .eq('id', notificacionId)
      .eq('usuario_id', usuarioId);
    if (error) console.error('Error al marcar la notificación como leída:', error);
    return !error;
  }

  /** Marca como leídas todas las notificaciones del usuario. */
  static async marcarTodasLeidas(usuarioId: string): Promise<boolean> {
    const admin = createAdminClient();
    const { error } = await admin
      .from('notificacion')
      .update({ leida: true })
      .eq('usuario_id', usuarioId)
      .eq('leida', false);
    if (error) console.error('Error al marcar las notificaciones como leídas:', error);
    return !error;
  }
}

/** Sucursales donde están los vehículos de la solicitud, sin repetir. */
function ubicacionesDe(sol: SolicitudLista): number[] {
  return [
    ...new Set(sol.vehiculos.map((v) => v.ubicacion).filter((u): u is number => typeof u === 'number' && u > 0)),
  ];
}

/** Nombres de las sucursales, separados por coma; `null` si no hay ninguna. */
async function nombresSucursales(ids: number[]): Promise<string | null> {
  if (ids.length === 0) return null;
  const sucursales = await Promise.all(ids.map((id) => OrganizacionService.getBranch(id)));
  const nombres = sucursales.map((s, i) => s?.nombre ?? `Sucursal ${ids[i]}`);
  return nombres.join(', ');
}
