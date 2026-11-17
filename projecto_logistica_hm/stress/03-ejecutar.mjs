// Carga progresiva con corte automático.
//   node stress/03-ejecutar.mjs                 -> 20, 40, 80, 122, 150, 200
//   node stress/03-ejecutar.mjs 20 40           -> solo esos niveles
//   STRESS_SOSTENER=3m STRESS_RAMPA=1m          -> duración de cada nivel
// Corta si: errores HTTP > 5 % o p95 > 5 s (umbrales de k6), o conexiones a la BD > 50
// (lo vigila este proceso con las métricas de Supabase cada 5 s). Si un nivel se corta,
// no se ejecutan los siguientes.
import { spawn, spawnSync } from 'node:child_process';
import { createWriteStream, existsSync } from 'node:fs';
import { join } from 'node:path';
import { bypassVercel } from './02-preparar-carga.mjs';
import { cargarEntorno, DIR_OUT, esperar, guardarJson, log, RAIZ_STRESS } from './lib/comun.mjs';

const NIVELES = process.argv.slice(2).map(Number).filter(Boolean);
const LISTA = NIVELES.length ? NIVELES : [20, 40, 80, 122, 150, 200];
const MAX_CONEXIONES = 50;
const PAUSA_ENTRE_NIVELES_MS = 60_000;
const K6 = process.env.K6_BIN || (existsSync('C:/Program Files/k6/k6.exe') ? 'C:/Program Files/k6/k6.exe' : 'k6');

