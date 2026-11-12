import { describe, expect, it } from 'vitest';
import { leerMigracion, normalizarSql } from '../mocks/sql';

/**
 * Contrato de la migración 20261112140000 (avisos completos): tipos nuevos del
 * enum fuera de la transacción y tabla `correo_envio` solo para service_role.
 */

const NOMBRE = '20261112140000_notificaciones_completas.sql';

describe('Migración notificaciones_completas', () => {
  const sql = normalizarSql(leerMigracion('migrations', NOMBRE));

  it('should_add_the_new_notification_types_outside_the_transaction', () => {
    for (const tipo of ['solicitud_insistencia', 'traslado_interno_creado', 'traslado_interno_en_transito', 'traslado_interno_recepcionado']) {
      expect(sql).toContain(`alter type public.tipo_notificacion add value if not exists '${tipo}';`);
    }
    expect(sql.lastIndexOf('add value')).toBeLessThan(sql.indexOf('begin;'));
    expect(sql.endsWith('commit;')).toBe(true);
  });

  it('should_create_the_email_log_with_allowed_states', () => {
    expect(sql).toContain('create table if not exists public.correo_envio');
    expect(sql).toContain("check (estado in ('enviado', 'fallido', 'omitido_tope', 'duplicado'))");
    expect(sql).toContain("check (entidad in ('solicitud', 'traslado_interno'))");
    expect(sql).toContain('usuario_id uuid references public.usuario (id) on delete set null');
  });

  it('should_index_daily_counts_and_per_user_lookups', () => {
    expect(sql).toContain('on public.correo_envio (estado, created_at desc);');
    expect(sql).toContain('on public.correo_envio (usuario_id, created_at desc);');
  });

  it('should_keep_the_log_private_to_service_role', () => {
    expect(sql).toContain('alter table public.correo_envio enable row level security;');
    expect(sql).toContain('revoke all on public.correo_envio from anon, authenticated;');
    expect(sql).not.toContain('create policy');
    expect(sql).not.toMatch(/grant [^;]* to (anon|authenticated)/);
  });

  it('should_drop_the_log_and_new_notifications_when_rolled_back', () => {
    const r = normalizarSql(leerMigracion('rollback', NOMBRE));
    expect(r).toContain('drop table if exists public.correo_envio;');
    expect(r).toContain("delete from public.notificacion where tipo in ('solicitud_insistencia'");
  });
});
