import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Helpers para los tests de contrato de migraciones SQL. No hay
 * infraestructura de tests contra Postgres (brecha 017), así que se verifica
 * el contenido de los archivos de `supabase/`.
 */

const SUPABASE = join(process.cwd(), 'supabase');

/** Contenido de una migración o de su rollback. */
export function leerMigracion(carpeta: 'migrations' | 'rollback', nombre: string): string {
  return readFileSync(join(SUPABASE, carpeta, nombre), 'utf8');
}

/**
 * SQL sin comentarios de línea, en minúsculas y con espacios normalizados.
 * Acepta CRLF (checkout en Windows): en JS el `.` no cruza `\r`, así que sin
 * partir también por `\r` los comentarios quedarían sin quitar.
 */
export function normalizarSql(sql: string): string {
  return sql
    .split(/\r?\n/)
    .map((l) => l.replace(/--.*$/, ''))
    .join(' ')
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .trim();
}

/**
 * Cuerpo normalizado de `create or replace function public.<nombre>(`, desde
 * su encabezado hasta el `$$;` que lo cierra. Cadena vacía si no existe.
 */
export function cuerpoFuncion(sql: string, nombre: string): string {
  const n = normalizarSql(sql);
  const inicio = n.indexOf(`create or replace function public.${nombre}(`);
  if (inicio === -1) return '';
  const apertura = n.indexOf('$$', inicio);
  const cierre = n.indexOf('$$;', apertura + 2);
  return cierre === -1 ? '' : n.slice(inicio, cierre + 3);
}
