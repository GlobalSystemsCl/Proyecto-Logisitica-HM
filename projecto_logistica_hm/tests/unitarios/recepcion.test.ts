import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  textoObservacionRecepcion,
  validarMotivoCancelacion,
  validarRecepcion,
} from '@/lib/recepcion';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('validarRecepcion', () => {
  it('should_accept_reception_without_news_and_without_comment', () => {
    expect(validarRecepcion({ conNovedades: false })).toBeNull();
  });

  it('should_accept_missing_data_as_plain_reception', () => {
    expect(validarRecepcion(null)).toBeNull();
    expect(validarRecepcion(undefined)).toBeNull();
  });

  it('should_require_description_when_vehicle_arrived_with_news', () => {
    expect(validarRecepcion({ conNovedades: true, observacion: '   ' })).toBe(
      'Describe la novedad con la que llegó el vehículo.'
    );
  });

  it('should_accept_news_with_description', () => {
    expect(validarRecepcion({ conNovedades: true, observacion: 'Rayón en puerta trasera' })).toBeNull();
  });

  it('should_reject_observation_longer_than_500_characters', () => {
    expect(validarRecepcion({ conNovedades: false, observacion: 'a'.repeat(501) })).toBe(
      'La observación no puede superar los 500 caracteres.'
    );
  });
});

describe('textoObservacionRecepcion', () => {
  it('should_build_text_with_news_prefix', () => {
    expect(textoObservacionRecepcion({ conNovedades: true, observacion: ' Rayón ' })).toBe(
      '[RECEPCIÓN] Con novedades: Rayón'
    );
  });

  it('should_build_text_without_news_when_there_is_a_comment', () => {
    expect(textoObservacionRecepcion({ conNovedades: false, observacion: 'Llegó limpio' })).toBe(
      '[RECEPCIÓN] Sin novedades: Llegó limpio'
    );
  });

  it('should_return_null_when_there_is_nothing_to_register', () => {
    expect(textoObservacionRecepcion({ conNovedades: false, observacion: '  ' })).toBeNull();
    expect(textoObservacionRecepcion(null)).toBeNull();
  });
});

describe('validarMotivoCancelacion', () => {
  it('should_reject_missing_or_short_reason', () => {
    const msg = 'El motivo de la cancelación es obligatorio (mínimo 5 caracteres).';
    expect(validarMotivoCancelacion(undefined)).toBe(msg);
    expect(validarMotivoCancelacion(' abc ')).toBe(msg);
  });

  it('should_reject_reason_longer_than_500_characters', () => {
    expect(validarMotivoCancelacion('a'.repeat(501))).toBe('El motivo no puede superar los 500 caracteres.');
  });

  it('should_accept_valid_reason', () => {
    expect(validarMotivoCancelacion('Camión en panne en la ruta')).toBeNull();
  });
});
