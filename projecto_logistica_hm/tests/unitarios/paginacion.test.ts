import { beforeEach, describe, expect, it, vi } from 'vitest';
import { obtenerTodasLasFilas, type ConsultaPaginable } from '@/lib/paginacion';

/** Consulta falsa que sirve `filas` en páginas según el rango pedido. */
function consultaFalsa(filas: number[], fallaEnPagina?: number) {
  const rangos: Array<[number, number]> = [];
  const consulta: ConsultaPaginable = {
    range: (desde, hasta) => {
      rangos.push([desde, hasta]);
      if (fallaEnPagina !== undefined && rangos.length === fallaEnPagina) {
        return Promise.resolve({ data: null, error: { message: 'boom' } });
      }
      return Promise.resolve({ data: filas.slice(desde, hasta + 1), error: null });
    },
  };
  return { consulta, rangos };
}

describe('obtenerTodasLasFilas', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should_return_all_rows_when_there_are_more_than_one_page', async () => {
    const filas = Array.from({ length: 2261 }, (_, i) => i);
    const { consulta, rangos } = consultaFalsa(filas);

    const res = await obtenerTodasLasFilas<number>(consulta, vi.fn());

    expect(res).toHaveLength(2261);
    expect(res?.[2260]).toBe(2260);
    expect(rangos).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
  });

  it('should_request_one_extra_page_when_total_is_exact_multiple', async () => {
    const { consulta, rangos } = consultaFalsa(Array.from({ length: 4 }, (_, i) => i));

    const res = await obtenerTodasLasFilas<number>(consulta, vi.fn(), 2);

    expect(res).toEqual([0, 1, 2, 3]);
    expect(rangos).toHaveLength(3);
  });

  it('should_return_empty_list_when_query_has_no_rows', async () => {
    const { consulta } = consultaFalsa([]);
    expect(await obtenerTodasLasFilas(consulta, vi.fn())).toEqual([]);
  });

  it('should_return_null_and_report_when_a_page_fails', async () => {
    const onError = vi.fn();
    const { consulta } = consultaFalsa(Array.from({ length: 5 }, (_, i) => i), 2);

    const res = await obtenerTodasLasFilas(consulta, onError, 2);

    expect(res).toBeNull();
    expect(onError).toHaveBeenCalledWith({ message: 'boom' });
  });
});
