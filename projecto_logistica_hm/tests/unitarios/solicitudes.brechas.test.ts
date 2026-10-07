import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSupabaseMock, fila, type MockResult, type SupabaseMock } from '../mocks/supabase';
import {
  MENSAJE_CONFLICTO_ESTADO,
  SolicitudesService,
  type SolicitudMinima,
} from '@/services/solicitudes.service';

/**
 * Tests de las correcciones de la auditoría 2026-10-07 en SolicitudesService
 * (brechas 008, 010, 018 y 024).
 */

const admin: SupabaseMock = createSupabaseMock();

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => admin,
}));

const USUARIO_ID = 'u-1';

function minimo(overrides: Partial<SolicitudMinima> = {}): SolicitudMinima {
  return {
    id: 's-1',
    estado: 'pendiente_aprobacion',
    sucursal: 1,
    sucursal_destino: 2,
    ejecutivo_id: null,
    jefe_local_id: null,
    logistica_id: null,
    tipo_solicitud: 'venta',
    posicion_prioridad: null,
    fecha_tentativa_despacho: null,
    fecha_despacho: null,
    fecha_entrega: null,
    fecha_inicio_transito: null,
    ...overrides,
  };
}

function errorResult(message: string, code?: string): MockResult {
  return { data: null, error: { message, code } };
}

function spyRegistrarAuditoria() {
  return vi.spyOn(SolicitudesService, 'registrarAuditoria').mockResolvedValue(undefined);
}

