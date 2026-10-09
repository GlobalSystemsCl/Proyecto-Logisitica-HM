import { describe, expect, it } from 'vitest';
import {
  FILTRO_EN_VIAJE,
  FILTRO_TODAS,
  FILTROS_INICIALES,
  aFechaLocal,
  coincideBusqueda,
  coincideDisponibilidad,
  coincideRangoFecha,
  coincideUbicacion,
  contarPorDisponibilidad,
  filtrarVehiculos,
  hayFiltrosActivos,
  type FiltrosVehiculos,
  FILTRO_EN_TRANSITO,
} from '@/lib/filtrosVehiculos';
import type { VehiculoConDisponibilidad } from '@/types/vehiculo.types';

function vehiculo(overrides: Partial<VehiculoConDisponibilidad> = {}): VehiculoConDisponibilidad {
  return {
    id: 'veh-1',
    chasis: '1HGCM82633A004352',
    patente: 'ABCD-12',
    marca: 'Toyota',
    modelo: 'Corolla',
    anio: 2020,
    color: null,
    precio: 100,
    ubicacion: 1,
    ubicacion_nombre: 'Centro',
    estado_disponibilidad: 'liberado',
    solicitud_id: null,
    created_at: '2026-03-15T12:00:00.000Z',
    updated_at: '2026-03-15T12:00:00.000Z',
    ...overrides,
  };
}

function filtros(overrides: Partial<FiltrosVehiculos> = {}): FiltrosVehiculos {
  return { ...FILTROS_INICIALES, ...overrides };
}

