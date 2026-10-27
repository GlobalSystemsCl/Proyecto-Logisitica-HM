import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  celda,
  columnasStock,
  esChasisValido,
  normalizarEncabezado,
  separarMarca,
  tieneColumnasMinimas,
} from '@/lib/importStock';

const ENCABEZADOS_EXCEL = [
  'Tipo de vehículo ',
  'Marca',
  'Marca completa',
  'Modelo',
  'IDV',
  'Chasis',
  'Color',
  'Ubicación',
  'Patente ',
];

beforeEach(() => {
  vi.clearAllMocks();
});

describe('normalizarEncabezado', () => {
  it('should_strip_accents_case_quotes_and_extra_spaces', () => {
    expect(normalizarEncabezado('Tipo de vehículo ')).toBe('tipo de vehiculo');
    expect(normalizarEncabezado('"Ubicación"')).toBe('ubicacion');
    expect(normalizarEncabezado('Marca   completa')).toBe('marca completa');
  });

  it('should_return_empty_string_when_header_is_empty', () => {
    expect(normalizarEncabezado('')).toBe('');
  });
});

describe('columnasStock', () => {
  it('should_find_every_column_of_the_stock_excel', () => {
    expect(columnasStock(ENCABEZADOS_EXCEL)).toEqual({
      tipo: 0,
      marca: 1,
      marcaCompleta: 2,
      modelo: 3,
      idv: 4,
      chasis: 5,
      color: 6,
      ubicacion: 7,
      patente: 8,
      fechaAdjudicacion: -1,
      precio: -1,
    });
  });

  it('should_accept_legacy_columns_when_file_uses_previous_format', () => {
    const c = columnasStock(['C.comp', 'Marca', 'Modelo', 'Chasis', 'Fec.adj.', 'P.V.D.']);
    expect(c.ubicacion).toBe(0);
    expect(c.fechaAdjudicacion).toBe(4);
    expect(c.precio).toBe(5);
    expect(c.marcaCompleta).toBe(-1);
  });
});

describe('tieneColumnasMinimas', () => {
  it('should_require_marca_modelo_and_chasis', () => {
    expect(tieneColumnasMinimas(columnasStock(ENCABEZADOS_EXCEL))).toBe(true);
    expect(tieneColumnasMinimas(columnasStock(['Marca', 'Modelo']))).toBe(false);
  });
});

describe('celda', () => {
  it('should_trim_value_and_return_empty_for_missing_column_or_cell', () => {
    expect(celda([' VN ', 'HY'], 0)).toBe('VN');
    expect(celda(['VN'], -1)).toBe('');
    expect(celda(['VN'], 5)).toBe('');
  });
});

describe('esChasisValido', () => {
  it('should_accept_17_alphanumeric_characters', () => {
    expect(esChasisValido('LJ12EKR20V4001512')).toBe(true);
  });

  it('should_reject_short_or_non_alphanumeric_chassis', () => {
    expect(esChasisValido('9BWBL6DF9TT42113')).toBe(false);
    expect(esChasisValido('LJ12EKR20V400151-')).toBe(false);
  });
});

describe('separarMarca', () => {
  it('should_use_separate_code_and_full_name_columns', () => {
    expect(separarMarca('hy', 'HYUNDAI')).toEqual({ codigo: 'HY', nombre: 'HYUNDAI' });
  });

  it('should_split_legacy_code_and_name_in_one_cell', () => {
    expect(separarMarca('BAI,BAIC', '')).toEqual({ codigo: 'BAI', nombre: 'BAIC' });
  });

  it('should_leave_name_empty_when_only_code_is_given', () => {
    expect(separarMarca('TO', '')).toEqual({ codigo: 'TO', nombre: '' });
  });
});
