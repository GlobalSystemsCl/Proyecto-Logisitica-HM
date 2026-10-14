import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UserProfile } from '@/types/auth.types';

const getCurrentUserProfile = vi.fn();
const getBandeja = vi.fn();
const marcarLeida = vi.fn();
const marcarTodasLeidas = vi.fn();

vi.mock('@/services/auth.service', () => ({
  AuthService: { getCurrentUserProfile: () => getCurrentUserProfile() },
}));
vi.mock('@/services/notificacion.service', () => ({
  NotificacionService: {
    getBandeja: (...a: unknown[]) => getBandeja(...a),
    marcarLeida: (...a: unknown[]) => marcarLeida(...a),
    marcarTodasLeidas: (...a: unknown[]) => marcarTodasLeidas(...a),
  },
}));

const {
  getBandejaNotificacionesAction,
  marcarNotificacionLeidaAction,
  marcarTodasNotificacionesLeidasAction,
} = await import('@/app/actions/bandeja.actions');

const ID = '11111111-2222-4333-8444-555555555555';

function perfil(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    id: 'u-1',
    email: 'u@test.com',
    nombre: 'U',
    apellido: 'Test',
    rol: 'ejecutivo',
    activo: true,
    aprobado: true,
    requiere_cambio_clave: false,
    sucursal_id: 1,
    sucursales: [],
    zonas: [],
    created_at: '',
    updated_at: '',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUserProfile.mockResolvedValue(perfil());
});

describe('getBandejaNotificacionesAction', () => {
  it('should_return_inbox_of_the_session_user', async () => {
    getBandeja.mockResolvedValue({ items: [], noLeidas: 3 });
    expect(await getBandejaNotificacionesAction()).toEqual({ items: [], noLeidas: 3 });
    expect(getBandeja).toHaveBeenCalledWith('u-1');
  });

  it('should_return_empty_inbox_without_session', async () => {
    getCurrentUserProfile.mockResolvedValue(null);
    expect(await getBandejaNotificacionesAction()).toEqual({ items: [], noLeidas: 0 });
    expect(getBandeja).not.toHaveBeenCalled();
  });

  it('should_return_empty_inbox_when_password_change_is_required', async () => {
    getCurrentUserProfile.mockResolvedValue(perfil({ requiere_cambio_clave: true }));
    expect(await getBandejaNotificacionesAction()).toEqual({ items: [], noLeidas: 0 });
  });
});

describe('marcarNotificacionLeidaAction', () => {
  it('should_mark_as_read_using_the_session_user_id', async () => {
    marcarLeida.mockResolvedValue(true);
    expect(await marcarNotificacionLeidaAction(ID)).toEqual({ success: true });
    expect(marcarLeida).toHaveBeenCalledWith('u-1', ID);
  });

  it('should_reject_invalid_ids', async () => {
    const res = await marcarNotificacionLeidaAction("x' or 1=1");
    expect(res).toEqual({ success: false, error: 'Notificación no válida.' });
    expect(marcarLeida).not.toHaveBeenCalled();
  });

  it('should_return_error_when_update_fails', async () => {
    marcarLeida.mockResolvedValue(false);
    expect((await marcarNotificacionLeidaAction(ID)).success).toBe(false);
  });

  it('should_reject_without_session', async () => {
    getCurrentUserProfile.mockResolvedValue(null);
    expect((await marcarNotificacionLeidaAction(ID)).success).toBe(false);
    expect(marcarLeida).not.toHaveBeenCalled();
  });
});

describe('marcarTodasNotificacionesLeidasAction', () => {
  it('should_mark_all_as_read_for_the_session_user', async () => {
    marcarTodasLeidas.mockResolvedValue(true);
    expect(await marcarTodasNotificacionesLeidasAction()).toEqual({ success: true });
    expect(marcarTodasLeidas).toHaveBeenCalledWith('u-1');
  });

  it('should_return_error_when_update_fails', async () => {
    marcarTodasLeidas.mockResolvedValue(false);
    expect((await marcarTodasNotificacionesLeidasAction()).success).toBe(false);
  });
});