describe('aFechaLocal', () => {
  it('should_return_calendar_date_in_local_timezone', () => {
    expect(aFechaLocal('2026-03-15T12:00:00.000Z')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(aFechaLocal('2026-03-15T12:00:00.000Z')).toBe('2026-03-15');
  });

  it('should_return_null_when_value_is_empty', () => {
    expect(aFechaLocal('')).toBeNull();
    expect(aFechaLocal(null)).toBeNull();
    expect(aFechaLocal(undefined)).toBeNull();
  });

  it('should_return_null_when_value_is_not_a_valid_date', () => {
    expect(aFechaLocal('no-es-fecha')).toBeNull();
  });
});

describe('coincideRangoFecha', () => {
  it('should_return_true_when_no_bounds_are_set', () => {
    expect(coincideRangoFecha('2026-03-15', '', '')).toBe(true);
  });

  it('should_include_dates_equal_to_the_lower_bound', () => {
    expect(coincideRangoFecha('2026-03-15', '2026-03-15', '')).toBe(true);
  });

  it('should_include_dates_equal_to_the_upper_bound', () => {
    expect(coincideRangoFecha('2026-03-15', '', '2026-03-15')).toBe(true);
  });

  it('should_reject_dates_before_the_lower_bound', () => {
    expect(coincideRangoFecha('2026-03-14', '2026-03-15', '')).toBe(false);
  });

  it('should_reject_dates_after_the_upper_bound', () => {
    expect(coincideRangoFecha('2026-03-16', '', '2026-03-15')).toBe(false);
  });

  it('should_reject_unparseable_dates_when_a_bound_is_set', () => {
    expect(coincideRangoFecha(null, '2026-03-01', '2026-03-31')).toBe(false);
  });
});

describe('coincideUbicacion', () => {
  it('should_return_true_when_filter_is_todas', () => {
    expect(coincideUbicacion(null, FILTRO_TODAS)).toBe(true);
    expect(coincideUbicacion(7, FILTRO_TODAS)).toBe(true);
  });

  it('should_return_true_when_filter_is_en_viaje_and_vehiculo_has_no_sucursal', () => {
    expect(coincideUbicacion(null, FILTRO_EN_VIAJE)).toBe(true);
  });

  it('should_return_false_when_filter_is_en_viaje_and_vehiculo_has_sucursal', () => {
    expect(coincideUbicacion(3, FILTRO_EN_VIAJE)).toBe(false);
  });

  it('should_return_true_when_vehiculo_belongs_to_selected_sucursal', () => {
    expect(coincideUbicacion(3, '3')).toBe(true);
  });

  it('should_return_false_when_vehiculo_belongs_to_another_sucursal', () => {
    expect(coincideUbicacion(3, '4')).toBe(false);
  });

  it('should_return_false_when_sucursal_filter_is_not_a_number', () => {
    expect(coincideUbicacion(3, 'abc')).toBe(false);
  });
});

describe('coincideDisponibilidad', () => {
  it('should_return_true_when_filter_is_todas', () => {
    expect(coincideDisponibilidad('vendido', FILTRO_TODAS)).toBe(true);
  });

  it('should_return_true_when_state_matches_the_filter', () => {
    expect(coincideDisponibilidad('reservado', 'reservado')).toBe(true);
  });

  it('should_return_false_when_state_does_not_match_the_filter', () => {
    expect(coincideDisponibilidad('liberado', 'reservado')).toBe(false);
  });
});

describe('coincideBusqueda', () => {
  it('should_return_true_when_search_term_is_empty', () => {
    expect(coincideBusqueda(vehiculo(), '   ')).toBe(true);
  });

  it('should_match_by_chasis', () => {
    expect(coincideBusqueda(vehiculo(), '1hgcm826')).toBe(true);
  });

  it('should_match_by_patente', () => {
    expect(coincideBusqueda(vehiculo(), 'abcd-12')).toBe(true);
  });

  it('should_match_by_marca', () => {
    expect(coincideBusqueda(vehiculo(), 'toyota')).toBe(true);
  });

  it('should_match_by_modelo', () => {
    expect(coincideBusqueda(vehiculo(), 'corolla')).toBe(true);
  });

  it('should_return_false_when_nothing_matches', () => {
    expect(coincideBusqueda(vehiculo(), 'kia')).toBe(false);
  });

  it('should_return_false_when_search_term_matches_only_the_null_patente', () => {
    expect(coincideBusqueda(vehiculo({ patente: null }), 'abcd')).toBe(false);
  });
});

describe('filtrarVehiculos', () => {
  const inventario = [
    vehiculo({ id: 'a', marca: 'Toyota', ubicacion: 1 }),
    vehiculo({ id: 'b', marca: 'Kia', ubicacion: 2 }),
    vehiculo({ id: 'c', marca: 'Toyota', ubicacion: null }),
  ];

  it('should_return_all_vehicles_when_no_filter_is_active', () => {
    expect(filtrarVehiculos(inventario, filtros())).toHaveLength(3);
  });

  it('should_filter_by_marca', () => {
    expect(filtrarVehiculos(inventario, filtros({ marca: 'Toyota' })).map((v) => v.id)).toEqual(['a', 'c']);
  });

  it('should_filter_by_sucursal', () => {
    expect(filtrarVehiculos(inventario, filtros({ ubicacion: '2' })).map((v) => v.id)).toEqual(['b']);
  });

  it('should_filter_by_en_viaje_including_vehicles_without_sucursal', () => {
    expect(filtrarVehiculos(inventario, filtros({ ubicacion: FILTRO_EN_VIAJE })).map((v) => v.id)).toEqual(['c']);
  });

  it('should_filter_by_registro_date_range', () => {
    const conFechas = [
      vehiculo({ id: 'viejo', created_at: '2026-01-10T12:00:00.000Z' }),
      vehiculo({ id: 'medio', created_at: '2026-03-15T12:00:00.000Z' }),
      vehiculo({ id: 'nuevo', created_at: '2026-06-20T12:00:00.000Z' }),
    ];
    const f = filtros({ fechaDesde: '2026-03-01', fechaHasta: '2026-03-31' });
    expect(filtrarVehiculos(conFechas, f).map((v) => v.id)).toEqual(['medio']);
  });

  it('should_combine_marca_sucursal_and_date_filters', () => {
    const conFechas = [
      vehiculo({ id: 'a', marca: 'Toyota', ubicacion: 1, created_at: '2026-06-20T12:00:00.000Z' }),
      vehiculo({ id: 'b', marca: 'Toyota', ubicacion: 1, created_at: '2026-01-10T12:00:00.000Z' }),
      vehiculo({ id: 'c', marca: 'Kia', ubicacion: 1, created_at: '2026-06-20T12:00:00.000Z' }),
    ];
    const f = filtros({ marca: 'Toyota', ubicacion: '1', fechaDesde: '2026-06-01' });
    expect(filtrarVehiculos(conFechas, f).map((v) => v.id)).toEqual(['a']);
  });

  it('should_return_empty_array_when_no_vehicle_matches', () => {
    expect(filtrarVehiculos(inventario, filtros({ marca: 'Ford' }))).toEqual([]);
  });

  it('should_not_mutate_the_source_list', () => {
    const original = [...inventario];
    filtrarVehiculos(inventario, filtros({ marca: 'Toyota' }));
    expect(inventario).toEqual(original);
  });
});

describe('contarPorDisponibilidad', () => {
  it('should_return_zeros_for_an_empty_list', () => {
    expect(contarPorDisponibilidad([])).toEqual({ total: 0, reservados: 0, vendidos: 0, disponibles: 0 });
  });

  it('should_split_vehicles_by_state', () => {
    const lista = [
      vehiculo({ id: 'a', estado_disponibilidad: 'liberado' }),
      vehiculo({ id: 'b', estado_disponibilidad: 'reservado' }),
      vehiculo({ id: 'c', estado_disponibilidad: 'reservado' }),
      vehiculo({ id: 'd', estado_disponibilidad: 'vendido' }),
    ];
    expect(contarPorDisponibilidad(lista)).toEqual({
      total: 4,
      reservados: 2,
      vendidos: 1,
      disponibles: 1,
    });
  });
});

describe('hayFiltrosActivos', () => {
  it('should_return_false_for_the_initial_filters', () => {
    expect(hayFiltrosActivos(FILTROS_INICIALES)).toBe(false);
  });

  it('should_return_true_when_search_term_is_set', () => {
    expect(hayFiltrosActivos(filtros({ busqueda: 'toyota' }))).toBe(true);
  });

  it('should_return_true_when_ubicacion_is_set', () => {
    expect(hayFiltrosActivos(filtros({ ubicacion: FILTRO_EN_VIAJE }))).toBe(true);
  });

  it('should_return_true_when_only_a_date_bound_is_set', () => {
    expect(hayFiltrosActivos(filtros({ fechaHasta: '2026-03-31' }))).toBe(true);
  });
});

describe('filtro en tránsito (R2)', () => {
  it('should_match_only_vehicles_with_transit_destination', () => {
    expect(coincideDisponibilidad('reservado', FILTRO_EN_TRANSITO, 'Norte')).toBe(true);
    expect(coincideDisponibilidad('reservado', FILTRO_EN_TRANSITO, null)).toBe(false);
  });

  it('should_keep_previous_behaviour_for_other_filters', () => {
    expect(coincideDisponibilidad('reservado', 'reservado', 'Norte')).toBe(true);
    expect(coincideDisponibilidad('liberado', 'todas')).toBe(true);
  });
});
