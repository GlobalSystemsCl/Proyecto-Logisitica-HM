import { describe, expect, it } from 'vitest';
import { leerMigracion, normalizarSql } from '../mocks/sql';

/**
 * Contrato de la migración 20261013160000 (brecha 011, paso 4): corrección
 * única de los contadores de todas las sucursales, repetible y sin escrituras
 * directas sobre los contadores.
 */

const NOMBRE = '20261013160000_brecha_011_recalculo_global.sql';

describe('Migración brecha_011_recalculo_global', () => {
  const sql = normalizarSql(leerMigracion('migrations', NOMBRE));

  it('should_recalculate_every_branch_in_id_order_when_applied', () => {
    expect(sql).toContain('for v_sucursal in select s.id from public.sucursal s order by s.id loop');
    expect(sql).toContain('perform public.fn_recalcular_slots_sucursal(v_sucursal);');
  });

  it('should_not_write_counters_directly_when_applied', () => {
    expect(sql).not.toMatch(/update public\.sucursal/);
    expect(sql).not.toMatch(/set slots_(ocupados|reservados)/);
  });

  it('should_be_transactional_when_applied', () => {
    expect(sql.startsWith('begin;')).toBe(true);
    expect(sql.endsWith('commit;')).toBe(true);
  });
});
