import { describe, expect, it } from 'vitest';
import { escaparPatronLike, etiquetaSucursal, filtrarSucursales, sanitizarTerminoBusqueda } from '@/lib/busqueda';

describe('sanitizarTerminoBusqueda', () => {
  it('should_keep_alphanumeric_and_hyphen_when_input_is_a_plate', () => {
    expect(sanitizarTerminoBusqueda('AB-CD12')).toBe('AB-CD12');
  });

  it('should_remove_postgrest_operators_when_input_tries_injection', () => {
    expect(sanitizarTerminoBusqueda('a%,id.not.is.null')).toBe('aidnotisnull');
    expect(sanitizarTerminoBusqueda('x),(id.neq.0')).toBe('xidneq0');
  });

  it('should_truncate_when_input_is_too_long', () => {
    expect(sanitizarTerminoBusqueda('A'.repeat(50))).toHaveLength(30);
    expect(sanitizarTerminoBusqueda('ABCDEFG', 3)).toBe('ABC');
  });

  it('should_return_empty_when_input_is_null_or_only_symbols', () => {
    expect(sanitizarTerminoBusqueda(null)).toBe('');
    expect(sanitizarTerminoBusqueda(undefined)).toBe('');
    expect(sanitizarTerminoBusqueda('%%,()')).toBe('');
  });
});

describe('escaparPatronLike', () => {
  it('should_escape_like_wildcards', () => {
    expect(escaparPatronLike('Zona_1')).toBe('Zona\\_1');
    expect(escaparPatronLike('100%')).toBe('100\\%');
    expect(escaparPatronLike('a\\b')).toBe('a\\\\b');
  });

  it('should_return_same_text_when_there_are_no_wildcards', () => {
    expect(escaparPatronLike('Sucursal Centro')).toBe('Sucursal Centro');
  });
});

describe('filtrarSucursales', () => {
  const sucursales = [
    { id: 101, nombre: '15 NORTE-VIÑA DEL MAR' },
    { id: 135, nombre: '3 ORIENTE BAIC' },
    { id: 108, nombre: 'ARGENTINA-ANTOFAGASTA' },
  ];

  it('should_return_all_when_term_is_empty', () => {
    expect(filtrarSucursales(sucursales, '  ')).toHaveLength(3);
  });

  it('should_match_name_ignoring_accents_and_case_or_code_prefix', () => {
    expect(filtrarSucursales(sucursales, 'vina').map((s) => s.id)).toEqual([101]);
    expect(filtrarSucursales(sucursales, '13').map((s) => s.id)).toEqual([135]);
  });

  it('should_keep_the_selected_branch_when_it_does_not_match', () => {
    expect(filtrarSucursales(sucursales, 'baic', 108).map((s) => s.id)).toEqual([135, 108]);
  });

  it('should_match_visible_code_with_letter_when_branch_has_codigo', () => {
    const conCodigo = [
      { id: 119, codigo: '119A', nombre: 'LONQUÉN' },
      { id: 409, codigo: '119B', nombre: 'ACOPIO LONQUÉN' },
    ];
    expect(filtrarSucursales(conCodigo, '119b').map((s) => s.id)).toEqual([409]);
    expect(filtrarSucursales(conCodigo, '119').map((s) => s.id)).toEqual([119, 409]);
    expect(filtrarSucursales(conCodigo, '409')).toEqual([]);
  });
});

describe('etiquetaSucursal', () => {
  it('should_show_visible_code_and_name_when_branch_has_codigo', () => {
    expect(etiquetaSucursal({ id: 409, codigo: '119B', nombre: 'ACOPIO LONQUÉN' })).toBe('119B · ACOPIO LONQUÉN');
  });

  it('should_use_id_as_code_when_codigo_is_missing_or_blank', () => {
    expect(etiquetaSucursal({ id: 101, nombre: '15 NORTE-VIÑA DEL MAR' })).toBe('101 · 15 NORTE-VIÑA DEL MAR');
    expect(etiquetaSucursal({ id: 101, codigo: '  ', nombre: 'X' })).toBe('101 · X');
  });

  it('should_show_only_code_when_name_is_empty', () => {
    expect(etiquetaSucursal({ id: 7, codigo: null, nombre: null })).toBe('7');
  });
});
