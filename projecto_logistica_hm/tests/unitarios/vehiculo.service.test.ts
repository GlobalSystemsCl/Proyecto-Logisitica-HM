import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { createSupabaseMock, fila } from '../mocks/supabase';

const admin = createSupabaseMock();

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => admin,
}));

vi.mock('@/services/organizacion.service', () => ({
  OrganizacionService: {
    asegurarMarcaCodigo: vi.fn(async (codigo: string) => `Marca ${codigo}`),
  },
}));

const { VehiculoService } = await import('@/services/vehiculo.service');

const CHASIS_VALIDO = '1HGCM82633A004352';
const ANIO_ACTUAL = new Date().getFullYear();

function inputBase(overrides: Record<string, unknown> = {}) {
  return {
    chasis: CHASIS_VALIDO,
    patente: 'ABCD-12',
    marca: 'Toyota',
    modelo: 'Corolla',
    anio: ANIO_ACTUAL,
    ...overrides,
  } as Parameters<typeof VehiculoService.createVehiculo>[0];
}

/** Encola las respuestas de `createVehiculo` en el orden en que las consume. */
function encolarCreate(insertResult = fila({ id: 'veh-1', ...inputBase() })) {
  admin.results.vehiculo = [
    { data: null, error: null },
    { data: null, error: null },
    insertResult,
  ];
}

function encolarDisponibilidad(data: unknown) {
  admin.results.solicitud_vehiculo = [{ data, error: null }];
}

