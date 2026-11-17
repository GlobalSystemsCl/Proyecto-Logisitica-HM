// Consolida los resultados de stress/out/ en stress/out/resumen.json (insumo del informe).
//   node stress/05-resumen.mjs
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { DIR_OUT, guardarJson, leerJson, log } from './lib/comun.mjs';

const r1 = (x) => (x == null || Number.isNaN(x) ? null : Math.round(x * 10) / 10);

function nivelK6(archivo) {
  const d = leerJson(archivo);
  const m = d.metrics;
  const dur = m.http_req_duration?.values ?? {};
  const porOp = {};
  for (const [nombre, met] of Object.entries(m)) {
    const op = nombre.match(/^http_req_duration\{op:(\w+)\}$/)?.[1];
    if (op && met.values.count) {
      porOp[op] = { n: met.values.count, avg: r1(met.values.avg), p50: r1(met.values.med), p95: r1(met.values['p(95)']), p99: r1(met.values['p(99)']), max: r1(met.values.max) };
    }
  }
  return {
    peticiones: m.http_reqs?.values.count ?? 0,
    reqPorSeg: r1(m.http_reqs?.values.rate),
    avg: r1(dur.avg), min: r1(dur.min), p50: r1(dur.med), p90: r1(dur['p(90)']), p95: r1(dur['p(95)']), p99: r1(dur['p(99)']), max: r1(dur.max),
    erroresHttpPct: r1((m.http_req_failed?.values.rate ?? 0) * 100),
    negocioOkPct: r1((m.negocio_ok?.values.rate ?? 0) * 100),
    conflictos: m.conflictos_actualizacion?.values.count ?? 0,
    erroresNegocio: m.errores_negocio?.values.count ?? 0,
    colasVacias: m.colas_vacias?.values.count ?? 0,
    loginApp: m.login_app_ms ? { n: m.login_app_ms.values.count, p50: r1(m.login_app_ms.values.med), p95: r1(m.login_app_ms.values['p(95)']) } : null,
    checksOkPct: r1((m.checks?.values.rate ?? 0) * 100),
    vusMax: m.vus_max?.values.max ?? null,
    porOp,
  };
}

function nivelMonitor(archivo) {
  const d = leerJson(archivo);
  const s = d.serie.filter((x) => !x.error);
  const max = (k) => (s.length ? Math.max(...s.map((x) => x[k] ?? 0)) : null);
  const prom = (k) => (s.length ? r1(s.reduce((a, x) => a + (x[k] ?? 0), 0) / s.length) : null);
  const suma = (k) => s.reduce((a, x) => a + (x[k] ?? 0), 0);
  return {
    inicio: d.inicio, fin: d.fin, corte: d.corte, codigoK6: d.codigoK6, muestras: s.length, erroresMuestreo: d.serie.length - s.length,
    cpuMaxPct: max('cpuPct'), cpuPromPct: prom('cpuPct'), memMaxPct: max('memPct'), load1Max: max('load1'),
    conexionesMax: max('conexiones'), conexionesProm: prom('conexiones'), tpsMax: max('tps'), tpsProm: prom('tps'),
    deadlocks: suma('deadlocksNuevos'), rollbacks: suma('rollbacks'),
    clientesEsperandoPoolMax: max('clientesEsperandoPool'), esperasPoolRest: suma('esperasPoolRest'),
    conexionesRestMax: max('conexionesRestAbiertas'),
  };
}

const archivos = readdirSync(DIR_OUT);
const niveles = [...new Set(archivos.map((a) => a.match(/^(?:k6|monitor)-(\d+)vus\.json$/)?.[1]).filter(Boolean))].map(Number).sort((a, b) => a - b);
const resumen = {
  generado: new Date().toISOString(),
  generacion: existsSync(join(DIR_OUT, 'generacion.json')) ? leerJson('generacion.json') : null,
  niveles: niveles.map((vus) => ({
    vus,
    k6: archivos.includes(`k6-${vus}vus.json`) ? nivelK6(`k6-${vus}vus.json`) : null,
    infra: archivos.includes(`monitor-${vus}vus.json`) ? nivelMonitor(`monitor-${vus}vus.json`) : null,
  })),
};
if (resumen.generacion) delete resumen.generacion.lotes;
const ruta = guardarJson('resumen.json', resumen);
for (const n of resumen.niveles) {
  log(`${n.vus} VU: ${n.k6?.reqPorSeg} req/s · p50 ${n.k6?.p50} · p95 ${n.k6?.p95} · p99 ${n.k6?.p99} ms · errores ${n.k6?.erroresHttpPct}% · CPU máx ${n.infra?.cpuMaxPct}% · conexiones máx ${n.infra?.conexionesMax}${n.infra?.corte ? ` · CORTE: ${n.infra.corte}` : ''}`);
}
log(`resumen: ${ruta}`);
