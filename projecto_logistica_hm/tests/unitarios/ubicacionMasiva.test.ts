import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MAX_CAMBIO_UBICACION,
  MOTIVO_EN_TRASLADO,
  MOTIVO_ENTREGADO,
  MOTIVO_NO_ENCONTRADO,
  MOTIVO_RESERVADO,
  MOTIVO_YA_EN_DESTINO,
  bloqueosDesdeVinculos,
  clasificarCambioUbicacion,
  esSeleccionableParaMover,
  validarCambioUbicacion,
} from '@/lib/ubicacionMasiva';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('validarCambioUbicacion', () => {
  it('should_accept_ids_and_valid_branch', () => {
    expect(validarCambioUbicacion(['v1'], 3)).toBeNull();
  });

  it('should_reject_empty_selection_too_many_or_invalid_branch', () => {
    expect(validarCambioUbicacion([], 3)).toBe('Selecciona al menos un vehículo.');
    expect(validarCambioUbicacion(Array(MAX_CAMBIO_UBICACION + 1).fill('v'), 3)).toMatch(/hasta 500/);
    expect(validarCambioUbicacion(['v1'], 0)).toBe('Elige la sucursal de destino.');
    expect(validarCambioUbicacion(['v1'], Number.NaN)).toBe('Elige la sucursal de destino.');
  });
});

describe('clasificarCambioUbicacion', () => {
  const vehiculos = [
    { id: 'v1', chasis: 'C1', ubicacion: 1 },
    { id: 'v2', chasis: 'C2', ubicacion: 3 },
    { id: 'v3', chasis: 'C3', ubicacion: null },
    { id: 'v4', chasis: 'C4', ubicacion: 2 },
  ];

  it('should_move_free_vehicles_and_report_blocked_already_there_and_missing_in_order', () => {
    const res = clasificarCambioUbicacion(['v1', 'v2', 'v3', 'v4', 'v9'], vehiculos, new Map([['v4', MOTIVO_RESERVADO]]), 3);
    expect(res.mover).toEqual([vehiculos[0], vehiculos[2]]);
    expect(res.omitidos).toEqual([
      { id: 'v2', chasis: 'C2', motivo: MOTIVO_YA_EN_DESTINO },
      { id: 'v4', chasis: 'C4', motivo: MOTIVO_RESERVADO },
      { id: 'v9', chasis: '', motivo: MOTIVO_NO_ENCONTRADO },
    ]);
  });

  it('should_return_nothing_to_move_when_all_are_blocked', () => {
    const res = clasificarCambioUbicacion(['v1'], vehiculos, new Map([['v1', MOTIVO_ENTREGADO]]), 3);
    expect(res.mover).toEqual([]);
  });
});

describe('bloqueosDesdeVinculos', () => {
  it('should_prioritize_delivered_then_reserved_then_transfer', () => {
    const res = bloqueosDesdeVinculos(
      [
        { vehiculo_id: 'a', disponibilidad: 'reservado' },
        { vehiculo_id: 'a', disponibilidad: 'vendido' },
        { vehiculo_id: 'b', disponibilidad: 'reservado' },
        { vehiculo_id: 'c', disponibilidad: 'liberado' },
      ],
      [{ vehiculo_id: 'b' }, { vehiculo_id: 'd' }]
    );
    expect(res).toEqual(
      new Map([
        ['d', MOTIVO_EN_TRASLADO],
        ['b', MOTIVO_RESERVADO],
        ['a', MOTIVO_ENTREGADO],
      ])
    );
  });

  it('should_ignore_released_links', () => {
    expect(bloqueosDesdeVinculos([{ vehiculo_id: 'c', disponibilidad: 'liberado' }], []).size).toBe(0);
  });
});

describe('esSeleccionableParaMover', () => {
  it('should_allow_only_free_vehicles_not_in_transit', () => {
    expect(esSeleccionableParaMover({ estado_disponibilidad: 'liberado', en_transito_hacia: null })).toBe(true);
    expect(esSeleccionableParaMover({ estado_disponibilidad: 'liberado', en_transito_hacia: 'Centro' })).toBe(false);
    expect(esSeleccionableParaMover({ estado_disponibilidad: 'reservado' })).toBe(false);
    expect(esSeleccionableParaMover({ estado_disponibilidad: 'vendido' })).toBe(false);
  });
});
