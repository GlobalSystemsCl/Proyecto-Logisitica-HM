import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UserProfile } from '@/types/auth.types';

const getCurrentUserProfile = vi.fn();
const registrarAuditoria = vi.fn(async () => undefined);
const registrarAuditoriaMasiva = vi.fn<(...a: unknown[]) => Promise<void>>(async () => undefined);
const svc = {
  createVehiculo: vi.fn(),
  updateVehiculo: vi.fn(),
  deleteVehiculo: vi.fn(),
  importVehiculosCSV: vi.fn(),
  getVehiculoById: vi.fn(),
  cambiarUbicacionMasiva: vi.fn(),
  listarImportaciones: vi.fn(),
  getImportacion: vi.fn(),
  revertirImportacion: vi.fn(),
  idsPorChasis: vi.fn(),
};
const createMarca = vi.fn();
const getSucursales = vi.fn();

vi.mock('@/services/auth.service', () => ({
  AuthService: { getCurrentUserProfile: () => getCurrentUserProfile() },
}));
vi.mock('@/services/vehiculo.service', () => ({ VehiculoService: svc }));
vi.mock('@/services/solicitudes.service', () => ({
  SolicitudesService: {
    registrarAuditoria: (...a: unknown[]) => registrarAuditoria(...(a as [])),
    registrarAuditoriaMasiva: (...a: unknown[]) => registrarAuditoriaMasiva(...a),
  },
}));
vi.mock('@/services/organizacion.service', () => ({
  OrganizacionService: { createMarca: (...a: unknown[]) => createMarca(...a) },
}));
vi.mock('@/services/sucursales.service', () => ({
  SucursalesService: { getSucursales: (...a: unknown[]) => getSucursales(...a) },
}));
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

const IMP_ID = '3f2b6c1e-0a4d-4b8e-9c7f-1d2e3f4a5b6c';

function importacion(extra: Record<string, unknown> = {}) {
  return {
    id: IMP_ID,
    usuario_id: 'log-1',
    usuario_nombre: 'L Uno',
    archivo: 'stock.xlsx',
    total: 10,
    importados: 8,
    duplicados: 2,
    errores: 0,
    created_at: '2026-11-20T12:00:00Z',
    revertida_at: null,
    revertida_por_nombre: null,
    vehiculos_eliminados: null,
    vehiculos_conservados: null,
    vehiculos_actuales: 8,
    ...extra,
  };
}

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
    expect(nuevo).toEqual({ archivo: null, total: 10, importados: 8, duplicados: 1, errores: 1 });
  });

  it('should_pass_actor_and_file_name_and_audit_with_the_import_id', async () => {
    svc.importVehiculosCSV.mockResolvedValue({ success: true, importacionId: IMP_ID, total: 1, importados: 1, duplicados: 0, errores: 0 });

    const res = await actions.importVehiculosAction({ csv: 'a;b', archivo: 'stock.xlsx' });

    expect(svc.importVehiculosCSV).toHaveBeenCalledWith('a;b', { anioPorDefecto: undefined, usuarioId: 'log-1', archivo: 'stock.xlsx' });
    expect((registrarAuditoria.mock.calls[0] as unknown[])[2]).toBe(IMP_ID);
    expect(res).toEqual(expect.objectContaining({ success: true, importacionId: IMP_ID }));
  });
});

describe('getImportacionesStockAction', () => {
  it('should_list_imports_for_vehicle_managers', async () => {
    svc.listarImportaciones.mockResolvedValue([importacion()]);

    const res = await actions.getImportacionesStockAction();

    expect(res).toEqual({ success: true, importaciones: [importacion()] });
  });

  it('should_reject_roles_without_vehicle_permission', async () => {
    getCurrentUserProfile.mockResolvedValue(perfil({ rol: 'jefe_local' }));

    const res = await actions.getImportacionesStockAction();

    expect(res.success).toBe(false);
    expect(svc.listarImportaciones).not.toHaveBeenCalled();
  });

  it('should_return_error_when_service_throws', async () => {
    svc.listarImportaciones.mockRejectedValue(new Error('No se pudieron cargar las importaciones.'));
    const res = await actions.getImportacionesStockAction();
    expect(res.success).toBe(false);
  });
});

