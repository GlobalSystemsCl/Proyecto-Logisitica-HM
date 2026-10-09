import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DESTINATARIOS_POR_EVENTO,
  plantillaCorreo,
  renderCorreoHtml,
  resolverDestinatarios,
  type DatosCorreo,
  type EventoNotificacion,
} from '@/lib/notificaciones';

const datos: DatosCorreo = {
  codigo: 'ABCD1234',
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
    expect(DESTINATARIOS_POR_EVENTO.solicitud_recalendarizada).toEqual(['ejecutivo', 'jefe_origen', 'jefe_recepcion']);
    expect(DESTINATARIOS_POR_EVENTO.solicitud_despachada).toEqual(['jefe_recepcion']);
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
    expect(res).toEqual([{ ...ana, email: 'ana@test.cl' }]);
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
    expect(p.asunto).toBe('[H.Motores] [URGENTE] Traslado de la solicitud #ABCD1234 reprogramado');
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
    expect(p.detalles[0]).toEqual(['Traslado interno', '#ABCD1234']);
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
    const html = renderCorreoHtml(p, '<b>Ana</b>', 'https://app.test/solicitudes?a=1&b=2');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;x&lt;/script&gt;');
    expect(html).toContain('Hola, &lt;b&gt;Ana&lt;/b&gt;');
    expect(html).toContain('href="https://app.test/solicitudes?a=1&amp;b=2"');
  });

  it('should_show_urgent_banner_only_for_urgent_events', () => {
    expect(renderCorreoHtml(plantillaCorreo('solicitud_recalendarizada', datos), 'Ana', 'x')).toContain('Aviso urgente');
    expect(renderCorreoHtml(plantillaCorreo('solicitud_aprobada', datos), 'Ana', 'x')).not.toContain('Aviso urgente');
  });
});
