import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSupabaseMock, fila } from '../mocks/supabase';

const admin = createSupabaseMock();
const toggleUserStatus = vi.fn(async () => ({ success: true }));
const registrarAuditoria = vi.fn(async () => undefined);

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => admin }));
vi.mock('@/services/users.service', () => ({
  UsersService: { toggleUserStatus: (...a: unknown[]) => toggleUserStatus(...(a as [])) },
}));
vi.mock('@/services/solicitudes.service', () => ({
  SolicitudesService: { registrarAuditoria: (...a: unknown[]) => registrarAuditoria(...(a as [])) },
}));

const { AusenciaService } = await import('@/services/ausencia.service');

const HOY = '2026-11-12';

function ausencia(overrides: Record<string, unknown> = {}) {
  return {
    id: 'a1',
    titular_id: 'tit',
    sustituto_id: 'sus',
    desde: HOY,
    hasta: '2026-11-20',
    estado: 'programada',
    motivo: null,
    iniciada_at: null,
    finalizada_at: null,
    creada_por: 'adm',
    titular: { nombre: 'Tito', apellido: 'Lar' },
    sustituto: { nombre: 'Susi', apellido: 'Tuto' },
    ...overrides,
  };
}

beforeEach(() => {
  admin.reset();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('AusenciaService.crear', () => {
  const datos = { titularId: 'tit', sustitutoId: 'sus', desde: '2026-11-15', hasta: '2026-11-20' };

  it('should_reject_invalid_data_without_querying', async () => {
    expect(await AusenciaService.crear({ ...datos, sustitutoId: 'tit' }, 'adm', HOY)).toEqual({
      success: false,
      error: 'El sustituto debe ser otra persona.',
    });
    expect(admin.from).not.toHaveBeenCalled();
  });

  it('should_require_both_users_to_be_logistica_and_substitute_active', async () => {
    admin.results.usuario = [
      fila([{ id: 'tit', rol: 'logistica', activo: true }, { id: 'sus', rol: 'ejecutivo', activo: true }]),
      fila([{ id: 'tit', rol: 'logistica', activo: true }, { id: 'sus', rol: 'logistica', activo: false }]),
    ];
    expect((await AusenciaService.crear(datos, 'adm', HOY)).error).toBe('El titular y el sustituto deben ser usuarios de Logística.');
    expect((await AusenciaService.crear(datos, 'adm', HOY)).error).toBe('El sustituto debe tener la cuenta activa.');
  });

  it('should_reject_when_substitute_is_absent_on_those_days', async () => {
    admin.results.usuario = [fila([{ id: 'tit', rol: 'logistica', activo: true }, { id: 'sus', rol: 'logistica', activo: true }])];
    admin.results.ausencia_usuario = [fila([{ desde: '2026-11-18', hasta: '2026-11-25' }])];
    expect((await AusenciaService.crear(datos, 'adm', HOY)).error).toBe('El sustituto tiene una ausencia en esos mismos días.');
  });

  it('should_schedule_a_future_absence_without_starting_it', async () => {
    admin.results.usuario = [fila([{ id: 'tit', rol: 'logistica', activo: true }, { id: 'sus', rol: 'logistica', activo: true }])];
    admin.results.ausencia_usuario = [fila([]), fila({ id: 'a1' })];

    expect(await AusenciaService.crear({ ...datos, motivo: ' Vacaciones ' }, 'adm', HOY)).toEqual({ success: true });
    expect(admin.callsTo('ausencia_usuario')).toContainEqual([
      'insert',
      { titular_id: 'tit', sustituto_id: 'sus', desde: '2026-11-15', hasta: '2026-11-20', motivo: 'Vacaciones', creada_por: 'adm' },
    ]);
    expect(toggleUserStatus).not.toHaveBeenCalled();
  });

  it('should_report_holder_with_a_current_absence', async () => {
    admin.results.usuario = [fila([{ id: 'tit', rol: 'logistica', activo: true }, { id: 'sus', rol: 'logistica', activo: true }])];
    admin.results.ausencia_usuario = [fila([]), { data: null, error: { message: 'dup', code: '23505' } }];
    expect((await AusenciaService.crear(datos, 'adm', HOY)).error).toBe('Ese usuario ya tiene una ausencia programada o en curso.');
  });
});

describe('AusenciaService.iniciar', () => {
  it('should_transfer_open_work_add_missing_zones_and_freeze_holder', async () => {
    admin.results.ausencia_usuario = [fila(ausencia()), fila(null)];
    admin.results.solicitud = [fila([{ id: 's1' }, { id: 's2' }]), fila(null)];
    admin.results.traslado_interno = [fila([{ id: 't1' }]), fila(null)];
    admin.results.usuario_zona = [fila([{ zona_id: 1 }, { zona_id: 2 }]), fila([{ zona_id: 2 }]), fila(null)];

    expect(await AusenciaService.iniciar('a1', 'adm')).toEqual({ success: true });

    expect(admin.callsTo('solicitud')).toContainEqual(['update', { logistica_id: 'sus' }]);
    expect(admin.callsTo('solicitud')).toContainEqual(['in', 'id', ['s1', 's2']]);
    expect(admin.callsTo('traslado_interno')).toContainEqual(['update', { logistica_id: 'sus' }]);
    expect(admin.callsTo('ausencia_traspaso')).toContainEqual([
      'insert',
      [
        { ausencia_id: 'a1', entidad: 'solicitud', entidad_id: 's1' },
        { ausencia_id: 'a1', entidad: 'solicitud', entidad_id: 's2' },
        { ausencia_id: 'a1', entidad: 'traslado_interno', entidad_id: 't1' },
      ],
    ]);
    expect(admin.callsTo('usuario_zona')).toContainEqual(['insert', [{ usuario_id: 'sus', zona_id: 1, ausencia_id: 'a1' }]]);
    expect(toggleUserStatus).toHaveBeenCalledWith('tit', false, 'adm');
    expect(admin.callsTo('ausencia_usuario')).toContainEqual(['update', expect.objectContaining({ estado: 'activa' })]);
  });

  it('should_only_start_scheduled_absences', async () => {
    admin.results.ausencia_usuario = [fila(ausencia({ estado: 'activa' }))];
    expect(await AusenciaService.iniciar('a1', 'adm')).toEqual({ success: false, error: 'Solo se puede iniciar una ausencia programada.' });
    expect(toggleUserStatus).not.toHaveBeenCalled();
  });
});

describe('AusenciaService.finalizar', () => {
  it('should_return_open_transferred_work_remove_temporary_zones_and_reactivate', async () => {
    admin.results.ausencia_usuario = [fila(ausencia({ estado: 'activa' })), fila(null)];
    admin.results.ausencia_traspaso = [
      fila([
        { entidad: 'solicitud', entidad_id: 's1' },
        { entidad: 'traslado_interno', entidad_id: 't1' },
      ]),
    ];

    expect(await AusenciaService.finalizar('a1', 'adm')).toEqual({ success: true });

    const solicitud = admin.callsTo('solicitud');
    expect(solicitud).toContainEqual(['update', { logistica_id: 'tit' }]);
    expect(solicitud).toContainEqual(['eq', 'logistica_id', 'sus']);
    expect(admin.callsTo('traslado_interno')).toContainEqual(['update', { logistica_id: 'tit' }]);
    expect(admin.callsTo('usuario_zona')).toContainEqual(['eq', 'ausencia_id', 'a1']);
    expect(toggleUserStatus).toHaveBeenCalledWith('tit', true, 'adm');
    expect(admin.callsTo('ausencia_usuario')).toContainEqual(['update', expect.objectContaining({ estado: 'finalizada' })]);
  });
});

describe('AusenciaService.cancelar', () => {
  it('should_cancel_scheduled_and_refuse_closed_absences', async () => {
    admin.results.ausencia_usuario = [fila(ausencia()), fila(null), fila(ausencia({ estado: 'finalizada' }))];
    expect(await AusenciaService.cancelar('a1', 'adm')).toEqual({ success: true });
    expect(admin.callsTo('ausencia_usuario')).toContainEqual(['update', { estado: 'cancelada' }]);
    expect(await AusenciaService.cancelar('a1', 'adm')).toEqual({ success: false, error: 'La ausencia ya está cerrada.' });
  });
});

describe('AusenciaService.procesarPendientes', () => {
  it('should_start_due_absences_close_expired_ones_and_use_creator_as_actor_for_cron', async () => {
    const iniciar = vi.spyOn(AusenciaService, 'iniciar').mockResolvedValue({ success: true });
    const finalizar = vi.spyOn(AusenciaService, 'finalizar').mockResolvedValue({ success: true });
    admin.results.ausencia_usuario = [
      fila([
        { id: 'a1', estado: 'programada', desde: HOY, hasta: '2026-11-20', creada_por: 'adm' },
        { id: 'a2', estado: 'activa', desde: '2026-11-01', hasta: '2026-11-11', creada_por: 'adm' },
        { id: 'a3', estado: 'programada', desde: '2026-11-01', hasta: '2026-11-05', creada_por: null },
        { id: 'a4', estado: 'programada', desde: '2026-12-01', hasta: '2026-12-05', creada_por: 'adm' },
      ]),
    ];

    const res = await AusenciaService.procesarPendientes(HOY, null);

    expect(res).toEqual({ iniciadas: 1, finalizadas: 2, errores: [] });
    expect(iniciar).toHaveBeenCalledWith('a1', 'adm');
    expect(finalizar).toHaveBeenCalledWith('a2', 'adm');
    expect(iniciar).toHaveBeenCalledTimes(1);
  });
});
