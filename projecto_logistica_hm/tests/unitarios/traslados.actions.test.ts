import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UserProfile } from '@/types/auth.types';

/**
 * R8: cancelar un traslado interno en tránsito es solo de Logística. El
 * administrador queda excluido a propósito (decisión de negocio, 2026-10-13).
 */

const getCurrentUserProfile = vi.fn();
const cancelarTraslado = vi.fn();
const crearTraslado = vi.fn();
const despacharTraslado = vi.fn();
const recibirTraslado = vi.fn();
const getTrasladosDeSucursal = vi.fn();
const getUserAssignedBranches = vi.fn();
const notificarTrasladoInterno = vi.fn(async () => ({ enviados: 1, fallidos: 0 }));
const getBranch = vi.fn();

vi.mock('@/services/auth.service', () => ({
  AuthService: { getCurrentUserProfile: () => getCurrentUserProfile() },
}));
vi.mock('@/services/solicitudes.service', () => ({ SolicitudesService: {} }));
vi.mock('@/services/traslado.service', () => ({
  TrasladoService: {
    cancelarTraslado: (...a: unknown[]) => cancelarTraslado(...a),
    crearTraslado: (...a: unknown[]) => crearTraslado(...a),
    despacharTraslado: (...a: unknown[]) => despacharTraslado(...a),
    recibirTraslado: (...a: unknown[]) => recibirTraslado(...a),
    getTrasladosDeSucursal: (id: number) => getTrasladosDeSucursal(id),
  },
}));
vi.mock('@/services/organizacion.service', () => ({
  OrganizacionService: {
    getBranch: (id: number) => getBranch(id),
    getUserAssignedBranches: (id: string) => getUserAssignedBranches(id),
  },
}));
vi.mock('@/services/sucursales.service', () => ({ SucursalesService: {} }));
vi.mock('@/services/notificacion.service', () => ({
  NotificacionService: {
    notificarTrasladoInterno: (...a: unknown[]) => notificarTrasladoInterno(...(a as [])),
  },
}));
// Ejecuta la tarea de inmediato para poder verificarla.
vi.mock('@/lib/segundoPlano', () => ({
  enSegundoPlano: (tarea: () => Promise<unknown>) => {
    void tarea();
  },
}));
vi.mock('@/lib/rutas', () => ({ revalidarSolicitudes: vi.fn() }));

const { cancelarTrasladoAction, crearTrasladoAction, despacharTrasladoAction, recibirTrasladoAction, getTrasladosAction } =
  await import('@/app/actions/traslados.actions');

function perfil(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    id: 'u-1',
    email: 'u@test.com',
    nombre: 'U',
    apellido: 'Test',
    rol: 'logistica',
    activo: true,
    aprobado: true,
    requiere_cambio_clave: false,
    sucursal_id: 1,
    sucursales: [],
    zonas: [{ id: 7, nombre: 'N' }],
    created_at: '',
    updated_at: '',
    ...overrides,
  };
}

const tick = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUserProfile.mockResolvedValue(perfil());
});

describe('cancelarTrasladoAction', () => {
  it('should_cancel_and_notify_when_user_is_logistica', async () => {
    cancelarTraslado.mockResolvedValue({ success: true });
    getBranch.mockResolvedValue({ id: 1, nombre: 'Centro', zona_id: 7 });

    const res = await cancelarTrasladoAction('t-1', ' Camión averiado ', 1);
    await tick();

    expect(res.success).toBe(true);
    expect(cancelarTraslado).toHaveBeenCalledWith('t-1', 'u-1', ' Camión averiado ', 1);
    expect(notificarTrasladoInterno).toHaveBeenCalledWith('traslado_interno_cancelado', 't-1', 'u-1', {
      motivo: 'Camión averiado',
      ubicacionFinal: 'Centro',
    });
  });

  it('should_reject_admin_when_cancelling_traslado_in_transit', async () => {
    getCurrentUserProfile.mockResolvedValue(perfil({ rol: 'administrador' }));

    const res = await cancelarTrasladoAction('t-1', 'Motivo válido', null);

    expect(res).toEqual({ success: false, error: 'Solo Logística puede cancelar un traslado en tránsito.' });
    expect(cancelarTraslado).not.toHaveBeenCalled();
  });

  it('should_reject_jefe_local_when_cancelling_traslado_in_transit', async () => {
    getCurrentUserProfile.mockResolvedValue(perfil({ rol: 'jefe_local' }));

    const res = await cancelarTrasladoAction('t-1', 'Motivo válido', null);

    expect(res).toEqual({ success: false, error: 'Solo Logística puede cancelar un traslado en tránsito.' });
    expect(cancelarTraslado).not.toHaveBeenCalled();
  });

  it('should_not_notify_when_service_fails', async () => {
    cancelarTraslado.mockResolvedValue({ success: false, error: 'Solo los traslados en tránsito pueden cancelarse.' });

    const res = await cancelarTrasladoAction('t-1', 'Motivo válido', null);
    await tick();

    expect(res).toEqual({ success: false, error: 'Solo los traslados en tránsito pueden cancelarse.' });
    expect(notificarTrasladoInterno).not.toHaveBeenCalled();
  });
});

