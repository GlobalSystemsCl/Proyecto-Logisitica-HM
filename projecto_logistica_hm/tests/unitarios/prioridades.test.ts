import { beforeEach, describe, expect, it, vi } from 'vitest';
import { colaDeSucursal, moverEnColaSucursal, ordenarPorPrioridad, posicionEnColaSucursal, resumenPrioridadPorSucursal, sucursalInicial } from '@/lib/prioridades';
import type { SolicitudLista } from '@/types/solicitud.types';

function sol(overrides: Partial<SolicitudLista>): SolicitudLista {
  return {
    id: 's',
    sucursal: 1,
    sucursal_nombre: 'Centro',
    sucursal_destino: 2,
    sucursal_destino_nombre: 'Norte',
    estado: 'aprobada',
    tipo_solicitud: 'venta',
    posicion_prioridad: null,
    ejecutivo_id: null,
    ejecutivo_nombre: null,
    jefe_local_id: null,
    jefe_local_nombre: null,
    logistica_id: null,
    logistica_nombre: null,
    fecha_creacion: null,
    fecha_tentativa_despacho: null,
    fecha_despacho: null,
    fecha_entrega: null,
    fecha_limite: null,
    fecha_confirmacion: null,
    fecha_inicio_transito: null,
    fecha_recepcion: null,
    fecha_entrega_cliente: null,
    motivo_cancelacion: null,
    direccion_evento: null,
    titulo_evento: null,
    sucursal_zona_id: null,
    vehiculos: [],
    ...overrides,
  } as SolicitudLista;
}

const DATOS = [
  sol({ id: 'a2', sucursal: 1, estado: 'priorizada', posicion_prioridad: 2 }),
  sol({ id: 'a1', sucursal: 1, estado: 'priorizada', posicion_prioridad: 1 }),
  sol({ id: 'a3', sucursal: 1, estado: 'aprobada' }),
  sol({ id: 'b1', sucursal: 2, estado: 'priorizada', posicion_prioridad: 1 }),
  sol({ id: 'b2', sucursal: 2, estado: 'aprobada' }),
  sol({ id: 'c1', sucursal: 1, estado: 'pendiente_aprobacion' }),
];

describe('colaDeSucursal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should_return_only_the_queue_of_the_selected_branch_sorted_by_position', () => {
    const res = colaDeSucursal(DATOS, 1);
    expect(res.cola.map((s) => s.id)).toEqual(['a1', 'a2']);
    expect(res.porPriorizar.map((s) => s.id)).toEqual(['a3']);
  });

  it('should_not_mix_branches_when_both_have_queues', () => {
    const res = colaDeSucursal(DATOS, 2);
    expect(res.cola.map((s) => s.id)).toEqual(['b1']);
    expect(res.porPriorizar.map((s) => s.id)).toEqual(['b2']);
  });

  it('should_return_empty_lists_when_no_branch_is_selected', () => {
    expect(colaDeSucursal(DATOS, null)).toEqual({ cola: [], porPriorizar: [] });
  });

  it('should_ignore_prioritized_rows_without_position', () => {
    const res = colaDeSucursal([sol({ id: 'x', estado: 'priorizada', posicion_prioridad: null })], 1);
    expect(res.cola).toEqual([]);
  });
});

describe('resumenPrioridadPorSucursal', () => {
  it('should_count_queue_and_pending_per_branch', () => {
    const res = resumenPrioridadPorSucursal(DATOS, [
      { id: 1, nombre: 'Centro' },
      { id: 2, nombre: 'Norte' },
      { id: 3, nombre: null },
    ]);
    expect(res).toEqual([
      { id: 1, nombre: 'Centro', enCola: 2, porPriorizar: 1 },
      { id: 2, nombre: 'Norte', enCola: 1, porPriorizar: 1 },
      { id: 3, nombre: 'Sucursal 3', enCola: 0, porPriorizar: 0 },
    ]);
  });
});

