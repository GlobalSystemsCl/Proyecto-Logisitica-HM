import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  existeMarca,
  filtrarMarcas,
  modelosDeMarca,
  propuestaMarcaNueva,
  validarMarcaNueva,
} from '@/lib/marcasVehiculo';

const MARCAS = [
  { codigo: 'HY', nombre: 'HYUNDAI' },
  { codigo: 'TO', nombre: 'TOYOTA' },
  { codigo: 'CH', nombre: 'CHERY' },
];

beforeEach(() => {
  vi.clearAllMocks();
});

describe('filtrarMarcas', () => {
  it('should_return_all_when_text_is_empty', () => {
    expect(filtrarMarcas(MARCAS, '  ')).toHaveLength(3);
  });

  it('should_match_code_prefix_or_name_ignoring_case', () => {
    expect(filtrarMarcas(MARCAS, 'hy').map((m) => m.codigo)).toEqual(['HY']);
    expect(filtrarMarcas(MARCAS, 'yota').map((m) => m.codigo)).toEqual(['TO']);
  });

  it('should_return_empty_when_nothing_matches', () => {
    expect(filtrarMarcas(MARCAS, 'kia')).toEqual([]);
  });
});

describe('existeMarca', () => {
  it('should_be_true_when_code_or_full_name_matches', () => {
    expect(existeMarca(MARCAS, 'to')).toBe(true);
    expect(existeMarca(MARCAS, 'Hyundai')).toBe(true);
  });

  it('should_be_false_when_only_partial_or_empty', () => {
    expect(existeMarca(MARCAS, 'HYUN')).toBe(false);
    expect(existeMarca(MARCAS, '')).toBe(false);
  });
});

describe('propuestaMarcaNueva', () => {
  it('should_use_short_text_as_code_and_name', () => {
    expect(propuestaMarcaNueva(' kia ')).toEqual({ codigo: 'KIA', nombre: 'KIA' });
  });

  it('should_leave_code_empty_when_text_is_long', () => {
    expect(propuestaMarcaNueva('great  wall')).toEqual({ codigo: '', nombre: 'GREAT WALL' });
  });
});

describe('validarMarcaNueva', () => {
  it('should_accept_code_and_name', () => {
    expect(validarMarcaNueva({ codigo: 'GW', nombre: 'GREAT WALL' })).toBeNull();
  });

  it('should_reject_missing_or_invalid_code', () => {
    expect(validarMarcaNueva({ codigo: '', nombre: 'X' })).toMatch(/código/);
    expect(validarMarcaNueva({ codigo: 'G-W', nombre: 'X' })).toMatch(/letras y números/);
  });

  it('should_reject_missing_name', () => {
    expect(validarMarcaNueva({ codigo: 'GW', nombre: '  ' })).toMatch(/nombre/);
  });
});

describe('modelosDeMarca', () => {
  const VEHICULOS = [
    { marca: 'HYUNDAI', marca_codigo: 'HY', modelo: 'TUCSON' },
    { marca: 'Hyundai', marca_codigo: null, modelo: 'Accent' },
    { marca: 'HYUNDAI', marca_codigo: 'HY', modelo: 'tucson' },
    { marca: 'OTRA', marca_codigo: 'HY', modelo: 'KONA' },
    { marca: 'TOYOTA', marca_codigo: 'TO', modelo: 'YARIS' },
    { marca: 'HYUNDAI', marca_codigo: 'HY', modelo: '  ' },
  ];

  it('should_list_unique_models_of_brand_by_name_or_code_sorted', () => {
    expect(modelosDeMarca(VEHICULOS, { nombre: 'HYUNDAI', codigo: 'HY' })).toEqual(['Accent', 'KONA', 'TUCSON']);
  });

  it('should_return_empty_when_no_brand_given', () => {
    expect(modelosDeMarca(VEHICULOS, { nombre: '', codigo: '' })).toEqual([]);
  });
});
