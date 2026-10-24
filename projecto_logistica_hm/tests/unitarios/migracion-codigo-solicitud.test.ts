import { describe, expect, it } from 'vitest';
import { cuerpoFuncion, leerMigracion, normalizarSql } from '../mocks/sql';

/**
 * Contrato de la migración 20261024120000: el n° visible de una solicitud es
 * `<sucursal de origen>-<numero>`, con sucursal.id = código del Excel y un
 * correlativo por sucursal que asigna la BD.
 */

const NOMBRE = '20261024120000_codigo_solicitud_por_sucursal.sql';

/** Códigos de la hoja "Concecionarios" de modelo_excel/Sucursales de Ventas y Marcas.xlsx. */
const CODIGOS_EXCEL = [
  101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113, 114, 115, 116, 117, 118, 119, 120, 121, 122,
  123, 124, 125, 126, 127, 128, 129, 130, 133, 134, 135, 136, 137, 139, 140, 141, 142, 143, 144, 145,
];

describe('Migración codigo_solicitud_por_sucursal', () => {
  const sql = normalizarSql(leerMigracion('migrations', NOMBRE));
  const fn = cuerpoFuncion(leerMigracion('migrations', NOMBRE), 'fn_asignar_numero_solicitud');

  it('should_add_counter_per_branch_and_unique_number_per_branch', () => {
    expect(sql).toContain(
      'alter table public.sucursal add column if not exists ultimo_numero_solicitud bigint not null default 0;'
    );
    expect(sql).toContain('alter table public.solicitud add column if not exists numero bigint;');
    expect(sql).toContain('add constraint solicitud_sucursal_numero_key unique (sucursal, numero);');
  });

  it('should_number_existing_requests_by_creation_date_within_each_branch', () => {
    expect(sql).toContain('row_number() over (partition by s.sucursal order by s.fecha_creacion, s.id)');
    const iNumerar = sql.indexOf('with numeradas as');
    const iContador = sql.indexOf('update public.sucursal su set ultimo_numero_solicitud');
    expect(iNumerar).toBeGreaterThan(-1);
    expect(iContador).toBeGreaterThan(iNumerar);
  });

  it('should_take_next_number_from_branch_counter_when_inserting', () => {
    expect(fn).toContain('set ultimo_numero_solicitud = ultimo_numero_solicitud + 1');
    expect(fn).toContain('where id = new.sucursal returning ultimo_numero_solicitud into new.numero;');
    expect(fn).toContain('security definer');
    expect(fn).toContain('set search_path = public, pg_temp');
  });

  it('should_keep_number_when_branch_does_not_change_or_is_renamed_by_cascade', () => {
    expect(fn).toContain('if new.sucursal is not distinct from old.sucursal then new.numero := old.numero;');
    expect(fn).toContain('not exists (select 1 from public.sucursal where id = old.sucursal)');
  });

  it('should_run_trigger_before_insert_and_on_branch_or_number_updates', () => {
    expect(sql).toContain(
      'create trigger tr_asignar_numero_solicitud before insert or update of sucursal, numero on public.solicitud for each row execute function public.fn_asignar_numero_solicitud();'
    );
    expect(sql).toContain(
      'revoke execute on function public.fn_asignar_numero_solicitud() from public, anon, authenticated;'
    );
  });

  it('should_load_every_branch_of_the_excel_with_its_code_as_id', () => {
    expect(sql).toContain('insert into public.sucursal (id, nombre) overriding system value values');
    for (const codigo of CODIGOS_EXCEL) {
      expect(sql, String(codigo)).toMatch(new RegExp(`\\(${codigo}, '`));
    }
    expect(sql.match(/\(1\d\d, '/g)).toHaveLength(CODIGOS_EXCEL.length);
    expect(sql).toContain('on conflict (id) do nothing;');
  });

  it('should_move_id_sequence_above_highest_code', () => {
    expect(sql).toContain("setval( pg_get_serial_sequence('public.sucursal', 'id'),");
  });

  it('should_be_transactional_when_applied', () => {
    expect(sql.startsWith('begin;')).toBe(true);
    expect(sql.endsWith('commit;')).toBe(true);
  });

  it('should_drop_trigger_and_columns_but_keep_branches_when_rolled_back', () => {
    const rollback = normalizarSql(leerMigracion('rollback', NOMBRE));
    expect(rollback).toContain('drop trigger if exists tr_asignar_numero_solicitud on public.solicitud;');
    expect(rollback).toContain('drop function if exists public.fn_asignar_numero_solicitud();');
    expect(rollback).toContain('alter table public.solicitud drop column if exists numero;');
    expect(rollback).toContain('alter table public.sucursal drop column if exists ultimo_numero_solicitud;');
    expect(rollback).not.toContain('delete from public.sucursal');
  });
});
