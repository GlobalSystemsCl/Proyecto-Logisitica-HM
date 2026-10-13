import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UserProfile } from '@/types/auth.types';

/**
 * R8: cancelar un traslado interno en tránsito es solo de Logística. El
 * administrador queda excluido a propósito (decisión de negocio, 2026-10-13).
 */

const getCurrentUserProfile = vi.fn();
const cancelarTraslado = vi.fn();
const notificarTrasladoInterno = vi.fn(async () => ({ enviados: 1, fallidos: 0 }));
const getBranch = vi.fn();

vi.mock('@/services/auth.service', () => ({
  AuthService: { getCurrentUserProfile: () => getCurrentUserProfile() },
}));
vi.mock('@/services/solicitudes.service', () => ({ SolicitudesService: {} }));
vi.mock('@/services/traslado.service', () => ({
  TrasladoService: { cancelarTraslado: (...a: unknown[]) => cancelarTraslado(...a) },
}));
vi.mock('@/services/organizacion.service', () => ({
  OrganizacionService: { getBranch: (id: number) => getBranch(id) },
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

const { cancelarTrasladoAction } = await import('@/app/actions/traslados.actions');

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
