import { describe, expect, it } from 'vitest';
import {
  requisitosPassword,
  validarCampoTexto,
  validarEmailFormato,
  validarPassword,
} from '@/lib/validaciones';

describe('validarPassword', () => {
  it('should_reject_when_password_is_empty', () => {
    expect(validarPassword('')).toBe('La contraseña debe tener al menos 10 caracteres.');
  });

  it('should_reject_when_password_is_shorter_than_10_characters', () => {
    expect(validarPassword('Corta1234')).toBe('La contraseña debe tener al menos 10 caracteres.');
  });

  it('should_reject_when_password_exceeds_72_characters', () => {
    expect(validarPassword('Aa1' + 'a'.repeat(70))).toBe(
      'La contraseña no puede superar los 72 caracteres.'
    );
  });

  it('should_reject_when_password_has_no_uppercase_number_or_lowercase', () => {
    const msg = 'La contraseña debe incluir al menos una mayúscula, una minúscula y un número.';
    expect(validarPassword('sinmayuscula1')).toBe(msg);
    expect(validarPassword('SINMINUSCULA1')).toBe(msg);
    expect(validarPassword('SinNumeroAqui')).toBe(msg);
  });

  it('should_accept_password_of_72_characters_meeting_complexity', () => {
    expect(validarPassword('Aa1' + 'a'.repeat(69))).toBeNull();
  });

  it('should_accept_password_meeting_policy', () => {
    expect(validarPassword('Logistica2026')).toBeNull();
  });
});

describe('requisitosPassword', () => {
  it('should_mark_all_requirements_when_password_is_strong', () => {
    expect(requisitosPassword('Logistica2026')).toEqual({
      longitud: true,
      mayuscula: true,
      minuscula: true,
      numero: true,
    });
  });

  it('should_mark_missing_requirements_when_password_is_weak', () => {
    expect(requisitosPassword('abc')).toEqual({
      longitud: false,
      mayuscula: false,
      minuscula: true,
      numero: false,
    });
  });

  it('should_handle_empty_value_when_password_is_undefined', () => {
    expect(requisitosPassword(undefined as unknown as string).longitud).toBe(false);
  });
});

describe('validarEmailFormato', () => {
  it('should_reject_when_email_is_empty', () => {
    expect(validarEmailFormato('  ')).toBe('El correo electrónico es obligatorio.');
  });

  it('should_reject_when_email_has_invalid_format', () => {
    expect(validarEmailFormato('correo-sin-arroba')).toBe(
      'El formato del correo electrónico no es válido.'
    );
    expect(validarEmailFormato('a@b')).toBe('El formato del correo electrónico no es válido.');
  });

  it('should_reject_when_email_exceeds_254_characters', () => {
    const largo = `a@${'b'.repeat(260)}.com`;
    expect(validarEmailFormato(largo)).toBe(
      'El correo no puede superar los 254 caracteres.'
    );
  });

  it('should_accept_a_valid_email_and_ignore_outer_spaces', () => {
    expect(validarEmailFormato('  user@test.com ')).toBeNull();
  });
});

describe('validarCampoTexto', () => {
  it('should_reject_when_field_is_missing', () => {
    expect(validarCampoTexto('   ', 'nombre', 100)).toBe('El nombre es obligatorio.');
  });

  it('should_reject_when_field_exceeds_max_length', () => {
    expect(validarCampoTexto('a'.repeat(101), 'nombre', 100)).toBe(
      'El nombre no puede superar los 100 caracteres.'
    );
  });

  it('should_reject_when_field_contains_html_brackets', () => {
    expect(validarCampoTexto('<a href="x">Juan</a>', 'nombre', 100)).toBe(
      'El nombre contiene caracteres no permitidos.'
    );
  });

  it('should_accept_a_field_within_limits', () => {
    expect(validarCampoTexto('Juan', 'nombre', 100)).toBeNull();
  });
});