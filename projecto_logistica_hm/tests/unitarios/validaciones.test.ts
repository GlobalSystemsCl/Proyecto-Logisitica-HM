import { describe, expect, it } from 'vitest';
import {
  CODIGO_SUCURSAL_MAX,
  parsearCodigoSucursalVisible,
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
describe('parsearCodigoSucursalVisible', () => {
  it('should_use_number_as_id_when_code_has_no_letter', () => {
    expect(parsearCodigoSucursalVisible('101')).toEqual({ codigo: '101', id: 101 });
    expect(parsearCodigoSucursalVisible(' 145 ')).toEqual({ codigo: '145', id: 145 });
  });

  it('should_leave_id_to_database_when_code_has_a_letter', () => {
    expect(parsearCodigoSucursalVisible('119B')).toEqual({ codigo: '119B', id: null });
    expect(parsearCodigoSucursalVisible(' 120a ')).toEqual({ codigo: '120A', id: null });
  });

  it('should_accept_limits_when_number_is_1_or_max', () => {
    expect(parsearCodigoSucursalVisible('1')?.id).toBe(1);
    expect(parsearCodigoSucursalVisible(String(CODIGO_SUCURSAL_MAX))?.id).toBe(CODIGO_SUCURSAL_MAX);
  });

  it('should_return_null_when_code_is_invalid', () => {
    for (const v of ['', '0', String(CODIGO_SUCURSAL_MAX + 1), 'B119', '119BB', '11-9', '1.5']) {
      expect(parsearCodigoSucursalVisible(v)).toBeNull();
    }
  });
});
