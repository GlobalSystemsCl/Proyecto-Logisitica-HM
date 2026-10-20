import { describe, expect, it } from 'vitest';
import { leerMigracion, normalizarSql } from '../mocks/sql';

/**
 * Contrato de la migración 20261020130000: catálogo de transportistas y su
 * referencia en solicitudes y traslados internos.
 */

const NOMBRE = '20261020130000_transportista.sql';

describe('Migración transportista', () => {
  const sql = normalizarSql(leerMigracion('migrations', NOMBRE));

  it('should_create_table_with_unique_normalized_rut', () => {
    expect(sql).toContain('create table if not exists public.transportista (');
    expect(sql).toContain('constraint transportista_rut_key unique (rut)');
    expect(sql).toContain("constraint transportista_rut_formato check (rut ~ '^[0-9]{7,8}-[0-9k]$')");
  });

  it('should_reference_carrier_from_requests_and_internal_transfers_with_restrict', () => {
    expect(sql).toContain(
      'alter table public.solicitud add column if not exists transportista_id uuid references public.transportista (id) on delete restrict;'
    );
    expect(sql).toContain(
      'alter table public.traslado_interno add column if not exists transportista_id uuid references public.transportista (id) on delete restrict;'
    );
    expect(sql).toContain('create index if not exists solicitud_transportista_id_idx on public.solicitud (transportista_id);');
    expect(sql).toContain(
      'create index if not exists traslado_interno_transportista_id_idx on public.traslado_interno (transportista_id);'
    );
  });

  it('should_enable_rls_with_read_only_access_for_active_users', () => {
    expect(sql).toContain('alter table public.transportista enable row level security;');
    expect(sql).toContain('for select to authenticated using (public.usuario_activo());');
    expect(sql).toContain('revoke all on public.transportista from anon;');
    expect(sql).toContain(
      'revoke insert, update, delete, truncate, references, trigger on public.transportista from authenticated;'
    );
  });

  it('should_be_transactional_when_applied', () => {
    expect(sql.startsWith('begin;')).toBe(true);
    expect(sql).toContain('commit;');
  });

  it('should_drop_columns_before_table_when_rolled_back', () => {
    const rollback = normalizarSql(leerMigracion('rollback', NOMBRE));
    const iColumna = rollback.indexOf('alter table public.solicitud drop column if exists transportista_id;');
    const iTabla = rollback.indexOf('drop table if exists public.transportista;');
    expect(iColumna).toBeGreaterThan(-1);
    expect(iTabla).toBeGreaterThan(iColumna);
  });
});
