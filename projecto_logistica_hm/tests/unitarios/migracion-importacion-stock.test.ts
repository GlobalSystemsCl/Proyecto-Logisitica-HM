import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cuerpoFuncion, leerMigracion, normalizarSql } from '../mocks/sql';

/**
 * Contrato de la migración 20261120120000: registro de importaciones de stock
 * y su reversión.
 */

const NOMBRE = '20261120120000_importacion_stock.sql';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Migración importación de stock', () => {
  const original = leerMigracion('migrations', NOMBRE);
  const sql = normalizarSql(original);
  const cuerpo = normalizarSql(cuerpoFuncion(original, 'fn_revertir_importacion_stock'));

  it('should_create_import_log_only_for_service_role', () => {
    expect(sql).toContain('create table if not exists public.importacion_stock (');
    expect(sql).toContain('alter table public.importacion_stock enable row level security;');
    expect(sql).toContain('revoke all on table public.importacion_stock from anon, authenticated;');
  });

  it('should_link_each_vehicle_to_its_import_keeping_vehicles_if_log_is_deleted', () => {
    expect(sql).toContain('alter table public.vehiculo add column if not exists importacion_id uuid;');
    expect(sql).toContain('references public.importacion_stock (id) on delete set null;');
  });

  it('should_delete_only_vehicles_not_used_in_requests_or_transfers', () => {
    expect(cuerpo).toContain('where v.importacion_id = p_importacion_id');
    expect(cuerpo).toContain('not exists (select 1 from public.solicitud_vehiculo sv where sv.vehiculo_id = v.id)');
    expect(cuerpo).toContain('not exists (select 1 from public.traslado_interno_vehiculo tv where tv.vehiculo_id = v.id)');
  });

  it('should_lock_the_import_and_reject_missing_or_already_reverted', () => {
    expect(cuerpo).toContain('for update;');
    expect(cuerpo).toContain("raise exception 'importacion_no_existe';");
    expect(cuerpo).toContain("raise exception 'importacion_ya_revertida';");
    expect(cuerpo).toContain('set revertida_at = now(),');
  });

  it('should_allow_execution_only_to_service_role', () => {
    expect(sql).toContain('revoke all on function public.fn_revertir_importacion_stock(uuid, uuid) from public, anon, authenticated;');
    expect(sql).toContain('grant execute on function public.fn_revertir_importacion_stock(uuid, uuid) to service_role;');
    expect(cuerpo).toContain('security definer');
  });

  it('should_be_transactional_and_have_a_rollback', () => {
    expect(sql.indexOf('begin;')).toBeLessThan(sql.indexOf('create table if not exists public.importacion_stock'));
    expect(sql.trim().endsWith('commit;')).toBe(true);
    const rollback = normalizarSql(leerMigracion('rollback', NOMBRE));
    expect(rollback).toContain('drop function if exists public.fn_revertir_importacion_stock(uuid, uuid);');
    expect(rollback).toContain('alter table public.vehiculo drop column if exists importacion_id;');
    expect(rollback).toContain('drop table if exists public.importacion_stock;');
  });
});