describe('sucursalInicial', () => {
  it('should_pick_first_branch_with_pending_to_prioritize', () => {
    expect(
      sucursalInicial([
        { id: 1, nombre: 'A', enCola: 3, porPriorizar: 0 },
        { id: 2, nombre: 'B', enCola: 0, porPriorizar: 2 },
      ])
    ).toBe(2);
  });

  it('should_pick_first_branch_with_queue_when_nothing_is_pending', () => {
    expect(
      sucursalInicial([
        { id: 1, nombre: 'A', enCola: 0, porPriorizar: 0 },
        { id: 2, nombre: 'B', enCola: 1, porPriorizar: 0 },
      ])
    ).toBe(2);
  });

  it('should_pick_first_branch_when_all_are_empty', () => {
    expect(sucursalInicial([{ id: 5, nombre: 'A', enCola: 0, porPriorizar: 0 }])).toBe(5);
  });

  it('should_return_null_when_there_are_no_branches', () => {
    expect(sucursalInicial([])).toBeNull();
  });
});

describe('posicionEnColaSucursal', () => {
  const sucursales: Record<string, number> = { a: 135, b: 135, c: 101, nueva: 135, d: 135 };
  const de = (id: string) => sucursales[id];

  it('should_return_1_when_card_is_dropped_first', () => {
    expect(posicionEnColaSucursal(['nueva', 'a', 'b'], 'nueva', de)).toBe(1);
  });

  it('should_return_drop_position_without_counting_itself_when_dropped_in_the_middle', () => {
    // Soltada delante de "b": queda 2.ª, no 3.ª.
    expect(posicionEnColaSucursal(['a', 'nueva', 'b'], 'nueva', de)).toBe(2);
  });

  it('should_ignore_other_branches_when_queue_is_mixed', () => {
    expect(posicionEnColaSucursal(['c', 'a', 'c', 'nueva', 'd'], 'nueva', de)).toBe(2);
  });

  it('should_return_null_when_id_is_not_in_queue', () => {
    expect(posicionEnColaSucursal(['a'], 'nueva', de)).toBeNull();
  });
});

describe('ordenarPorPrioridad', () => {
  it('should_sort_by_queue_position_then_by_deadline', () => {
    const lista = [
      { id: 'c', posicion_prioridad: 2, fecha_limite: '2026-11-20' },
      { id: 'a', posicion_prioridad: 1, fecha_limite: '2026-12-01' },
      { id: 'b', posicion_prioridad: 1, fecha_limite: '2026-11-15' },
    ];
    expect(ordenarPorPrioridad(lista).map((s) => s.id)).toEqual(['b', 'a', 'c']);
  });

  it('should_put_items_without_position_or_deadline_last_and_not_mutate_input', () => {
    const lista = [
      { id: 'x', posicion_prioridad: null, fecha_limite: null },
      { id: 'y', posicion_prioridad: 3, fecha_limite: null },
    ];
    expect(ordenarPorPrioridad(lista).map((s) => s.id)).toEqual(['y', 'x']);
    expect(lista[0].id).toBe('x');
  });
});

describe('moverEnColaSucursal', () => {
  const suc: Record<string, number> = { a: 135, b: 135, x: 101, c: 135 };
  const de = (id: string) => suc[id];

  it('should_swap_with_previous_item_of_same_branch_when_moving_up', () => {
    expect(moverEnColaSucursal(['a', 'x', 'b', 'c'], 'b', -1, de)).toEqual(['b', 'x', 'a', 'c']);
  });

  it('should_swap_with_next_item_when_moving_down', () => {
    expect(moverEnColaSucursal(['a', 'b', 'c'], 'a', 1, de)).toEqual(['b', 'a', 'c']);
  });

  it('should_return_null_at_the_edges_or_when_missing', () => {
    expect(moverEnColaSucursal(['a', 'b'], 'a', -1, de)).toBeNull();
    expect(moverEnColaSucursal(['a', 'b'], 'b', 1, de)).toBeNull();
    expect(moverEnColaSucursal(['a'], 'z', 1, de)).toBeNull();
  });
});
