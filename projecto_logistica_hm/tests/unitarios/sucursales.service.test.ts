import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSupabaseMock, filaConCount } from '../mocks/supabase';

const admin = createSupabaseMock();

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => admin }));

const { SucursalesService } = await import('@/services/sucursales.service');

function sinDependencias() {
  admin.results.usuario = [filaConCount(0)];
  admin.results.solicitud = [filaConCount(0)];
  admin.results.vehiculo = [filaConCount(0)];
  admin.results.traslado_interno = [filaConCount(0)];
}

describe('SucursalesService.deleteSucursal (brecha 016)', () => {
  beforeEach(() => {
    admin.reset();
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('should_delete_when_branch_has_no_dependencies', async () => {
    sinDependencias();
    admin.results.sucursal = [{ data: null, error: null }];

    const res = await SucursalesService.deleteSucursal(4);

    expect(res).toEqual({ success: true });
    expect(admin.callsTo('sucursal')).toContainEqual(['delete']);
    expect(admin.callsTo('sucursal')).toContainEqual(['eq', 'id', 4]);
  });

  it('should_reject_and_not_delete_when_branch_has_solicitudes_as_origin_or_destination', async () => {
    sinDependencias();
    admin.results.solicitud = [filaConCount(3)];

    const res = await SucursalesService.deleteSucursal(4);

    expect(res.success).toBe(false);
    expect(res.error).toContain('3 solicitud(es) de origen o destino');
    expect(admin.callsTo('solicitud')).toContainEqual(['or', 'sucursal.eq.4,sucursal_destino.eq.4']);
    expect(admin.callsTo('sucursal')).toHaveLength(0);
  });

  it('should_list_every_blocking_dependency', async () => {
    admin.results.usuario = [filaConCount(2)];
    admin.results.solicitud = [filaConCount(0)];
    admin.results.vehiculo = [filaConCount(5)];
    admin.results.traslado_interno = [filaConCount(1)];

    const res = await SucursalesService.deleteSucursal(4);

    expect(res.error).toBe(
      'No se puede eliminar la sucursal: tiene 2 usuario(s) con esta sucursal asignada, 5 vehículo(s) ubicados en ella, 1 traslado(s) interno(s). Reasigna o cierra esos registros primero.'
    );
  });

  it('should_check_transfers_by_origin_or_destination', async () => {
    sinDependencias();
    admin.results.sucursal = [{ data: null, error: null }];

    await SucursalesService.deleteSucursal(4);

    expect(admin.callsTo('traslado_interno')).toContainEqual(['or', 'origen_id.eq.4,destino_id.eq.4']);
    expect(admin.callsTo('vehiculo')).toContainEqual(['eq', 'ubicacion', 4]);
  });

  it('should_return_generic_error_when_a_check_fails', async () => {
    admin.results.usuario = [{ data: null, error: { message: 'relation "usuario" does not exist' } }];

    const res = await SucursalesService.deleteSucursal(4);

    expect(res.success).toBe(false);
    expect(res.error).toMatch(/^No se pudo verificar la sucursal\./);
    expect(res.error).not.toContain('relation');
  });

  it('should_translate_foreign_key_error_when_delete_is_restricted', async () => {
    sinDependencias();
    admin.results.sucursal = [{ data: null, error: { message: 'violates foreign key', code: '23503' } }];

    const res = await SucursalesService.deleteSucursal(4);

    expect(res).toEqual({
      success: false,
      error: 'La operación no es posible porque hay datos relacionados.',
    });
  });
});

describe('SucursalesService.createSucursal', () => {
  const INPUT = { codigo: 101, nombre: '15 NORTE-VIÑA DEL MAR', direccion: null, slots: 20, zona_id: 1 };

  beforeEach(() => {
    admin.reset();
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('should_insert_branch_with_code_as_id_when_code_and_name_are_free', async () => {
    admin.results.sucursal = [
      { data: null, error: null },
      { data: [], error: null },
      { data: { id: 101, nombre: INPUT.nombre }, error: null },
    ];

    const res = await SucursalesService.createSucursal(INPUT);

    expect(res.success).toBe(true);
    expect(res.sucursal?.id).toBe(101);
    expect(admin.callsTo('sucursal')).toContainEqual(['eq', 'id', 101]);
    expect(admin.callsTo('sucursal')).toContainEqual([
      'insert',
      { id: 101, nombre: INPUT.nombre, direccion: null, slots: 20, zona_id: 1 },
    ]);
  });

  it('should_reject_and_not_insert_when_code_already_belongs_to_another_branch', async () => {
    admin.results.sucursal = [{ data: { id: 101, nombre: 'CONCON' }, error: null }];

    const res = await SucursalesService.createSucursal(INPUT);

    expect(res).toEqual({ success: false, error: 'El código 101 ya pertenece a la sucursal "CONCON".' });
    expect(admin.callsTo('sucursal').some(([m]) => m === 'insert')).toBe(false);
  });

  it('should_reject_and_not_insert_when_name_already_exists', async () => {
    admin.results.sucursal = [
      { data: null, error: null },
      { data: [{ id: 6, nombre: INPUT.nombre }], error: null },
    ];

    const res = await SucursalesService.createSucursal(INPUT);

    expect(res.success).toBe(false);
    expect(res.error).toBe(`Ya existe una sucursal registrada con el nombre "${INPUT.nombre}".`);
    expect(admin.callsTo('sucursal').some(([m]) => m === 'insert')).toBe(false);
  });

  it('should_translate_unique_violation_when_code_is_taken_concurrently', async () => {
    admin.results.sucursal = [
      { data: null, error: null },
      { data: [], error: null },
      { data: null, error: { message: 'duplicate key value violates unique constraint "sucursal_pkey"', code: '23505' } },
    ];

    const res = await SucursalesService.createSucursal(INPUT);

    expect(res).toEqual({ success: false, error: 'Ya existe un registro con esos datos.' });
  });
});
