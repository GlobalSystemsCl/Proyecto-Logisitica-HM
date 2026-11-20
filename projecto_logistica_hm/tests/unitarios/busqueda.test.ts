import { describe, expect, it } from 'vitest';
import {
  codigoVisibleSucursal,
  escaparPatronLike,
  filtrarSucursales,
  moverIndiceLista,
  sanitizarTerminoBusqueda,
} from '@/lib/busqueda';

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

describe('codigoVisibleSucursal', () => {
  it('should_return_visible_code_when_branch_has_codigo', () => {
    expect(codigoVisibleSucursal({ id: 409, codigo: '119B' })).toBe('119B');
  });

  it('should_use_id_when_codigo_is_missing_or_blank', () => {
    expect(codigoVisibleSucursal({ id: 101 })).toBe('101');
    expect(codigoVisibleSucursal({ id: 101, codigo: '  ' })).toBe('101');
    expect(codigoVisibleSucursal({ id: 7, codigo: null })).toBe('7');
  });
});

describe('moverIndiceLista', () => {
  it('should_move_down_and_up_when_inside_the_list', () => {
    expect(moverIndiceLista(0, 5, 1)).toBe(1);
    expect(moverIndiceLista(3, 5, -1)).toBe(2);
  });

  it('should_wrap_around_when_at_the_ends', () => {
    expect(moverIndiceLista(4, 5, 1)).toBe(0);
    expect(moverIndiceLista(0, 5, -1)).toBe(4);
  });

  it('should_return_0_when_list_is_empty', () => {
    expect(moverIndiceLista(3, 0, 1)).toBe(0);
  });

  it('should_clamp_when_current_index_is_out_of_range', () => {
    expect(moverIndiceLista(9, 3, 1)).toBe(0);
    expect(moverIndiceLista(9, 3, -1)).toBe(1);
  });
});
