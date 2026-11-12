import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UserProfile } from '@/types/auth.types';

const getCurrentUserProfile = vi.fn();
const listarActivos = vi.fn();
const crear = vi.fn();
const listarEmpresas = vi.fn();
const actualizarEmpresa = vi.fn();
const crearCamion = vi.fn();
const actualizarCamion = vi.fn();
const revalidatePath = vi.fn();

vi.mock('next/cache', () => ({ revalidatePath: (p: string) => revalidatePath(p) }));

vi.mock('@/services/auth.service', () => ({
  AuthService: { getCurrentUserProfile: () => getCurrentUserProfile() },
}));
vi.mock('@/services/transportista.service', () => ({
  TransportistaService: {
    listarActivos: () => listarActivos(),
    crear: (...a: unknown[]) => crear(...a),
    listarEmpresas: () => listarEmpresas(),
    actualizarEmpresa: (...a: unknown[]) => actualizarEmpresa(...a),
    crearCamion: (...a: unknown[]) => crearCamion(...a),
    actualizarCamion: (...a: unknown[]) => actualizarCamion(...a),
  },
}));

const {
  actualizarCamionAction,
  actualizarEmpresaTransporteAction,
  crearCamionAction,
  crearTransportistaAction,
  getTransportistasAction,
  listarEmpresasTransporteAction,
} = await import('@/app/actions/transportistas.actions');

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

describe('listarEmpresasTransporteAction', () => {
  it('should_list_companies_for_logistica_and_nothing_for_other_roles', async () => {
    getCurrentUserProfile.mockResolvedValue(perfil('logistica'));
    listarEmpresas.mockResolvedValue([{ id: 'e1', camiones: [] }]);
    expect(await listarEmpresasTransporteAction()).toEqual([{ id: 'e1', camiones: [] }]);

    vi.spyOn(console, 'error').mockImplementation(() => {});
    getCurrentUserProfile.mockResolvedValue(perfil('ejecutivo'));
    expect(await listarEmpresasTransporteAction()).toEqual([]);
  });
});

describe('crearCamionAction', () => {
  it('should_create_truck_with_actor_and_refresh_management_page', async () => {
    getCurrentUserProfile.mockResolvedValue(perfil('logistica'));
    crearCamion.mockResolvedValue({ success: true, camion: { id: 'c1' } });

    const res = await crearCamionAction('e1', 'ABCD-12', 'Pedro');

    expect(res.success).toBe(true);
    expect(crearCamion).toHaveBeenCalledWith('e1', 'ABCD-12', 'Pedro', 'u-1');
    expect(revalidatePath).toHaveBeenCalledWith('/logistica/transportistas');
  });

  it('should_reject_when_user_is_jefe_local', async () => {
    getCurrentUserProfile.mockResolvedValue(perfil('jefe_local'));
    const res = await crearCamionAction('e1', 'ABCD-12', null);
    expect(res).toEqual({ success: false, error: 'Solo Logística o el Administrador gestionan transportistas.' });
    expect(crearCamion).not.toHaveBeenCalled();
  });
});

describe('actualizarEmpresaTransporteAction', () => {
  it('should_update_and_not_refresh_when_service_fails', async () => {
    getCurrentUserProfile.mockResolvedValue(perfil('administrador'));
    actualizarEmpresa.mockResolvedValue({ success: false, error: 'x' });
    expect(await actualizarEmpresaTransporteAction('e1', { activo: false })).toEqual({ success: false, error: 'x' });
    expect(actualizarEmpresa).toHaveBeenCalledWith('e1', { activo: false });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe('actualizarCamionAction', () => {
  it('should_update_truck_when_user_is_logistica', async () => {
    getCurrentUserProfile.mockResolvedValue(perfil('logistica'));
    actualizarCamion.mockResolvedValue({ success: true });
    expect(await actualizarCamionAction('c1', { conductorNombre: 'Ana' })).toEqual({ success: true });
    expect(actualizarCamion).toHaveBeenCalledWith('c1', { conductorNombre: 'Ana' });
  });
});
