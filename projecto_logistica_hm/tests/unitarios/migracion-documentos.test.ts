import { describe, expect, it } from 'vitest';
import { leerMigracion, normalizarSql } from '../mocks/sql';
import { TIPOS_DOCUMENTO } from '@/lib/archivos';

/**
 * Contrato de la migración 20261103120000: el bucket de documentos acepta
 * exactamente los mismos tipos que valida la app (R11).
 */

const NOMBRE = '20261103120000_documentos_excel_pdf_imagenes.sql';

function tiposDe(sql: string): string[] {
  const bloque = sql.slice(sql.indexOf('array['), sql.indexOf(']', sql.indexOf('array[')));
  return [...bloque.matchAll(/'([^']+)'/g)].map((m) => m[1]).sort();
}

describe('Migración documentos Excel, PDF e imágenes', () => {
  const sql = normalizarSql(leerMigracion('migrations', NOMBRE));

  it('should_allow_in_bucket_exactly_the_types_validated_by_the_app', () => {
    expect(sql).toContain("where id = 'solicitud-documentos';");
    expect(tiposDe(sql)).toEqual(Object.keys(TIPOS_DOCUMENTO).sort());
  });

  it('should_be_transactional_when_applied', () => {
    expect(sql.startsWith('begin;')).toBe(true);
    expect(sql).toContain('commit;');
  });

  it('should_restore_previous_list_when_rolled_back', () => {
    const rollback = normalizarSql(leerMigracion('rollback', NOMBRE));
    expect(tiposDe(rollback)).toContain('application/zip');
    expect(tiposDe(rollback)).not.toContain('application/vnd.ms-excel');
  });
});