describe('revertirImportacionStockAction', () => {
  it('should_revert_own_import_audit_it_and_report_counts', async () => {
    svc.getImportacion.mockResolvedValue(importacion());
    svc.revertirImportacion.mockResolvedValue({ success: true, eliminados: 7, conservados: 1 });

    const res = await actions.revertirImportacionStockAction(IMP_ID, ' confirmar ');

    expect(svc.revertirImportacion).toHaveBeenCalledWith(IMP_ID, 'log-1');
    expect(res).toEqual({
      success: true,
      eliminados: 7,
      conservados: 1,
      mensaje: 'Importación revertida: 7 vehículo(s) eliminado(s) del inventario. 1 se conservaron porque ya se usan en una solicitud o un traslado.',
    });
    expect(registrarAuditoria).toHaveBeenCalledWith(
      'log-1',
      'vehiculo',
      IMP_ID,
      'reversion_importacion',
      { archivo: 'stock.xlsx', importados: 8, fecha: '2026-11-20T12:00:00Z' },
      { eliminados: 7, conservados: 1 }
    );
  });

  it('should_reject_when_confirmation_text_is_wrong', async () => {
    const res = await actions.revertirImportacionStockAction(IMP_ID, 'si');

    expect(res).toEqual({ success: false, error: 'Escribe CONFIRMAR para confirmar.' });
    expect(svc.getImportacion).not.toHaveBeenCalled();
  });

  it('should_reject_invalid_id', async () => {
    const res = await actions.revertirImportacionStockAction('../x', 'CONFIRMAR');
    expect(res).toEqual({ success: false, error: 'Importación no válida.' });
  });

  it('should_reject_when_import_does_not_exist', async () => {
    svc.getImportacion.mockResolvedValue(null);
    const res = await actions.revertirImportacionStockAction(IMP_ID, 'CONFIRMAR');
    expect(res).toEqual({ success: false, error: 'La importación no existe.' });
  });

  it('should_reject_logistica_reverting_someone_elses_import', async () => {
    svc.getImportacion.mockResolvedValue(importacion({ usuario_id: 'otro' }));

    const res = await actions.revertirImportacionStockAction(IMP_ID, 'CONFIRMAR');

    expect(res).toEqual({ success: false, error: 'Solo el administrador puede revertir importaciones de otro usuario.' });
    expect(svc.revertirImportacion).not.toHaveBeenCalled();
  });

  it('should_allow_admin_to_revert_any_import', async () => {
    getCurrentUserProfile.mockResolvedValue(perfil({ id: 'adm-1', rol: 'administrador' }));
    svc.getImportacion.mockResolvedValue(importacion({ usuario_id: 'otro' }));
    svc.revertirImportacion.mockResolvedValue({ success: true, eliminados: 8, conservados: 0 });

    const res = await actions.revertirImportacionStockAction(IMP_ID, 'CONFIRMAR');

    expect(res.success).toBe(true);
    expect(svc.revertirImportacion).toHaveBeenCalledWith(IMP_ID, 'adm-1');
  });

  it('should_not_audit_when_database_rejects_the_reversion', async () => {
    svc.getImportacion.mockResolvedValue(importacion());
    svc.revertirImportacion.mockResolvedValue({ success: false, error: 'Esta importación ya se revirtió.' });

    const res = await actions.revertirImportacionStockAction(IMP_ID, 'CONFIRMAR');

    expect(res).toEqual({ success: false, error: 'Esta importación ya se revirtió.' });
    expect(registrarAuditoria).not.toHaveBeenCalled();
  });

  it('should_reject_roles_without_vehicle_permission', async () => {
    getCurrentUserProfile.mockResolvedValue(perfil({ rol: 'jefe_local' }));

    const res = await actions.revertirImportacionStockAction(IMP_ID, 'CONFIRMAR');

    expect(res.success).toBe(false);
    expect(svc.revertirImportacion).not.toHaveBeenCalled();
  });
});

