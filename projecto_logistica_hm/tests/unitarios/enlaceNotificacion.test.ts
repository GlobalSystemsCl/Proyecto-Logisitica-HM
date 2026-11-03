import { beforeEach, describe, expect, it, vi } from 'vitest';
import { idDesdeParam, urlSinParametro } from '@/lib/enlaceNotificacion';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('idDesdeParam', () => {
  it('should_return_trimmed_value_or_first_of_array', () => {
    expect(idDesdeParam(' abc ')).toBe('abc');
    expect(idDesdeParam(['uno', 'dos'])).toBe('uno');
  });

  it('should_return_null_when_missing_or_blank', () => {
    expect(idDesdeParam(undefined)).toBeNull();
    expect(idDesdeParam('   ')).toBeNull();
    expect(idDesdeParam([])).toBeNull();
  });
});

describe('urlSinParametro', () => {
  it('should_remove_only_the_given_parameter_and_keep_the_rest', () => {
    expect(urlSinParametro('http://x.cl/logistica/calendarizaciones?vista=mes&solicitud=s-1#d', 'solicitud')).toBe(
      '/logistica/calendarizaciones?vista=mes#d'
    );
  });

  it('should_return_path_without_question_mark_when_no_parameters_remain', () => {
    expect(urlSinParametro('http://x.cl/solicitudes/recepciones?solicitud=s-1', 'solicitud')).toBe('/solicitudes/recepciones');
  });
});
