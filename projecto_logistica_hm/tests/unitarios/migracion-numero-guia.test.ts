import { describe, expect, it } from 'vitest';
import { leerMigracion, normalizarSql } from '../mocks/sql';
import { MAX_LARGO_GUIA } from '@/lib/guiaDespacho';

/**
 * Contrato de la migración 20261111120000: número de guía por vehículo en las
 * solicitudes y en los traslados internos (R15).
 */

const NOMBRE = '20261111120000_numero_guia_despacho.sql';

describe('Migración número de guía', () => {
  const sql = normalizarSql(leerMigracion('migrations', NOMBRE));

  it('should_add_nullable_non_unique_guide_to_both_link_tables', () => {
    expect(sql).toContain('alter table public.solicitud_vehiculo add column if not exists numero_guia text;');
    expect(sql).toContain('alter table public.traslado_interno_vehiculo add column if not exists numero_guia text;');
    expect(sql).not.toMatch(/unique/);
  });

  it('should_limit_length_to_the_same_maximum_as_the_app', () => {
    const check = `check (numero_guia is null or char_length(btrim(numero_guia)) between 1 and ${MAX_LARGO_GUIA})`;
    expect(sql.split(check).length - 1).toBe(2);
  });

  it('should_index_guide_for_search', () => {
    expect(sql).toContain('create index if not exists solicitud_vehiculo_numero_guia_idx on public.solicitud_vehiculo (numero_guia);');
    expect(sql).toContain(
      'create index if not exists traslado_interno_vehiculo_numero_guia_idx on public.traslado_interno_vehiculo (numero_guia);'
    );
  });

  it('should_be_transactional_when_applied', () => {
    expect(sql.startsWith('begin;')).toBe(true);
    expect(sql).toContain('commit;');
  });

  it('should_drop_columns_when_rolled_back', () => {
    const rollback = normalizarSql(leerMigracion('rollback', NOMBRE));
    expect(rollback).toContain('alter table public.solicitud_vehiculo drop column if exists numero_guia;');
    expect(rollback).toContain('alter table public.traslado_interno_vehiculo drop column if exists numero_guia;');
  });
});
