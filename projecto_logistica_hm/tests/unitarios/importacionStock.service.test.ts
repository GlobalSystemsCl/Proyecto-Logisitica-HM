import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSupabaseMock, fila } from '../mocks/supabase';

const admin = createSupabaseMock();

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => admin,
}));

vi.mock('@/services/organizacion.service', () => ({ OrganizacionService: {} }));

const { VehiculoService, mapImportacion } = await import('@/services/vehiculo.service');

const FILA = {
  id: 'imp-1',
  usuario_id: 'log-1',
  archivo: 'stock.xlsx',
  total: 10,
  importados: 8,
  duplicados: 2,
  errores: 0,
  created_at: '2026-11-20T12:00:00Z',
  revertida_at: null,
  vehiculos_eliminados: null,
  vehiculos_conservados: null,
  autor: { nombre: 'Lía', apellido: 'Rojas' },
  revertidor: null,
  vehiculo: [{ count: 8 }],
};

beforeEach(() => {
  admin.reset();
  vi.clearAllMocks();
});

describe('mapImportacion', () => {
  it('should_map_author_reverter_and_remaining_vehicles', () => {
    const imp = mapImportacion({
      ...FILA,
      revertida_at: '2026-11-20T13:00:00Z',
      revertidor: { nombre: 'Ana', apellido: null },
      vehiculos_eliminados: 6,
      vehiculos_conservados: 2,
      vehiculo: [{ count: 2 }],
    });
    expect(imp).toEqual(
      expect.objectContaining({
        usuario_nombre: 'Lía Rojas',
        revertida_por_nombre: 'Ana',
        vehiculos_eliminados: 6,
        vehiculos_conservados: 2,
        vehiculos_actuales: 2,
      })
    );
  });

  it('should_default_missing_counts_and_people', () => {
    const imp = mapImportacion({ ...FILA, autor: null, vehiculo: null, total: null, importados: null });
    expect(imp.usuario_nombre).toBeNull();
    expect(imp.vehiculos_actuales).toBe(0);
    expect(imp.total).toBe(0);
    expect(imp.importados).toBe(0);
  });

  it('should_return_null_name_when_person_has_empty_names', () => {
    expect(mapImportacion({ ...FILA, autor: { nombre: null, apellido: null } }).usuario_nombre).toBeNull();
  });
});

describe('VehiculoService.listarImportaciones', () => {
  it('should_list_newest_first_with_default_limit', async () => {
    admin.results.importacion_stock = [{ data: [FILA], error: null }];

    const lista = await VehiculoService.listarImportaciones();

    expect(lista.map((i) => i.id)).toEqual(['imp-1']);
    expect(admin.callsTo('importacion_stock')).toContainEqual(['order', 'created_at', { ascending: false }]);
    expect(admin.callsTo('importacion_stock')).toContainEqual(['limit', 10]);
  });

  it('should_return_empty_list_when_there_are_no_imports', async () => {
    admin.results.importacion_stock = [{ data: null, error: null }];
    expect(await VehiculoService.listarImportaciones()).toEqual([]);
  });

  it('should_throw_when_query_fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    admin.results.importacion_stock = [{ data: null, error: { message: 'x' } }];
    await expect(VehiculoService.listarImportaciones()).rejects.toThrow('No se pudieron cargar las importaciones.');
  });
});

describe('VehiculoService.getImportacion', () => {
  it('should_return_the_import_by_id', async () => {
    admin.results.importacion_stock = [fila(FILA)];

    const imp = await VehiculoService.getImportacion('imp-1');

    expect(imp?.archivo).toBe('stock.xlsx');
    expect(admin.callsTo('importacion_stock')).toContainEqual(['eq', 'id', 'imp-1']);
  });

  it('should_return_null_when_missing', async () => {
    admin.results.importacion_stock = [{ data: null, error: null }];
    expect(await VehiculoService.getImportacion('nope')).toBeNull();
  });

  it('should_throw_when_query_fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    admin.results.importacion_stock = [{ data: null, error: { message: 'x' } }];
    await expect(VehiculoService.getImportacion('imp-1')).rejects.toThrow('No se pudo leer la importación.');
  });
});

describe('VehiculoService.revertirImportacion', () => {
  it('should_call_db_function_and_return_counts', async () => {
    admin.rpc.mockResolvedValueOnce({ data: [{ eliminados: 7, conservados: 1 }], error: null });

    const res = await VehiculoService.revertirImportacion('imp-1', 'adm-1');

    expect(res).toEqual({ success: true, eliminados: 7, conservados: 1 });
    expect(admin.rpc).toHaveBeenCalledWith('fn_revertir_importacion_stock', { p_importacion_id: 'imp-1', p_usuario_id: 'adm-1' });
  });

  it('should_map_db_error_to_user_message', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    admin.rpc.mockResolvedValueOnce({ data: null, error: { message: 'IMPORTACION_YA_REVERTIDA' } });

    expect(await VehiculoService.revertirImportacion('imp-1', 'adm-1')).toEqual({
      success: false,
      error: 'Esta importación ya se revirtió.',
    });
  });

  it('should_return_zero_counts_when_db_returns_nothing', async () => {
    admin.rpc.mockResolvedValueOnce({ data: null, error: null });
    expect(await VehiculoService.revertirImportacion('imp-1', 'adm-1')).toEqual({ success: true, eliminados: 0, conservados: 0 });
  });
});
