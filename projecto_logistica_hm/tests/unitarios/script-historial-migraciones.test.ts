import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { normalizarSql } from '../mocks/sql';

/**
 * Brecha 015: el script que alinea supabase_migrations.schema_migrations debe
 * registrar exactamente los archivos de supabase/migrations/, con su versión y
 * nombre.
 */

const SUPABASE = join(process.cwd(), 'supabase');
const script = normalizarSql(readFileSync(join(SUPABASE, 'scripts', '01_alinear_historial_migraciones.sql'), 'utf8'));
const archivos = readdirSync(join(SUPABASE, 'migrations')).filter((f) => f.endsWith('.sql')).sort();

describe('Script 01_alinear_historial_migraciones', () => {
  it('should_register_every_migration_file_with_its_version_and_name', () => {
    expect(archivos.length).toBeGreaterThan(0);
    for (const archivo of archivos) {
      const [, version, nombre] = archivo.match(/^(\d{14})_(.+)\.sql$/) ?? [];
      expect(version, archivo).toBeDefined();
      expect(script).toContain(`('${version}', '${nombre}')`);
    }
  });

  it('should_not_register_versions_without_a_migration_file', () => {
    // El nombre empieza con letra: así no se confunde con la lista del delete.
    const registradas = [...script.matchAll(/\('(\d{14})', '[a-z][a-z0-9_]+'\)/g)].map((m) => m[1]);
    expect(registradas.sort()).toEqual(archivos.map((f) => f.slice(0, 14)));
  });

  it('should_remove_connector_versions_that_do_not_match_the_repo', () => {
    expect(script).toContain("where version in ('20261013144915', '20261013152109');");
  });

  it('should_be_idempotent_and_transactional', () => {
    expect(script).toContain('on conflict (version) do nothing;');
    expect(script.startsWith('begin;')).toBe(true);
    expect(script.endsWith('commit;')).toBe(true);
  });
});
