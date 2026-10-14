import { describe, expect, it } from 'vitest';
import { leerMigracion, normalizarSql } from '../mocks/sql';
import { TIPO_NOTIFICACION_POR_EVENTO } from '@/lib/notificaciones-app';

/**
 * Contrato de la migración 20261014120000 (notificaciones en la app): el enum
 * tiene todos los tipos que usa la app, la tabla queda en Realtime y se
 * eliminan las funciones de trigger antiguas.
 */

const NOMBRE = '20261014120000_notificaciones_en_app.sql';

/** Valores del enum que ya existían en producción antes de la migración. */
const TIPOS_PREVIOS = [
  'NUEVA_SOLICITUD',
  'SOLICITUD_PRIORIZADA',
  'SOLICITUD_ASIGNADA',
  'SOLICITUD_CALENDARIZADA',
  'SOLICITUD_EN_TRANSITO',
  'SOLICITUD_ENTREGADA',
  'SOLICITUD_FINALIZADA',
  'SOLICITUD_CANCELADA',
  'VEHICULO_RESERVADO',
  'VEHICULO_LIBERADO',
  'NUEVA_OBSERVACION',
];

describe('Migración notificaciones_en_app', () => {
  const migracion = leerMigracion('migrations', NOMBRE);
  const sql = normalizarSql(migracion);

  it('should_define_every_tipo_used_by_the_app_when_applied', () => {
    for (const tipo of new Set(Object.values(TIPO_NOTIFICACION_POR_EVENTO))) {
      const existe =
        TIPOS_PREVIOS.includes(tipo) ||
        sql.includes(`alter type public.tipo_notificacion add value if not exists '${tipo.toLowerCase()}';`);
      expect(existe, tipo).toBe(true);
    }
  });

  it('should_add_enum_values_outside_the_transaction', () => {
    expect(sql.lastIndexOf('add value')).toBeLessThan(sql.indexOf('begin;'));
    expect(sql.endsWith('commit;')).toBe(true);
  });

  it('should_publish_table_in_realtime_only_once_when_reapplied', () => {
    expect(sql).toContain("where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notificacion'");
    expect(sql).toContain('alter publication supabase_realtime add table public.notificacion;');
  });

  it('should_index_user_inbox_and_emisor_fk', () => {
    expect(sql).toContain('on public.notificacion (usuario_id, leida, created_at desc);');
    expect(sql).toContain('on public.notificacion (emisor_id);');
  });

  it('should_drop_legacy_trigger_functions_that_used_auth_uid_as_emisor', () => {
    for (const fn of ['notificar_solicitud', 'notificar_observacion', 'notificar_solicitud_vehiculo']) {
      expect(sql).toContain(`drop function if exists public.${fn}();`);
    }
  });

  it('should_not_grant_write_permissions_to_authenticated', () => {
    expect(sql).not.toMatch(/grant [^;]*(insert|update|delete)[^;]* to authenticated/);
  });

  it('should_restore_functions_and_remove_realtime_when_rolled_back', () => {
    const r = normalizarSql(leerMigracion('rollback', NOMBRE));
    expect(r).toContain('alter publication supabase_realtime drop table public.notificacion;');
    expect(r).toContain('drop index if exists public.notificacion_usuario_bandeja_idx;');
    for (const fn of ['notificar_solicitud', 'notificar_observacion', 'notificar_solicitud_vehiculo']) {
      expect(r).toContain(`create or replace function public.${fn}()`);
    }
  });
});
