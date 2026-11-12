import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_LARGO_GUIA, guiasTexto, idsPorGuia, normalizarGuia, validarGuias } from '@/lib/guiaDespacho';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('normalizarGuia', () => {
  it('should_trim_and_collapse_inner_spaces', () => {
    expect(normalizarGuia('  GD  12 345 ')).toBe('GD 12 345');
  });

  it('should_return_empty_for_missing_values', () => {
    expect(normalizarGuia(null)).toBe('');
    expect(normalizarGuia(undefined)).toBe('');
  });
});

describe('validarGuias', () => {
  it('should_return_normalized_guides_only_for_given_ids', () => {
    expect(validarGuias(['sv-1', 'sv-2'], { 'sv-1': ' 1001 ', 'sv-2': '1001', otro: 'x' })).toEqual({
      ok: true,
      guias: { 'sv-1': '1001', 'sv-2': '1001' },
    });
  });

  it('should_reject_when_any_vehicle_has_no_guide', () => {
    expect(validarGuias(['sv-1', 'sv-2'], { 'sv-1': '1001', 'sv-2': '  ' })).toEqual({
      ok: false,
      error: 'Falta el número de guía de 1 vehículo: no se puede despachar sin guía.',
    });
    expect(validarGuias(['a', 'b', 'c'], {})).toEqual({
      ok: false,
      error: 'Falta el número de guía de 3 vehículos: no se puede despachar sin guía.',
    });
  });

  it('should_reject_guides_longer_than_the_maximum', () => {
    const res = validarGuias(['sv-1'], { 'sv-1': 'x'.repeat(MAX_LARGO_GUIA + 1) });
    expect(res.ok).toBe(false);
  });

  it('should_reject_when_there_are_no_vehicles', () => {
    expect(validarGuias([], {})).toEqual({ ok: false, error: 'La solicitud no tiene vehículos para despachar.' });
  });
});

describe('idsPorGuia', () => {
  it('should_group_ids_sharing_the_same_guide', () => {
    expect([...idsPorGuia({ a: '1', b: '2', c: '1' }).entries()]).toEqual([
      ['1', ['a', 'c']],
      ['2', ['b']],
    ]);
  });
});

describe('guiasTexto', () => {
  it('should_list_distinct_guides_skipping_empty_ones', () => {
    expect(guiasTexto([{ numero_guia: '1001' }, { numero_guia: '1001' }, { numero_guia: null }, { numero_guia: ' 1002 ' }])).toBe(
      '1001, 1002'
    );
  });

  it('should_return_empty_when_no_vehicle_has_guide', () => {
    expect(guiasTexto([{}, { numero_guia: null }])).toBe('');
  });
});