describe('cambiarUbicacionMasivaAction (fase G)', () => {
  it('should_audit_each_moved_vehicle_with_previous_and_new_location', async () => {
    svc.cambiarUbicacionMasiva.mockResolvedValue({
      success: true,
      movidos: [{ id: 'v1', chasis: 'C1', ubicacion: 1 }, { id: 'v2', chasis: 'C2', ubicacion: null }],
      omitidos: [{ id: 'v3', chasis: 'C3', motivo: 'Reservado en una solicitud activa.' }],
    });

    const res = await actions.cambiarUbicacionMasivaAction(['v1', 'v2', 'v3'], 5);

    expect(res.success).toBe(true);
    expect(svc.cambiarUbicacionMasiva).toHaveBeenCalledWith(['v1', 'v2', 'v3'], 5);
    expect(registrarAuditoriaMasiva).toHaveBeenCalledWith([
      { usuarioId: 'log-1', entidad: 'vehiculo', entidadId: 'v1', accion: 'cambio_ubicacion', anterior: { ubicacion: 1 }, nuevo: { ubicacion: 5 } },
      { usuarioId: 'log-1', entidad: 'vehiculo', entidadId: 'v2', accion: 'cambio_ubicacion', anterior: { ubicacion: null }, nuevo: { ubicacion: 5 } },
    ]);
  });

  it('should_not_audit_when_service_fails', async () => {
    svc.cambiarUbicacionMasiva.mockResolvedValue({ success: false, movidos: [], omitidos: [], error: 'Elige la sucursal donde están los vehículos.' });

    const res = await actions.cambiarUbicacionMasivaAction(['v1'], 0);

    expect(res).toEqual({ success: false, movidos: [], omitidos: [], error: 'Elige la sucursal donde están los vehículos.' });
    expect(registrarAuditoriaMasiva).not.toHaveBeenCalled();
  });

  it('should_reject_roles_without_vehicle_permission', async () => {
    getCurrentUserProfile.mockResolvedValue(perfil({ rol: 'ejecutivo' }));

    const res = await actions.cambiarUbicacionMasivaAction(['v1'], 5);

    expect(res.success).toBe(false);
    expect(svc.cambiarUbicacionMasiva).not.toHaveBeenCalled();
  });
});

describe('permisos de gestión de vehículos (QA #15)', () => {
  it.each(['jefe_local', 'ejecutivo'] as const)(
    'should_reject_import_and_move_when_role_is_%s',
    async (rol) => {
      getCurrentUserProfile.mockResolvedValue(perfil({ rol }));

      const importar = await actions.importVehiculosAction({ csv: 'Marca,Modelo,Chasis' });
      const mover = await actions.cambiarUbicacionMasivaAction(['veh-1'], 4);
      const editar = await actions.updateVehiculoAction('veh-1', { ubicacion: 4 });

      expect(importar.success).toBe(false);
      expect(mover.success).toBe(false);
      expect(editar.success).toBe(false);
      expect(svc.importVehiculosCSV).not.toHaveBeenCalled();
      expect(svc.cambiarUbicacionMasiva).not.toHaveBeenCalled();
      expect(svc.updateVehiculo).not.toHaveBeenCalled();
    },
  );

  it('should_allow_import_when_role_is_administrador', async () => {
    getCurrentUserProfile.mockResolvedValue(perfil({ rol: 'administrador' }));
    svc.importVehiculosCSV.mockResolvedValue({ success: true, importados: 0 });

    const res = await actions.importVehiculosAction({ csv: 'Marca,Modelo,Chasis' });

    expect(res.success).toBe(true);
    expect(svc.importVehiculosCSV).toHaveBeenCalled();
  });
});

describe('crearMarcaVehiculoAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should_create_brand_in_uppercase_when_user_manages_vehicles', async () => {
    getCurrentUserProfile.mockResolvedValue(perfil());
    createMarca.mockResolvedValue({ success: true, marca: { id: 9, codigo: 'GW', nombre: 'GREAT WALL' } });

    const res = await actions.crearMarcaVehiculoAction({ codigo: ' gw ', nombre: 'great wall' });

    expect(createMarca).toHaveBeenCalledWith({ codigo: 'GW', nombre: 'GREAT WALL' });
    expect(res).toEqual({ success: true, marca: { id: 9, codigo: 'GW', nombre: 'GREAT WALL' } });
  });

  it('should_reject_invalid_brand_without_calling_service', async () => {
    getCurrentUserProfile.mockResolvedValue(perfil());

    const res = await actions.crearMarcaVehiculoAction({ codigo: '', nombre: 'X' });

    expect(res.success).toBe(false);
    expect(createMarca).not.toHaveBeenCalled();
  });

  it('should_return_service_error_when_code_already_exists', async () => {
    getCurrentUserProfile.mockResolvedValue(perfil());
    createMarca.mockResolvedValue({ success: false, error: 'Ya existe una marca con el código "HY".' });

    expect(await actions.crearMarcaVehiculoAction({ codigo: 'HY', nombre: 'HYUNDAI' })).toEqual({
      success: false,
      error: 'Ya existe una marca con el código "HY".',
    });
  });

  it('should_reject_when_user_is_jefe_local', async () => {
    getCurrentUserProfile.mockResolvedValue(perfil({ rol: 'jefe_local' }));

    const res = await actions.crearMarcaVehiculoAction({ codigo: 'GW', nombre: 'GREAT WALL' });

    expect(res.success).toBe(false);
    expect(createMarca).not.toHaveBeenCalled();
  });
});

