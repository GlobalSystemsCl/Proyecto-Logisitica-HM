import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSupabaseMock } from '../mocks/supabase';

const admin = createSupabaseMock();

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => admin }));

const { AuditoriaService } = await import('@/services/auditoria.service');

const SOL = '5eed0001-abcd-4ef0-9abc-000000000001';

function registro(entidad: string, entidad_id: string) {
  return {
    id: `a-${entidad_id}`,
    usuario_id: 'u1',
    entidad,
    entidad_id,
    accion: 'aprobacion',
    valor_anterior: null,
    valor_nuevo: null,
    created_at: '2026-10-24T12:00:00Z',
    usuario: { nombre: 'Ana', apellido: 'Soto' },
  };
}

describe('AuditoriaService.getAuditoria', () => {
  beforeEach(() => {
    admin.reset();
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('should_add_request_code_when_record_belongs_to_a_numbered_request', async () => {
    admin.results.auditoria = [{ data: [registro('solicitud', SOL)], error: null }];
    admin.results.solicitud = [
      { data: [], error: null },
      { data: [{ id: SOL, fecha_creacion: '2026-10-01T00:00:00Z', sucursal: 101, numero: 15 }], error: null },
    ];
    admin.results.vehiculo = [{ data: [], error: null }];

    const [reg] = await AuditoriaService.getAuditoria();

    expect(reg).toMatchObject({ solicitud_id: SOL, solicitud_codigo: '101-15', solicitud_fecha_creacion: '2026-10-01T00:00:00Z' });
    expect(admin.callsTo('solicitud')).toContainEqual(['select', 'id, fecha_creacion, sucursal, numero']);
  });

  it('should_resolve_request_code_through_vehicle_reservation_records', async () => {
    admin.results.auditoria = [{ data: [registro('solicitud_vehiculo', 'sv1')], error: null }];
    admin.results.solicitud_vehiculo = [{ data: [{ id: 'sv1', solicitud_id: SOL, vehiculo_id: 'v1' }], error: null }];
    admin.results.solicitud = [
      { data: [], error: null },
      { data: [{ id: SOL, fecha_creacion: null, sucursal: 9, numero: 3 }], error: null },
    ];
    admin.results.vehiculo = [{ data: [{ id: 'v1', chasis: 'CH1', patente: 'ABCD12' }], error: null }];

    const [reg] = await AuditoriaService.getAuditoria();

    expect(reg).toMatchObject({ solicitud_id: SOL, solicitud_codigo: '9-3', chasis: 'CH1', patente: 'ABCD12' });
  });

  it('should_fall_back_to_short_uuid_when_request_is_not_found', async () => {
    admin.results.auditoria = [{ data: [registro('solicitud', SOL)], error: null }];
    admin.results.solicitud = [{ data: [], error: null }, { data: [], error: null }];
    admin.results.vehiculo = [{ data: [], error: null }];

    const [reg] = await AuditoriaService.getAuditoria();

    expect(reg.solicitud_codigo).toBe('#5EED0001');
  });

  it('should_leave_code_null_when_record_is_not_about_a_request', async () => {
    admin.results.auditoria = [{ data: [registro('usuario', 'u9')], error: null }];
    admin.results.vehiculo = [{ data: [], error: null }];

    const [reg] = await AuditoriaService.getAuditoria();

    expect(reg).toMatchObject({ solicitud_id: null, solicitud_codigo: null });
  });
});
