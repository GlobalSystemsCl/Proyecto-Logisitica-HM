import { describe, expect, it } from 'vitest';
import { cuerpoFuncion, leerMigracion, normalizarSql } from '../mocks/sql';

/**
 * Contrato de la migración 20261113100000: cada vehículo pedido guarda la
 * sucursal desde la que sale (hallazgo QA #38). La app la lee en
 * SOLICITUD_SELECT con el nombre de FK `solicitud_vehiculo_sucursal_origen_fkey`.
 */

const NOMBRE = '20261113100000_origen_vehiculo_solicitud.sql';

describe('Migración origen del vehículo en la solicitud', () => {
  const sql = leerMigracion('migrations', NOMBRE);
  const normal = normalizarSql(sql);

  it('should_add_nullable_origin_column_with_the_fk_name_used_by_the_app', () => {
    expect(normal).toContain('add column if not exists sucursal_origen bigint;');
    expect(normal).toContain('add constraint solicitud_vehiculo_sucursal_origen_fkey');
    expect(normal).toContain('references public.sucursal(id) on delete set null;');
  });

  it('should_fill_origin_from_vehicle_location_on_insert', () => {
    const cuerpo = cuerpoFuncion(sql, 'fn_fijar_origen_solicitud_vehiculo');
    expect(cuerpo).toContain('select v.ubicacion into new.sucursal_origen');
    expect(normal).toContain(
      'create trigger tr_fijar_origen_solicitud_vehiculo before insert on public.solicitud_vehiculo for each row execute function public.fn_fijar_origen_solicitud_vehiculo();'
    );
    expect(normal).toContain('revoke execute on function public.fn_fijar_origen_solicitud_vehiculo() from public, anon, authenticated;');
  });

  it('should_backfill_only_requests_not_yet_received', () => {
    expect(normal).toContain("'calendarizada', 'despachada', 'en_transito'");
    expect(normal).not.toMatch(/s\.estado in \([^)]*'entregada'/);
  });

  it('should_match_the_fk_name_used_in_solicitud_select', async () => {
    const fs = await import('fs');
    const servicio = fs.readFileSync('src/services/solicitudes.service.ts', 'utf8');
    expect(servicio).toContain('origen:sucursal!solicitud_vehiculo_sucursal_origen_fkey(nombre)');
  });
});
