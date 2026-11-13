import { describe, expect, it } from 'vitest';
import { origenSolicitud, origenVehiculo, rutaSolicitud, TEXTO_VARIOS_ORIGENES } from '@/lib/origenSolicitud';

const base = { sucursal: 101, sucursal_nombre: '15 NORTE', sucursal_destino_nombre: '15 NORTE', titulo_evento: null };

describe('origenSolicitud', () => {
  it('should_use_vehicle_origin_when_all_vehicles_leave_from_one_branch', () => {
    const s = { ...base, vehiculos: [{ sucursal_origen: 135, sucursal_origen_nombre: '3 ORIENTE BAIC' }] };
    expect(origenSolicitud(s)).toBe('3 ORIENTE BAIC');
  });

  it('should_return_varias_when_vehicles_leave_from_several_branches', () => {
    const s = {
      ...base,
      vehiculos: [
        { sucursal_origen: 135, sucursal_origen_nombre: '3 ORIENTE BAIC' },
        { sucursal_origen: 136, sucursal_origen_nombre: '3 ORIENTE JAC' },
      ],
    };
    expect(origenSolicitud(s)).toBe(TEXTO_VARIOS_ORIGENES);
  });

  it('should_fall_back_to_requesting_branch_when_origin_is_unknown', () => {
    expect(origenSolicitud({ ...base, vehiculos: [{ sucursal_origen: null }] })).toBe('15 NORTE');
    expect(origenSolicitud({ sucursal: 7 })).toBe('Sucursal 7');
  });
});

describe('rutaSolicitud', () => {
  it('should_build_route_from_vehicle_origin_to_destination', () => {
    const s = { ...base, vehiculos: [{ sucursal_origen: 135, sucursal_origen_nombre: '3 ORIENTE BAIC' }] };
    expect(rutaSolicitud(s)).toBe('3 ORIENTE BAIC → 15 NORTE');
  });

  it('should_use_event_title_when_there_is_no_destination_branch', () => {
    expect(rutaSolicitud({ ...base, sucursal_destino_nombre: null, titulo_evento: 'Feria' })).toBe('15 NORTE → Feria');
  });
});

describe('origenVehiculo', () => {
  it('should_return_vehicle_origin_when_known', () => {
    expect(origenVehiculo(base, { sucursal_origen: 135, sucursal_origen_nombre: '3 ORIENTE BAIC' })).toBe('3 ORIENTE BAIC');
  });

  it('should_fall_back_to_requesting_branch_when_vehicle_origin_is_unknown', () => {
    expect(origenVehiculo(base, null)).toBe('15 NORTE');
  });
});
