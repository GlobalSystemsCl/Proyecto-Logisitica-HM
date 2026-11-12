import { describe, expect, it } from 'vitest';
import { leerMigracion, normalizarSql } from '../mocks/sql';

/**
 * Contrato de la migración 20261111130000: camiones de las empresas de
 * transporte y patente/conductor usados en cada traslado (R10).
 */

const NOMBRE = '20261111130000_camion_transporte.sql';

describe('Migración camión de transporte', () => {
  const sql = normalizarSql(leerMigracion('migrations', NOMBRE));

  it('should_create_truck_table_with_unique_normalized_plate_and_company', () => {
    expect(sql).toContain('create table if not exists public.camion (');
    expect(sql).toContain('transportista_id uuid not null references public.transportista (id) on delete restrict');
    expect(sql).toContain('constraint camion_patente_key unique (patente)');
    // normalizarSql pasa todo a minúsculas.
    expect(sql).toContain("constraint camion_patente_formato check (patente ~ '^[a-z0-9]{5,8}$')");
  });

  it('should_add_plate_and_driver_snapshot_to_requests_and_internal_transfers', () => {
    for (const tabla of ['solicitud', 'traslado_interno']) {
      expect(sql).toContain(`alter table public.${tabla} add column if not exists patente_camion text;`);
      expect(sql).toContain(`alter table public.${tabla} add column if not exists conductor_nombre text;`);
    }
  });

  it('should_enable_rls_with_read_only_access_for_active_users', () => {
    expect(sql).toContain('alter table public.camion enable row level security;');
    expect(sql).toContain('for select to authenticated using (public.usuario_activo());');
    expect(sql).toContain('revoke all on public.camion from anon;');
    expect(sql).toContain('revoke insert, update, delete, truncate, references, trigger on public.camion from authenticated;');
  });

  it('should_be_transactional_when_applied', () => {
    expect(sql.startsWith('begin;')).toBe(true);
    expect(sql).toContain('commit;');
  });

  it('should_drop_columns_before_table_when_rolled_back', () => {
    const rollback = normalizarSql(leerMigracion('rollback', NOMBRE));
    const iColumna = rollback.indexOf('alter table public.solicitud drop column if exists patente_camion;');
    const iTabla = rollback.indexOf('drop table if exists public.camion;');
    expect(iColumna).toBeGreaterThanOrEqual(0);
    expect(iTabla).toBeGreaterThan(iColumna);
    expect(rollback).not.toContain('drop table if exists public.transportista');
  });
});
