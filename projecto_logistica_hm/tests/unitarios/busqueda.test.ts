import { describe, expect, it } from 'vitest';
import { escaparPatronLike, filtrarSucursales, sanitizarTerminoBusqueda } from '@/lib/busqueda';

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
});