beforeEach(() => {
  admin.reset();
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-07T12:00:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('transiciones condicionadas al estado (brecha 010)', () => {
  it('should_filter_update_by_the_state_that_was_validated', async () => {
    admin.results.solicitud = [fila(minimo()), fila([{ id: 's-1' }])];
    spyRegistrarAuditoria();

    const res = await SolicitudesService.aprobarSolicitud('s-1', USUARIO_ID, '2026-10-20');

    expect(res).toEqual({ success: true });
    expect(admin.callsTo('solicitud')).toContainEqual(['eq', 'estado', 'pendiente_aprobacion']);
    expect(admin.callsTo('solicitud')).toContainEqual(['select', 'id']);
  });

  it('should_return_conflict_when_no_row_was_updated', async () => {
    admin.results.solicitud = [fila(minimo()), fila([])];
    const auditoria = spyRegistrarAuditoria();

    const res = await SolicitudesService.aprobarSolicitud('s-1', USUARIO_ID, '2026-10-20');

    expect(res).toEqual({ success: false, error: MENSAJE_CONFLICTO_ESTADO });
    expect(auditoria).not.toHaveBeenCalled();
  });

  it('should_return_business_message_when_trigger_rejects_with_P0001', async () => {
    admin.results.solicitud = [
      fila(minimo({ estado: 'calendarizada' })),
      errorResult('El vehículo ya fue vendido y no se puede reservar.', 'P0001'),
    ];
    spyRegistrarAuditoria();

    const res = await SolicitudesService.despacharSolicitud('s-1', USUARIO_ID);

    expect(res).toEqual({ success: false, error: 'El vehículo ya fue vendido y no se puede reservar.' });
  });
});

describe('getSolicitudIdDeDocumento', () => {
  it('should_return_solicitud_id_when_document_exists', async () => {
    admin.results.solicitud_documento = [fila({ solicitud_id: 's-9' })];
    expect(await SolicitudesService.getSolicitudIdDeDocumento('d-1')).toBe('s-9');
    expect(admin.callsTo('solicitud_documento')).toContainEqual(['eq', 'id', 'd-1']);
  });

  it('should_return_null_when_document_does_not_exist', async () => {
    admin.results.solicitud_documento = [fila(null)];
    expect(await SolicitudesService.getSolicitudIdDeDocumento('d-x')).toBeNull();
  });

  it('should_return_null_when_query_throws', async () => {
    vi.spyOn(admin, 'from').mockImplementationOnce(() => {
      throw new Error('caída');
    });
    expect(await SolicitudesService.getSolicitudIdDeDocumento('d-1')).toBeNull();
  });
});

describe('getSolicitudIdDeReserva', () => {
  it('should_return_solicitud_id_when_reservation_exists', async () => {
    admin.results.solicitud_vehiculo = [fila({ solicitud_id: 's-3' })];
    expect(await SolicitudesService.getSolicitudIdDeReserva('sv-1')).toBe('s-3');
  });

  it('should_return_null_when_reservation_does_not_exist', async () => {
    admin.results.solicitud_vehiculo = [fila(null)];
    expect(await SolicitudesService.getSolicitudIdDeReserva('sv-x')).toBeNull();
  });

  it('should_return_null_when_query_throws', async () => {
    vi.spyOn(admin, 'from').mockImplementationOnce(() => {
      throw new Error('caída');
    });
    expect(await SolicitudesService.getSolicitudIdDeReserva('sv-1')).toBeNull();
  });
});

describe('eliminarSolicitud auditada (brecha 018)', () => {
  it('should_audit_deletion_with_actor_when_user_is_given', async () => {
    admin.results.solicitud = [fila(minimo({ ejecutivo_id: 'e-1' })), fila(null)];
    const auditoria = spyRegistrarAuditoria();

    const res = await SolicitudesService.eliminarSolicitud('s-1', USUARIO_ID);

    expect(res).toEqual({ success: true });
    expect(auditoria).toHaveBeenCalledWith(
      USUARIO_ID,
      'solicitud',
      's-1',
      'eliminacion',
      { estado: 'pendiente_aprobacion', sucursal: 1, ejecutivo_id: 'e-1' },
      null
    );
  });

  it('should_not_audit_when_delete_fails', async () => {
    admin.results.solicitud = [fila(minimo()), errorResult('fk')];
    const auditoria = spyRegistrarAuditoria();

    const res = await SolicitudesService.eliminarSolicitud('s-1', USUARIO_ID);

    expect(res.success).toBe(false);
    expect(auditoria).not.toHaveBeenCalled();
  });
});

describe('calendarizarSolicitud: encargado de logística (brecha 008)', () => {
  function cambiosDelUpdate() {
    return admin.callsTo('solicitud').find((c) => c[0] === 'update')?.[1] as Record<string, unknown>;
  }

  it('should_keep_existing_logistica_id_when_solicitud_was_assigned', async () => {
    admin.results.solicitud = [fila(minimo({ estado: 'asignada', logistica_id: 'log-a' })), fila([{ id: 's-1' }])];
    spyRegistrarAuditoria();

    await SolicitudesService.calendarizarSolicitud('s-1', '2026-10-10', 'log-b', 'logistica');

    expect(cambiosDelUpdate().logistica_id).toBe('log-a');
  });

  it('should_not_register_jefe_local_as_logistica_encargado', async () => {
    admin.results.solicitud = [fila(minimo({ estado: 'priorizada' })), fila([{ id: 's-1' }])];
    spyRegistrarAuditoria();

    await SolicitudesService.calendarizarSolicitud('s-1', '2026-10-10', 'jl-1', 'jefe_local');

    expect(cambiosDelUpdate().logistica_id).toBeNull();
  });

  it('should_assign_actor_when_logistica_calendarizes_unassigned_solicitud', async () => {
    admin.results.solicitud = [fila(minimo({ estado: 'priorizada' })), fila([{ id: 's-1' }])];
    spyRegistrarAuditoria();

    await SolicitudesService.calendarizarSolicitud('s-1', '2026-10-10', 'log-b', 'logistica');

    expect(cambiosDelUpdate().logistica_id).toBe('log-b');
  });
});

describe('getSolicitudesFiltradas para logística (brecha 024)', () => {
  it('should_filter_by_zone_branches_in_the_database', async () => {
    admin.results.usuario_zona = [fila([{ zona_id: 7, zona: { id: 7, nombre: 'Norte' } }])];
    admin.results.sucursal = [fila([{ id: 1 }, { id: 3 }])];
    admin.results.solicitud = [fila([])];

    const res = await SolicitudesService.getSolicitudesFiltradas('log-1', 'logistica');

    expect(res).toEqual([]);
    expect(admin.callsTo('sucursal')).toContainEqual(['in', 'zona_id', [7]]);
    expect(admin.callsTo('solicitud')).toContainEqual(['in', 'sucursal', [1, 3]]);
  });

  it('should_return_empty_without_querying_solicitudes_when_zones_have_no_branches', async () => {
    admin.results.usuario_zona = [fila([{ zona_id: 7, zona: { id: 7, nombre: 'Norte' } }])];
    admin.results.sucursal = [fila([])];

    const res = await SolicitudesService.getSolicitudesFiltradas('log-1', 'logistica');

    expect(res).toEqual([]);
    expect(admin.callsTo('solicitud')).toHaveLength(0);
  });

  it('should_return_empty_when_branch_query_fails', async () => {
    admin.results.usuario_zona = [fila([{ zona_id: 7, zona: { id: 7, nombre: 'Norte' } }])];
    admin.results.sucursal = [errorResult('caída')];

    expect(await SolicitudesService.getSolicitudesFiltradas('log-1', 'logistica')).toEqual([]);
  });
});
