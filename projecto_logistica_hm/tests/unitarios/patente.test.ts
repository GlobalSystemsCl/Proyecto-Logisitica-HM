import { beforeEach, describe, expect, it, vi } from 'vitest';
import { formatearPatente, normalizarPatente, validarPatente } from '@/lib/patente';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('normalizarPatente', () => {
  it('should_uppercase_and_remove_dashes_and_spaces', () => {
    expect(normalizarPatente(' abcd-12 ')).toBe('ABCD12');
    expect(normalizarPatente('ab 1234')).toBe('AB1234');
  });

  it('should_return_empty_for_missing_values', () => {
    expect(normalizarPatente(null)).toBe('');
  });
});

describe('validarPatente', () => {
  it('should_accept_new_and_old_chilean_formats', () => {
    expect(validarPatente('ABCD-12')).toBeNull();
    expect(validarPatente('AB1234')).toBeNull();
  });

  it('should_require_a_plate', () => {
    expect(validarPatente('  ')).toBe('Indica la patente del camión.');
  });

  it('should_reject_plates_without_letters_or_digits_or_wrong_length', () => {
    expect(validarPatente('123456')).not.toBeNull();
    expect(validarPatente('ABCDEF')).not.toBeNull();
    expect(validarPatente('AB1')).not.toBeNull();
    expect(validarPatente('ABCDE123456')).not.toBeNull();
  });
});

describe('formatearPatente', () => {
  it('should_add_dash_for_known_formats', () => {
    expect(formatearPatente('abcd12')).toBe('ABCD-12');
    expect(formatearPatente('AB1234')).toBe('AB-1234');
  });

  it('should_leave_other_formats_normalized', () => {
    expect(formatearPatente('ab-12345')).toBe('AB12345');
  });
});