/** Métricas Prometheus de Supabase (CPU, RAM, conexiones, pool, deadlocks). */
async function leerMetricas(env) {
  const res = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/customer/v1/privileged/metrics`, {
    headers: { Authorization: 'Basic ' + Buffer.from('service_role:' + env.SUPABASE_SERVICE_ROLE_KEY).toString('base64') },
  });
  if (!res.ok) throw new Error(`métricas HTTP ${res.status}`);
  const m = {};
  for (const linea of (await res.text()).split('\n')) {
    if (!linea || linea.startsWith('#')) continue;
    const i = linea.lastIndexOf(' ');
    const clave = linea.slice(0, i);
    const nombre = clave.split('{')[0];
    (m[nombre] ??= []).push({ etiquetas: clave, valor: Number(linea.slice(i + 1)) });
  }
  const suma = (n, filtro = () => true) => (m[n] ?? []).filter((x) => filtro(x.etiquetas)).reduce((a, x) => a + x.valor, 0);
  return {
    t: Date.now(),
    cpuIdle: suma('node_cpu_seconds_total', (e) => e.includes('mode="idle"')),
    cpuTotal: suma('node_cpu_seconds_total'),
    memTotal: suma('node_memory_MemTotal_bytes'),
    memDisponible: suma('node_memory_MemAvailable_bytes'),
    load1: suma('node_load1'),
    conexiones: suma('pg_stat_database_num_backends'),
    deadlocks: suma('pg_stat_database_deadlocks_total'),
    rollbacks: suma('pg_stat_database_xact_rollback_total'),
    commits: suma('pg_stat_database_xact_commit_total'),
    clientesEsperandoPool: suma('pgbouncer_pools_client_waiting_connections'),
    esperasPoolRest: suma('db_sql_connection_wait_total'),
    conexionesRestAbiertas: suma('db_sql_connection_open'),
    maxConexiones: suma('max_connections_connection_count'),
  };
}

function derivar(prev, act) {
  const dTotal = act.cpuTotal - prev.cpuTotal;
  return {
    t: new Date(act.t).toISOString(),
    cpuPct: dTotal > 0 ? +(100 * (1 - (act.cpuIdle - prev.cpuIdle) / dTotal)).toFixed(1) : null,
    memPct: act.memTotal ? +(100 * (1 - act.memDisponible / act.memTotal)).toFixed(1) : null,
    load1: act.load1,
    conexiones: act.conexiones,
    deadlocksNuevos: act.deadlocks - prev.deadlocks,
    rollbacks: act.rollbacks - prev.rollbacks,
    tps: +((act.commits - prev.commits) / ((act.t - prev.t) / 1000)).toFixed(1),
    clientesEsperandoPool: act.clientesEsperandoPool,
    esperasPoolRest: act.esperasPoolRest - prev.esperasPoolRest,
    conexionesRestAbiertas: act.conexionesRestAbiertas,
  };
}

async function nivel(env, bypass, vus) {
  log(`== nivel ${vus} VU: preparando colas y sesiones`);
  const prep = spawnSync(process.execPath, [join(RAIZ_STRESS, '02-preparar-carga.mjs')], { stdio: 'inherit' });
  if (prep.status !== 0) throw new Error('Falló la preparación.');

  const serie = [];
  let prev = await leerMetricas(env);
  let corte = null;
  const salida = createWriteStream(join(DIR_OUT, `k6-${vus}vus.log`));
  const k6 = spawn(K6, ['run', '--quiet', '-e', `VUS=${vus}`, '-e', `BYPASS=${bypass}`,
    '-e', `SOSTENER=${process.env.STRESS_SOSTENER || '3m'}`, '-e', `RAMPA=${process.env.STRESS_RAMPA || '1m'}`, 'carga.js'],
  { cwd: join(RAIZ_STRESS, 'k6') });
  k6.stdout.pipe(salida);
  k6.stderr.pipe(salida);
  const fin = new Promise((r) => k6.on('exit', (code) => r(code)));
  let terminado = false;
  fin.then(() => (terminado = true));

  const inicio = Date.now();
  while (!terminado) {
    await esperar(5000);
    try {
      const act = await leerMetricas(env);
      const d = derivar(prev, act);
      prev = act;
      serie.push(d);
      if (serie.length % 6 === 0) log(`  ${vus} VU · ${Math.round((Date.now() - inicio) / 1000)} s · CPU ${d.cpuPct}% · RAM ${d.memPct}% · conexiones ${d.conexiones} · tps ${d.tps}`);
      if (d.conexiones > MAX_CONEXIONES && !corte) {
        corte = `conexiones a la BD = ${d.conexiones} (> ${MAX_CONEXIONES})`;
        log(`  CORTE: ${corte}`);
        k6.kill('SIGINT');
        setTimeout(() => !terminado && k6.kill('SIGKILL'), 20_000);
      }
    } catch (e) {
      serie.push({ t: new Date().toISOString(), error: e.message });
    }
  }
  const codigo = await fin;
  // k6 sale con 99 cuando un umbral con abortOnFail se cruza.
  if (codigo === 99 && !corte) corte = 'umbral de k6 (errores > 5 % o p95 > 5 s)';
  const resultado = { vus, inicio: new Date(inicio).toISOString(), fin: new Date().toISOString(), codigoK6: codigo, corte, serie };
  guardarJson(`monitor-${vus}vus.json`, resultado);
  log(`== nivel ${vus} VU terminado (k6 ${codigo})${corte ? ` · CORTADO: ${corte}` : ''}`);
  return resultado;
}

async function main() {
  const env = cargarEntorno();
  const bypass = bypassVercel();
  const resumen = [];
  for (const [i, vus] of LISTA.entries()) {
    const r = await nivel(env, bypass, vus);
    resumen.push({ vus, corte: r.corte, codigoK6: r.codigoK6 });
    if (r.corte) {
      log('Se detiene la progresión: se encontró el punto de corte.');
      break;
    }
    if (i < LISTA.length - 1) {
      log(`pausa de ${PAUSA_ENTRE_NIVELES_MS / 1000} s para que el sistema vuelva a reposo`);
      await esperar(PAUSA_ENTRE_NIVELES_MS);
    }
  }
  guardarJson('ejecucion.json', { terminado: new Date().toISOString(), niveles: resumen });
}

main().catch((e) => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
