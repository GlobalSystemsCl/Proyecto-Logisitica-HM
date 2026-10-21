import { describe, expect, it } from 'vitest';
import {
  DESTINATARIOS_APP,
  MAX_MENSAJE_NOTIFICACION,
  TIPO_NOTIFICACION_POR_EVENTO,
  esEventoConCorreo,
  resolverDestinatariosApp,
  rutaNotificacion,
  textoNotificacion,
  tiempoRelativo,
  textoNotificacionNuevoUsuario,
  type EventoApp,
} from '@/lib/notificaciones-app';
import { DESTINATARIOS_POR_EVENTO } from '@/lib/notificaciones';

const persona = (id: string) => ({ id, email: `${id}@test.cl`, nombre: id.toUpperCase() });
const EVENTOS = Object.keys(DESTINATARIOS_APP) as EventoApp[];
const DATOS = { codigo: 'ABCD1234', origen: 'Centro', destino: 'Norte' };

describe('DESTINATARIOS_APP', () => {
  it('should_include_every_email_recipient_in_app_notifications', () => {
    // La campana nunca avisa a menos personas que el correo del mismo evento.
    for (const [evento, roles] of Object.entries(DESTINATARIOS_POR_EVENTO)) {
      for (const rol of roles) expect(DESTINATARIOS_APP[evento as EventoApp], `${evento}/${rol}`).toContain(rol);
    }
  });

  it('should_have_a_tipo_for_every_event', () => {
    for (const evento of EVENTOS) expect(TIPO_NOTIFICACION_POR_EVENTO[evento], evento).toBeTruthy();
  });

  it('should_notify_dispatch_to_executive_in_app_but_not_by_email', () => {
    expect(DESTINATARIOS_APP.solicitud_despachada).toEqual(['jefe_recepcion', 'ejecutivo']);
    expect(DESTINATARIOS_POR_EVENTO.solicitud_despachada).toEqual(['jefe_recepcion']);
  });
});

describe('esEventoConCorreo', () => {
  it('should_return_true_for_r7_events', () => {
    expect(esEventoConCorreo('solicitud_aprobada')).toBe(true);
    expect(esEventoConCorreo('traslado_interno_cancelado')).toBe(true);
  });

  it('should_return_false_for_in_app_only_events', () => {
    expect(esEventoConCorreo('solicitud_priorizada')).toBe(false);
    expect(esEventoConCorreo('solicitud_finalizada')).toBe(false);
  });
});

describe('resolverDestinatariosApp', () => {
  it('should_exclude_actor_and_deduplicate_by_id', () => {
    const res = resolverDestinatariosApp(
      'solicitud_calendarizada',
      { ejecutivo: [persona('eje')], jefe_origen: [persona('jl1'), persona('log')], jefe_recepcion: [persona('jl1')] },
      'log'
    );
    expect(res.map((d) => d.id)).toEqual(['eje', 'jl1']);
  });

  it('should_only_use_roles_of_the_event', () => {
    const res = resolverDestinatariosApp(
      'solicitud_rechazada',
      { ejecutivo: [persona('eje')], jefe_origen: [persona('jl1')] },
      null
    );
    expect(res.map((d) => d.id)).toEqual(['eje']);
  });

  it('should_return_empty_when_no_one_is_left', () => {
    expect(resolverDestinatariosApp('solicitud_priorizada', { ejecutivo: [persona('eje')] }, 'eje')).toEqual([]);
  });
});

describe('textoNotificacion', () => {
  it('should_build_title_and_message_with_code_and_route_for_every_event', () => {
    for (const evento of EVENTOS) {
      const t = textoNotificacion(evento, DATOS);
      expect(t.titulo.length, evento).toBeGreaterThan(0);
      expect(t.titulo.length, evento).toBeLessThanOrEqual(100);
      expect(t.mensaje, evento).toContain('#ABCD1234');
      expect(t.mensaje, evento).toContain('Centro → Norte');
    }
  });

  it('should_include_reason_and_dates_when_rescheduling', () => {
    const t = textoNotificacion('solicitud_recalendarizada', {
      ...DATOS,
      fechaProgramada: '20/10/2026',
      fechaAnterior: '15/10/2026',
      motivo: ' Lluvia ',
    });
    expect(t.mensaje).toBe(
      'El traslado de la solicitud #ABCD1234 (Centro → Norte) se reprogramó para el 20/10/2026 (antes: 15/10/2026). Motivo: Lluvia'
    );
  });

  it('should_mark_reception_with_issues', () => {
    expect(textoNotificacion('solicitud_recepcionada', { ...DATOS, conNovedades: true }).titulo).toBe('Recibida con novedades');
    expect(textoNotificacion('solicitud_recepcionada', DATOS).titulo).toBe('Vehículo recibido');
  });

  it('should_truncate_long_user_reasons', () => {
    const t = textoNotificacion('solicitud_rechazada', { ...DATOS, motivo: 'x'.repeat(1000) });
    expect(t.mensaje.length).toBe(MAX_MENSAJE_NOTIFICACION);
    expect(t.mensaje.endsWith('…')).toBe(true);
  });

  it('should_omit_reason_when_blank', () => {
    expect(textoNotificacion('solicitud_cancelada', { ...DATOS, motivo: '   ' }).mensaje).not.toContain('Motivo');
  });
});

describe('tiempoRelativo', () => {
  const ahora = new Date('2026-10-14T15:00:00Z');

  it.each([
    ['2026-10-14T14:59:40Z', 'Ahora'],
    ['2026-10-14T14:55:00Z', 'Hace 5 min'],
    ['2026-10-14T12:00:00Z', 'Hace 3 h'],
    ['2026-10-13T14:00:00Z', 'Ayer'],
    ['2026-10-11T15:00:00Z', 'Hace 3 días'],
  ])('should_format_%s_as_%s', (fecha, esperado) => {
    expect(tiempoRelativo(fecha, ahora)).toBe(esperado);
  });

  it('should_show_date_when_older_than_a_week', () => {
    expect(tiempoRelativo('2026-09-30T15:00:00Z', ahora)).toBe('30-09-2026');
  });

  it('should_return_empty_string_when_date_is_invalid', () => {
    expect(tiempoRelativo('no-es-fecha', ahora)).toBe('');
  });
});

describe('rutaNotificacion', () => {
  it('should_open_solicitud_detail_by_id', () => {
    expect(rutaNotificacion('solicitud', 'abc-1')).toBe('/solicitudes?solicitud=abc-1');
  });

  it('should_open_transfers_inbox_for_internal_transfers', () => {
    expect(rutaNotificacion('traslado_interno', 't-1')).toBe('/solicitudes/traslados');
  });
});

describe('textoNotificacionNuevoUsuario', () => {
  it('should_include_name_email_and_branch_when_branch_is_known', () => {
    expect(textoNotificacionNuevoUsuario({ nombre: 'Ana Soto', email: 'ana@hmotores.cl', sucursal: 'Centro' })).toEqual({
      titulo: 'Nueva cuenta por activar',
      mensaje: 'Ana Soto (ana@hmotores.cl) se registró en Centro y espera que le asignes rol y sucursal.',
    });
  });

  it('should_omit_branch_when_it_is_unknown', () => {
    expect(textoNotificacionNuevoUsuario({ nombre: 'Ana', email: 'a@hmotores.cl', sucursal: null }).mensaje).toBe(
      'Ana (a@hmotores.cl) se registró y espera que le asignes rol y sucursal.'
    );
  });
});
