import { describe, expect, it } from 'vitest';
import { etiquetaVehiculo, nombreVehiculo, nombreVehiculoConAnio, DESCRIPCION_DISPONIBILIDAD, etiquetaDisponibilidad } from '@/lib/vehiculo';
import type { VehiculoAsociado } from '@/types/solicitud.types';

function vehiculo(overrides: Partial<VehiculoAsociado> = {}): VehiculoAsociado {
  return {
    solicitud_vehiculo_id: 'sv-1',
    disponibilidad: 'reservado',
    patente: 'ABCD12',
    chasis: 'CHASIS12345678901',
    marca: 'Toyota',
    modelo: 'Etios',
    anio: 2020,
    color: 'Blanco',
    ...overrides,
  };
}

describe('nombreVehiculo', () => {
  it('should_join_marca_and_modelo', () => {
    expect(nombreVehiculo(vehiculo())).toBe('Toyota Etios');
  });

  it('should_fall_back_to_chasis_when_marca_and_modelo_are_empty', () => {
    expect(nombreVehiculo(vehiculo({ marca: '', modelo: '' }))).toBe('CHASIS12345678901');
  });

  it('should_trim_and_ignore_blank_parts', () => {
    expect(nombreVehiculo(vehiculo({ marca: '  Toyota ', modelo: '  ' }))).toBe('Toyota');
  });
});

describe('nombreVehiculoConAnio', () => {
  it('should_append_the_year', () => {
    expect(nombreVehiculoConAnio(vehiculo())).toBe('Toyota Etios · 2020');
  });

  it('should_omit_the_year_when_it_is_not_positive', () => {
    expect(nombreVehiculoConAnio(vehiculo({ anio: 0 }))).toBe('Toyota Etios');
  });

  it('should_fall_back_to_chasis_when_marca_and_modelo_are_missing', () => {
    expect(nombreVehiculoConAnio(vehiculo({ marca: '', modelo: '', anio: 2019 }))).toBe(
      'CHASIS12345678901 · 2019'
    );
  });
});

describe('etiquetaVehiculo', () => {
  it('should_prefix_the_patente_when_present', () => {
    expect(etiquetaVehiculo(vehiculo())).toBe('ABCD12 · Toyota Etios');
  });

  it('should_ignore_a_blank_patente', () => {
    expect(etiquetaVehiculo(vehiculo({ patente: '   ' }))).toBe('Toyota Etios');
    expect(etiquetaVehiculo(vehiculo({ patente: '' }))).toBe('Toyota Etios');
  });

  it('should_handle_a_vehicle_without_patente', () => {
    expect(etiquetaVehiculo(vehiculo({ patente: null }))).toBe('Toyota Etios');
  });

  it('should_return_null_when_there_is_nothing_printable', () => {
    expect(etiquetaVehiculo(vehiculo({ patente: null, marca: '', modelo: '', chasis: '' }))).toBe(
      null
    );
  });
});

describe('etiquetaDisponibilidad', () => {
  it('should_show_disponible_when_db_state_is_liberado', () => {
    expect(etiquetaDisponibilidad('liberado')).toBe('Disponible');
  });

  it('should_show_reservado_and_vendido_labels', () => {
    expect(etiquetaDisponibilidad('reservado')).toBe('Reservado');
    expect(etiquetaDisponibilidad('vendido')).toBe('Vendido');
    expect(DESCRIPCION_DISPONIBILIDAD.vendido).toContain('entregado al cliente');
  });

  it('should_return_dash_when_state_is_missing', () => {
    expect(etiquetaDisponibilidad(null)).toBe('—');
    expect(etiquetaDisponibilidad(undefined)).toBe('—');
  });

  it('should_return_raw_value_when_state_is_unknown', () => {
    expect(etiquetaDisponibilidad('en_revision')).toBe('en_revision');
  });
});
