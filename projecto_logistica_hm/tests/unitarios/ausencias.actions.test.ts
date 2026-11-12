import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UserProfile } from '@/types/auth.types';

const getCurrentUserProfile = vi.fn();
const crear = vi.fn();
const cancelar = vi.fn();
const revalidatePath = vi.fn();

vi.mock('next/cache', () => ({ revalidatePath: (p: string) => revalidatePath(p) }));
vi.mock('@/services/auth.service', () => ({
  AuthService: { getCurrentUserProfile: () => getCurrentUserProfile() },
}));
vi.mock('@/services/ausencia.service', () => ({
  AusenciaService: {
    crear: (...a: unknown[]) => crear(...a),
    cancelar: (...a: unknown[]) => cancelar(...a),
  },
}));

const { cancelarAusenciaAction, crearAusenciaAction } = await import('@/app/actions/ausencias.actions');

function perfil(rol: UserProfile['rol']): UserProfile {
  return {
    id: 'u-1',
    email: 'u@test.com',
    nombre: 'U',
    apellido: 'T',
    rol,
    activo: true,
    aprobado: true,
    requiere_cambio_clave: false,
    sucursal_id: 1,
    sucursales: [],
    zonas: [],
    created_at: '',
    updated_at: '',
  };
}

const DATOS = { titularId: 'tit', sustitutoId: 'sus', desde: '2026-11-15', hasta: '2026-11-20' };

beforeEach(() => {
  vi.clearAllMocks();
});

describe('crearAusenciaAction', () => {
  it('should_create_and_revalidate_when_admin', async () => {
    getCurrentUserProfile.mockResolvedValue(perfil('administrador'));
    crear.mockResolvedValue({ success: true });

    expect(await crearAusenciaAction(DATOS)).toEqual({ success: true });
    expect(crear).toHaveBeenCalledWith(DATOS, 'u-1', expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/));
    expect(revalidatePath).toHaveBeenCalledWith('/admin/ausencias');
  });

  it('should_reject_when_not_admin', async () => {
    getCurrentUserProfile.mockResolvedValue(perfil('logistica'));

    const res = await crearAusenciaAction(DATOS);

    expect(res.success).toBe(false);
    expect(crear).not.toHaveBeenCalled();
  });

  it('should_not_revalidate_when_service_fails', async () => {
    getCurrentUserProfile.mockResolvedValue(perfil('administrador'));
    crear.mockResolvedValue({ success: false, error: 'x' });

    expect(await crearAusenciaAction(DATOS)).toEqual({ success: false, error: 'x' });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe('cancelarAusenciaAction', () => {
  it('should_cancel_when_admin', async () => {
    getCurrentUserProfile.mockResolvedValue(perfil('administrador'));
    cancelar.mockResolvedValue({ success: true });

    expect(await cancelarAusenciaAction('a1')).toEqual({ success: true });
    expect(cancelar).toHaveBeenCalledWith('a1', 'u-1');
    expect(revalidatePath).toHaveBeenCalledWith('/admin/ausencias');
  });

  it('should_reject_when_not_logged_in', async () => {
    getCurrentUserProfile.mockResolvedValue(null);

    expect((await cancelarAusenciaAction('a1')).success).toBe(false);
    expect(cancelar).not.toHaveBeenCalled();
  });
});
