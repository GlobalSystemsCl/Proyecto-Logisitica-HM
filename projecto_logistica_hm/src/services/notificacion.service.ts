import { createAdminClient } from '@/lib/supabase/admin';
import { EmailService } from '@/services/email.service';
import { SolicitudesService } from '@/services/solicitudes.service';
import { TrasladoService } from '@/services/traslado.service';
import { OrganizacionService } from '@/services/organizacion.service';
import {
  plantillaCorreo,
  renderCorreoHtml,
  resolverDestinatarios,
  type DatosCorreo,
  type Destinatario,
  type EventoNotificacion,
  type RolDestinatario,
} from '@/lib/notificaciones';
import {
  TIPO_NOTIFICACION_POR_EVENTO,
  esEventoConCorreo,
  resolverDestinatariosApp,
  rutaNotificacion,
  textoNotificacion,
  type DatosNotificacionApp,
  type EventoApp,
} from '@/lib/notificaciones-app';
import { etiquetaVehiculo } from '@/lib/vehiculo';
import { formatFecha } from '@/lib/fechas';
import { getAppUrl } from '@/lib/env';

export interface ResultadoNotificacion {
  /** Correos enviados y fallidos (R7). */
  enviados: number;
  fallidos: number;
  /** Notificaciones creadas en la app (campana). */
  enApp: number;
}

const SIN_ENVIOS: ResultadoNotificacion = { enviados: 0, fallidos: 0, enApp: 0 };

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

/**
 * Notificaciones de los cambios de estado: correo en los hitos críticos (R7) y
 * notificación en la app (campana) en todos los cambios de estado.
 *
 * Resuelve los participantes de la solicitud o del traslado, arma el correo
 * con `lib/notificaciones` y lo envía con Brevo, e inserta una fila en
 * `notificacion` por destinatario (`lib/notificaciones-app`). Nunca lanza: un
 * fallo no debe afectar la operación que lo originó (se llama desde `after`).
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

  /** Envía un correo por destinatario. */
  static async enviar(
    evento: EventoNotificacion,
    destinatarios: Destinatario[],
    datos: DatosCorreo,
    ruta: string
  ): Promise<ResultadoNotificacion> {
    if (destinatarios.length === 0) return SIN_ENVIOS;
    const plantilla = plantillaCorreo(evento, datos);
    const enlace = `${getAppUrl()}${ruta}`;
    const resultados = await Promise.all(
      destinatarios.map((d) =>
        EmailService.enviarCorreo({
          toEmail: d.email,
          toName: d.nombre,
          asunto: plantilla.asunto,
          html: renderCorreoHtml(plantilla, d.nombre, enlace),
        })
      )
    );
    const enviados = resultados.filter((r) => r.success).length;
    const fallidos = resultados.length - enviados;
    if (fallidos > 0) console.error(`[notificación ${evento}] ${fallidos} correo(s) no se pudieron enviar.`);
    return { enviados, fallidos, enApp: 0 };
  }

  /**
   * Inserta una notificación en la app por destinatario. Devuelve cuántas se
   * crearon (0 si falla: la operación original no se ve afectada).
   */
  static async crearNotificaciones(
    evento: EventoApp,
    destinatarios: Destinatario[],
    emisorId: string,
    entidad: 'solicitud' | 'traslado_interno',
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
      ruta: rutaNotificacion(entidad, entidadId),
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
   * Notifica un evento de una solicitud. `extra` completa los datos que no
   * están en la solicitud (motivo, fecha anterior, ubicación final, etc.).
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

      const sucursalRecepcion = sol.sucursal_destino ?? sol.sucursal;
      const [ejecutivo, jefeOrigen, jefeRecepcion, logisticaEncargado, logisticaZona] = await Promise.all([
        NotificacionService.usuariosPorIds([sol.ejecutivo_id]),
        NotificacionService.jefesDeSucursal(sol.sucursal),
        NotificacionService.jefesDeSucursal(sucursalRecepcion),
        NotificacionService.usuariosPorIds([sol.logistica_id]),
        evento === 'solicitud_aprobada' ? NotificacionService.logisticaDeSucursal(sol.sucursal) : Promise.resolve([]),
      ]);

      const porRol: Partial<Record<RolDestinatario, Destinatario[]>> = {
        ejecutivo,
        jefe_origen: jefeOrigen,
        jefe_recepcion: jefeRecepcion,
        logistica_encargado: logisticaEncargado,
        logistica_zona: logisticaZona,
      };

      const datos: DatosCorreo = {
        codigo: sol.id.slice(0, 8).toUpperCase(),
        origen: sol.sucursal_nombre ?? `Sucursal ${sol.sucursal}`,
        destino: sol.sucursal_destino_nombre ?? sol.titulo_evento ?? 'Evento',
        vehiculos: sol.vehiculos.map((v) => etiquetaVehiculo(v)).filter((v): v is string => Boolean(v)),
        fechaLimite: sol.fecha_limite ? formatFecha(sol.fecha_limite) : null,
        fechaProgramada: sol.fecha_tentativa_despacho ? formatFecha(sol.fecha_tentativa_despacho) : null,
        ...extra,
      };

      const correo = esEventoConCorreo(evento)
        ? await NotificacionService.enviar(evento, resolverDestinatarios(evento, porRol, actorId), datos, '/solicitudes')
        : SIN_ENVIOS;
      // emisor_id es obligatorio: sin actor (procesos automáticos) no hay campana.
      const enApp = actorId
        ? await NotificacionService.crearNotificaciones(
            evento,
            resolverDestinatariosApp(evento, porRol, actorId),
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

  /** Notifica la cancelación en tránsito de un traslado interno. */
  static async notificarTrasladoInterno(
    evento: Extract<EventoNotificacion, 'traslado_interno_cancelado'>,
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

      const datos: DatosCorreo = {
        codigo: t.id.slice(0, 8).toUpperCase(),
        origen: t.origen_nombre ?? `Sucursal ${t.origen_id}`,
        destino: t.destino_nombre ?? `Sucursal ${t.destino_id}`,
        vehiculos: t.vehiculos.map((v) => `${v.patente ?? v.chasis} · ${v.marca} ${v.modelo}`),
        ...extra,
      };

      const porRol = { jefe_origen: jefeOrigen, jefe_recepcion: jefeRecepcion, logistica_encargado: logisticaEncargado };
      const correo = await NotificacionService.enviar(
        evento,
        resolverDestinatarios(evento, porRol, actorId),
        datos,
        '/solicitudes/traslados'
      );
      const enApp = actorId
        ? await NotificacionService.crearNotificaciones(
            evento,
            resolverDestinatariosApp(evento, porRol, actorId),
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
