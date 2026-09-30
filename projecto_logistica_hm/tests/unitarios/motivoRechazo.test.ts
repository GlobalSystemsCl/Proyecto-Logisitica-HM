import { describe, expect, it } from 'vitest';
import {
  PREFIJO_RECHAZO,
  extraerMotivoRechazo,
  tienePrefijoRechazo,
  quitarPrefijoRechazo,
} from '@/lib/motivoRechazo';
import type { ObservacionEntry } from '@/types/solicitud.types';

function observacion(overrides: Partial<ObservacionEntry> = {}): ObservacionEntry {
  return {
    id: 'obs-1',
    solicitud_id: 'sol-1',
    usuario_id: 'jefe-1',
    usuario_nombre: 'Jefe de Local',
    observacion: `${PREFIJO_RECHAZO} Falta documentación del vehículo`,
    created_at: '2026-09-01T10:00:00.000Z',
    ...overrides,
  };
}

describe('tienePrefijoRechazo', () => {
  it('should_detect_the_exact_prefix', () => {
    expect(tienePrefijoRechazo('[RECHAZO] Motivo')).toBe(true);
  });

  it('should_be_tolerant_to_spaces_and_case', () => {
    expect(tienePrefijoRechazo('  [rechazo] Motivo')).toBe(true);
    expect(tienePrefijoRechazo('\t[Rechazo] Motivo')).toBe(true);
  });

  it('should_return_false_for_other_observations', () => {
    expect(tienePrefijoRechazo('El vehículo ya fue vendido')).toBe(false);
  });

  it('should_return_false_for_null_undefined_and_empty', () => {
    expect(tienePrefijoRechazo(null)).toBe(false);
    expect(tienePrefijoRechazo(undefined)).toBe(false);
    expect(tienePrefijoRechazo('')).toBe(false);
  });
});

describe('quitarPrefijoRechazo', () => {
  it('should_return_the_reason_without_the_prefix_and_trimmed', () => {
    expect(quitarPrefijoRechazo('[RECHAZO]   Sin patente  ')).toBe('Sin patente');
  });

  it('should_return_null_when_there_is_no_rejection_prefix', () => {
    expect(quitarPrefijoRechazo('Observación normal')).toBeNull();
  });

  it('should_return_empty_string_when_there_is_no_text_after_the_prefix', () => {
    expect(quitarPrefijoRechazo('[RECHAZO]   ')).toBe('');
  });

  it('should_not_throw_for_null_or_undefined', () => {
    expect(quitarPrefijoRechazo(null)).toBeNull();
    expect(quitarPrefijoRechazo(undefined)).toBeNull();
  });
});

describe('extraerMotivoRechazo', () => {
  it('should_return_the_reason_the_user_and_the_date', () => {
    const res = extraerMotivoRechazo([observacion()]);
    expect(res).toEqual({
      motivo: 'Falta documentación del vehículo',
      usuario_id: 'jefe-1',
      usuario_nombre: 'Jefe de Local',
      created_at: '2026-09-01T10:00:00.000Z',
    });
  });

  it('should_pick_the_most_recent_rejection_when_there_are_several', () => {
    const res = extraerMotivoRechazo([
      observacion({ id: 'a', created_at: '2026-09-01T10:00:00.000Z', observacion: '[RECHAZO] Primero' }),
      observacion({ id: 'b', created_at: '2026-09-03T10:00:00.000Z', observacion: '[RECHAZO] Segundo' }),
      observacion({ id: 'c', created_at: '2026-09-02T10:00:00.000Z', observacion: '[RECHAZO] Tercero' }),
    ]);
    expect(res?.motivo).toBe('Segundo');
  });

  it('should_ignore_observations_that_are_not_rejections', () => {
    const res = extraerMotivoRechazo([
      observacion({ id: 'x', created_at: '2026-09-05T10:00:00.000Z', observacion: 'Observación normal' }),
      observacion({ id: 'y', created_at: '2026-09-01T10:00:00.000Z', observacion: '[RECHAZO] Motivo real' }),
    ]);
    expect(res?.motivo).toBe('Motivo real');
  });

  it('should_return_null_when_there_are_no_rejection_observations', () => {
    expect(extraerMotivoRechazo([observacion({ observacion: 'Solo una observación' })])).toBeNull();
  });

  it('should_return_null_for_empty_null_and_undefined_input', () => {
    expect(extraerMotivoRechazo([])).toBeNull();
    expect(extraerMotivoRechazo(null)).toBeNull();
    expect(extraerMotivoRechazo(undefined)).toBeNull();
  });

  it('should_not_throw_when_an_observation_has_a_null_text', () => {
    const res = extraerMotivoRechazo([
      observacion({ id: 'n', observacion: null as unknown as string }),
    ]);
    expect(res).toBeNull();
  });

  it('should_return_null_when_the_rejection_observation_has_no_text_after_the_prefix', () => {
    expect(extraerMotivoRechazo([observacion({ observacion: '[RECHAZO]   ' })])).toBeNull();
  });

  it('should_normalize_a_missing_user_name_to_null', () => {
    const res = extraerMotivoRechazo([observacion({ usuario_nombre: null as unknown as string })]);
    expect(res?.usuario_nombre).toBeNull();
  });
});
