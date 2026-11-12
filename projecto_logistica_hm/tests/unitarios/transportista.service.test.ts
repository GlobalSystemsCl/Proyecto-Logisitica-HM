import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSupabaseMock, fila } from '../mocks/supabase';

const admin = createSupabaseMock();

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => admin,
}));

const { TransportistaService, MENSAJE_TRANSPORTISTA_INVALIDO, MENSAJE_TRANSPORTISTA_REQUERIDO, limpiarConductor, validarConductor } =
  await import('@/services/transportista.service');

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

describe('limpiarConductor y validarConductor', () => {
  it('should_return_null_for_empty_driver_and_accept_it', () => {
    expect(limpiarConductor('   ')).toBeNull();
    expect(validarConductor('   ')).toBeNull();
  });

  it('should_collapse_spaces_and_validate_length', () => {
    expect(limpiarConductor('  Pedro   Soto ')).toBe('Pedro Soto');
    expect(validarConductor('Al')).toBe('El nombre del transportista debe tener entre 3 y 120 caracteres.');
  });
});

describe('TransportistaService.listarEmpresas', () => {
  it('should_return_companies_with_trucks_sorted_by_plate', async () => {
    admin.results.transportista = [
      fila([
        {
          id: 'e1',
          nombre: 'Sur',
          rut: '76543210-3',
          activo: true,
          camiones: [
            { id: 'c2', patente: 'ZZZZ99', transportista_id: 'e1', conductor_nombre: null, activo: true },
            { id: 'c1', patente: 'ABCD12', transportista_id: 'e1', conductor_nombre: null, activo: true },
          ],
        },
        { id: 'e2', nombre: 'Norte', rut: '11111111-1', activo: false, camiones: null },
      ]),
    ];
    const res = await TransportistaService.listarEmpresas();
    expect(res[0].camiones.map((c) => c.patente)).toEqual(['ABCD12', 'ZZZZ99']);
    expect(res[1].camiones).toEqual([]);
  });

  it('should_return_empty_when_query_fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    admin.results.transportista = [{ data: null, error: { message: 'boom' } }];
    expect(await TransportistaService.listarEmpresas()).toEqual([]);
  });
});

describe('TransportistaService.actualizarEmpresa', () => {
  it('should_update_trimmed_name_and_state', async () => {
    const res = await TransportistaService.actualizarEmpresa('e1', { nombre: '  Transportes   Sur ', activo: false });
    expect(res).toEqual({ success: true });
    expect(admin.callsTo('transportista')).toContainEqual(['update', { nombre: 'Transportes Sur', activo: false }]);
  });

  it('should_reject_too_short_name_without_querying', async () => {
    const res = await TransportistaService.actualizarEmpresa('e1', { nombre: 'ab' });
    expect(res.success).toBe(false);
    expect(admin.callsTo('transportista')).toHaveLength(0);
  });
});

describe('TransportistaService.crearCamion', () => {
  it('should_insert_normalized_plate_and_driver', async () => {
    admin.results.camion = [fila({ id: 'c1', patente: 'ABCD12', transportista_id: 'e1', conductor_nombre: 'Pedro', activo: true })];
    const res = await TransportistaService.crearCamion('e1', 'abcd-12', ' Pedro ', 'u-1');
    expect(res.success).toBe(true);
    expect(admin.callsTo('camion')).toContainEqual([
      'insert',
      { transportista_id: 'e1', patente: 'ABCD12', conductor_nombre: 'Pedro', creado_por: 'u-1' },
    ]);
  });

  it('should_report_duplicate_plate', async () => {
    admin.results.camion = [{ data: null, error: { message: 'dup', code: '23505' } }];
    const res = await TransportistaService.crearCamion('e1', 'ABCD12', null, 'u-1');
    expect(res).toEqual({ success: false, error: 'Ya existe un camión con la patente ABCD-12.' });
  });

  it('should_reject_invalid_plate_without_querying', async () => {
    const res = await TransportistaService.crearCamion('e1', '123', null, 'u-1');
    expect(res.success).toBe(false);
    expect(admin.callsTo('camion')).toHaveLength(0);
  });
});

describe('TransportistaService.actualizarCamion', () => {
  it('should_update_driver_and_state', async () => {
    const res = await TransportistaService.actualizarCamion('c1', { conductorNombre: '', activo: false });
    expect(res).toEqual({ success: true });
    expect(admin.callsTo('camion')).toContainEqual(['update', { conductor_nombre: null, activo: false }]);
  });
});

describe('TransportistaService.resolverTransporte', () => {
  const camion = (o: Record<string, unknown> = {}) =>
    fila({ conductor_nombre: 'Pedro', activo: true, transportista_id: 'e1', empresa: { activo: true }, ...o });

  it('should_resolve_company_plate_and_habitual_driver', async () => {
    admin.results.camion = [camion()];
    expect(await TransportistaService.resolverTransporte({ patente: 'abcd-12', conductorNombre: null })).toEqual({
      ok: true,
      datos: { transportista_id: 'e1', patente_camion: 'ABCD12', conductor_nombre: 'Pedro' },
    });
  });

  it('should_use_driver_given_for_this_trip', async () => {
    admin.results.camion = [camion()];
    const res = await TransportistaService.resolverTransporte({ patente: 'ABCD12', conductorNombre: ' Ana  Paz ' });
    expect(res).toMatchObject({ ok: true, datos: { conductor_nombre: 'Ana Paz' } });
  });

  it('should_require_assignment_valid_plate_and_some_driver', async () => {
    expect(await TransportistaService.resolverTransporte(null)).toEqual({
      ok: false,
      error: 'Indica la patente del camión y el transportista del traslado.',
    });
    expect((await TransportistaService.resolverTransporte({ patente: '12', conductorNombre: null })).ok).toBe(false);
    admin.results.camion = [camion({ conductor_nombre: null })];
    expect(await TransportistaService.resolverTransporte({ patente: 'ABCD12', conductorNombre: null })).toEqual({
      ok: false,
      error: 'Indica el nombre del transportista que maneja el camión.',
    });
  });

  it('should_reject_unknown_or_inactive_trucks', async () => {
    admin.results.camion = [fila(null), camion({ activo: false })];
    expect(await TransportistaService.resolverTransporte({ patente: 'ABCD12', conductorNombre: null })).toEqual({
      ok: false,
      error: 'La patente ABCD-12 no está registrada. Regístrala con su empresa de transporte.',
    });
    expect(await TransportistaService.resolverTransporte({ patente: 'ABCD12', conductorNombre: null })).toEqual({
      ok: false,
      error: 'El camión ABCD-12 o su empresa están desactivados.',
    });
  });
});
