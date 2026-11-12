import { beforeEach, describe, expect, it, vi } from 'vitest';
import { accionPendiente, hoyChile, rangosSeCruzan, validarAusencia, zonasTemporales } from '@/lib/ausencias';

const HOY = '2026-11-12';
const base = { titularId: 'u1', sustitutoId: 'u2', desde: '2026-11-15', hasta: '2026-11-30' };

beforeEach(() => {
  vi.clearAllMocks();
});

describe('hoyChile', () => {
  it('should_use_chile_date_even_when_utc_is_already_the_next_day', () => {
    expect(hoyChile(new Date('2026-11-13T01:30:00Z'))).toBe('2026-11-12');
    expect(hoyChile(new Date('2026-11-13T12:00:00Z'))).toBe('2026-11-13');
  });
});

describe('validarAusencia', () => {
  it('should_accept_a_future_or_current_absence', () => {
    expect(validarAusencia(base, HOY)).toBeNull();
    expect(validarAusencia({ ...base, desde: HOY, hasta: HOY }, HOY)).toBeNull();
  });

  it('should_require_both_people_and_different_ones', () => {
    expect(validarAusencia({ ...base, titularId: '' }, HOY)).toBe('Elige al usuario de Logística que se ausenta.');
    expect(validarAusencia({ ...base, sustitutoId: '' }, HOY)).toBe('Elige al sustituto.');
    expect(validarAusencia({ ...base, sustitutoId: 'u1' }, HOY)).toBe('El sustituto debe ser otra persona.');
  });

  it('should_reject_invalid_reversed_or_past_ranges', () => {
    expect(validarAusencia({ ...base, desde: 'x' }, HOY)).toBe('Indica las fechas desde y hasta.');
    expect(validarAusencia({ ...base, desde: '2026-11-30', hasta: '2026-11-15' }, HOY)).toContain('anterior a la fecha desde');
    expect(validarAusencia({ ...base, desde: '2026-11-01', hasta: '2026-11-05' }, HOY)).toContain('ya terminó');
  });
});

describe('accionPendiente', () => {
  it('should_start_scheduled_absences_when_their_day_arrives', () => {
    expect(accionPendiente({ estado: 'programada', desde: HOY, hasta: '2026-11-20' }, HOY)).toBe('iniciar');
    expect(accionPendiente({ estado: 'programada', desde: '2026-11-13', hasta: '2026-11-20' }, HOY)).toBeNull();
  });

  it('should_finish_active_absences_the_day_after_their_end', () => {
    expect(accionPendiente({ estado: 'activa', desde: '2026-11-01', hasta: HOY }, HOY)).toBeNull();
    expect(accionPendiente({ estado: 'activa', desde: '2026-11-01', hasta: '2026-11-11' }, HOY)).toBe('finalizar');
  });

  it('should_close_scheduled_absences_that_expired_without_starting_and_ignore_closed_ones', () => {
    expect(accionPendiente({ estado: 'programada', desde: '2026-11-01', hasta: '2026-11-05' }, HOY)).toBe('vencida');
    expect(accionPendiente({ estado: 'finalizada', desde: '2026-11-01', hasta: '2026-11-05' }, HOY)).toBeNull();
    expect(accionPendiente({ estado: 'cancelada', desde: HOY, hasta: HOY }, HOY)).toBeNull();
  });
});

describe('zonasTemporales', () => {
  it('should_add_only_holder_zones_the_substitute_does_not_have', () => {
    expect(zonasTemporales([1, 2, 2, 3], [2])).toEqual([1, 3]);
    expect(zonasTemporales([1], [1])).toEqual([]);
  });
});

describe('rangosSeCruzan', () => {
  it('should_detect_overlapping_inclusive_ranges', () => {
    expect(rangosSeCruzan({ desde: '2026-11-10', hasta: '2026-11-15' }, { desde: '2026-11-15', hasta: '2026-11-20' })).toBe(true);
    expect(rangosSeCruzan({ desde: '2026-11-10', hasta: '2026-11-14' }, { desde: '2026-11-15', hasta: '2026-11-20' })).toBe(false);
  });
});
