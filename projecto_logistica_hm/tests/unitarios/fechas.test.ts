import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { esFechaAnteriorAHoy, formatFecha, formatFechaLarga, hoyISO } from '@/lib/fechas';

const HOY = '2026-01-15T12:00:00Z';

describe('fechas', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(HOY));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('hoyISO', () => {
    it('should_return_yyyy_mm_dd_format_when_called', () => {
      expect(hoyISO()).toBe('2026-01-15');
    });

    it('should_pad_month_and_day_with_single_digit_values', () => {
      vi.setSystemTime(new Date('2026-03-07T08:30:00'));
      expect(hoyISO()).toBe('2026-03-07');
    });

    it('should_roll_over_month_boundary_correctly', () => {
      vi.setSystemTime(new Date('2026-12-31T23:59:59'));
      expect(hoyISO()).toBe('2026-12-31');
    });
  });

  describe('esFechaAnteriorAHoy', () => {
    it('should_return_true_when_date_is_before_today', () => {
      expect(esFechaAnteriorAHoy('2026-01-14')).toBe(true);
    });

    it('should_return_false_when_date_is_today', () => {
      expect(esFechaAnteriorAHoy('2026-01-15')).toBe(false);
    });

    it('should_return_false_when_date_is_in_the_future', () => {
      expect(esFechaAnteriorAHoy('2026-01-16')).toBe(false);
    });

    it('should_return_false_when_date_is_null', () => {
      expect(esFechaAnteriorAHoy(null)).toBe(false);
    });

    it('should_return_false_when_date_is_undefined', () => {
      expect(esFechaAnteriorAHoy(undefined)).toBe(false);
    });

    it('should_return_false_when_date_is_empty_string', () => {
      expect(esFechaAnteriorAHoy('')).toBe(false);
    });

    it('should_return_false_when_date_format_is_invalid', () => {
      expect(esFechaAnteriorAHoy('15-01-2026')).toBe(false);
      expect(esFechaAnteriorAHoy('no-es-fecha')).toBe(false);
    });

    it('should_ignore_time_part_when_iso_datetime_is_provided', () => {
      expect(esFechaAnteriorAHoy('2026-01-14T23:59:59Z')).toBe(true);
      expect(esFechaAnteriorAHoy('2026-01-15T00:00:00Z')).toBe(false);
    });
  });

  describe('formatFecha', () => {
    it('should_format_iso_date_as_dd_mm_yyyy', () => {
      expect(formatFecha('2026-03-07T00:00:00Z')).toBe('7/03/2026');
    });

    it('should_pad_month_but_not_day', () => {
      expect(formatFecha('2026-11-25T00:00:00Z')).toBe('25/11/2026');
    });

    it('should_return_dash_when_date_is_null', () => {
      expect(formatFecha(null)).toBe('—');
    });

    it('should_return_dash_when_date_is_undefined', () => {
      expect(formatFecha(undefined)).toBe('—');
    });

    it('should_return_dash_when_date_is_invalid', () => {
      expect(formatFecha('fecha-invalida')).toBe('—');
    });
  });

  describe('formatFechaLarga', () => {
    it('should_return_day_month_year_with_spanish_month_name', () => {
      expect(formatFechaLarga('2026-03-07T00:00:00Z')).toBe('7 de marzo de 2026');
    });

    it('should_use_correct_spanish_name_for_each_month', () => {
      const meses = [
        'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
        'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
      ];
      meses.forEach((mes, i) => {
        const iso = `2026-${String(i + 1).padStart(2, '0')}-15T00:00:00Z`;
        expect(formatFechaLarga(iso)).toBe(`15 de ${mes} de 2026`);
      });
    });

    it('should_return_dash_when_date_is_null', () => {
      expect(formatFechaLarga(null)).toBe('—');
    });

    it('should_return_dash_when_date_is_undefined', () => {
      expect(formatFechaLarga(undefined)).toBe('—');
    });

    it('should_return_dash_when_date_is_invalid', () => {
      expect(formatFechaLarga('fecha-invalida')).toBe('—');
    });
  });
});
