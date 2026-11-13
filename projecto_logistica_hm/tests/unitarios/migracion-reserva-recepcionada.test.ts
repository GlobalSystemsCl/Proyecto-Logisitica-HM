import { describe, expect, it } from 'vitest';
import { cuerpoFuncion, leerMigracion, normalizarSql } from '../mocks/sql';

/**
 * Contrato de la migración 20261112140000: un vehículo de una solicitud
 * `entregada` (recepcionada, falta entregarlo al cliente) no se pide en otra
 * solicitud ni se traslada (hallazgos #1 y #44 de la prueba QA).
 */

const NOMBRE = '20261112140000_reserva_incluye_recepcionada.sql';

describe('Migración reserva incluye recepcionada', () => {
  const sql = leerMigracion('migrations', NOMBRE);
  const normal = normalizarSql(sql);

  it('should_block_a_second_reservation_when_the_first_request_was_received', () => {
    const cuerpo = cuerpoFuncion(sql, 'fn_validar_reserva_unica_vehiculo');
    expect(cuerpo).toContain("'en_transito', 'entregada')");
    expect(cuerpo).toContain('el vehículo ya está reservado en otra solicitud activa.');
  });

  it('should_reject_transfers_of_sold_or_reserved_vehicles_in_the_database', () => {
    const cuerpo = cuerpoFuncion(sql, 'fn_validar_vehiculo_trasladable');
    expect(cuerpo).toContain("sv.disponibilidad = 'vendido'");
    expect(cuerpo).toContain("sv.disponibilidad = 'reservado'");
    expect(normal).toContain(
      'create trigger tr_validar_vehiculo_trasladable before insert on public.traslado_interno_vehiculo for each row execute function public.fn_validar_vehiculo_trasladable();'
    );
    expect(normal).toContain('revoke execute on function public.fn_validar_vehiculo_trasladable() from public, anon, authenticated;');
  });

  it('should_stop_offering_received_vehicles_in_the_transfer_search', () => {
    const cuerpo = cuerpoFuncion(sql, 'fn_vehiculos_disponibles_traslado');
    expect(cuerpo).toContain("'entregada')");
    expect(cuerpo).not.toContain('fn_estados_reserva_activos');
    expect(normal).toContain(
      'grant execute on function public.fn_vehiculos_disponibles_traslado(text, bigint, text, int, int) to service_role;'
    );
  });

  it('should_run_in_a_transaction_and_have_a_rollback', () => {
    expect(normal.startsWith('begin;') || normal.includes('\nbegin;') || normal.includes(' begin; ')).toBe(true);
    const rollback = normalizarSql(leerMigracion('rollback', NOMBRE));
    expect(rollback).toContain('drop trigger if exists tr_validar_vehiculo_trasladable on public.traslado_interno_vehiculo;');
    expect(rollback).toContain('drop function if exists public.fn_validar_vehiculo_trasladable();');
  });
});
