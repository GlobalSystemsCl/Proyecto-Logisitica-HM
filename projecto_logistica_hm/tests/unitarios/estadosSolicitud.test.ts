import { describe, expect, it } from 'vitest';
import { admiteInteraccion, ESTADOS_SIN_INTERACCION } from '@/lib/estadosSolicitud';

describe('admiteInteraccion', () => {
  it('should_return_false_when_solicitud_is_rejected_or_cancelled', () => {
    expect(admiteInteraccion('rechazada')).toBe(false);
    expect(admiteInteraccion('cancelada')).toBe(false);
  });

  it('should_return_true_when_solicitud_is_in_progress_or_finished', () => {
    expect(admiteInteraccion('pendiente_aprobacion')).toBe(true);
    expect(admiteInteraccion('en_transito')).toBe(true);
    expect(admiteInteraccion('finalizada')).toBe(true);
  });

  it('should_return_false_when_state_is_missing', () => {
    expect(admiteInteraccion(null)).toBe(false);
    expect(admiteInteraccion(undefined)).toBe(false);
    expect(admiteInteraccion('')).toBe(false);
  });

  it('should_list_only_closed_states', () => {
    expect([...ESTADOS_SIN_INTERACCION].sort()).toEqual(['cancelada', 'rechazada']);
  });
});
