import { describe, expect, it } from 'vitest';
import { coincideFiltroZona, FILTRO_SIN_ZONA, resumenSinZona } from '@/lib/sucursalesSinZona';

describe('coincideFiltroZona', () => {
  it('should_accept_every_branch_when_filter_is_todas', () => {
    expect(coincideFiltroZona(null, 'todas')).toBe(true);
    expect(coincideFiltroZona(3, 'todas')).toBe(true);
  });

  it('should_accept_only_branches_without_zone_when_filter_is_sin_zona', () => {
    expect(coincideFiltroZona(null, FILTRO_SIN_ZONA)).toBe(true);
    expect(coincideFiltroZona(undefined, FILTRO_SIN_ZONA)).toBe(true);
    expect(coincideFiltroZona(2, FILTRO_SIN_ZONA)).toBe(false);
  });

  it('should_match_exact_zone_when_filter_is_a_zone_id', () => {
    expect(coincideFiltroZona(2, 2)).toBe(true);
    expect(coincideFiltroZona(1, 2)).toBe(false);
    expect(coincideFiltroZona(null, 2)).toBe(false);
  });
});

describe('resumenSinZona', () => {
  const sucursales = [
    { id: 101, zona_id: null },
    { id: 102, zona_id: null },
    { id: 135, zona_id: 1 },
    { id: 140 },
  ];

  it('should_count_branches_without_zone_and_list_those_with_open_requests', () => {
    const res = resumenSinZona(sucursales, [
      { sucursal: 101, estado: 'priorizada' },
      { sucursal: 101, estado: 'aprobada' },
      { sucursal: 102, estado: 'finalizada' },
      { sucursal: 135, estado: 'priorizada' },
    ]);
    expect(res).toEqual({ total: 3, conSolicitudesAbiertas: [101] });
  });

  it('should_ignore_requests_that_no_longer_need_logistica', () => {
    const res = resumenSinZona(sucursales, [
      { sucursal: 140, estado: 'pendiente_aprobacion' },
      { sucursal: 140, estado: 'entregada' },
      { sucursal: 102, estado: 'cancelada' },
    ]);
    expect(res.conSolicitudesAbiertas).toEqual([]);
  });

  it('should_return_zero_when_every_branch_has_a_zone', () => {
    expect(resumenSinZona([{ id: 1, zona_id: 1 }], [])).toEqual({ total: 0, conSolicitudesAbiertas: [] });
  });
});
