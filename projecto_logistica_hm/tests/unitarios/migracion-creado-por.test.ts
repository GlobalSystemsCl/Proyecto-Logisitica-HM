import { describe, expect, it } from 'vitest';
import { leerMigracion, normalizarSql } from '../mocks/sql';

/**
 * Contrato de la migración 20261014130000: solicitud.creado_por guarda quién
 * inició la solicitud y se completa para las existentes desde la auditoría.
 */

const NOMBRE = '20261014130000_solicitud_creado_por.sql';

describe('Migración solicitud_creado_por', () => {
  const sql = normalizarSql(leerMigracion('migrations', NOMBRE));

  it('should_add_nullable_fk_that_keeps_requests_when_user_is_deleted', () => {
    expect(sql).toContain(
      'alter table public.solicitud add column if not exists creado_por uuid references public.usuario (id) on delete set null;'
    );
    expect(sql).toContain('create index if not exists solicitud_creado_por_idx on public.solicitud (creado_por);');
  });

  it('should_backfill_from_creation_audit_then_delegation_then_fallback', () => {
    const iReserva = sql.indexOf("where a.accion = 'asignacion_vehiculo' and a.entidad = 'solicitud_vehiculo'");
    const iDelegacion = sql.indexOf("where a.accion = 'delegacion' and a.entidad = 'solicitud'");
    expect(iReserva).toBeGreaterThan(-1);
    expect(iDelegacion).toBeGreaterThan(iReserva);
    expect(sql).toContain('case when s.ejecutivo_id is null then s.jefe_local_id else s.ejecutivo_id end');
    expect(sql).toContain('where s.creado_por is null;');
  });

  it('should_be_transactional_when_applied', () => {
    expect(sql.startsWith('begin;')).toBe(true);
    expect(sql.endsWith('commit;')).toBe(true);
  });

  it('should_drop_column_when_rolled_back', () => {
    expect(normalizarSql(leerMigracion('rollback', NOMBRE))).toContain(
      'alter table public.solicitud drop column if exists creado_por;'
    );
  });
});
