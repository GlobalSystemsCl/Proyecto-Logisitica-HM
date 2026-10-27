import { describe, expect, it } from 'vitest';
import { leerMigracion, normalizarSql } from '../mocks/sql';

/**
 * Contrato de la migración 20261027120000: recrea public.vehiculo (borrada con
 * DROP CASCADE el 2026-10-26) con las columnas originales y las del Excel de stock.
 */

const NOMBRE = '20261027120000_recrear_vehiculo_formato_stock.sql';

describe('Migración recrear vehiculo', () => {
  const sql = normalizarSql(leerMigracion('migrations', NOMBRE));

  it('should_keep_original_columns_and_add_stock_excel_columns', () => {
    expect(sql).toContain('create table if not exists public.vehiculo (');
    for (const columna of [
      'id uuid primary key default gen_random_uuid()',
      'chasis varchar not null',
      'patente varchar',
      'tipo_vehiculo varchar',
      'marca_codigo varchar',
      'marca varchar not null',
      'modelo varchar not null',
      'idv varchar',
      'anio integer',
      'color varchar',
      'precio numeric',
      'ubicacion bigint',
      'created_at timestamptz not null default now()',
      'updated_at timestamptz not null default now()',
    ]) {
      expect(sql).toContain(columna);
    }
    expect(sql).toContain('constraint vehiculo_chasis_key unique (chasis)');
  });

  it('should_recreate_foreign_keys_with_names_used_by_postgrest_embeds', () => {
    expect(sql).toContain(
      'constraint vehiculo_ubicacion_fkey foreign key (ubicacion) references public.sucursal (id) on delete restrict'
    );
    expect(sql).toContain(
      'add constraint solicitud_vehiculo_vehiculo_fk foreign key (vehiculo_id) references public.vehiculo (id) on delete restrict;'
    );
    expect(sql).toContain(
      'add constraint traslado_interno_vehiculo_vehiculo_id_fkey foreign key (vehiculo_id) references public.vehiculo (id) on delete restrict;'
    );
  });

  it('should_recreate_statement_level_slot_triggers_and_updated_at', () => {
    expect(sql).toContain('for each statement execute function public.fn_recalcular_slots_vehiculos_insertados();');
    expect(sql).toContain('for each statement execute function public.fn_recalcular_slots_vehiculos_actualizados();');
    expect(sql).toContain('for each statement execute function public.fn_recalcular_slots_vehiculos_eliminados();');
    expect(sql).toContain('for each row execute function public.handle_updated_at();');
  });

  it('should_enable_rls_with_read_only_access_for_active_users', () => {
    expect(sql).toContain('alter table public.vehiculo enable row level security;');
    expect(sql).toContain('for select to authenticated using (public.usuario_activo());');
    expect(sql).toContain('revoke all on public.vehiculo from anon;');
    expect(sql).toContain(
      'revoke insert, update, delete, truncate, references, trigger on public.vehiculo from authenticated;'
    );
  });

  it('should_be_transactional_when_applied', () => {
    expect(sql.startsWith('begin;')).toBe(true);
    expect(sql).toContain('commit;');
  });

  it('should_drop_foreign_keys_before_table_when_rolled_back', () => {
    const rollback = normalizarSql(leerMigracion('rollback', NOMBRE));
    const iFk = rollback.indexOf('drop constraint if exists solicitud_vehiculo_vehiculo_fk;');
    const iTabla = rollback.indexOf('drop table if exists public.vehiculo;');
    expect(iFk).toBeGreaterThanOrEqual(0);
    expect(iTabla).toBeGreaterThan(iFk);
  });
});
