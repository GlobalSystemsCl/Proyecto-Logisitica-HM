import { beforeEach, describe, expect, it, vi } from 'vitest';
import { accionCambioVehiculo, diferenciasVehiculo, resumenVehiculo } from '@/lib/auditoriaVehiculo';

const base = {
  id: 'veh-1',
  chasis: 'WBA3A5C50FF123456',
  patente: 'ABCD-12',
  marca: 'Toyota',
  modelo: 'Corolla',
  anio: 2024,
  color: 'Negro',
  precio: 1000,
  ubicacion: 1,
  created_at: '2026-01-01',
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('diferenciasVehiculo', () => {
  it('should_return_only_changed_fields', () => {
    expect(diferenciasVehiculo(base, { ...base, ubicacion: 3, precio: 1200 })).toEqual({
      anterior: { precio: 1000, ubicacion: 1 },
      nuevo: { precio: 1200, ubicacion: 3 },
    });
  });

  it('should_return_null_when_nothing_relevant_changed', () => {
    const conOtroCampo = { ...base, created_at: '2026-02-02' };
    expect(diferenciasVehiculo(base, conOtroCampo)).toBeNull();
  });

  it('should_treat_empty_string_and_undefined_as_null', () => {
    expect(diferenciasVehiculo({ ...base, color: '' }, { ...base, color: null })).toBeNull();
    expect(diferenciasVehiculo({ ...base, patente: 'ABCD-12' }, { ...base, patente: undefined })).toEqual({
      anterior: { patente: 'ABCD-12' },
      nuevo: { patente: null },
    });
  });

  it('should_return_null_when_a_version_is_missing', () => {
    expect(diferenciasVehiculo(null, base)).toBeNull();
    expect(diferenciasVehiculo(base, undefined)).toBeNull();
  });
});

describe('accionCambioVehiculo', () => {
  it('should_highlight_location_changes', () => {
    expect(accionCambioVehiculo({ anterior: { ubicacion: 1 }, nuevo: { ubicacion: null } })).toBe('cambio_ubicacion');
  });

  it('should_return_edicion_for_other_changes', () => {
    expect(accionCambioVehiculo({ anterior: { precio: 1 }, nuevo: { precio: 2 } })).toBe('edicion');
  });
});

describe('resumenVehiculo', () => {
  it('should_keep_only_audited_fields', () => {
    const res = resumenVehiculo(base);
    expect(res).toMatchObject({ chasis: 'WBA3A5C50FF123456', ubicacion: 1 });
    expect(res).not.toHaveProperty('id');
    expect(res).not.toHaveProperty('created_at');
  });

  it('should_return_empty_object_when_vehicle_is_missing', () => {
    expect(resumenVehiculo(null)).toEqual({});
  });
});
