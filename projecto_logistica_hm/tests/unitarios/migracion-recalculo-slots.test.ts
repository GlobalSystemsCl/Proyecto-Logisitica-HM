import { describe, expect, it } from 'vitest';
import { cuerpoFuncion, leerMigracion, normalizarSql } from '../mocks/sql';

/**
 * Contrato de la migración 20261013130000 (brecha 011, paso 1): una sola
 * función calcula ambos contadores de slots desde los datos, incluidas las
 * reservas de traslados internos, y nunca bloquea por capacidad (marcha blanca).
 */

const NOMBRE = '20261013130000_brecha_011_recalculo_slots_unificado.sql';

describe('Migración brecha_011_recalculo_slots_unificado', () => {
  const migracion = leerMigracion('migrations', NOMBRE);
  const sql = normalizarSql(migracion);
  const recalculo = cuerpoFuncion(migracion, 'fn_recalcular_slots_sucursal');

  it('should_list_the_reservation_states_including_despachada', () => {
    const estados = cuerpoFuncion(migracion, 'fn_estados_reserva_activos');
    for (const e of ['pendiente_aprobacion', 'aprobada', 'pendiente', 'priorizada', 'asignada', 'calendarizada', 'despachada', 'en_transito']) {
      expect(estados).toContain(`'${e}'`);
    }
    expect(estados).not.toContain("'entregada'");
    expect(estados).not.toContain("'cancelada'");
  });

  it('should_count_physical_vehicles_and_solicitud_reservations_when_recalculating', () => {
    expect(recalculo).toContain('from public.vehiculo v where v.ubicacion = p_sucursal_id');
    expect(recalculo).toContain('sol.sucursal_destino = p_sucursal_id');
    expect(recalculo).toContain("sol.tipo_solicitud <> 'evento'");
    expect(recalculo).toContain('sol.estado = any (public.fn_estados_reserva_activos())');
  });

  it('should_count_pending_traslado_reservations_when_recalculating', () => {
    expect(recalculo).toContain('t.destino_id = p_sucursal_id');
    expect(recalculo).toContain("tiv.disponibilidad = 'reservado'");
    expect(recalculo).toContain("t.estado in ('pendiente', 'en_transito')");
  });

  it('should_set_both_counters_from_the_same_calculation', () => {
    expect(recalculo).toContain('v_reservados := v_res_solicitud + v_res_traslado;');
    expect(recalculo).toContain('v_ocupados := v_fisicos + v_reservados;');
    expect(recalculo).toContain('set slots_ocupados = v_ocupados, slots_reservados = v_reservados');
  });

  it('should_lock_the_branch_row_before_counting', () => {
    expect(recalculo).toMatch(/from public\.sucursal s where s\.id = p_sucursal_id for update;.*select count\(\*\) into v_fisicos/);
  });

  it('should_only_warn_and_never_block_when_capacity_is_exceeded', () => {
    // Marcha blanca: los límites de capacidad están desactivados a propósito.
    expect(recalculo).toContain('raise notice');
    expect(recalculo).not.toContain('raise exception');
  });

  it('should_delegate_old_recalculation_function_to_the_new_one', () => {
    const anterior = cuerpoFuncion(migracion, 'fn_recalcular_slots_ocupados');
    expect(anterior).toContain('perform public.fn_recalcular_slots_sucursal(p_sucursal_id);');
    expect(anterior).not.toContain('count(*)');
  });

  it('should_restrict_execution_to_service_role_when_function_is_security_definer', () => {
    expect(recalculo).toContain('security definer');
    expect(recalculo).toContain('set search_path = public, pg_temp');
    expect(sql).toContain('revoke execute on function public.fn_recalcular_slots_sucursal(bigint) from public, anon, authenticated;');
    expect(sql).toContain('grant execute on function public.fn_recalcular_slots_sucursal(bigint) to service_role;');
  });

  it('should_be_transactional_when_applied', () => {
    expect(sql.startsWith('begin;')).toBe(true);
    expect(sql.endsWith('commit;')).toBe(true);
  });

  it('should_restore_previous_function_and_drop_new_ones_when_rolled_back', () => {
    const rollback = leerMigracion('rollback', NOMBRE);
    const anterior = cuerpoFuncion(rollback, 'fn_recalcular_slots_ocupados');
    expect(anterior).toContain('select count(*) from public.vehiculo v where v.ubicacion = p_sucursal_id');
    expect(anterior).not.toContain('fn_recalcular_slots_sucursal');
    const r = normalizarSql(rollback);
    expect(r).toContain('drop function if exists public.fn_recalcular_slots_sucursal(bigint);');
    expect(r).toContain('drop function if exists public.fn_estados_reserva_activos();');
  });
});
