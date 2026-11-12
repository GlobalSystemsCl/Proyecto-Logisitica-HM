import { describe, expect, it } from 'vitest';
import { leerMigracion, normalizarSql } from '../mocks/sql';

/**
 * Contrato de la migración 20261112120000: un usuario de Logística puede tener
 * varias zonas (R3).
 */

const NOMBRE = '20261112120000_logistica_varias_zonas.sql';

describe('Migración Logística con varias zonas', () => {
  const sql = normalizarSql(leerMigracion('migrations', NOMBRE));

  it('should_drop_the_one_zone_per_user_index_only', () => {
    expect(sql).toContain('drop index if exists public.usuario_zona_una_por_usuario;');
    expect(sql).not.toMatch(/drop table|primary key|usuario_zona_pkey/);
  });

  it('should_be_transactional_when_applied', () => {
    expect(sql.startsWith('begin;')).toBe(true);
    expect(sql).toContain('commit;');
  });

  it('should_restore_the_unique_index_when_rolled_back', () => {
    const rollback = normalizarSql(leerMigracion('rollback', NOMBRE));
    expect(rollback).toContain('create unique index if not exists usuario_zona_una_por_usuario on public.usuario_zona (usuario_id);');
  });
});
