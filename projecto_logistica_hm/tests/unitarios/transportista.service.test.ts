import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSupabaseMock, fila } from '../mocks/supabase';

const admin = createSupabaseMock();

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => admin,
}));

const { TransportistaService, MENSAJE_TRANSPORTISTA_INVALIDO, MENSAJE_TRANSPORTISTA_REQUERIDO } = await import(
  '@/services/transportista.service'
);

beforeEach(() => {
  admin.reset();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('TransportistaService.listarActivos', () => {
  it('should_return_active_carriers_ordered_by_name', async () => {
    admin.results.transportista = [fila([{ id: 't1', nombre: 'Andes', rut: '76543210-3', activo: true }])];

    const res = await TransportistaService.listarActivos();

    expect(res).toHaveLength(1);
    expect(admin.callsTo('transportista')).toContainEqual(['eq', 'activo', true]);
    expect(admin.callsTo('transportista')).toContainEqual(['order', 'nombre', { ascending: true }]);
  });

  it('should_return_empty_list_when_query_fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    admin.results.transportista = [{ data: null, error: { message: 'boom' } }];
    expect(await TransportistaService.listarActivos()).toEqual([]);
  });
});

describe('TransportistaService.crear', () => {
  it('should_store_normalized_rut_and_trimmed_name_when_data_is_valid', async () => {
    admin.results.transportista = [fila({ id: 't1', nombre: 'Transportes Andes', rut: '76543210-3', activo: true })];

    const res = await TransportistaService.crear('  Transportes   Andes ', '76.543.210-3', 'u-1');

    expect(res.success).toBe(true);
    expect(res.transportista?.id).toBe('t1');
    expect(admin.callsTo('transportista')).toContainEqual([
      'insert',
      { nombre: 'Transportes Andes', rut: '76543210-3', creado_por: 'u-1' },
    ]);
  });

  it('should_reject_invalid_rut_without_querying', async () => {
    const res = await TransportistaService.crear('Transportes Andes', '76.543.210-4', 'u-1');
    expect(res).toEqual({ success: false, error: 'El RUT no es válido. Revisa el dígito verificador.' });
    expect(admin.callsTo('transportista')).toHaveLength(0);
  });

  it('should_reject_short_name_without_querying', async () => {
    const res = await TransportistaService.crear(' ab ', '76543210-3', 'u-1');
    expect(res.success).toBe(false);
    expect(res.error).toContain('entre 3 y 120');
    expect(admin.callsTo('transportista')).toHaveLength(0);
  });

  it('should_report_duplicate_when_rut_already_exists', async () => {
    admin.results.transportista = [{ data: null, error: { message: 'duplicate', code: '23505' } }];
    const res = await TransportistaService.crear('Transportes Andes', '76543210-3', 'u-1');
    expect(res).toEqual({ success: false, error: 'Ya existe un transportista con ese RUT.' });
  });
});

describe('TransportistaService.validarAsignable', () => {
  it('should_require_a_carrier_when_id_is_missing', async () => {
    expect(await TransportistaService.validarAsignable(null)).toBe(MENSAJE_TRANSPORTISTA_REQUERIDO);
    expect(admin.callsTo('transportista')).toHaveLength(0);
  });

  it('should_return_null_when_carrier_is_active', async () => {
    admin.results.transportista = [fila({ id: 't1', activo: true })];
    expect(await TransportistaService.validarAsignable('t1')).toBeNull();
  });

  it('should_reject_when_carrier_is_inactive_or_unknown', async () => {
    admin.results.transportista = [fila({ id: 't1', activo: false }), fila(null)];
    expect(await TransportistaService.validarAsignable('t1')).toBe(MENSAJE_TRANSPORTISTA_INVALIDO);
    expect(await TransportistaService.validarAsignable('t2')).toBe(MENSAJE_TRANSPORTISTA_INVALIDO);
  });
});