describe('avisos de traslados internos', () => {
  it('should_notify_creation_with_the_new_transfer_id', async () => {
    crearTraslado.mockResolvedValue({ success: true, traslado: { id: 't-9' } });

    const res = await crearTrasladoAction({ origen_id: 1, destino_id: 2, transportista_id: 'tr' }, ['v-1']);
    await tick();

    expect(res.success).toBe(true);
    expect(notificarTrasladoInterno).toHaveBeenCalledWith('traslado_interno_creado', 't-9', 'u-1');
  });

  it('should_not_notify_creation_when_it_fails', async () => {
    crearTraslado.mockResolvedValue({ success: false, error: 'x' });
    await crearTrasladoAction({ origen_id: 1, destino_id: 2, transportista_id: 'tr' }, ['v-1']);
    await tick();
    expect(notificarTrasladoInterno).not.toHaveBeenCalled();
  });

  it('should_notify_dispatch', async () => {
    despacharTraslado.mockResolvedValue({ success: true });
    await despacharTrasladoAction('t-1');
    await tick();
    expect(notificarTrasladoInterno).toHaveBeenCalledWith('traslado_interno_despachado', 't-1', 'u-1');
  });

  it('should_notify_reception_with_issues_and_trimmed_note', async () => {
    getCurrentUserProfile.mockResolvedValue(perfil({ rol: 'jefe_local' }));
    recibirTraslado.mockResolvedValue({ success: true });

    await recibirTrasladoAction('t-1', { conNovedades: true, observacion: ' Rayón ' });
    await tick();

    expect(notificarTrasladoInterno).toHaveBeenCalledWith('traslado_interno_recepcionado', 't-1', 'u-1', {
      conNovedades: true,
      observacion: 'Rayón',
    });
  });

  it('should_not_notify_reception_when_it_fails', async () => {
    getCurrentUserProfile.mockResolvedValue(perfil({ rol: 'jefe_local' }));
    recibirTraslado.mockResolvedValue({ success: false, error: 'x' });
    await recibirTrasladoAction('t-1');
    await tick();
    expect(notificarTrasladoInterno).not.toHaveBeenCalled();
  });
});

describe('getTrasladosAction (Jefe de Local)', () => {
  it('should_list_transfers_of_every_branch_without_repeating', async () => {
    getCurrentUserProfile.mockResolvedValue(perfil({ rol: 'jefe_local' }));
    getUserAssignedBranches.mockResolvedValue([{ id: 1 }, { id: 2 }, { id: 1 }]);
    getTrasladosDeSucursal.mockImplementation(async (id: number) =>
      id === 1
        ? [{ id: 't-a', created_at: '2026-11-01T10:00:00Z' }]
        : [{ id: 't-a', created_at: '2026-11-01T10:00:00Z' }, { id: 't-b', created_at: '2026-11-05T10:00:00Z' }]
    );

    const res = await getTrasladosAction();

    expect(getTrasladosDeSucursal).toHaveBeenCalledTimes(2);
    expect(res.map((t) => t.id)).toEqual(['t-b', 't-a']);
  });
});
