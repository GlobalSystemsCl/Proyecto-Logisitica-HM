import { describe, expect, it } from 'vitest';
import { cuerpoFuncion, leerMigracion, normalizarSql } from '../mocks/sql';

/**
 * Contrato de la migración 20261013140000 (brecha 011, paso 2): ningún trigger
 * de slots suma o resta de a uno; todos recalculan con
 * fn_recalcular_slots_sucursal. Se cierran las fugas al borrar solicitudes y
 * traslados, y se elimina el trigger duplicado trigger_disponibilidad.
 */

const NOMBRE = '20261013140000_brecha_011_triggers_recalculo.sql';
const RECALCULO = 'perform public.fn_recalcular_slots_sucursal(';
/** `slots_ocupados = slots_ocupados + 1`, `slots_reservados - v_cantidad`, etc. */
const INCREMENTAL = /slots_(ocupados|reservados)\s*=\s*(greatest\(\s*)?(coalesce\()?slots_(ocupados|reservados)/;

const FUNCIONES = [
  'fn_reservar_slots_solicitud_vehiculo',
  'fn_liberar_slots_solicitud_vehiculo_eliminado',
  'fn_liberar_slots_rechazo_cancelacion',
  'fn_entregar_solicitud_vehiculos',
  'fn_reservar_slots_traslado_vehiculo',
  'fn_recibir_traslado_vehiculos',
  'fn_cancelar_traslado_interno',
  'fn_recalcular_slots_solicitud_eliminada',
  'fn_recalcular_slots_traslado_eliminado',
  'fn_recalcular_slots_traslado_vehiculo_eliminado',
];

describe('Migración brecha_011_triggers_recalculo', () => {
  const migracion = leerMigracion('migrations', NOMBRE);
  const sql = normalizarSql(migracion);

  it.each(FUNCIONES)('should_recalculate_instead_of_incrementing_when_%s_runs', (nombre) => {
    const cuerpo = cuerpoFuncion(migracion, nombre);
    expect(cuerpo).not.toBe('');
    expect(cuerpo).toContain(RECALCULO);
    expect(cuerpo).not.toMatch(INCREMENTAL);
  });

  it('should_release_reservations_on_rejection_or_cancellation_even_without_destination', () => {
    const cuerpo = cuerpoFuncion(migracion, 'fn_liberar_slots_rechazo_cancelacion');
    // La liberación ocurre antes de cualquier condición sobre el destino.
    expect(cuerpo).toMatch(/set disponibilidad = 'liberado' where solicitud_id = new\.id and disponibilidad = 'reservado';\s*perform public\.fn_recalcular_slots_sucursal\(new\.sucursal_destino\)/);
    expect(cuerpo).not.toContain('v_destino is null then return');
  });

  it('should_drop_the_duplicated_cancellation_trigger', () => {
    expect(sql).toContain('drop trigger if exists trigger_disponibilidad on public.solicitud;');
    expect(sql).not.toContain('create trigger trigger_disponibilidad');
  });

  it('should_recalculate_destination_when_a_solicitud_is_deleted', () => {
    expect(sql).toContain(
      'create trigger tr_recalcular_slots_solicitud_eliminada after delete on public.solicitud for each row execute function public.fn_recalcular_slots_solicitud_eliminada();'
    );
    expect(cuerpoFuncion(migracion, 'fn_recalcular_slots_solicitud_eliminada')).toContain(`${RECALCULO}old.sucursal_destino)`);
  });

  it('should_recalculate_destination_when_a_traslado_or_its_vehicle_is_deleted', () => {
    expect(sql).toContain('create trigger tr_recalcular_slots_traslado_eliminado after delete on public.traslado_interno');
    expect(sql).toContain('create trigger tr_recalcular_slots_traslado_vehiculo_eliminado after delete on public.traslado_interno_vehiculo');
    expect(cuerpoFuncion(migracion, 'fn_recalcular_slots_traslado_eliminado')).toContain(`${RECALCULO}old.destino_id)`);
  });

  it('should_keep_cancel_traslado_rpc_signature_validations_and_permissions', () => {
    const cuerpo = cuerpoFuncion(migracion, 'fn_cancelar_traslado_interno');
    expect(cuerpo).toContain('p_traslado_id uuid, p_usuario_id uuid, p_motivo text, p_ubicacion bigint');
    expect(cuerpo).toContain('security definer');
    expect(cuerpo).toContain("if v_estado <> 'en_transito' then");
    expect(cuerpo).toContain('length(btrim(p_motivo)) < 5');
    expect(sql).toContain('grant execute on function public.fn_cancelar_traslado_interno(uuid, uuid, text, bigint) to service_role;');
  });

  it('should_keep_vehicle_moves_on_delivery_and_reception', () => {
    expect(cuerpoFuncion(migracion, 'fn_entregar_solicitud_vehiculos')).toContain('set ubicacion = v_destino');
    expect(cuerpoFuncion(migracion, 'fn_recibir_traslado_vehiculos')).toContain('set ubicacion = new.destino_id');
  });

  it('should_revoke_execute_on_new_trigger_functions', () => {
    for (const f of ['fn_recalcular_slots_solicitud_eliminada', 'fn_recalcular_slots_traslado_eliminado', 'fn_recalcular_slots_traslado_vehiculo_eliminado']) {
      expect(sql).toContain(`revoke execute on function public.${f}() from public, anon, authenticated;`);
    }
  });

  it('should_be_transactional_when_applied', () => {
    expect(sql.startsWith('begin;')).toBe(true);
    expect(sql.endsWith('commit;')).toBe(true);
  });

  it('should_restore_incremental_functions_and_duplicated_trigger_when_rolled_back', () => {
    const rollback = leerMigracion('rollback', NOMBRE);
    const r = normalizarSql(rollback);
    expect(r).toContain('create trigger trigger_disponibilidad after update of estado on public.solicitud');
    expect(r).toContain('drop trigger if exists tr_recalcular_slots_solicitud_eliminada on public.solicitud;');
    expect(cuerpoFuncion(rollback, 'fn_reservar_slots_solicitud_vehiculo')).toMatch(INCREMENTAL);
    expect(cuerpoFuncion(rollback, 'fn_reservar_slots_solicitud_vehiculo')).not.toContain(RECALCULO);
    for (const f of FUNCIONES.slice(0, 7)) {
      expect(cuerpoFuncion(rollback, f)).not.toBe('');
    }
  });
});
