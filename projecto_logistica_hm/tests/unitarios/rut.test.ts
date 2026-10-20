import { beforeEach, describe, expect, it, vi } from 'vitest';
import { calcularDigitoVerificador, formatearRut, normalizarRut, validarRut } from '@/lib/rut';

describe('calcularDigitoVerificador', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should_return_digit_when_modulo_11_gives_a_number', () => {
    expect(calcularDigitoVerificador('12345678')).toBe('5');
    expect(calcularDigitoVerificador('76543210')).toBe('3');
  });

  it('should_return_K_when_remainder_is_10', () => {
    expect(calcularDigitoVerificador('10000013')).toBe('K');
  });

  it('should_return_0_when_remainder_is_11', () => {
    expect(calcularDigitoVerificador('10000004')).toBe('0');
  });
});

describe('normalizarRut', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should_return_database_format_when_rut_has_dots_and_dash', () => {
    expect(normalizarRut('12.345.678-5')).toBe('12345678-5');
  });

  it('should_accept_rut_without_dash_and_lowercase_k', () => {
    expect(normalizarRut('10000013k')).toBe('10000013-K');
    expect(normalizarRut(' 7.654.321-6 ')).toBe('7654321-6');
  });

  it('should_return_null_when_check_digit_is_wrong', () => {
    expect(normalizarRut('12.345.678-9')).toBeNull();
  });

  it('should_return_null_when_body_is_too_short_long_or_empty', () => {
    expect(normalizarRut('123456-0')).toBeNull();
    expect(normalizarRut('123456789-0')).toBeNull();
    expect(normalizarRut('')).toBeNull();
  });
});

describe('validarRut', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should_return_true_when_rut_is_valid', () => {
    expect(validarRut('76.543.210-3')).toBe(true);
  });

  it('should_return_false_when_rut_is_invalid', () => {
    expect(validarRut('76.543.210-4')).toBe(false);
  });
});

describe('formatearRut', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should_add_thousands_separators_when_rut_is_valid', () => {
    expect(formatearRut('12345678-5')).toBe('12.345.678-5');
    expect(formatearRut('7654321-6')).toBe('7.654.321-6');
  });

  it('should_return_input_unchanged_when_rut_is_invalid', () => {
    expect(formatearRut('abc')).toBe('abc');
  });
});
