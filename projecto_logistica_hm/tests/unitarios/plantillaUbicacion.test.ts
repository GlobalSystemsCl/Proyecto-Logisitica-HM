import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// ExcelJS pesa ~1 MB: su primera carga puede pasar los 5 s del timeout con la suite en paralelo.
beforeAll(async () => {
  await import('exceljs');
}, 30_000);
import {
  analizarPlantillaUbicacion,
  codigoDesdeUbicacion,
  crearPlantillaUbicaciones,
  HOJA_PLANTILLA,
  HOJA_SUCURSALES,
  leerPlantillaUbicacion,
  MAX_FILAS_PLANTILLA_UBICACION,
  opcionUbicacion,
  resumenCargaUbicaciones,
  sucursalPorCodigo,
  vehiculosParaPlantillaUbicacion,
} from '@/lib/plantillaUbicacion';

const VIN_A = 'LB3G43S71TX401167';
const VIN_B = 'MA1NZ2NP1T2E76415';

const SUCURSALES = [
  { id: 101, codigo: '101', nombre: '15 NORTE' },
  { id: 119, codigo: '119A', nombre: 'LONQUÉN' },
  { id: 409, codigo: '119B', nombre: 'ACOPIO LONQUÉN' },
  { id: 130, codigo: '130', nombre: 'CERRADA', activa: false },
];

beforeEach(() => {
  vi.clearAllMocks();
});

describe('vehiculosParaPlantillaUbicacion', () => {
  it('should_keep_only_free_vehicles_without_location_sorted_by_vin', () => {
    const lista = [
      { chasis: 'Z', ubicacion: null, estado_disponibilidad: 'liberado' },
      { chasis: 'A', ubicacion: null, estado_disponibilidad: 'liberado' },
      { chasis: 'B', ubicacion: 101, estado_disponibilidad: 'liberado' },
      { chasis: 'C', ubicacion: null, estado_disponibilidad: 'reservado' },
      { chasis: 'D', ubicacion: null, estado_disponibilidad: 'liberado', en_transito_hacia: '101' },
    ];
    expect(vehiculosParaPlantillaUbicacion(lista).map((v) => v.chasis)).toEqual(['A', 'Z']);
  });
});

describe('opcionUbicacion', () => {
  it('should_join_visible_code_and_name', () => {
    expect(opcionUbicacion({ id: 409, codigo: '119B', nombre: 'ACOPIO LONQUÉN' })).toBe('119B · ACOPIO LONQUÉN');
  });

  it('should_use_only_code_when_name_is_empty', () => {
    expect(opcionUbicacion({ id: 7, nombre: null })).toBe('7');
  });
});

describe('codigoDesdeUbicacion', () => {
  it('should_take_leading_code_from_dropdown_text_or_plain_code', () => {
    expect(codigoDesdeUbicacion('119b · ACOPIO LONQUÉN')).toBe('119B');
    expect(codigoDesdeUbicacion(' 101 ')).toBe('101');
    expect(codigoDesdeUbicacion('120A - TORQUEMADA')).toBe('120A');
  });

  it('should_return_null_when_text_does_not_start_with_a_code', () => {
    expect(codigoDesdeUbicacion('LONQUÉN')).toBeNull();
    expect(codigoDesdeUbicacion('119BC')).toBeNull();
  });
});

describe('sucursalPorCodigo', () => {
  it('should_prefer_exact_visible_code', () => {
    expect(sucursalPorCodigo(SUCURSALES, '119B')?.id).toBe(409);
  });

  it('should_fall_back_to_id_when_code_is_only_a_number', () => {
    expect(sucursalPorCodigo(SUCURSALES, '119')?.id).toBe(119);
  });

  it('should_return_null_when_code_is_unknown', () => {
    expect(sucursalPorCodigo(SUCURSALES, '999')).toBeNull();
    expect(sucursalPorCodigo(SUCURSALES, '119C')).toBeNull();
  });
});

describe('leerPlantillaUbicacion', () => {
  it('should_read_vin_and_location_columns_skipping_blank_rows', () => {
    const res = leerPlantillaUbicacion([
      ['VIN', 'Ubicación'],
      [VIN_A.toLowerCase(), '101 · 15 NORTE'],
      ['', ''],
      [VIN_B, ''],
    ]);
    expect(res.filas).toEqual([
      { fila: 2, vin: VIN_A, ubicacion: '101 · 15 NORTE' },
      { fila: 4, vin: VIN_B, ubicacion: '' },
    ]);
  });

  it('should_accept_chasis_and_sucursal_as_header_aliases', () => {
    const res = leerPlantillaUbicacion([['Chasis', 'Sucursal'], [VIN_A, '101']]);
    expect(res.filas).toHaveLength(1);
  });

  it('should_fail_when_columns_are_missing', () => {
    expect(leerPlantillaUbicacion([['Marca', 'Modelo'], ['HY', 'X']]).error).toMatch(/VIN y Ubicación/);
  });

  it('should_fail_when_file_has_no_vehicles', () => {
    expect(leerPlantillaUbicacion([['VIN', 'Ubicación']]).error).toMatch(/no tiene vehículos/);
  });

  it('should_fail_when_file_exceeds_row_limit', () => {
    const filas = Array.from({ length: MAX_FILAS_PLANTILLA_UBICACION + 1 }, () => [VIN_A, '101']);
    expect(leerPlantillaUbicacion([['VIN', 'Ubicación'], ...filas]).error).toMatch(/máximo/);
  });
});

