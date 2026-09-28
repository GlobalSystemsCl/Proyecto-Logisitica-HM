import { describe, expect, it } from 'vitest';
import {
  validarCampoTexto,
  validarEmailFormato,
  validarPasswordRegistro,
} from '@/lib/validaciones';

describe('validarPasswordRegistro', () => {
  it('should_reject_when_password_is_empty', () => {
    expect(validarPasswordRegistro('')).toBe('La contraseña debe tener al menos 8 caracteres.');
  });

  it('should_reject_when_password_is_shorter_than_8_characters', () => {
    expect(validarPasswordRegistro('corta')).toBe('La contraseña debe tener al menos 8 caracteres.');
  });

  it('should_reject_when_password_exceeds_72_characters', () => {
    expect(validarPasswordRegistro('a'.repeat(73))).toBe(
      'La contraseña no puede superar los 72 caracteres.'
    );
  });

  it('should_accept_password_of_72_characters', () => {
    expect(validarPasswordRegistro('a'.repeat(72))).toBeNull();
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

  it('should_accept_a_field_within_limits', () => {
    expect(validarCampoTexto('Juan', 'nombre', 100)).toBeNull();
  });
});