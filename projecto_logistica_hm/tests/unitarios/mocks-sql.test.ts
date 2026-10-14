import { describe, expect, it } from 'vitest';
import { cuerpoFuncion, normalizarSql } from '../mocks/sql';

/**
 * Helpers de los tests de contrato de migraciones. Deben dar el mismo
 * resultado con saltos de línea LF y CRLF (checkout en Windows).
 */

const SQL = [
  '-- Comentario de cabecera',
  'begin;',
  'create or replace function public.f() returns int',
  'language sql as $$ select 1; $$; -- comentario final',
  'commit;',
].join('\n');

describe('normalizarSql', () => {
  it('should_strip_comments_and_collapse_spaces_when_line_endings_are_lf', () => {
    expect(normalizarSql(SQL)).toBe(
      'begin; create or replace function public.f() returns int language sql as $$ select 1; $$; commit;'
    );
  });

  it('should_give_same_result_when_line_endings_are_crlf', () => {
    expect(normalizarSql(SQL.replace(/\n/g, '\r\n'))).toBe(normalizarSql(SQL));
  });

  it('should_return_empty_string_when_sql_has_only_comments', () => {
    expect(normalizarSql('-- solo comentario\r\n-- otro')).toBe('');
  });
});

describe('cuerpoFuncion', () => {
  it('should_return_function_body_when_line_endings_are_crlf', () => {
    expect(cuerpoFuncion(SQL.replace(/\n/g, '\r\n'), 'f')).toBe(
      'create or replace function public.f() returns int language sql as $$ select 1; $$;'
    );
  });

  it('should_return_empty_string_when_function_does_not_exist', () => {
    expect(cuerpoFuncion(SQL, 'otra')).toBe('');
  });
});
