import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  TOPE_DIARIO_POR_DEFECTO,
  TOPE_USUARIO_POR_DEFECTO,
  decidirEnvio,
  esDuplicado,
  inicioDelDiaChile,
  topesDesdeEntorno,
} from '@/lib/topeCorreos';

const topes = { diario: 10, porUsuario: 3 };

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('topesDesdeEntorno', () => {
  it('should_use_defaults_when_variables_are_missing', () => {
    expect(topesDesdeEntorno({})).toEqual({ diario: TOPE_DIARIO_POR_DEFECTO, porUsuario: TOPE_USUARIO_POR_DEFECTO });
  });

  it('should_read_valid_integers', () => {
    expect(topesDesdeEntorno({ CORREOS_TOPE_DIARIO: ' 120 ', CORREOS_TOPE_USUARIO: '0' })).toEqual({ diario: 120, porUsuario: 0 });
  });

  it('should_ignore_invalid_values', () => {
    expect(topesDesdeEntorno({ CORREOS_TOPE_DIARIO: 'mucho', CORREOS_TOPE_USUARIO: '-1' })).toEqual({
      diario: TOPE_DIARIO_POR_DEFECTO,
      porUsuario: TOPE_USUARIO_POR_DEFECTO,
    });
    expect(topesDesdeEntorno({ CORREOS_TOPE_DIARIO: '2.5' }).diario).toBe(TOPE_DIARIO_POR_DEFECTO);
  });
});

describe('decidirEnvio', () => {
  it('should_send_when_under_both_caps', () => {
    expect(decidirEnvio({ urgente: false, enviadosHoy: 9, enviadosHoyUsuario: 2, topes })).toBe('enviar');
  });

  it('should_skip_when_daily_cap_is_reached', () => {
    expect(decidirEnvio({ urgente: false, enviadosHoy: 10, enviadosHoyUsuario: 0, topes })).toBe('omitido_tope');
  });

  it('should_skip_when_user_cap_is_reached', () => {
    expect(decidirEnvio({ urgente: false, enviadosHoy: 0, enviadosHoyUsuario: 3, topes })).toBe('omitido_tope');
  });

  it('should_always_send_urgent_emails', () => {
    expect(decidirEnvio({ urgente: true, enviadosHoy: 999, enviadosHoyUsuario: 999, topes })).toBe('enviar');
  });
});

describe('esDuplicado', () => {
  const ahora = new Date('2026-11-12T15:00:00Z');

  it('should_be_true_within_the_window', () => {
    expect(esDuplicado('2026-11-12T14:57:00Z', ahora)).toBe(true);
  });

  it('should_be_false_after_the_window', () => {
    expect(esDuplicado('2026-11-12T14:55:00Z', ahora)).toBe(false);
    expect(esDuplicado('2026-11-12T14:50:00Z', ahora, 5)).toBe(false);
  });

  it('should_be_false_without_previous_send_or_with_invalid_or_future_date', () => {
    expect(esDuplicado(null, ahora)).toBe(false);
    expect(esDuplicado(undefined, ahora)).toBe(false);
    expect(esDuplicado('no-es-fecha', ahora)).toBe(false);
    expect(esDuplicado('2026-11-12T15:01:00Z', ahora)).toBe(false);
  });
});

describe('inicioDelDiaChile', () => {
  it('should_return_chile_midnight_in_summer_time', () => {
    // 12/11 a las 12:00 en Chile (UTC-3): el día empezó a las 03:00 UTC.
    expect(inicioDelDiaChile(new Date('2026-11-12T15:00:00Z'))).toBe('2026-11-12T03:00:00.000Z');
  });

  it('should_use_chile_day_when_utc_is_already_the_next_day', () => {
    // 11/11 a las 22:30 en Chile es 12/11 01:30 UTC.
    expect(inicioDelDiaChile(new Date('2026-11-12T01:30:00Z'))).toBe('2026-11-11T03:00:00.000Z');
  });

  it('should_return_chile_midnight_in_winter_time', () => {
    // Julio: Chile está en UTC-4.
    expect(inicioDelDiaChile(new Date('2026-07-10T15:00:00Z'))).toBe('2026-07-10T04:00:00.000Z');
  });

  it('should_use_current_time_by_default', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-12T15:00:00Z'));
    expect(inicioDelDiaChile()).toBe('2026-11-12T03:00:00.000Z');
  });
});
