import { describe, expect, it } from 'vitest';
import { cuerpoFuncion, leerMigracion, normalizarSql } from '../mocks/sql';

/**
 * Contrato de la migración 20261118120000: código visible de sucursal (número
 * + letra) y acopios de Lonquén (119B) y Torquemada (120B).
 */

const NOMBRE = '20261118120000_codigo_sucursal_acopio.sql';

describe('Migración código de sucursal y acopios', () => {
  const original = leerMigracion('migrations', NOMBRE);
  const sql = normalizarSql(original);

  it('should_add_unique_code_defaulting_to_id_and_mark_lonquen_torquemada_as_A', () => {
    expect(sql).toContain('alter table public.sucursal add column if not exists codigo text;');
    expect(sql).toContain('update public.sucursal set codigo = id::text where codigo is null;');
    expect(sql).toContain("update public.sucursal set codigo = id::text || 'a' where id in (119, 120) and codigo = id::text;");
    expect(sql).toContain('alter table public.sucursal add constraint sucursal_codigo_unico unique (codigo);');
  });

  it('should_create_both_acopios_as_B_only_when_parent_exists', () => {
    expect(sql).toContain("select 'lonquen acopio-santiago', s.direccion, s.slots, s.zona_id, '119b'");
    expect(sql).toContain('where s.id = 119');
    expect(sql).toContain("select 'torquemada acopio-viña del mar', s.direccion, s.slots, s.zona_id, '120b'");
    expect(sql).toContain('where s.id = 120');
  });

  it('should_copy_branch_code_into_request_when_numbering', () => {
    const cuerpo = normalizarSql(cuerpoFuncion(original, 'fn_asignar_numero_solicitud'));
    expect(cuerpo).toContain('returning ultimo_numero_solicitud, codigo into new.numero, new.codigo_sucursal;');
    expect(cuerpo).toContain('new.codigo_sucursal := old.codigo_sucursal;');
  });

  it('should_fill_code_with_id_when_branch_is_inserted_without_code', () => {
    const cuerpo = normalizarSql(cuerpoFuncion(original, 'fn_codigo_sucursal'));
    expect(cuerpo).toContain('new.codigo := new.id::text;');
  });

  it('should_be_transactional_and_have_a_rollback', () => {
    expect(sql.startsWith('begin;') || sql.includes('\nbegin;') || sql.includes(' begin;')).toBe(true);
    expect(sql.trim().includes('commit;')).toBe(true);
    const rollback = normalizarSql(leerMigracion('rollback', NOMBRE));
    expect(rollback).toContain("delete from public.sucursal where codigo in ('119b', '120b');");
    expect(rollback).toContain('alter table public.sucursal drop column if exists codigo;');
  });
});
