import { describe, expect, it } from 'vitest';
import { leerMigracion, normalizarSql } from '../mocks/sql';

/**
 * Contrato de la migración 20261112130000: ausencias de Logística con
 * sustituto (R9).
 */

const NOMBRE = '20261112130000_ausencias_logistica.sql';

describe('Migración ausencias de Logística', () => {
  const sql = normalizarSql(leerMigracion('migrations', NOMBRE));

  it('should_create_absence_table_with_valid_states_range_and_different_users', () => {
    expect(sql).toContain('create table if not exists public.ausencia_usuario (');
    expect(sql).toContain("check (estado in ('programada', 'activa', 'finalizada', 'cancelada'))");
    expect(sql).toContain('constraint ausencia_usuario_rango check (hasta >= desde)');
    expect(sql).toContain('constraint ausencia_usuario_distintos check (titular_id <> sustituto_id)');
  });

  it('should_allow_only_one_current_absence_per_holder', () => {
    expect(sql).toContain(
      "create unique index if not exists ausencia_usuario_una_vigente_por_titular on public.ausencia_usuario (titular_id) where estado in ('programada', 'activa');"
    );
  });

  it('should_track_transfers_and_temporary_zones', () => {
    expect(sql).toContain('create table if not exists public.ausencia_traspaso (');
    expect(sql).toContain('primary key (ausencia_id, entidad, entidad_id)');
    expect(sql).toContain(
      'alter table public.usuario_zona add column if not exists ausencia_id uuid references public.ausencia_usuario (id) on delete cascade;'
    );
  });

  it('should_enable_rls_with_read_only_access_for_admins', () => {
    for (const tabla of ['ausencia_usuario', 'ausencia_traspaso']) {
      expect(sql).toContain(`alter table public.${tabla} enable row level security;`);
      expect(sql).toContain(`revoke all on public.${tabla} from anon;`);
      expect(sql).toContain(`revoke insert, update, delete, truncate, references, trigger on public.${tabla} from authenticated;`);
    }
    expect(sql).toContain('using (public.es_administrador());');
  });

  it('should_be_transactional_when_applied', () => {
    expect(sql.startsWith('begin;')).toBe(true);
    expect(sql).toContain('commit;');
  });

  it('should_remove_temporary_zones_before_dropping_column_when_rolled_back', () => {
    const rollback = normalizarSql(leerMigracion('rollback', NOMBRE));
    const iBorrar = rollback.indexOf('delete from public.usuario_zona where ausencia_id is not null;');
    const iColumna = rollback.indexOf('alter table public.usuario_zona drop column if exists ausencia_id;');
    expect(iBorrar).toBeGreaterThanOrEqual(0);
    expect(iColumna).toBeGreaterThan(iBorrar);
    expect(rollback).toContain('drop table if exists public.ausencia_usuario;');
  });
});
