import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DESTINATARIOS_POR_EVENTO,
  correoAplica,
  destinatariosCancelacion,
  destinatariosInsistencia,
  esEventoDeTraslado,
  esUrgente,
  etiquetaEstadoSolicitud,
  motivoEnvio,
  pasoDeEstado,
  plantillaCorreo,
  renderCorreoHtml,
  renderCorreoTexto,
  resolverDestinatarios,
  rolesCorreo,
  rolesSegunEstado,
  textoActor,
  type DatosCorreo,
  type EventoNotificacion,
} from '@/lib/notificaciones';

const datos: DatosCorreo = {
  codigo: '101-15',
  origen: 'Centro',
  destino: 'Norte',
  vehiculos: ['ABCD-12 · Toyota Corolla'],
  fechaLimite: '20/10/2026',
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('DESTINATARIOS_POR_EVENTO', () => {
  it('should_notify_the_critical_events_requested', () => {
    expect(DESTINATARIOS_POR_EVENTO.solicitud_creada).toEqual(['jefe_origen']);
    expect(DESTINATARIOS_POR_EVENTO.solicitud_aprobada).toContain('ejecutivo');
    expect(DESTINATARIOS_POR_EVENTO.solicitud_recalendarizada).toEqual(['ejecutivo', 'jefe_origen', 'jefe_recepcion', 'jefe_ubicacion']);
    expect(DESTINATARIOS_POR_EVENTO.solicitud_despachada).toEqual(['jefe_recepcion', 'ejecutivo']);
  });

  it('should_notify_every_participant_when_transit_is_cancelled', () => {
    expect(DESTINATARIOS_POR_EVENTO.solicitud_cancelada_transito).toEqual([
      'ejecutivo',
      'jefe_origen',
      'jefe_recepcion',
      'logistica_encargado',
    ]);
  });
});

describe('resolverDestinatarios', () => {
  const ana = { id: 'u-ana', email: 'Ana@Test.cl', nombre: 'Ana' };
  const jl = { id: 'u-jl', email: 'jl@test.cl', nombre: 'Juan' };

  it('should_collect_recipients_of_the_event_roles_only', () => {
    const res = resolverDestinatarios(
      'solicitud_rechazada',
      { ejecutivo: [ana], jefe_origen: [jl] },
      null
    );
    expect(res).toEqual([{ ...ana, email: 'ana@test.cl', rol: 'ejecutivo' }]);
  });

  it('should_keep_the_first_role_of_the_event_order_when_someone_has_two', () => {
    const res = resolverDestinatarios('solicitud_despachada', { ejecutivo: [jl], jefe_recepcion: [jl] }, null);
    expect(res).toEqual([{ ...jl, rol: 'jefe_recepcion' }]);
  });

  it('should_deduplicate_by_email_and_skip_the_actor', () => {
    const res = resolverDestinatarios(
      'solicitud_calendarizada',
      { ejecutivo: [ana], jefe_origen: [jl], jefe_recepcion: [jl, { ...ana, id: 'otra' }] },
      'u-jl'
    );
    expect(res.map((d) => d.id)).toEqual(['u-ana']);
  });

  it('should_skip_recipients_without_email', () => {
    const res = resolverDestinatarios('solicitud_creada', { jefe_origen: [{ id: 'x', email: '  ', nombre: 'X' }] }, null);
    expect(res).toEqual([]);
  });
});

describe('plantillaCorreo', () => {
  it('should_mark_rescheduling_as_urgent_with_previous_and_new_dates', () => {
    const p = plantillaCorreo('solicitud_recalendarizada', {
      ...datos,
      fechaAnterior: '12/10/2026',
      fechaProgramada: '15/10/2026',
      motivo: 'Lluvia',
    });
    expect(p.urgente).toBe(true);
    expect(p.asunto).toBe('[H.Motores] [URGENTE] Traslado de la solicitud 101-15 reprogramado');
    expect(p.detalles).toContainEqual(['Fecha anterior', '12/10/2026']);
    expect(p.detalles).toContainEqual(['Nueva fecha de despacho', '15/10/2026']);
    expect(p.detalles).toContainEqual(['Motivo', 'Lluvia']);
  });

  it('should_include_reason_and_final_location_when_cancelled_in_transit', () => {
    const p = plantillaCorreo('solicitud_cancelada_transito', { ...datos, motivo: 'Panne', ubicacionFinal: null });
    expect(p.urgente).toBe(true);
    expect(p.detalles).toContainEqual(['Motivo', 'Panne']);
    expect(p.detalles).toContainEqual(['Ubicación del vehículo', 'Sin sucursal asignada']);
  });

  it('should_use_the_proposed_deadline_label', () => {
    const p = plantillaCorreo('solicitud_creada', datos);
    expect(p.urgente).toBe(false);
    expect(p.detalles).toContainEqual(['Fecha límite de entrega propuesta', '20/10/2026']);
  });

  it('should_flag_reception_with_news', () => {
    const p = plantillaCorreo('solicitud_recepcionada', { ...datos, conNovedades: true, observacion: 'Rayón' });
    expect(p.asunto).toContain('con novedades');
    expect(p.detalles).toContainEqual(['Observación de la recepción', 'Rayón']);
  });

  it('should_label_internal_transfers', () => {
    const p = plantillaCorreo('traslado_interno_cancelado', { ...datos, motivo: 'x' });
    expect(p.detalles[0]).toEqual(['Traslado interno', '101-15']);
  });

  it('should_build_a_template_for_every_event', () => {
    for (const evento of Object.keys(DESTINATARIOS_POR_EVENTO) as EventoNotificacion[]) {
      const p = plantillaCorreo(evento, datos);
      expect(p.asunto.startsWith('[H.Motores]')).toBe(true);
      expect(p.titulo.length).toBeGreaterThan(0);
    }
  });
});

describe('renderCorreoHtml', () => {
  it('should_escape_every_variable_text', () => {
    const p = plantillaCorreo('solicitud_rechazada', { ...datos, motivo: '<script>x</script>' });
    const html = renderCorreoHtml(p, { nombre: '<b>Ana</b>', enlace: 'https://app.test/solicitudes?a=1&b=2', appUrl: 'https://app.test' });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;x&lt;/script&gt;');
    expect(html).toContain('Hola, &lt;b&gt;Ana&lt;/b&gt;');
    expect(html).toContain('href="https://app.test/solicitudes?a=1&amp;b=2"');
  });

  it('should_show_urgent_banner_only_for_urgent_events', () => {
    const o = { nombre: 'Ana', enlace: 'x', appUrl: 'https://app.test' };
    expect(renderCorreoHtml(plantillaCorreo('solicitud_recalendarizada', datos), o)).toContain('Aviso urgente');
    expect(renderCorreoHtml(plantillaCorreo('solicitud_aprobada', datos), o)).not.toContain('Aviso urgente');
  });
});

describe('destinatariosCancelacion', () => {
  it('should_only_include_manager_and_executive_when_request_was_pending', () => {
    expect(destinatariosCancelacion('pendiente_aprobacion')).toEqual(['ejecutivo', 'jefe_origen']);
  });

  it('should_add_logistics_when_request_was_already_approved', () => {
    for (const estado of ['aprobada', 'priorizada', 'asignada']) {
      expect(destinatariosCancelacion(estado), estado).toEqual(['ejecutivo', 'jefe_origen', 'logistica_encargado', 'logistica_zona']);
    }
  });

  it('should_add_reception_and_vehicle_branch_when_request_was_scheduled', () => {
    expect(destinatariosCancelacion('calendarizada')).toEqual(
      expect.arrayContaining(['jefe_recepcion', 'jefe_ubicacion', 'logistica_encargado'])
    );
  });

  it('should_fall_back_to_manager_and_executive_when_state_is_unknown', () => {
    expect(destinatariosCancelacion(null)).toEqual(['ejecutivo', 'jefe_origen']);
  });
});

describe('destinatariosInsistencia', () => {
  it('should_send_to_branch_manager_while_approval_or_priority_is_missing', () => {
    expect(destinatariosInsistencia('pendiente_aprobacion')).toEqual(['jefe_origen']);
    expect(destinatariosInsistencia('aprobada')).toEqual(['jefe_origen']);
  });

  it('should_send_to_logistics_once_in_the_queue', () => {
    for (const estado of ['priorizada', 'asignada', 'calendarizada']) {
      expect(destinatariosInsistencia(estado), estado).toEqual(['logistica_encargado', 'logistica_zona']);
    }
  });

  it('should_send_to_nobody_in_closed_states', () => {
    expect(destinatariosInsistencia('finalizada')).toEqual([]);
    expect(destinatariosInsistencia(undefined)).toEqual([]);
  });
});

describe('rolesSegunEstado / rolesCorreo', () => {
  it('should_return_null_for_events_with_fixed_recipients', () => {
    expect(rolesSegunEstado('solicitud_aprobada', { estado: 'aprobada' })).toBeNull();
    expect(rolesCorreo('solicitud_aprobada')).toEqual(['ejecutivo', 'logistica_zona']);
  });

  it('should_use_the_state_for_cancellation_and_insistence', () => {
    expect(rolesCorreo('solicitud_cancelada', { estadoAnterior: 'pendiente_aprobacion' })).toEqual(['ejecutivo', 'jefe_origen']);
    expect(rolesCorreo('solicitud_insistencia', { estado: 'aprobada' })).toEqual(['jefe_origen']);
  });

  it('should_never_exceed_the_maximum_recipients_of_the_event', () => {
    for (const estado of ['pendiente_aprobacion', 'aprobada', 'priorizada', 'asignada', 'calendarizada']) {
      for (const rol of rolesCorreo('solicitud_cancelada', { estadoAnterior: estado })) {
        expect(DESTINATARIOS_POR_EVENTO.solicitud_cancelada).toContain(rol);
      }
      for (const rol of rolesCorreo('solicitud_insistencia', { estado })) {
        expect(DESTINATARIOS_POR_EVENTO.solicitud_insistencia).toContain(rol);
      }
    }
  });
});

describe('resolverDestinatarios con estado', () => {
  it('should_skip_logistics_when_pending_request_is_cancelled', () => {
    const res = resolverDestinatarios(
      'solicitud_cancelada',
      {
        ejecutivo: [{ id: 'e', email: 'e@x.cl', nombre: 'E' }],
        jefe_origen: [{ id: 'j', email: 'j@x.cl', nombre: 'J' }],
        logistica_encargado: [{ id: 'l', email: 'l@x.cl', nombre: 'L' }],
      },
      'e',
      { estadoAnterior: 'pendiente_aprobacion' }
    );
    expect(res.map((d) => d.id)).toEqual(['j']);
  });
});

describe('correoAplica / esUrgente', () => {
  it('should_email_internal_transfer_reception_only_with_issues', () => {
    expect(correoAplica('traslado_interno_recepcionado', { conNovedades: false })).toBe(false);
    expect(correoAplica('traslado_interno_recepcionado', { conNovedades: true })).toBe(true);
    expect(correoAplica('solicitud_aprobada', {})).toBe(true);
  });

  it('should_mark_reception_with_issues_and_reverted_dispatch_as_urgent', () => {
    expect(esUrgente('solicitud_recepcionada', { conNovedades: true })).toBe(true);
    expect(esUrgente('solicitud_recepcionada', { conNovedades: false })).toBe(false);
    expect(esUrgente('solicitud_despacho_revertido', {})).toBe(true);
    expect(esUrgente('solicitud_cancelada', {})).toBe(false);
  });

  it('should_detect_internal_transfer_events', () => {
    expect(esEventoDeTraslado('traslado_interno_creado')).toBe(true);
    expect(esEventoDeTraslado('solicitud_creada')).toBe(false);
  });
});

describe('pasoDeEstado / etiquetaEstadoSolicitud', () => {
  it('should_map_each_state_to_its_progress_step', () => {
    expect(pasoDeEstado('pendiente_aprobacion')).toBe(0);
    expect(pasoDeEstado('priorizada')).toBe(1);
    expect(pasoDeEstado('calendarizada')).toBe(2);
    expect(pasoDeEstado('en_transito')).toBe(3);
    expect(pasoDeEstado('entregada')).toBe(4);
    expect(pasoDeEstado('finalizada')).toBe(5);
    expect(pasoDeEstado('rechazada')).toBeNull();
  });

  it('should_label_states_in_spanish_and_keep_unknown_ones', () => {
    expect(etiquetaEstadoSolicitud('calendarizada')).toBe('Programada');
    expect(etiquetaEstadoSolicitud('raro')).toBe('raro');
    expect(etiquetaEstadoSolicitud(null)).toBe('—');
  });
});

describe('plantillaCorreo (eventos nuevos)', () => {
  it('should_show_date_carrier_and_pickup_branch_when_scheduled', () => {
    const p = plantillaCorreo('solicitud_calendarizada', {
      ...datos,
      fechaProgramada: '15/10/2026',
      transportista: 'Transportes Sur',
      retiroEn: 'Bodega',
    });
    expect(p.asunto).toBe('[H.Motores] Traslado de la solicitud 101-15 programado para el 15/10/2026');
    expect(p.detalles).toContainEqual(['Transportista', 'Transportes Sur']);
    expect(p.detalles).toContainEqual(['Retiro en', 'Bodega']);
    expect(p.paso).toBe(2);
  });

  it('should_show_departure_time_when_dispatched', () => {
    const p = plantillaCorreo('solicitud_despachada', { ...datos, fechaHoraDespacho: '14/10/2026 09:05' });
    expect(p.detalles).toContainEqual(['Salida', '14/10/2026 09:05']);
    expect(p.asunto).toBe('[H.Motores] Solicitud 101-15 en camino');
    expect(p.paso).toBe(3);
  });

  it('should_show_who_cancelled_and_previous_state', () => {
    const p = plantillaCorreo('solicitud_cancelada', {
      ...datos,
      motivo: 'x',
      canceladoPor: 'Ana (Ejecutivo)',
      estadoAnterior: 'priorizada',
    });
    expect(p.detalles).toContainEqual(['Cancelada por', 'Ana (Ejecutivo)']);
    expect(p.detalles).toContainEqual(['Estado al cancelar', 'En la cola de prioridades']);
    expect(p.paso).toBeNull();
    expect(p.etiqueta.tono).toBe('alerta');
  });

  it('should_show_current_state_and_message_on_insistence', () => {
    const p = plantillaCorreo('solicitud_insistencia', { ...datos, estado: 'aprobada', mensaje: 'Urge' });
    expect(p.detalles).toContainEqual(['Estado actual', 'Aprobada']);
    expect(p.detalles).toContainEqual(['Mensaje del ejecutivo', 'Urge']);
    expect(p.paso).toBe(1);
  });

  it('should_label_internal_transfers_without_progress_and_with_transfer_button', () => {
    const p = plantillaCorreo('traslado_interno_creado', { ...datos, codigo: '#FFFF0000' });
    expect(p.detalles[0]).toEqual(['Traslado interno', '#FFFF0000']);
    expect(p.paso).toBeNull();
    expect(p.textoBoton).toBe('Ver traslado #FFFF0000');
    expect(p.detalles.map(([k]) => k)).not.toContain('Fecha límite de entrega propuesta');
  });

  it('should_omit_blank_optional_rows', () => {
    const p = plantillaCorreo('solicitud_despachada', { ...datos, transportista: '   ' });
    expect(p.detalles.map(([k]) => k)).not.toContain('Transportista');
  });
});

describe('motivoEnvio', () => {
  it('should_explain_the_role_of_the_recipient', () => {
    expect(motivoEnvio('solicitud_calendarizada', 'jefe_ubicacion')).toBe(
      'Recibes este correo porque eres Jefe de Local de la sucursal donde está el vehículo.'
    );
    expect(motivoEnvio('traslado_interno_creado', 'jefe_recepcion')).toContain('destino del traslado');
  });

  it('should_return_null_without_role', () => {
    expect(motivoEnvio('solicitud_creada', null)).toBeNull();
    expect(motivoEnvio('traslado_interno_creado', 'ejecutivo')).toBeNull();
  });
});

describe('renderCorreoTexto', () => {
  it('should_include_details_link_and_reason_in_plain_text', () => {
    const t = renderCorreoTexto(plantillaCorreo('solicitud_aprobada', datos), {
      nombre: 'Ana',
      enlace: 'https://app.test/solicitudes?solicitud=1',
      appUrl: 'https://app.test',
      motivoEnvio: 'Recibes este correo porque eres el Ejecutivo de esta solicitud.',
    });
    expect(t).toContain('Hola, Ana.');
    expect(t).toContain('- Solicitud: 101-15');
    expect(t).toContain('Ver solicitud 101-15: https://app.test/solicitudes?solicitud=1');
    expect(t).toContain('Recibes este correo porque eres el Ejecutivo de esta solicitud.');
  });
});

describe('textoActor', () => {
  it('should_show_name_and_role_label', () => {
    expect(textoActor({ nombre: 'Ana', apellido: 'Soto', rol: 'jefe_local' })).toBe('Ana Soto (Jefe de Local)');
  });

  it('should_show_only_role_when_name_is_empty', () => {
    expect(textoActor({ nombre: '', apellido: '', rol: 'logistica' })).toBe('Logística');
  });
});

describe('plantillaCorreo (venta sin traslado)', () => {
  it('should_tell_the_executive_the_vehicle_is_ready_to_deliver', () => {
    const p = plantillaCorreo('solicitud_lista_para_entregar', datos);
    expect(DESTINATARIOS_POR_EVENTO.solicitud_lista_para_entregar).toEqual(['ejecutivo']);
    expect(p.asunto).toBe('[H.Motores] Solicitud 101-15 aprobada: lista para entregar');
    expect(p.paso).toBe(4);
    expect(p.urgente).toBe(false);
  });
});