describe('VehiculoService', () => {
  beforeEach(() => {
    admin.reset();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('createVehiculo', () => {
    it('should_return_success_when_chasis_has_17_alphanumeric_characters', async () => {
      encolarCreate();
      const res = await VehiculoService.createVehiculo(inputBase());
      expect(res.success).toBe(true);
      expect(res.vehiculo?.id).toBe('veh-1');
    });

    it('should_reject_when_chasis_has_fewer_than_17_characters', async () => {
      const res = await VehiculoService.createVehiculo(inputBase({ chasis: 'ABC123' }));
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/17 caracteres/);
      expect(admin.calls).toHaveLength(0);
    });

    it('should_reject_when_chasis_has_more_than_17_characters', async () => {
      const res = await VehiculoService.createVehiculo(inputBase({ chasis: `${CHASIS_VALIDO}X` }));
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/17 caracteres/);
    });

    it('should_reject_when_chasis_contains_non_alphanumeric_characters', async () => {
      const res = await VehiculoService.createVehiculo(inputBase({ chasis: '1HGCM82633A00435-' }));
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/17 caracteres/);
    });

    it('should_normalize_chasis_and_patente_to_uppercase_and_trim', async () => {
      encolarCreate();
      await VehiculoService.createVehiculo(
        inputBase({ chasis: `  ${CHASIS_VALIDO.toLowerCase()}  `, patente: ' abcd-12 ' })
      );
      const insert = admin.callsTo('vehiculo').find((c) => c[0] === 'insert');
      expect(insert?.[1]).toMatchObject({ chasis: CHASIS_VALIDO, patente: 'ABCD-12' });
    });

    it('should_store_null_when_color_is_blank', async () => {
      encolarCreate();
      await VehiculoService.createVehiculo(inputBase({ color: '   ' }));
      const insert = admin.callsTo('vehiculo').find((c) => c[0] === 'insert');
      expect(insert?.[1]).toMatchObject({ color: null });
    });

    it('should_reject_when_patente_format_is_invalid', async () => {
      const res = await VehiculoService.createVehiculo(inputBase({ patente: '1234-AB' }));
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/XXXX-XX/);
    });

    it('should_accept_patente_with_four_digits', async () => {
      encolarCreate();
      const res = await VehiculoService.createVehiculo(inputBase({ patente: 'abcd-1234' }));
      expect(res.success).toBe(true);
    });

    it('should_return_success_when_patente_is_not_provided', async () => {
      admin.results.vehiculo = [{ data: null, error: null }, fila({ id: 'veh-1' })];
      const res = await VehiculoService.createVehiculo(inputBase({ patente: undefined }));
      expect(res.success).toBe(true);
      const consultaPatente = admin
        .callsTo('vehiculo')
        .some((c) => c[0] === 'eq' && c[1] === 'patente');
      expect(consultaPatente).toBe(false);
    });

    it('should_return_success_when_patente_is_empty_string', async () => {
      admin.results.vehiculo = [{ data: null, error: null }, fila({ id: 'veh-1' })];
      const res = await VehiculoService.createVehiculo(inputBase({ patente: '   ' }));
      expect(res.success).toBe(true);
      const insert = admin.callsTo('vehiculo').find((c) => c[0] === 'insert');
      expect(insert?.[1]).toMatchObject({ patente: null });
    });

    it('should_reject_when_chasis_already_exists', async () => {
      admin.results.vehiculo = [fila({ id: 'veh-existente' })];
      const res = await VehiculoService.createVehiculo(inputBase());
      expect(res.success).toBe(false);
      expect(res.error).toBe(`Ya existe un vehículo con el chasis ${CHASIS_VALIDO}.`);
    });

    it('should_reject_when_patente_already_exists', async () => {
      admin.results.vehiculo = [
        { data: null, error: null },
        fila({ id: 'veh-existente' }),
      ];
      const res = await VehiculoService.createVehiculo(inputBase());
      expect(res.success).toBe(false);
      expect(res.error).toBe('Ya existe un vehículo con la patente ABCD-12.');
    });

    it('should_reject_when_year_is_below_1900', async () => {
      admin.results.vehiculo = [{ data: null, error: null }, { data: null, error: null }];
      const res = await VehiculoService.createVehiculo(inputBase({ anio: 1899 }));
      expect(res.success).toBe(false);
      expect(res.error).toBe(`El año debe estar entre 1900 y ${ANIO_ACTUAL + 1}.`);
    });

    it('should_reject_when_year_is_above_next_year', async () => {
      admin.results.vehiculo = [{ data: null, error: null }, { data: null, error: null }];
      const res = await VehiculoService.createVehiculo(inputBase({ anio: ANIO_ACTUAL + 2 }));
      expect(res.success).toBe(false);
    });

    it('should_accept_year_1900_and_next_year', async () => {
      encolarCreate();
      expect((await VehiculoService.createVehiculo(inputBase({ anio: 1900 }))).success).toBe(true);
      admin.reset();
      encolarCreate();
      expect(
        (await VehiculoService.createVehiculo(inputBase({ anio: ANIO_ACTUAL + 1 }))).success
      ).toBe(true);
    });

    it('should_reject_when_price_is_negative', async () => {
      admin.results.vehiculo = [{ data: null, error: null }, { data: null, error: null }];
      const res = await VehiculoService.createVehiculo(inputBase({ precio: -1 }));
      expect(res.success).toBe(false);
      expect(res.error).toBe('El precio no puede ser un valor negativo.');
    });

    it('should_accept_zero_price', async () => {
      encolarCreate();
      expect((await VehiculoService.createVehiculo(inputBase({ precio: 0 }))).success).toBe(true);
    });

    it('should_return_error_when_insert_fails', async () => {
      admin.results.vehiculo = [
        { data: null, error: null },
        { data: null, error: null },
        { data: null, error: { message: 'violación de FK' } },
      ];
      const res = await VehiculoService.createVehiculo(inputBase());
      expect(res.success).toBe(false);
      expect(res.error).toBe('Error al crear el vehículo: violación de FK');
    });

    it('should_return_error_when_supabase_throws', async () => {
      const spy = vi.spyOn(admin, 'from').mockImplementation(() => {
        throw new Error('conexión caída');
      });
      const res = await VehiculoService.createVehiculo(inputBase());
      spy.mockRestore();
      expect(res.success).toBe(false);
      expect(res.error).toBe('conexión caída');
    });
  });

  describe('verificarDisponibilidad', () => {
    it('should_return_available_when_vehicle_has_no_reservations', async () => {
      encolarDisponibilidad([{ solicitud_id: 'sol-1', disponibilidad: 'liberado' }]);
      const res = await VehiculoService.verificarDisponibilidad('veh-1');
      expect(res).toEqual({ reservado: false, vendido: false, solicitud_id: undefined });
    });

    it('should_return_reserved_when_vehicle_has_active_reservation', async () => {
      encolarDisponibilidad([{ solicitud_id: 'sol-9', disponibilidad: 'reservado' }]);
      const res = await VehiculoService.verificarDisponibilidad('veh-1');
      expect(res).toEqual({ reservado: true, vendido: false, solicitud_id: 'sol-9' });
    });

    it('should_return_sold_when_vehicle_has_sold_availability', async () => {
      encolarDisponibilidad([{ solicitud_id: 'sol-9', disponibilidad: 'vendido' }]);
      const res = await VehiculoService.verificarDisponibilidad('veh-1');
      expect(res).toEqual({ reservado: false, vendido: true, solicitud_id: undefined });
    });

    it('should_return_not_reserved_when_query_fails', async () => {
      admin.results.solicitud_vehiculo = [{ data: null, error: { message: 'boom' } }];
      const res = await VehiculoService.verificarDisponibilidad('veh-1');
      expect(res).toEqual({ reservado: false, vendido: false });
    });

    it('should_filter_by_vehicle_id', async () => {
      encolarDisponibilidad([]);
      await VehiculoService.verificarDisponibilidad('veh-42');
      expect(admin.callsTo('solicitud_vehiculo')).toEqual([
        ['select', 'solicitud_id, disponibilidad'],
        ['eq', 'vehiculo_id', 'veh-42'],
      ]);
    });
  });

  describe('updateVehiculo', () => {
    it('should_reject_when_vehicle_is_reserved', async () => {
      encolarDisponibilidad([{ solicitud_id: 'sol-9', disponibilidad: 'reservado' }]);
      const res = await VehiculoService.updateVehiculo('veh-1', { marca: 'Kia' });
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/reservado en una solicitud activa/);
    });

    it('should_reject_when_vehicle_is_sold', async () => {
      encolarVendido();
      const res = await VehiculoService.updateVehiculo('veh-1', { marca: 'Kia' });
      expect(res.success).toBe(false);
      expect(res.error).toBe('No se puede modificar un vehículo que ya fue vendido.');
    });

    it('should_reject_when_new_chasis_is_invalid', async () => {
      encolarDisponibilidad([]);
      const res = await VehiculoService.updateVehiculo('veh-1', { chasis: 'CORTO' });
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/17 caracteres/);
    });

    it('should_reject_when_new_chasis_belongs_to_another_vehicle', async () => {
      encolarDisponibilidad([]);
      admin.results.vehiculo = [fila({ id: 'veh-2' })];
      const res = await VehiculoService.updateVehiculo('veh-1', { chasis: CHASIS_VALIDO });
      expect(res.success).toBe(false);
      expect(res.error).toBe(`Ya existe otro vehículo con el chasis ${CHASIS_VALIDO}.`);
    });

    it('should_reject_when_new_patente_is_invalid', async () => {
      encolarDisponibilidad([]);
      const res = await VehiculoService.updateVehiculo('veh-1', { patente: 'XX-1234' });
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/XXXX-XX/);
    });

    it('should_reject_when_new_patente_belongs_to_another_vehicle', async () => {
      encolarDisponibilidad([]);
      admin.results.vehiculo = [fila({ id: 'veh-2' })];
      const res = await VehiculoService.updateVehiculo('veh-1', { patente: 'ABCD-99' });
      expect(res.success).toBe(false);
      expect(res.error).toBe('Ya existe otro vehículo con la patente ABCD-99.');
    });

    it('should_reject_when_new_price_is_negative', async () => {
      encolarDisponibilidad([]);
      const res = await VehiculoService.updateVehiculo('veh-1', { precio: -10 });
      expect(res.success).toBe(false);
      expect(res.error).toBe('El precio no puede ser un valor negativo.');
    });

    it('should_reject_when_new_year_is_out_of_range', async () => {
      encolarDisponibilidad([]);
      const res = await VehiculoService.updateVehiculo('veh-1', { anio: 1800 });
      expect(res.success).toBe(false);
      expect(res.error).toBe(`El año debe estar entre 1900 y ${ANIO_ACTUAL + 1}.`);
    });

    it('should_update_only_the_provided_fields', async () => {
      encolarDisponibilidad([]);
      admin.results.vehiculo = [fila({ id: 'veh-1', marca: 'Kia' })];
      const res = await VehiculoService.updateVehiculo('veh-1', { marca: '  Kia  ' });
      expect(res.success).toBe(true);
      expect(res.vehiculo?.marca).toBe('Kia');
      expect(admin.callsTo('vehiculo').map((c) => c[0])).toEqual(['update', 'eq', 'select', 'single']);
    });

    it('should_set_patente_to_null_when_empty_string_is_provided', async () => {
      encolarDisponibilidad([]);
      admin.results.vehiculo = [fila({ id: 'veh-1' })];
      const res = await VehiculoService.updateVehiculo('veh-1', { patente: '  ' });
      expect(res.success).toBe(true);
      const updateCalls = admin.callsTo('vehiculo').filter((c) => c[0] === 'update');
      expect(updateCalls).toHaveLength(1);
    });

    it('should_return_error_when_update_fails', async () => {
      encolarDisponibilidad([]);
      admin.results.vehiculo = [{ data: null, error: { message: 'no existe' } }];
      const res = await VehiculoService.updateVehiculo('veh-1', { marca: 'Kia' });
      expect(res.success).toBe(false);
      expect(res.error).toBe('Error al actualizar: no existe');
    });
  });

  describe('deleteVehiculo', () => {
    it('should_reject_when_vehicle_is_reserved', async () => {
      encolarDisponibilidad([{ solicitud_id: 'sol-9', disponibilidad: 'reservado' }]);
      const res = await VehiculoService.deleteVehiculo('veh-1');
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/reservado en una solicitud activa/);
    });

    it('should_reject_when_vehicle_is_sold', async () => {
      encolarVendido();
      const res = await VehiculoService.deleteVehiculo('veh-1');
      expect(res.success).toBe(false);
      expect(res.error).toBe('No se puede eliminar un vehículo que ya fue vendido.');
    });

    it('should_return_success_when_vehicle_is_free', async () => {
      encolarDisponibilidad([]);
      const res = await VehiculoService.deleteVehiculo('veh-1');
      expect(res).toEqual({ success: true });
      expect(admin.callsTo('vehiculo')).toEqual([['delete'], ['eq', 'id', 'veh-1']]);
    });

    it('should_return_error_when_delete_fails', async () => {
      encolarDisponibilidad([]);
      admin.results.vehiculo = [{ data: null, error: { message: 'FK violation' } }];
      const res = await VehiculoService.deleteVehiculo('veh-1');
      expect(res.success).toBe(false);
      expect(res.error).toBe('Error al eliminar: FK violation');
    });
  });

  describe('getVehiculos', () => {
    it('should_return_empty_array_when_query_fails', async () => {
      admin.results.vehiculo = [{ data: null, error: { message: 'boom' } }];
      expect(await VehiculoService.getVehiculos()).toEqual([]);
    });

    it('should_map_vehicle_to_liberado_when_no_active_reservation', async () => {
      admin.results.vehiculo = [
        {
          data: [
            {
              id: 'veh-1',
              chasis: CHASIS_VALIDO,
              patente: null,
              marca: 'Toyota',
              modelo: 'Corolla',
              anio: 2020,
              color: 'Blanco',
              precio: 100,
              ubicacion: 1,
              sucursal: { nombre: 'Sucursal Centro' },
              solicitud_vehiculo: [{ solicitud_id: 'sol-1', disponibilidad: 'liberado' }],
              created_at: '2026-01-01',
              updated_at: '2026-01-02',
            },
          ],
          error: null,
        },
      ];
      const res = await VehiculoService.getVehiculos();
      expect(res[0].estado_disponibilidad).toBe('liberado');
      expect(res[0].solicitud_id).toBeNull();
      expect(res[0].ubicacion_nombre).toBe('Sucursal Centro');
    });

    it('should_map_vehicle_to_reservado_when_active_reservation_exists', async () => {
      admin.results.vehiculo = [{ data: [vehiculoRow('sol-7', 'reservado')], error: null }];
      const res = await VehiculoService.getVehiculos();
      expect(res[0].estado_disponibilidad).toBe('reservado');
      expect(res[0].solicitud_id).toBe('sol-7');
    });

    it('should_map_vehicle_to_vendido_when_sold_and_not_reserved', async () => {
      admin.results.vehiculo = [{ data: [vehiculoRow('sol-7', 'vendido')], error: null }];
      const res = await VehiculoService.getVehiculos();
      expect(res[0].estado_disponibilidad).toBe('vendido');
      expect(res[0].solicitud_id).toBeNull();
    });

    it('should_prioritize_reserved_over_sold', async () => {
      admin.results.vehiculo = [
        {
          data: [
            {
              ...vehiculoRow('sol-7', 'reservado'),
              solicitud_vehiculo: [
                { solicitud_id: 'sol-7', disponibilidad: 'vendido' },
                { solicitud_id: 'sol-8', disponibilidad: 'reservado' },
              ],
            },
          ],
          error: null,
        },
      ];
      const res = await VehiculoService.getVehiculos();
      expect(res[0].estado_disponibilidad).toBe('reservado');
      expect(res[0].solicitud_id).toBe('sol-8');
    });

    it('should_handle_vehicle_without_branch_or_reservations', async () => {
      admin.results.vehiculo = [
        { data: [{ ...vehiculoRow(), sucursal: null, solicitud_vehiculo: null }], error: null },
      ];
      const res = await VehiculoService.getVehiculos();
      expect(res[0].estado_disponibilidad).toBe('liberado');
      expect(res[0].ubicacion_nombre).toBeNull();
    });

    it('should_paginate_through_1000_row_pages_and_merge_everything', async () => {
      const pagina1 = Array.from({ length: 1000 }, (_, i) => ({ ...vehiculoRow(), id: `veh-${i}` }));
      const pagina2 = [{ ...vehiculoRow(), id: 'veh-1000' }];
      admin.results.vehiculo = [
        { data: pagina1, error: null },
        { data: pagina2, error: null },
      ];
      const res = await VehiculoService.getVehiculos();
      expect(res).toHaveLength(1001);
      expect(res[0].id).toBe('veh-0');
      expect(res[1000].id).toBe('veh-1000');
      const ranges = admin.callsTo('vehiculo').filter((c) => c[0] === 'range');
      expect(ranges).toEqual([
        ['range', 0, 999],
        ['range', 1000, 1999],
      ]);
    });

    it('should_stop_paginating_when_a_partial_page_is_returned', async () => {
      const pagina1 = Array.from({ length: 1000 }, (_, i) => ({ ...vehiculoRow(), id: `veh-${i}` }));
      const pagina2 = Array.from({ length: 500 }, (_, i) => ({ ...vehiculoRow(), id: `veh-part-${i}` }));
      admin.results.vehiculo = [
        { data: pagina1, error: null },
        { data: pagina2, error: null },
      ];
      const res = await VehiculoService.getVehiculos();
      expect(res).toHaveLength(1500);
      const ranges = admin.callsTo('vehiculo').filter((c) => c[0] === 'range');
      expect(ranges).toEqual([
        ['range', 0, 999],
        ['range', 1000, 1999],
      ]);
    });

    it('should_return_empty_array_when_a_middle_page_fails', async () => {
      const pagina1 = Array.from({ length: 1000 }, (_, i) => ({ ...vehiculoRow(), id: `veh-${i}` }));
      admin.results.vehiculo = [
        { data: pagina1, error: null },
        { data: null, error: { message: 'boom' } },
      ];
      expect(await VehiculoService.getVehiculos()).toEqual([]);
    });

    it('should_order_by_created_at_then_id_to_make_pagination_deterministic', async () => {
      admin.results.vehiculo = [{ data: [vehiculoRow()], error: null }];
      await VehiculoService.getVehiculos();
      const orders = admin.callsTo('vehiculo').filter((c) => c[0] === 'order');
      expect(orders).toEqual([
        ['order', 'created_at', { ascending: false }],
        ['order', 'id', { ascending: true }],
      ]);
    });

    it('should_dedupe_rows_repeated_across_pages_by_id', async () => {
      const pagina1 = Array.from({ length: 1000 }, (_, i) => ({ ...vehiculoRow(), id: `veh-${i}` }));
      const pagina2 = [
        { ...vehiculoRow(), id: 'veh-999' },
        { ...vehiculoRow(), id: 'veh-1000' },
        { ...vehiculoRow(), id: 'veh-1000' },
      ];
      admin.results.vehiculo = [
        { data: pagina1, error: null },
        { data: pagina2, error: null },
      ];
      const res = await VehiculoService.getVehiculos();
      expect(res).toHaveLength(1001);
      expect(new Set(res.map((v) => v.id)).size).toBe(1001);
      expect(res[999].id).toBe('veh-999');
      expect(res[1000].id).toBe('veh-1000');
    });

    it('should_keep_rows_without_id_when_deduplicating', async () => {
      const sinId = { ...vehiculoRow(), id: undefined };
      admin.results.vehiculo = [{ data: [sinId, sinId], error: null }];
      expect(await VehiculoService.getVehiculos()).toHaveLength(2);
    });
  });

  describe('getMarcas', () => {
    it('should_return_unique_brands', async () => {
      admin.results.vehiculo = [
        { data: [{ marca: 'Toyota' }, { marca: 'Kia' }, { marca: 'Toyota' }], error: null },
      ];
      expect(await VehiculoService.getMarcas()).toEqual(['Toyota', 'Kia']);
    });

    it('should_paginate_and_dedupe_brands_across_pages', async () => {
      const pagina1 = Array.from({ length: 1000 }, (_, i) => ({ marca: i % 2 === 0 ? 'Toyota' : 'Kia' }));
      const pagina2 = [{ marca: 'Toyota' }, { marca: 'Ford' }];
      admin.results.vehiculo = [
        { data: pagina1, error: null },
        { data: pagina2, error: null },
      ];
      expect(await VehiculoService.getMarcas()).toEqual(['Toyota', 'Kia', 'Ford']);
    });

    it('should_return_empty_array_when_query_fails', async () => {
      admin.results.vehiculo = [{ data: null, error: { message: 'boom' } }];
      expect(await VehiculoService.getMarcas()).toEqual([]);
    });

    it('should_order_by_marca_then_id_to_make_pagination_deterministic', async () => {
      admin.results.vehiculo = [{ data: [{ marca: 'Toyota' }], error: null }];
      await VehiculoService.getMarcas();
      const orders = admin.callsTo('vehiculo').filter((c) => c[0] === 'order');
      expect(orders).toEqual([
        ['order', 'marca'],
        ['order', 'id', { ascending: true }],
      ]);
    });
  });

  describe('importVehiculosCSV', () => {
    const CSV = [
      'C.comp,Marca,Modelo,Chasis,Color,Fec.adj.,P.V.D.',
      `1,TOY,Corolla,${CHASIS_VALIDO},Blanco,15/06/2020,"13,859,244.00"`,
      `1,KIA,Sportage,JTMW1RF79KD123456,Negro,10/03/2021,"1.234,56"`,
      `1,TOY,Duplicado,${CHASIS_VALIDO},Rojo,10/03/2021,100`,
      '1,TOY,SinChasis,,,,',
    ].join('\n');

    it('should_reject_when_file_has_no_rows', async () => {
      const res = await VehiculoService.importVehiculosCSV('');
      expect(res.success).toBe(false);
      expect(res.error).toBe('El archivo no contiene filas válidas.');
    });

    it('should_reject_when_required_columns_are_missing', async () => {
      const res = await VehiculoService.importVehiculosCSV('a,b\n1,2');
      expect(res.success).toBe(false);
      expect(res.error).toBe('El archivo debe contener al menos las columnas Marca, Modelo y Chasis.');
    });

    it('should_import_valid_rows_and_count_duplicates_and_errors', async () => {
      admin.results.sucursal = [{ data: [{ id: 1, nombre: 'Centro' }], error: null }];
      admin.results.vehiculo = [{ data: [], error: null }, { data: null, error: null }];
      const res = await VehiculoService.importVehiculosCSV(CSV);
      expect(res.importados).toBe(2);
      expect(res.duplicados).toBe(1);
      expect(res.errores).toBe(1);
      expect(res.total).toBe(4);
    });

    it('should_count_rows_with_invalid_chassis_as_errors', async () => {
      admin.results.sucursal = [{ data: [], error: null }];
      admin.results.vehiculo = [{ data: [], error: null }];
      const csv = ['Marca,Modelo,Chasis', 'TOY,Corolla,CORTO'].join('\n');
      const res = await VehiculoService.importVehiculosCSV(csv);
      expect(res.errores).toBe(1);
      expect(res.importados).toBe(0);
    });

    it('should_read_existing_chassis_ordered_by_id', async () => {
      admin.results.sucursal = [{ data: [], error: null }];
      admin.results.vehiculo = [{ data: [], error: null }];
      await VehiculoService.importVehiculosCSV(CSV);
      const orders = admin.callsTo('vehiculo').filter((c) => c[0] === 'order');
      expect(orders).toEqual([['order', 'id', { ascending: true }]]);
    });
  });
});

function encolarVendido() {
  admin.results.solicitud_vehiculo = [
    { data: [{ solicitud_id: 'sol-1', disponibilidad: 'vendido' }], error: null },
  ];
}

function vehiculoRow(solicitudId?: string, disponibilidad?: string) {
  return {
    id: 'veh-1',
    chasis: CHASIS_VALIDO,
    patente: null,
    marca: 'Toyota',
    modelo: 'Corolla',
    anio: 2020,
    color: null,
    precio: 100,
    ubicacion: 1,
    sucursal: { nombre: 'Centro' },
    solicitud_vehiculo: solicitudId ? [{ solicitud_id: solicitudId, disponibilidad }] : [],
    created_at: '2026-01-01',
    updated_at: '2026-01-02',
  };
}