describe('analizarPlantillaUbicacion', () => {
  it('should_group_vins_by_branch_and_count_rows_without_location', () => {
    const res = analizarPlantillaUbicacion(
      [
        { fila: 2, vin: VIN_A, ubicacion: '119B · ACOPIO LONQUÉN' },
        { fila: 3, vin: VIN_B, ubicacion: '119B' },
        { fila: 4, vin: 'WBA3A5C50FF123456', ubicacion: '101' },
        { fila: 5, vin: 'XXXXXXXXXXXXXXXXX', ubicacion: '' },
      ],
      SUCURSALES,
    );
    expect(res.grupos).toEqual([
      { sucursalId: 409, vins: [VIN_A, VIN_B] },
      { sucursalId: 101, vins: ['WBA3A5C50FF123456'] },
    ]);
    expect(res.sinUbicacion).toBe(1);
    expect(res.errores).toEqual([]);
  });

  it('should_report_invalid_repeated_unknown_and_deactivated_rows', () => {
    const res = analizarPlantillaUbicacion(
      [
        { fila: 2, vin: 'CORTO', ubicacion: '101' },
        { fila: 3, vin: VIN_A, ubicacion: '101' },
        { fila: 4, vin: VIN_A, ubicacion: '119A' },
        { fila: 5, vin: VIN_B, ubicacion: 'LONQUÉN' },
        { fila: 6, vin: 'WBA3A5C50FF123456', ubicacion: '130 · CERRADA' },
      ],
      SUCURSALES,
    );
    expect(res.grupos).toEqual([{ sucursalId: 101, vins: [VIN_A] }]);
    expect(res.errores.map((e) => [e.fila, e.motivo])).toEqual([
      [2, 'VIN no válido (debe tener 17 caracteres).'],
      [4, 'VIN repetido en el archivo.'],
      [5, 'Ubicación desconocida: "LONQUÉN". Elígela de la lista.'],
      [6, 'La sucursal 130 está desactivada.'],
    ]);
  });
});

describe('resumenCargaUbicaciones', () => {
  it('should_mention_only_the_counts_that_apply', () => {
    expect(resumenCargaUbicaciones({ movidos: 5, noActualizados: 0, sinUbicacion: 0 })).toBe('5 vehículo(s) cambiaron de ubicación.');
    expect(resumenCargaUbicaciones({ movidos: 2, noActualizados: 1, sinUbicacion: 3 })).toBe(
      '2 vehículo(s) cambiaron de ubicación. 1 no se actualizaron (ver detalle). 3 fila(s) sin ubicación quedaron igual.',
    );
  });
});

describe('crearPlantillaUbicaciones', () => {
  it('should_build_vin_sheet_with_dropdown_of_active_branches', async () => {
    const libro = await crearPlantillaUbicaciones([{ chasis: VIN_A }, { chasis: VIN_B }], SUCURSALES);

    const hoja = libro.getWorksheet(HOJA_PLANTILLA)!;
    expect(hoja.getCell('A1').value).toBe('VIN');
    expect(hoja.getCell('B1').value).toBe('Ubicación');
    expect(hoja.getCell('A3').value).toBe(VIN_B);
    expect(hoja.getCell('B2').dataValidation).toMatchObject({ type: 'list', formulae: [`${HOJA_SUCURSALES}!$A$2:$A$4`] });

    const opciones = libro.getWorksheet(HOJA_SUCURSALES)!;
    expect(opciones.getCell('A2').value).toBe('101 · 15 NORTE');
    expect(opciones.getCell('A4').value).toBe('119B · ACOPIO LONQUÉN');
    expect(opciones.getCell('A5').value).toBeNull();
  });

  it('should_build_empty_template_when_there_are_no_vehicles', async () => {
    const libro = await crearPlantillaUbicaciones([], SUCURSALES);
    const hoja = libro.getWorksheet(HOJA_PLANTILLA)!;
    expect(hoja.getCell('A1').value).toBe('VIN');
    expect(hoja.rowCount).toBe(1);
  });
});
