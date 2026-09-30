import { describe, expect, it } from 'vitest';
import {
  UMBRAL_ATENCION,
  nombreSucursal,
  ordenarPorDisponibilidad,
  resumenSlots,
  slotsLibres,
  textoSlots,
  type SlotSucursalResumen,
} from '@/lib/slots';

function sucursal(overrides: Partial<SlotSucursalResumen> = {}): SlotSucursalResumen {
  return {
    nombre: 'Sucursal Norte',
    slots: 10,
    slots_ocupados: 0,
    slots_reservados: 0,
    ...overrides,
  };
}

describe('slotsLibres', () => {
  it('should_restar_ocupados_y_reservados_a_la_capacidad', () => {
    expect(slotsLibres(sucursal({ slots: 10, slots_ocupados: 3, slots_reservados: 2 }))).toBe(5);
  });

  it('should_devolver_cero_cuando_no_hay_slots_libres', () => {
    expect(slotsLibres(sucursal({ slots: 10, slots_ocupados: 7, slots_reservados: 3 }))).toBe(0);
  });

  it('should_never_return_negative_values', () => {
    expect(slotsLibres(sucursal({ slots: 5, slots_ocupados: 9, slots_reservados: 4 }))).toBe(0);
  });

  it('should_normalize_null_undefined_and_non_finite_to_zero', () => {
    expect(slotsLibres(sucursal({ slots: null, slots_ocupados: null, slots_reservados: null }))).toBe(0);
    expect(slotsLibres(sucursal({ slots: undefined, slots_ocupados: 2 }))).toBe(0);
    expect(Number.isNaN(slotsLibres(sucursal({ slots: NaN, slots_ocupados: NaN })))).toBe(false);
    expect(Number.isNaN(slotsLibres(sucursal({ slots: Infinity, slots_ocupados: 0 })))).toBe(false);
  });
});

describe('nombreSucursal', () => {
  it('should_return_the_trimmed_name', () => {
    expect(nombreSucursal(sucursal({ nombre: '  Centro  ' }))).toBe('Centro');
  });

  it('should_fallback_when_name_is_null_or_blank', () => {
    expect(nombreSucursal(sucursal({ nombre: null }))).toBe('Sucursal sin nombre');
    expect(nombreSucursal(sucursal({ nombre: '   ' }))).toBe('Sucursal sin nombre');
  });
});

describe('textoSlots', () => {
  it('should_format_free_over_total', () => {
    expect(textoSlots(sucursal({ slots: 12, slots_ocupados: 4, slots_reservados: 1 }))).toBe('7/12');
  });

  it('should_format_zero_when_capacity_is_null', () => {
    expect(textoSlots(sucursal({ slots: null }))).toBe('0/0');
  });
});

describe('resumenSlots', () => {
  it('should_sum_libres_total_and_ocupados_across_branches', () => {
    const res = resumenSlots([
      sucursal({ nombre: 'A', slots: 10, slots_ocupados: 3, slots_reservados: 1 }),
      sucursal({ nombre: 'B', slots: 5, slots_ocupados: 5, slots_reservados: 0 }),
    ]);
    expect(res.libres).toBe(6);
    expect(res.total).toBe(15);
    expect(res.ocupados).toBe(9);
    expect(res.porcentajeOcupacion).toBe(60);
  });

  it('should_be_critico_when_no_branch_has_free_slots', () => {
    const res = resumenSlots([
      sucursal({ nombre: 'A', slots: 4, slots_ocupados: 4 }),
      sucursal({ nombre: 'B', slots: 2, slots_ocupados: 1, slots_reservados: 1 }),
    ]);
    expect(res.criticidad).toBe('critico');
    expect(res.libres).toBe(0);
    expect(res.sucursalesCriticas).toEqual(['A', 'B']);
  });

  it('should_be_atencion_when_free_ratio_is_below_threshold', () => {
    const res = resumenSlots([sucursal({ slots: 100, slots_ocupados: 85, slots_reservados: 10 })]);
    expect(res.criticidad).toBe('atencion');
    expect(res.libres).toBe(5);
  });

  it('should_be_ok_when_free_ratio_reaches_the_threshold', () => {
    const libres = Math.round(10 * UMBRAL_ATENCION);
    const res = resumenSlots([sucursal({ slots: 10, slots_ocupados: 10 - libres })]);
    expect(res.criticidad).toBe('ok');
  });

  it('should_be_ok_and_zeroed_when_there_are_no_branches', () => {
    const res = resumenSlots([]);
    expect(res).toEqual({
      libres: 0,
      total: 0,
      ocupados: 0,
      criticidad: 'ok',
      porcentajeOcupacion: 0,
      sucursalesCriticas: [],
    });
  });

  it('should_not_throw_for_null_or_undefined', () => {
    expect(resumenSlots(null).libres).toBe(0);
    expect(resumenSlots(undefined).total).toBe(0);
  });

  it('should_not_count_zero_capacity_branches_as_critical', () => {
    const res = resumenSlots([sucursal({ nombre: 'A', slots: 0 })]);
    expect(res.criticidad).toBe('ok');
    expect(res.sucursalesCriticas).toEqual(['A']);
  });
});

describe('ordenarPorDisponibilidad', () => {
  it('should_sort_ascending_by_free_slots', () => {
    const res = ordenarPorDisponibilidad([
      sucursal({ nombre: 'A', slots: 10, slots_ocupados: 1 }),
      sucursal({ nombre: 'B', slots: 10, slots_ocupados: 9 }),
      sucursal({ nombre: 'C', slots: 10, slots_ocupados: 5 }),
    ]);
    expect(res.map((s) => s.nombre)).toEqual(['B', 'C', 'A']);
  });

  it('should_not_mutate_the_input', () => {
    const input = [
      sucursal({ nombre: 'A', slots: 10, slots_ocupados: 1 }),
      sucursal({ nombre: 'B', slots: 10, slots_ocupados: 9 }),
    ];
    ordenarPorDisponibilidad(input);
    expect(input.map((s) => s.nombre)).toEqual(['A', 'B']);
  });
});
