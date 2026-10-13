import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Contrato de la migración 20261013120000 (corrección R8).
 *
 * El trigger fn_reservar_slots_traslado_vehiculo suma +1 a slots_reservados y
 * a slots_ocupados del destino al crear un traslado; la cancelación debe
 * descontar ambos. No hay infraestructura de tests SQL (brecha 017), así que se
 * verifica el contenido del archivo, como en actions-inventario.test.ts.
 */

const NOMBRE = '20261013120000_fix_cancelar_traslado_slots_ocupados.sql';
const SUPABASE = join(process.cwd(), 'supabase');

function leer(carpeta: 'migrations' | 'rollback'): string {
  return readFileSync(join(SUPABASE, carpeta, NOMBRE), 'utf8');
}

/** SQL sin comentarios de línea, en minúsculas y con espacios normalizados. */
function normalizar(sql: string): string {
  return sql
    .split(/\r?\n/) // el checkout en Windows puede dejar CRLF
    .map((l) => l.replace(/--.*$/, ''))
    .join(' ')
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .trim();
}

/** Sentencia `update public.sucursal ... ;` de la función. */
function updateSucursal(sql: string): string {
  const m = normalizar(sql).match(/update public\.sucursal set .*?;/);
  return m ? m[0] : '';
}

const FIRMA = 'public.fn_cancelar_traslado_interno(uuid, uuid, text, bigint)';

describe('Migración fix_cancelar_traslado_slots_ocupados', () => {
  const migracion = leer('migrations');
  const sql = normalizar(migracion);

  it('should_decrement_both_slot_counters_when_traslado_is_cancelled', () => {
    const update = updateSucursal(migracion);
    expect(update).toContain('slots_reservados = greatest(coalesce(slots_reservados, 0) - v_n, 0)');
    expect(update).toContain('slots_ocupados = greatest(coalesce(slots_ocupados, 0) - v_n, 0)');
    expect(update).toContain('where id = v_destino');
    expect(sql).toContain('v_n := coalesce(array_length(v_vehiculos, 1), 0);');
  });

  it('should_keep_same_signature_and_security_when_replacing_function', () => {
    expect(sql).toContain(
      'create or replace function public.fn_cancelar_traslado_interno( p_traslado_id uuid, p_usuario_id uuid, p_motivo text, p_ubicacion bigint ) returns void'
    );
    expect(sql).toContain('security definer');
    expect(sql).toContain('set search_path = public, pg_temp');
    expect(sql).toContain(`revoke execute on function ${FIRMA} from public, anon, authenticated;`);
    expect(sql).toContain(`grant execute on function ${FIRMA} to service_role;`);
  });

  it('should_keep_business_validations_when_replacing_function', () => {
    expect(sql).toContain("if v_estado <> 'en_transito' then");
    expect(sql).toContain('length(btrim(p_motivo)) < 5');
    expect(sql).toContain('for update;');
    expect(sql).toContain("set disponibilidad = 'liberado'");
    expect(sql).toContain('update public.vehiculo set ubicacion = p_ubicacion');
  });

  it('should_be_transactional_when_applied', () => {
    expect(sql.startsWith('begin;')).toBe(true);
    expect(sql.endsWith('commit;')).toBe(true);
  });

  it('should_have_matching_rollback_when_migration_exists', () => {
    const rollback = leer('rollback');
    const update = updateSucursal(rollback);
    expect(normalizar(rollback)).toContain('create or replace function public.fn_cancelar_traslado_interno(');
    expect(update).toContain('slots_reservados = greatest(');
    expect(update).not.toContain('slots_ocupados');
  });
});
