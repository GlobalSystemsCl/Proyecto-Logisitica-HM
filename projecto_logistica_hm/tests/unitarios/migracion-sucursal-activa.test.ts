import { beforeEach, describe, expect, it, vi } from 'vitest';
import { leerMigracion, normalizarSql } from '../mocks/sql';

/** Contrato de la migración 20261123120000: sucursal activa / desactivada. */

const NOMBRE = '20261123120000_sucursal_activa.sql';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Migración sucursal activa', () => {
  const sql = normalizarSql(leerMigracion('migrations', NOMBRE));
  const rollback = normalizarSql(leerMigracion('rollback', NOMBRE));

  it('should_add_activa_column_defaulting_to_true_inside_a_transaction', () => {
    expect(sql).toContain('begin;');
    expect(sql).toContain('alter table public.sucursal add column if not exists activa boolean not null default true;');
    expect(sql).toContain('commit;');
  });

  it('should_drop_the_column_in_rollback', () => {
    expect(rollback).toContain('alter table public.sucursal drop column if exists activa;');
  });
});
