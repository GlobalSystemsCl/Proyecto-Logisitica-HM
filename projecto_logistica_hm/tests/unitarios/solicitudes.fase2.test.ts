import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSupabaseMock, fila, type MockResult, type SupabaseMock } from '../mocks/supabase';
import { SolicitudesService, type SolicitudMinima } from '@/services/solicitudes.service';

/** Fase 2 de requisitos: recepción (R13), recalendarización (R7/R16) y cancelación en tránsito (R8). */

const admin: SupabaseMock = createSupabaseMock();

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => admin,
}));

const USUARIO_ID = 'u-1';

function minimo(overrides: Partial<SolicitudMinima> = {}): SolicitudMinima {
  return {
    id: 's-1',
    estado: 'en_transito',
    sucursal: 1,
    sucursal_destino: 2,
    ejecutivo_id: 'e-1',
    jefe_local_id: null,
    logistica_id: 'log-1',
    tipo_solicitud: 'venta',
    posicion_prioridad: null,
    fecha_tentativa_despacho: '2026-10-12',
    fecha_despacho: null,
    fecha_entrega: null,
    fecha_inicio_transito: null,
    ...overrides,
  };
}

function errorResult(message: string, code?: string): MockResult {
  return { data: null, error: { message, code } };
}

function spyAuditoria() {
  return vi.spyOn(SolicitudesService, 'registrarAuditoria').mockResolvedValue(undefined);
}