describe('cambiarUbicacionPorPlantillaAction', () => {
  const VIN_A = 'LB3G43S71TX401167';
  const VIN_B = 'MA1NZ2NP1T2E76415';
  const VIN_C = 'MALB251CAVM784651';

  beforeEach(() => {
    vi.clearAllMocks();
    getSucursales.mockResolvedValue([
      { id: 101, codigo: '101', nombre: '15 NORTE' },
      { id: 409, codigo: '119B', nombre: 'ACOPIO' },
    ]);
  });

  it('should_move_only_rows_with_location_and_audit_each_vehicle', async () => {
    getCurrentUserProfile.mockResolvedValue(perfil());
    svc.idsPorChasis.mockResolvedValue({ ids: new Map([[VIN_A, 'v-a'], [VIN_B, 'v-b']]) });
    svc.cambiarUbicacionMasiva.mockResolvedValue({
      success: true,
      movidos: [{ id: 'v-a', chasis: VIN_A, ubicacion: null }],
      omitidos: [{ id: 'v-b', chasis: VIN_B, motivo: 'Reservado en una solicitud activa.' }],
    });

    const res = await actions.cambiarUbicacionPorPlantillaAction([
      { fila: 2, vin: VIN_A, ubicacion: '119B · ACOPIO' },
      { fila: 3, vin: VIN_B, ubicacion: '119B' },
      { fila: 4, vin: VIN_C, ubicacion: '' },
    ]);

    expect(getSucursales).toHaveBeenCalledWith({ incluirInactivas: true });
    expect(svc.cambiarUbicacionMasiva).toHaveBeenCalledTimes(1);
    expect(svc.cambiarUbicacionMasiva).toHaveBeenCalledWith(['v-a', 'v-b'], 409);
    expect(res).toMatchObject({ success: true, movidos: 1, sinUbicacion: 1 });
    expect(res.errores).toEqual([{ fila: 3, vin: VIN_B, motivo: 'Reservado en una solicitud activa.' }]);
    expect(registrarAuditoriaMasiva).toHaveBeenCalledWith([
      expect.objectContaining({ entidadId: 'v-a', accion: 'cambio_ubicacion', nuevo: { ubicacion: 409 } }),
    ]);
  });

  it('should_report_vins_not_in_inventory_and_unknown_locations', async () => {
    getCurrentUserProfile.mockResolvedValue(perfil());
    svc.idsPorChasis.mockResolvedValue({ ids: new Map() });

    const res = await actions.cambiarUbicacionPorPlantillaAction([
      { fila: 2, vin: VIN_A, ubicacion: '101' },
      { fila: 3, vin: VIN_B, ubicacion: '999' },
    ]);

    expect(svc.cambiarUbicacionMasiva).not.toHaveBeenCalled();
    expect(res.movidos).toBe(0);
    expect(res.errores.map((e) => e.fila)).toEqual([2, 3]);
    expect(res.errores[0].motivo).toBe('El VIN no está en el inventario.');
  });

  it('should_fail_when_file_is_empty', async () => {
    getCurrentUserProfile.mockResolvedValue(perfil());

    const res = await actions.cambiarUbicacionPorPlantillaAction([]);

    expect(res.success).toBe(false);
    expect(getSucursales).not.toHaveBeenCalled();
  });

  it('should_return_error_when_vehicle_lookup_fails', async () => {
    getCurrentUserProfile.mockResolvedValue(perfil());
    svc.idsPorChasis.mockResolvedValue({ ids: new Map(), error: 'No se pudieron leer los vehículos.' });

    const res = await actions.cambiarUbicacionPorPlantillaAction([{ fila: 2, vin: VIN_A, ubicacion: '101' }]);

    expect(res).toMatchObject({ success: false, error: 'No se pudieron leer los vehículos.' });
  });

  it('should_reject_when_user_is_jefe_local', async () => {
    getCurrentUserProfile.mockResolvedValue(perfil({ rol: 'jefe_local' }));

    const res = await actions.cambiarUbicacionPorPlantillaAction([{ fila: 2, vin: VIN_A, ubicacion: '101' }]);

    expect(res.success).toBe(false);
    expect(svc.idsPorChasis).not.toHaveBeenCalled();
  });
});
