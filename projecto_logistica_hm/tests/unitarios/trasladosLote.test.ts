import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_TRASLADOS_POR_LOTE, mensajeResultadoLote, validarLoteTraslados } from '@/lib/trasladosLote';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('validarLoteTraslados', () => {
  it('should_accept_one_or_many_vehicles_up_to_the_maximum', () => {
    expect(validarLoteTraslados(['v1'])).toBeNull();
    expect(validarLoteTraslados(Array.from({ length: MAX_TRASLADOS_POR_LOTE }, (_, i) => `v${i}`))).toBeNull();
  });

  it('should_reject_empty_selection', () => {
    expect(validarLoteTraslados([])).toBe('Selecciona al menos un vehículo para trasladar.');
    expect(validarLoteTraslados([''])).toBe('Selecciona al menos un vehículo para trasladar.');
  });

  it('should_reject_more_than_the_maximum_counting_unique_ids', () => {
    const ids = Array.from({ length: MAX_TRASLADOS_POR_LOTE + 1 }, (_, i) => `v${i}`);
    expect(validarLoteTraslados(ids)).toContain(`hasta ${MAX_TRASLADOS_POR_LOTE}`);
    expect(validarLoteTraslados(['v1', 'v1'])).toBeNull();
  });
});

describe('mensajeResultadoLote', () => {
  it('should_report_created_transfers', () => {
    expect(mensajeResultadoLote(1, [], {})).toBe('Se creó 1 traslado.');
    expect(mensajeResultadoLote(3, [], {})).toBe('Se crearon 3 traslados.');
  });

  it('should_list_skipped_vehicles_with_reason', () => {
    expect(mensajeResultadoLote(2, [{ vehiculoId: 'v9', error: 'Ya está en un traslado.' }], { v9: 'CH9' })).toBe(
      'Se crearon 2 traslados. No se crearon 1: CH9: Ya está en un traslado.'
    );
  });

  it('should_limit_detail_to_five_and_count_the_rest', () => {
    const omitidos = Array.from({ length: 7 }, (_, i) => ({ vehiculoId: `v${i}`, error: 'x' }));
    const msg = mensajeResultadoLote(0, omitidos, {});
    expect(msg.startsWith('No se crearon 7:')).toBe(true);
    expect(msg.endsWith('· y 2 más')).toBe(true);
  });
});
