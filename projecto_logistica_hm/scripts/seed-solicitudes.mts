// SEED (solo desarrollo): 1 solicitud de venta por sucursal para probar el
// circuito multi-sucursal / por zonas.
//  - Un vehículo disponible (no reservado en solicitudes activas) por sucursal.
//  - fecha_limite en el futuro (hoy + 10 días).
//  - Usa solo estados ya presentes en el enum `estado_solicitud` de la BD viva
//    (DEV 2 pendiente: no usa 'despachada').
// Uso: node --experimental-strip-types --env-file=.env.local scripts/seed-solicitudes.mts
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createClient } from '@supabase/supabase-js';

function loadEnv(file: string): void {
  const lines = readFileSync(file, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    let key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (key.startsWith('export ')) key = key.slice(7).trim();
    value = value.replace(/^["']|["']$/g, '');
    if (process.env[key] === undefined || process.env[key] === '') process.env[key] = value;
  }
}

const envFile = join(dirname(fileURLToPath(import.meta.url)), '..', '.env.local');
loadEnv(envFile);

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
if (!url || !key) {
  console.error('Faltan variables de Supabase en .env.local.');
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

const ESTADOS_ACTIVOS = [
  'pendiente_aprobacion',
  'aprobada',
  'priorizada',
  'asignada',
  'calendarizada',
  'en_transito',
] as const;
const DIAS_AVANCE = 10;

interface SucursalRow { id: number; nombre: string | null; usuario_id: string | null }
interface VehiculoRow { id: string; chasis: string | null; patente: string | null }
interface UsuarioRow { id: string; rol: string | null; sucursal_id: number | null }

async function main(): Promise<void> {
  const { data: sucursales, error: e1 } = await supabase
    .from('sucursal')
    .select('id, nombre, usuario_id')
    .order('id');
  if (e1) { console.error('Error al listar sucursales:', e1.message); process.exit(1); }

  const { data: vehiculos, error: e2 } = await supabase
    .from('vehiculo')
    .select('id, chasis, patente');
  if (e2) { console.error('Error al listar vehículos:', e2.message); process.exit(1); }

  const { data: solicitudes, error: e3 } = await supabase.from('solicitud').select('id, estado');
  if (e3) { console.error('Error al listar solicitudes:', e3.message); process.exit(1); }

  const activasIds = (solicitudes as Array<{ id: string; estado: string }> | null || [])
    .filter((s) => (ESTADOS_ACTIVOS as readonly string[]).includes(s.estado))
    .map((s) => s.id);

  const reservados = new Set<string>();
  if (activasIds.length > 0) {
    const { data: sv, error: e4 } = await supabase
      .from('solicitud_vehiculo')
      .select('vehiculo_id')
      .eq('disponibilidad', 'reservado')
      .in('solicitud_id', activasIds);
    if (e4) { console.error('Error al listar reservas:', e4.message); process.exit(1); }
    (sv as Array<{ vehiculo_id: string }> | null || []).forEach((r) => reservados.add(r.vehiculo_id));
  }

  const { data: usuarios, error: e5 } = await supabase.from('usuario').select('id, rol, sucursal_id');
  if (e5) { console.error('Error al listar usuarios:', e5.message); process.exit(1); }

  const ejecutivoPorSucursal = new Map<number, string>();
  const jefePorSucursal = new Map<number, string>();
  (usuarios as UsuarioRow[] | null || []).forEach((u) => {
    if (!u.sucursal_id) return;
    if (u.rol === 'ejecutivo' && !ejecutivoPorSucursal.has(u.sucursal_id)) {
      ejecutivoPorSucursal.set(u.sucursal_id, u.id);
    }
    if (u.rol === 'jefe_local' && !jefePorSucursal.has(u.sucursal_id)) {
      jefePorSucursal.set(u.sucursal_id, u.id);
    }
  });

  const disponibles = (vehiculos as VehiculoRow[] | null || []).filter((v) => !reservados.has(v.id));
  const filas = sucursales as SucursalRow[] | null || [];
  const fechaLimite = new Date(Date.now() + DIAS_AVANCE * 24 * 3600 * 1000).toISOString();

  console.log(`Sucursales: ${filas.length} | Vehículos disponibles: ${disponibles.length}`);
  console.log('--- Creando solicitudes ---');

  const creadas: Array<string> = [];
  let autoIdx = 0;
  for (const suc of filas) {
    if (autoIdx >= disponibles.length) {
      console.log(`  - [${suc.nombre}] SIN vehículos disponibles, se omite.`);
      continue;
    }
    const vehiculo = disponibles[autoIdx++];
    const jefeId = jefePorSucursal.get(suc.id) ?? suc.usuario_id ?? null;
    const ejecutivoId = ejecutivoPorSucursal.get(suc.id) ?? null;

    const { data: sol, error: er } = await supabase
      .from('solicitud')
      .insert({
        sucursal: suc.id,
        sucursal_destino: suc.id,
        tipo_solicitud: 'venta',
        estado: 'pendiente_aprobacion',
        fecha_limite: fechaLimite,
        ejecutivo_id: ejecutivoId,
        jefe_local_id: jefeId,
      })
      .select('id')
      .single();

    if (er) { console.log(`  - [${suc.nombre}] ERROR al crear solicitud: ${er.message}`); continue; }

    const { error: er2 } = await supabase.from('solicitud_vehiculo').insert({
      solicitud_id: (sol as { id: string }).id,
      vehiculo_id: vehiculo.id,
      disponibilidad: 'reservado',
    });

    if (er2) {
      await supabase.from('solicitud').delete().eq('id', (sol as { id: string }).id);
      console.log(`  - [${suc.nombre}] ERROR al reservar vehículo: ${er2.message}`);
      continue;
    }

    creadas.push(`${suc.nombre} -> vehículo ${vehiculo.chasis ?? vehiculo.patente ?? vehiculo.id} (JL: ${jefeId ? '√' : 'sin jefe'})`);
  }

  console.log(`--- Resultado: ${creadas.length}/${filas.length} solicitudes creadas ---`);
  creadas.forEach((c) => console.log(`  ✔ ${c}`));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});