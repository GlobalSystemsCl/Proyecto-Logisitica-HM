import { describe, expect, it } from 'vitest';
import { cuerpoFuncion, leerMigracion, normalizarSql } from '../mocks/sql';

/**
 * Contrato de la migración 20261013170000 (brecha 014, puntos pendientes):
 * las funciones de rol solo cuentan activo = true y usuario_tiene_sucursal no
 * permite a un usuario con sesión consultar las asignaciones de otro.
 */

const NOMBRE = '20261013170000_brecha_014_funciones_rol_y_sucursal.sql';

describe('Migración brecha_014_funciones_rol_y_sucursal', () => {
  const migracion = leerMigracion('migrations', NOMBRE);
  const sql = normalizarSql(migracion);

  it.each(['es_administrador', 'tiene_rol', 'usuario_activo'])(
    'should_never_treat_null_activo_as_active_when_%s_runs',
    (nombre) => {
      const cuerpo = cuerpoFuncion(migracion, nombre);
      expect(cuerpo).not.toBe('');
      expect(cuerpo).not.toMatch(/coalesce\([^)]*activo[^)]*,\s*true\)/);
      expect(cuerpo).toMatch(/activo is true|coalesce\(v_activo, false\)/);
      expect(cuerpo).toContain('where id = auth.uid()');
      expect(cuerpo).toContain('security definer');
      expect(cuerpo).toContain('set search_path = public, pg_temp');
    }
  );

  it('should_make_activo_not_null_after_filling_nulls', () => {
    expect(sql).toMatch(
      /update public\.usuario set activo = false where activo is null;\s*alter table public\.usuario alter column activo set not null;/
    );
  });

  it('should_keep_signature_of_usuario_tiene_sucursal_used_by_policies_and_app', () => {
    expect(sql).toContain(
      'create or replace function public.usuario_tiene_sucursal(p_usuario_id uuid, p_sucursal_id bigint) returns boolean'
    );
  });

  it('should_reject_other_users_when_caller_has_a_session', () => {
    const cuerpo = cuerpoFuncion(migracion, 'usuario_tiene_sucursal');
    expect(cuerpo).toContain('when auth.uid() is not null and p_usuario_id is distinct from auth.uid() then false');
    expect(cuerpo).toContain('u.id = p_usuario_id and u.sucursal_id = p_sucursal_id');
    expect(cuerpo).toContain('s.id = p_sucursal_id and s.usuario_id = p_usuario_id');
  });

  it('should_be_transactional_when_applied', () => {
    expect(sql.startsWith('begin;')).toBe(true);
    expect(sql.endsWith('commit;')).toBe(true);
  });

  it('should_restore_previous_definitions_when_rolled_back', () => {
    const rollback = leerMigracion('rollback', NOMBRE);
    const r = normalizarSql(rollback);
    expect(r).toContain('alter table public.usuario alter column activo drop not null;');
    expect(cuerpoFuncion(rollback, 'tiene_rol')).toContain('coalesce(activo, true) = true');
    expect(cuerpoFuncion(rollback, 'usuario_tiene_sucursal')).not.toContain('auth.uid()');
  });
});
