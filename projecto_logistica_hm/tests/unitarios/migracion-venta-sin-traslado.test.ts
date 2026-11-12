import { describe, expect, it } from 'vitest';
import { cuerpoFuncion, leerMigracion, normalizarSql } from '../mocks/sql';

/**
 * Contrato de la migración 20261111140000: venta de un vehículo que ya está en
 * la sucursal (R1). La solicitud sin traslado no reserva slots en el destino.
 */

const NOMBRE = '20261111140000_venta_sin_traslado.sql';

describe('Migración venta sin traslado', () => {
  const sql = normalizarSql(leerMigracion('migrations', NOMBRE));

  it('should_add_flag_defaulting_to_false', () => {
    expect(sql).toContain('alter table public.solicitud add column if not exists sin_traslado boolean not null default false;');
  });

  it('should_exclude_requests_without_transfer_from_slot_reservations', () => {
    const cuerpo = normalizarSql(cuerpoFuncion(leerMigracion('migrations', NOMBRE), 'fn_recalcular_slots_sucursal'));
    expect(cuerpo).toContain("and sol.tipo_solicitud <> 'evento' and not sol.sin_traslado and sv.disponibilidad = 'reservado'");
    expect(cuerpo).toContain("t.estado in ('pendiente', 'en_transito')");
    expect(cuerpo).toContain('v_ocupados := v_fisicos + v_reservados;');
  });

  it('should_keep_function_restricted_to_service_role', () => {
    expect(sql).toContain('revoke execute on function public.fn_recalcular_slots_sucursal(bigint) from public, anon, authenticated;');
    expect(sql).toContain('grant execute on function public.fn_recalcular_slots_sucursal(bigint) to service_role;');
  });

  it('should_be_transactional_when_applied', () => {
    expect(sql.startsWith('begin;')).toBe(true);
    expect(sql).toContain('commit;');
  });

  it('should_restore_previous_function_and_drop_column_when_rolled_back', () => {
    const rollback = leerMigracion('rollback', NOMBRE);
    expect(normalizarSql(cuerpoFuncion(rollback, 'fn_recalcular_slots_sucursal'))).not.toContain('sin_traslado');
    expect(normalizarSql(rollback)).toContain('alter table public.solicitud drop column if exists sin_traslado;');
  });
});
