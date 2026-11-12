import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UserProfile } from '@/types/auth.types';

/**
 * R4 (2026-11-11): vehículos de una sucursal y los que van en camino hacia
 * ella, desde Slots. El jefe de local solo ve sus sucursales.
 */

const getCurrentUserProfile = vi.fn();
const usuarioTieneSucursal = vi.fn();
const getVehiculosEnSucursal = vi.fn();
const getRecepcionesPendientes = vi.fn();
const getTrasladosEnTransitoHacia = vi.fn();

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/services/auth.service', () => ({
  AuthService: { getCurrentUserProfile: () => getCurrentUserProfile() },
}));
vi.mock('@/services/sucursales.service', () => ({ SucursalesService: {} }));
vi.mock('@/services/organizacion.service', () => ({
  OrganizacionService: { usuarioTieneSucursal: (...a: unknown[]) => usuarioTieneSucursal(...a) },
}));
vi.mock('@/services/vehiculo.service', () => ({
  VehiculoService: { getVehiculosEnSucursal: (...a: unknown[]) => getVehiculosEnSucursal(...a) },
}));
vi.mock('@/services/solicitudes.service', () => ({
  SolicitudesService: { getRecepcionesPendientes: (...a: unknown[]) => getRecepcionesPendientes(...a) },
}));
vi.mock('@/services/traslado.service', () => ({
  TrasladoService: { getTrasladosEnTransitoHacia: (...a: unknown[]) => getTrasladosEnTransitoHacia(...a) },
}));

const { getVehiculosDeSucursalAction } = await import('@/app/actions/sucursales.actions');

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
    sucursal_id: 101,
    sucursales: [],
    zonas: [],
    created_at: '',
    updated_at: '',
  };
}

function enTransito(id: string, destino: number | null) {
  return {
    id,
    sucursal: 101,
    numero: 1,
    sucursal_nombre: 'Origen',
    sucursal_destino: destino,
    sucursal_destino_nombre: 'Destino',
    estado: 'en_transito',
    fecha_despacho: '2026-11-10T12:00:00Z',
    fecha_limite: null,
    titulo_evento: null,
    transportista: null,
    vehiculos: [{ solicitud_vehiculo_id: `sv-${id}`, disponibilidad: 'reservado', chasis: `CH-${id}`, patente: null, marca: 'Kia', modelo: 'Rio', anio: 2024, color: null }],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getVehiculosEnSucursal.mockResolvedValue([{ id: 'v1', chasis: 'CH1', reservado: false }]);
  getRecepcionesPendientes.mockResolvedValue([enTransito('s1', 102), enTransito('evento', null)]);
  getTrasladosEnTransitoHacia.mockResolvedValue([]);
});

describe('getVehiculosDeSucursalAction', () => {
  it('should_return_vehicles_in_branch_and_only_requests_arriving_to_it', async () => {
    getCurrentUserProfile.mockResolvedValue(perfil('logistica'));

    const res = await getVehiculosDeSucursalAction(102);

    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.enSucursal).toEqual([{ id: 'v1', chasis: 'CH1', reservado: false }]);
    expect(res.enCamino.map((f) => f.chasis)).toEqual(['CH-s1']);
    expect(getVehiculosEnSucursal).toHaveBeenCalledWith(102);
    expect(usuarioTieneSucursal).not.toHaveBeenCalled();
  });

  it('should_reject_branch_not_assigned_to_jefe_local', async () => {
    getCurrentUserProfile.mockResolvedValue(perfil('jefe_local'));
    usuarioTieneSucursal.mockResolvedValue(false);

    expect(await getVehiculosDeSucursalAction(102)).toEqual({ success: false, error: 'Solo puedes ver los vehículos de tus sucursales.' });
    expect(getVehiculosEnSucursal).not.toHaveBeenCalled();
  });

  it('should_reject_other_roles_and_invalid_ids', async () => {
    getCurrentUserProfile.mockResolvedValue(perfil('ejecutivo'));
    expect((await getVehiculosDeSucursalAction(102)).success).toBe(false);

    getCurrentUserProfile.mockResolvedValue(perfil('administrador'));
    expect(await getVehiculosDeSucursalAction(0)).toEqual({ success: false, error: 'Sucursal no válida.' });
  });
});
