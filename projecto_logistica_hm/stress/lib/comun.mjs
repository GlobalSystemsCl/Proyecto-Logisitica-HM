// Utilidades compartidas de la prueba de estrés. Nunca imprime secretos.
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { CONFIG } from '../config.mjs';

export const RAIZ_STRESS = join(dirname(fileURLToPath(import.meta.url)), '..');
export const RAIZ_PROYECTO = join(RAIZ_STRESS, '..');
export const DIR_OUT = join(RAIZ_STRESS, 'out');
if (!existsSync(DIR_OUT)) mkdirSync(DIR_OUT, { recursive: true });

/** Lee `.env.local` sin exponer valores. */
export function cargarEntorno() {
  const ruta = join(RAIZ_PROYECTO, '.env.local');
  const env = {};
  for (const linea of readFileSync(ruta, 'utf8').split(/\r?\n/)) {
    const m = linea.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].trim().replace(/^"|"$/g, '');
  }
  const url = env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  if (!url.includes(CONFIG.proyectoSupabase)) {
    throw new Error(`El .env.local no apunta al proyecto esperado (${CONFIG.proyectoSupabase}). Se detiene.`);
  }
  if (!env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('Falta SUPABASE_SERVICE_ROLE_KEY en .env.local.');
  return env;
}

export function clienteAdmin(env = cargarEntorno()) {
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** UUID determinista (formato v5) a partir de un nombre: idempotencia. */
export function uuidDet(nombre) {
  const h = createHash('sha1').update(`hm-stress:${nombre}`).digest();
  h[6] = (h[6] & 0x0f) | 0x50;
  h[8] = (h[8] & 0x3f) | 0x80;
  const x = h.subarray(0, 16).toString('hex');
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20, 32)}`;
}

/** PRNG determinista (mulberry32). */
export function prng(semilla) {
  let a = semilla >>> 0;
  const r = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  r.entre = (min, max) => min + r() * (max - min);
  r.entero = (min, max) => Math.floor(r.entre(min, max + 1));
  r.de = (lista) => lista[Math.floor(r() * lista.length)];
  return r;
}

export function trozos(lista, tam) {
  const out = [];
  for (let i = 0; i < lista.length; i += tam) out.push(lista.slice(i, i + tam));
  return out;
}

export const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

/** Contraseña de las cuentas ficticias: se genera una vez y queda en out/ (ignorado por git). */
export function secretoSimulacion() {
  const ruta = join(DIR_OUT, 'secreto.json');
  if (existsSync(ruta)) return JSON.parse(readFileSync(ruta, 'utf8'));
  const s = { password: `Stress-${randomBytes(12).toString('base64url')}-9a` };
  writeFileSync(ruta, JSON.stringify(s, null, 2));
  return s;
}

export function guardarJson(nombre, datos) {
  const ruta = join(DIR_OUT, nombre);
  writeFileSync(ruta, JSON.stringify(datos, null, 2));
  return ruta;
}

export function leerJson(nombre) {
  return JSON.parse(readFileSync(join(DIR_OUT, nombre), 'utf8'));
}

export function log(...a) {
  console.log(new Date().toISOString().slice(11, 19), ...a);
}

/** Lanza si un error de Supabase viene definido. */
export function ok(res, contexto) {
  if (res.error) throw new Error(`${contexto}: ${res.error.message ?? JSON.stringify(res.error)}`);
  return res.data;
}
