import { describe, expect, it } from 'vitest';
import { escaparPatronLike, sanitizarTerminoBusqueda } from '@/lib/busqueda';

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
