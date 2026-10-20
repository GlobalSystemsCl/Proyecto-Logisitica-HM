import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UserProfile } from '@/types/auth.types';

const getCurrentUserProfile = vi.fn();
const listarActivos = vi.fn();
const crear = vi.fn();

vi.mock('@/services/auth.service', () => ({
  AuthService: { getCurrentUserProfile: () => getCurrentUserProfile() },
}));
vi.mock('@/services/transportista.service', () => ({
  TransportistaService: {
    listarActivos: () => listarActivos(),
    crear: (...a: unknown[]) => crear(...a),
  },
}));

const { crearTransportistaAction, getTransportistasAction } = await import('@/app/actions/transportistas.actions');

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

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getTransportistasAction', () => {
  it('should_list_carriers_when_user_is_logistica', async () => {
    getCurrentUserProfile.mockResolvedValue(perfil('logistica'));
    listarActivos.mockResolvedValue([{ id: 't1' }]);
    expect(await getTransportistasAction()).toEqual([{ id: 't1' }]);
  });

  it('should_return_empty_list_when_user_is_ejecutivo', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    getCurrentUserProfile.mockResolvedValue(perfil('ejecutivo'));
    expect(await getTransportistasAction()).toEqual([]);
    expect(listarActivos).not.toHaveBeenCalled();
  });
});

describe('crearTransportistaAction', () => {
  it('should_create_with_actor_id_when_user_is_admin', async () => {
    getCurrentUserProfile.mockResolvedValue(perfil('administrador'));
    crear.mockResolvedValue({ success: true, transportista: { id: 't1' } });

    const res = await crearTransportistaAction('Andes', '76543210-3');

    expect(res.success).toBe(true);
    expect(crear).toHaveBeenCalledWith('Andes', '76543210-3', 'u-1');
  });

  it('should_reject_when_user_is_jefe_local', async () => {
    getCurrentUserProfile.mockResolvedValue(perfil('jefe_local'));
    const res = await crearTransportistaAction('Andes', '76543210-3');
    expect(res).toEqual({ success: false, error: 'Solo Logística o el Administrador gestionan transportistas.' });
    expect(crear).not.toHaveBeenCalled();
  });
});
