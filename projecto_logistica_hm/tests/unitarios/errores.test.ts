import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorUsuario, mensajeErrorUsuario } from '@/lib/errores';

describe('mensajeErrorUsuario', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should_return_own_message_when_error_is_ErrorUsuario', () => {
    expect(mensajeErrorUsuario(new ErrorUsuario('Solicitud no encontrada.'), 'Fallo')).toBe(
      'Solicitud no encontrada.'
    );
    expect(console.error).not.toHaveBeenCalled();
  });

  it('should_return_business_message_when_trigger_raises_P0001', () => {
    const err = { code: 'P0001', message: 'El vehículo ya está reservado en otra solicitud activa.' };
    expect(mensajeErrorUsuario(err, 'Fallo')).toBe(
      'El vehículo ya está reservado en otra solicitud activa.'
    );
  });

  it('should_translate_unique_violation_without_leaking_constraint_name', () => {
    const err = { code: '23505', message: 'duplicate key value violates unique constraint "vehiculo_chasis_key"' };
    const msg = mensajeErrorUsuario(err, 'No se pudo guardar');
    expect(msg).toBe('Ya existe un registro con esos datos.');
    expect(msg).not.toContain('vehiculo_chasis_key');
    expect(console.error).toHaveBeenCalled();
  });

  it('should_translate_foreign_key_violation', () => {
    expect(mensajeErrorUsuario({ code: '23503', message: 'x' }, 'Fallo')).toBe(
      'La operación no es posible porque hay datos relacionados.'
    );
  });

  it('should_return_fallback_with_support_code_when_error_is_unknown', () => {
    const err = { message: 'Could not find the column "aprobado" of "usuario"' };
    const msg = mensajeErrorUsuario(err, 'No se pudo crear el usuario');
    expect(msg).toMatch(/^No se pudo crear el usuario \(código de soporte [A-Z0-9]+\)$/);
    expect(msg).not.toContain('aprobado');
    expect(console.error).toHaveBeenCalled();
  });

  it('should_return_fallback_when_error_is_a_plain_Error', () => {
    const msg = mensajeErrorUsuario(new TypeError('cannot read x of undefined'), 'Error inesperado');
    expect(msg.startsWith('Error inesperado')).toBe(true);
    expect(msg).not.toContain('undefined');
  });

  it('should_return_fallback_when_error_is_null_or_string', () => {
    expect(mensajeErrorUsuario(null, 'Fallo').startsWith('Fallo')).toBe(true);
    expect(mensajeErrorUsuario('texto', 'Fallo').startsWith('Fallo')).toBe(true);
  });

  it('should_return_fallback_when_P0001_has_no_message', () => {
    expect(mensajeErrorUsuario({ code: 'P0001' }, 'Fallo').startsWith('Fallo')).toBe(true);
  });
});
