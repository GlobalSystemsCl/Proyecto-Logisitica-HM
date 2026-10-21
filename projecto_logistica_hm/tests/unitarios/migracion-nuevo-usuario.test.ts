import { describe, expect, it } from 'vitest';
import { leerMigracion, normalizarSql } from '../mocks/sql';
import { TIPO_NUEVO_USUARIO } from '@/lib/notificaciones-app';

/** Contrato de la migración 20261020140000 (notificación de usuario nuevo). */
const NOMBRE = '20261020140000_notificacion_nuevo_usuario.sql';

describe('Migración notificacion_nuevo_usuario', () => {
  const sql = normalizarSql(leerMigracion('migrations', NOMBRE));
  const rollback = normalizarSql(leerMigracion('rollback', NOMBRE));

  it('should_add_the_enum_value_used_by_the_app_idempotently', () => {
    expect(sql).toContain(`alter type public.tipo_notificacion add value if not exists '${TIPO_NUEVO_USUARIO.toLowerCase()}';`);
  });

  it('should_not_open_a_transaction_around_add_value', () => {
    expect(sql).not.toContain('begin;');
  });

  it('should_only_delete_notifications_of_that_type_when_rolled_back', () => {
    expect(rollback).toContain("delete from public.notificacion where tipo = 'nuevo_usuario';");
    expect(rollback).not.toContain('drop ');
  });
});
