import { describe, expect, it } from 'vitest';
import { cuerpoFuncion, leerMigracion, normalizarSql } from '../mocks/sql';

/**
 * Contrato de la migración 20261013150000 (brecha 011, paso 3): los
 * movimientos de vehículos vuelven a recalcular slots con triggers por
 * sentencia (una importación masiva recalcula una vez por sucursal afectada).
 */

const NOMBRE = '20261013150000_brecha_011_trigger_vehiculos.sql';
const RECALCULO = 'perform public.fn_recalcular_slots_sucursal(v_sucursal);';

describe('Migración brecha_011_trigger_vehiculos', () => {
  const migracion = leerMigracion('migrations', NOMBRE);
  const sql = normalizarSql(migracion);

  it.each([
    ['insertados', 'after insert on public.vehiculo referencing new table as nuevos for each statement'],
    ['actualizados', 'after update on public.vehiculo referencing old table as viejos new table as nuevos for each statement'],
    ['eliminados', 'after delete on public.vehiculo referencing old table as viejos for each statement'],
  ])('should_create_statement_level_trigger_when_vehicles_are_%s', (evento, definicion) => {
    expect(sql).toContain(
      `create trigger tr_recalcular_slots_vehiculos_${evento} ${definicion} execute function public.fn_recalcular_slots_vehiculos_${evento}();`
    );
  });

  it.each(['insertados', 'actualizados', 'eliminados'])(
    'should_recalculate_each_affected_branch_once_in_id_order_when_vehicles_are_%s',
    (evento) => {
      const cuerpo = cuerpoFuncion(migracion, `fn_recalcular_slots_vehiculos_${evento}`);
      expect(cuerpo).toContain('select distinct');
      expect(cuerpo).toContain('order by 1');
      expect(cuerpo).toContain(RECALCULO);
      expect(cuerpo).toContain('return null;');
    }
  );

  it('should_only_recalculate_vehicles_whose_location_changed_when_updating', () => {
    const cuerpo = cuerpoFuncion(migracion, 'fn_recalcular_slots_vehiculos_actualizados');
    expect(cuerpo).toContain('where o.ubicacion is distinct from n.ubicacion');
    expect(cuerpo).toContain('select o.ubicacion as sucursal');
    expect(cuerpo).toContain('select n.ubicacion');
  });

  it('should_drop_the_disabled_row_level_trigger', () => {
    expect(sql).toContain('drop trigger if exists tr_recalcular_slots_vehiculo on public.vehiculo;');
    expect(sql).not.toContain('disable trigger');
  });

  it('should_revoke_execute_on_trigger_functions', () => {
    for (const evento of ['insertados', 'actualizados', 'eliminados']) {
      expect(sql).toContain(
        `revoke execute on function public.fn_recalcular_slots_vehiculos_${evento}() from public, anon, authenticated;`
      );
    }
  });

  it('should_be_transactional_when_applied', () => {
    expect(sql.startsWith('begin;')).toBe(true);
    expect(sql.endsWith('commit;')).toBe(true);
  });

  it('should_restore_disabled_row_level_trigger_when_rolled_back', () => {
    const r = normalizarSql(leerMigracion('rollback', NOMBRE));
    expect(r).toContain(
      'create trigger tr_recalcular_slots_vehiculo after insert or delete or update of ubicacion on public.vehiculo for each row execute function public.fn_recalcular_slots_por_vehiculo();'
    );
    expect(r).toContain('alter table public.vehiculo disable trigger tr_recalcular_slots_vehiculo;');
    expect(r).toContain('drop trigger if exists tr_recalcular_slots_vehiculos_insertados on public.vehiculo;');
  });
});
