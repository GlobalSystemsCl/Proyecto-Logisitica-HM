import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UserProfile } from '@/types/auth.types';

const getCurrentUserProfile = vi.fn();
const registrarAuditoria = vi.fn(async () => undefined);
const svc = {
  createVehiculo: vi.fn(),
  updateVehiculo: vi.fn(),
  deleteVehiculo: vi.fn(),
  importVehiculosCSV: vi.fn(),
  getVehiculoById: vi.fn(),
};

vi.mock('@/services/auth.service', () => ({
  AuthService: { getCurrentUserProfile: () => getCurrentUserProfile() },
}));
vi.mock('@/services/vehiculo.service', () => ({ VehiculoService: svc }));
vi.mock('@/services/solicitudes.service', () => ({
  SolicitudesService: { registrarAuditoria: (...a: unknown[]) => registrarAuditoria(...(a as [])) },
}));
vi.mock('@/services/organizacion.service', () => ({ OrganizacionService: {} }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

const actions = await import('@/app/actions/vehiculo.actions');

function perfil(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    id: 'log-1',
    email: 'l@test.com',
    nombre: 'L',
    apellido: 'Uno',
    rol: 'logistica',
    activo: true,
    aprobado: true,
    requiere_cambio_clave: false,
    created_at: '',
    updated_at: '',
    ...overrides,
  };
}

const vehiculo = {
  id: 'veh-1',
  chasis: 'WBA3A5C50FF123456',
  patente: 'ABCD-12',
  marca: 'Toyota',
  modelo: 'Corolla',
  anio: 2024,
  color: 'Negro',
  precio: 1000,
  ubicacion: 1,
};

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUserProfile.mockResolvedValue(perfil());
});

describe('updateVehiculoAction (auditoría R2)', () => {
  it('should_audit_location_change_with_actor_and_before_after', async () => {
    svc.getVehiculoById.mockResolvedValue(vehiculo);
    svc.updateVehiculo.mockResolvedValue({ success: true, vehiculo: { ...vehiculo, ubicacion: 4 } });

    const res = await actions.updateVehiculoAction('veh-1', { ubicacion: 4 });

    expect(res.success).toBe(true);
    expect(registrarAuditoria).toHaveBeenCalledWith(
      'log-1',
      'vehiculo',
      'veh-1',
      'cambio_ubicacion',
      { ubicacion: 1 },
      { ubicacion: 4 }
    );
  });

  it('should_audit_other_edits_as_edicion', async () => {
    svc.getVehiculoById.mockResolvedValue(vehiculo);
    svc.updateVehiculo.mockResolvedValue({ success: true, vehiculo: { ...vehiculo, precio: 1500 } });

    await actions.updateVehiculoAction('veh-1', { precio: 1500 });

    expect(registrarAuditoria).toHaveBeenCalledWith('log-1', 'vehiculo', 'veh-1', 'edicion', { precio: 1000 }, { precio: 1500 });
  });

  it('should_not_audit_when_nothing_changed_or_update_failed', async () => {
    svc.getVehiculoById.mockResolvedValue(vehiculo);
    svc.updateVehiculo.mockResolvedValueOnce({ success: true, vehiculo });
    await actions.updateVehiculoAction('veh-1', {});
    svc.updateVehiculo.mockResolvedValueOnce({ success: false, error: 'Reservado' });
    await actions.updateVehiculoAction('veh-1', { ubicacion: 2 });

    expect(registrarAuditoria).not.toHaveBeenCalled();
  });
});

describe('createVehiculoAction (auditoría R2)', () => {
  it('should_audit_creation_with_vehicle_summary', async () => {
    svc.createVehiculo.mockResolvedValue({ success: true, vehiculo });

    await actions.createVehiculoAction({ chasis: vehiculo.chasis, marca: 'Toyota', modelo: 'Corolla', anio: 2024 });

    expect(registrarAuditoria).toHaveBeenCalledWith(
      'log-1',
      'vehiculo',
      'veh-1',
      'creacion',
      null,
      expect.objectContaining({ chasis: vehiculo.chasis, ubicacion: 1 })
    );
  });
});

describe('deleteVehiculoAction (auditoría R2)', () => {
  it('should_audit_deletion_with_previous_data_when_admin_deletes', async () => {
    getCurrentUserProfile.mockResolvedValue(perfil({ id: 'adm-1', rol: 'administrador' }));
    svc.getVehiculoById.mockResolvedValue(vehiculo);
    svc.deleteVehiculo.mockResolvedValue({ success: true });

    await actions.deleteVehiculoAction('veh-1');

    expect(registrarAuditoria).toHaveBeenCalledWith(
      'adm-1',
      'vehiculo',
      'veh-1',
      'eliminacion',
      expect.objectContaining({ chasis: vehiculo.chasis }),
      null
    );
  });
});

describe('importVehiculosAction (auditoría R2)', () => {
  it('should_register_a_single_summary_row_per_import', async () => {
    svc.importVehiculosCSV.mockResolvedValue({ success: true, total: 10, importados: 8, duplicados: 1, errores: 1 });

    await actions.importVehiculosAction({ csv: 'a;b' });

    expect(registrarAuditoria).toHaveBeenCalledTimes(1);
    const [usuario, entidad, entidadId, accion, anterior, nuevo] = registrarAuditoria.mock.calls[0] as unknown[];
    expect([usuario, entidad, accion, anterior]).toEqual(['log-1', 'vehiculo', 'importacion', null]);
    expect(entidadId).toMatch(/^[0-9a-f-]{36}$/);
    expect(nuevo).toEqual({ total: 10, importados: 8, duplicados: 1, errores: 1 });
  });
});
