import { describe, expect, it } from 'vitest';
import { cuerpoFuncion, leerMigracion, normalizarSql } from '../mocks/sql';

/**
 * Contrato de la migración 20261020120000: la búsqueda de vehículos para
 * traslados internos excluye reservados y vendidos en SQL (antes con una lista
 * de ids en la URL), ordena por chasis y pagina.
 */

const NOMBRE = '20261020120000_fn_vehiculos_disponibles_traslado.sql';

describe('Migración fn_vehiculos_disponibles_traslado', () => {
  const sql = normalizarSql(leerMigracion('migrations', NOMBRE));
  const cuerpo = cuerpoFuncion(leerMigracion('migrations', NOMBRE), 'fn_vehiculos_disponibles_traslado');

  it('should_exclude_reserved_in_active_requests_and_sold_vehicles', () => {
    expect(cuerpo).toContain("sv.disponibilidad = 'reservado' and s.estado = any (public.fn_estados_reserva_activos())");
    expect(cuerpo).toContain("sv.disponibilidad = 'vendido'");
    expect(cuerpo.match(/not exists/g)).toHaveLength(2);
  });

  it('should_sanitize_search_term_like_the_app_when_filtering', () => {
    expect(cuerpo).toContain("regexp_replace(coalesce(p_busqueda, ''), '[^a-za-z0-9-]', '', 'g'), 30)");
    expect(cuerpo).toContain("v.patente ilike '%' || f.termino || '%'");
    expect(cuerpo).toContain("v.chasis ilike '%' || f.termino || '%'");
  });

  it('should_order_by_unique_chasis_and_clamp_page_size_when_paginating', () => {
    expect(cuerpo).toContain('order by c.chasis, c.id');
    expect(cuerpo).toContain('limit greatest(least(coalesce(p_limite, 12), 100), 1)');
    expect(cuerpo).toContain('offset greatest(coalesce(p_desplazamiento, 0), 0)');
    expect(cuerpo).toContain('count(*) over () as total');
  });

  it('should_be_security_definer_with_fixed_search_path_and_only_service_role', () => {
    expect(cuerpo).toContain('security definer set search_path = public, pg_temp');
    expect(sql).toContain(
      'revoke execute on function public.fn_vehiculos_disponibles_traslado(text, bigint, text, int, int) from public, anon, authenticated;'
    );
    expect(sql).toContain(
      'grant execute on function public.fn_vehiculos_disponibles_traslado(text, bigint, text, int, int) to service_role;'
    );
  });

  it('should_be_transactional_when_applied', () => {
    expect(sql.startsWith('begin;')).toBe(true);
    expect(sql.endsWith('commit;')).toBe(true);
  });

  it('should_drop_function_when_rolled_back', () => {
    const rollback = normalizarSql(leerMigracion('rollback', NOMBRE));
    expect(rollback).toContain(
      'drop function if exists public.fn_vehiculos_disponibles_traslado(text, bigint, text, int, int);'
    );
  });
});