beforeEach(() => {
  admin.reset();
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-09T12:00:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('recibirSolicitud con registro de recepción', () => {
  it('should_register_news_as_observation_and_audit_them', async () => {
    admin.results.solicitud = [fila(minimo()), fila([{ id: 's-1' }])];
    admin.results.usuario = [fila({ rol: 'administrador', sucursal_id: null })];
    admin.results.observacion = [fila(null)];
    const auditoria = spyAuditoria();

    const res = await SolicitudesService.recibirSolicitud('s-1', USUARIO_ID, {
      conNovedades: true,
      observacion: 'Rayón en el parachoques',
    });

    expect(res).toEqual({ success: true });
    expect(admin.callsTo('observacion')).toContainEqual([
      'insert',
      { solicitud_id: 's-1', usuario_id: USUARIO_ID, observacion: '[RECEPCIÓN] Con novedades: Rayón en el parachoques' },
    ]);
    expect(auditoria).toHaveBeenCalledWith(
      USUARIO_ID,
      'solicitud',
      's-1',
      'entrega',
      expect.anything(),
      expect.objectContaining({ con_novedades: true, observacion: 'Rayón en el parachoques' })
    );
  });

  it('should_not_insert_observation_when_reception_has_nothing_to_register', async () => {
    admin.results.solicitud = [fila(minimo()), fila([{ id: 's-1' }])];
    admin.results.usuario = [fila({ rol: 'administrador', sucursal_id: null })];
    spyAuditoria();

    const res = await SolicitudesService.recibirSolicitud('s-1', USUARIO_ID, { conNovedades: false });

    expect(res).toEqual({ success: true });
    expect(admin.callsTo('observacion')).toHaveLength(0);
  });

  it('should_keep_working_without_reception_data', async () => {
    admin.results.solicitud = [fila(minimo()), fila([{ id: 's-1' }])];
    admin.results.usuario = [fila({ rol: 'administrador', sucursal_id: null })];
    spyAuditoria();

    expect(await SolicitudesService.recibirSolicitud('s-1', USUARIO_ID)).toEqual({ success: true });
  });

  it('should_reject_news_without_description_before_querying', async () => {
    const res = await SolicitudesService.recibirSolicitud('s-1', USUARIO_ID, { conNovedades: true, observacion: '' });
    expect(res).toEqual({ success: false, error: 'Describe la novedad con la que llegó el vehículo.' });
    expect(admin.callsTo('solicitud')).toHaveLength(0);
  });
});

describe('recalendarizarSolicitud', () => {
  it('should_change_date_keep_state_and_audit_previous_date', async () => {
    admin.results.solicitud = [fila(minimo({ estado: 'calendarizada' })), fila([{ id: 's-1' }])];
    const auditoria = spyAuditoria();

    const res = await SolicitudesService.recalendarizarSolicitud('s-1', '2026-10-15', USUARIO_ID, ' Lluvia ');

    expect(res).toEqual({ success: true, fechaAnterior: '2026-10-12' });
    expect(admin.callsTo('solicitud')).toContainEqual(['update', { fecha_tentativa_despacho: '2026-10-15' }]);
    expect(admin.callsTo('solicitud')).toContainEqual(['eq', 'estado', 'calendarizada']);
    expect(auditoria).toHaveBeenCalledWith(
      USUARIO_ID,
      'solicitud',
      's-1',
      'recalendarizacion',
      { fecha_tentativa_despacho: '2026-10-12' },
      { fecha_tentativa_despacho: '2026-10-15', motivo: 'Lluvia' }
    );
  });

  it('should_reject_when_solicitud_is_not_calendarized', async () => {
    admin.results.solicitud = [fila(minimo({ estado: 'priorizada' }))];
    const res = await SolicitudesService.recalendarizarSolicitud('s-1', '2026-10-15', USUARIO_ID);
    expect(res).toEqual({ success: false, error: 'Solo las solicitudes Calendarizadas pueden reprogramarse.' });
  });

  it('should_reject_past_or_invalid_dates', async () => {
    expect((await SolicitudesService.recalendarizarSolicitud('s-1', '2026-10-01', USUARIO_ID)).error).toBe(
      'No puedes programar el traslado en una fecha anterior a hoy.'
    );
    expect((await SolicitudesService.recalendarizarSolicitud('s-1', 'no-fecha', USUARIO_ID)).error).toBe(
      'La nueva fecha de despacho no es válida.'
    );
    expect(admin.callsTo('solicitud')).toHaveLength(0);
  });

  it('should_reject_when_new_date_equals_current_date', async () => {
    admin.results.solicitud = [fila(minimo({ estado: 'calendarizada', fecha_tentativa_despacho: '2026-10-15T00:00:00Z' }))];
    const res = await SolicitudesService.recalendarizarSolicitud('s-1', '2026-10-15', USUARIO_ID);
    expect(res).toEqual({ success: false, error: 'La nueva fecha es igual a la fecha programada.' });
  });

  it('should_store_null_reason_when_none_is_given', async () => {
    admin.results.solicitud = [fila(minimo({ estado: 'calendarizada' })), fila([{ id: 's-1' }])];
    const auditoria = spyAuditoria();
    await SolicitudesService.recalendarizarSolicitud('s-1', '2026-10-15', USUARIO_ID);
    expect(auditoria.mock.calls[0][5]).toEqual({ fecha_tentativa_despacho: '2026-10-15', motivo: null });
  });
});

describe('cancelarEnTransito', () => {
  it('should_cancel_through_rpc_and_audit_reason_and_location', async () => {
    admin.results.solicitud = [fila(minimo())];
    const auditoria = spyAuditoria();

    const res = await SolicitudesService.cancelarEnTransito('s-1', ' Camión averiado ', 3, USUARIO_ID);

    expect(res).toEqual({ success: true });
    expect(admin.rpc).toHaveBeenCalledWith('fn_cancelar_solicitud_en_transito', {
      p_solicitud_id: 's-1',
      p_usuario_id: USUARIO_ID,
      p_motivo: 'Camión averiado',
      p_ubicacion: 3,
    });
    expect(auditoria).toHaveBeenCalledWith(
      USUARIO_ID,
      'solicitud',
      's-1',
      'cancelacion_transito',
      { estado: 'en_transito' },
      { estado: 'cancelada', motivo: 'Camión averiado', ubicacion: 3 }
    );
  });

  it('should_reject_when_solicitud_is_not_in_transit', async () => {
    admin.results.solicitud = [fila(minimo({ estado: 'calendarizada' }))];
    const res = await SolicitudesService.cancelarEnTransito('s-1', 'Motivo válido', null, USUARIO_ID);
    expect(res.success).toBe(false);
    expect(admin.rpc).not.toHaveBeenCalled();
  });

  it('should_reject_short_reason_before_querying', async () => {
    const res = await SolicitudesService.cancelarEnTransito('s-1', 'x', null, USUARIO_ID);
    expect(res.success).toBe(false);
    expect(admin.callsTo('solicitud')).toHaveLength(0);
  });

  it('should_return_business_message_when_rpc_raises', async () => {
    admin.results.solicitud = [fila(minimo())];
    admin.rpc.mockResolvedValueOnce(errorResult('La sucursal indicada como ubicación no existe.', 'P0001'));
    const auditoria = spyAuditoria();

    const res = await SolicitudesService.cancelarEnTransito('s-1', 'Motivo válido', 99, USUARIO_ID);

    expect(res).toEqual({ success: false, error: 'La sucursal indicada como ubicación no existe.' });
    expect(auditoria).not.toHaveBeenCalled();
  });
});

describe('getRecepcionesPendientes', () => {
  it('should_filter_in_transit_by_destination_or_event_origin', async () => {
    admin.results.solicitud = [fila([])];

    const res = await SolicitudesService.getRecepcionesPendientes([2, 5]);

    expect(res).toEqual([]);
    expect(admin.callsTo('solicitud')).toContainEqual(['eq', 'estado', 'en_transito']);
    expect(admin.callsTo('solicitud')).toContainEqual([
      'or',
      'sucursal_destino.in.(2,5),and(sucursal_destino.is.null,sucursal.in.(2,5))',
    ]);
  });

  it('should_not_filter_by_branch_for_admin', async () => {
    admin.results.solicitud = [fila([])];
    await SolicitudesService.getRecepcionesPendientes(null);
    expect(admin.callsTo('solicitud').some((c) => c[0] === 'or')).toBe(false);
  });

  it('should_return_empty_without_querying_when_user_has_no_branches', async () => {
    expect(await SolicitudesService.getRecepcionesPendientes([])).toEqual([]);
    expect(admin.callsTo('solicitud')).toHaveLength(0);
  });

  it('should_return_empty_when_query_fails', async () => {
    admin.results.solicitud = [errorResult('caída')];
    expect(await SolicitudesService.getRecepcionesPendientes([1])).toEqual([]);
  });
});

describe('getSolicitudesPorPriorizar (R11)', () => {
  it('should_list_approved_without_position_of_the_branches', async () => {
    admin.results.solicitud = [fila([])];

    await SolicitudesService.getSolicitudesPorPriorizar([1, 3]);

    const llamadas = admin.callsTo('solicitud');
    expect(llamadas).toContainEqual(['eq', 'estado', 'aprobada']);
    expect(llamadas).toContainEqual(['is', 'posicion_prioridad', null]);
    expect(llamadas).toContainEqual(['in', 'sucursal', [1, 3]]);
  });

  it('should_not_filter_by_branch_for_admin_and_skip_query_without_scope', async () => {
    admin.results.solicitud = [fila([])];
    await SolicitudesService.getSolicitudesPorPriorizar(null);
    expect(admin.callsTo('solicitud').some((c) => c[0] === 'in')).toBe(false);

    admin.reset();
    expect(await SolicitudesService.getSolicitudesPorPriorizar([])).toEqual([]);
    expect(admin.callsTo('solicitud')).toHaveLength(0);
  });

  it('should_return_empty_when_query_fails', async () => {
    admin.results.solicitud = [errorResult('caída')];
    expect(await SolicitudesService.getSolicitudesPorPriorizar([1])).toEqual([]);
  });
});

describe('getSolicitudesPendientesAprobacion con alcance de administrador', () => {
  it('should_list_all_branches_when_scope_is_null', async () => {
    admin.results.solicitud = [fila([])];
    await SolicitudesService.getSolicitudesPendientesAprobacion(null);
    expect(admin.callsTo('solicitud')).toContainEqual(['eq', 'estado', 'pendiente_aprobacion']);
    expect(admin.callsTo('solicitud').some((c) => c[0] === 'in')).toBe(false);
  });

  it('should_filter_by_branches_when_given', async () => {
    admin.results.solicitud = [fila([])];
    await SolicitudesService.getSolicitudesPendientesAprobacion([4]);
    expect(admin.callsTo('solicitud')).toContainEqual(['in', 'sucursal', [4]]);
  });
});
