// Prepara una corrida de carga: sesiones, IDs de Server Actions del deploy y colas de trabajo.
//   STRESS_BASE_URL=https://...  (por defecto el alias de la rama stress-test)
//   STRESS_VERCEL_BYPASS=<secreto>  o archivo stress/out/vercel-bypass.txt
//   node stress/02-preparar-carga.mjs
// Escribe stress/out/carga.json (lo lee k6). No escribe nada en la BD.
import { createServerClient } from '@supabase/ssr';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { CONFIG, idsSucursalesSim } from './config.mjs';
import { cargarEntorno, clienteAdmin, DIR_OUT, esperar, guardarJson, leerJson, log, ok, secretoSimulacion } from './lib/comun.mjs';

export const BASE_POR_DEFECTO = 'https://logistica-hm-git-stress-test-global-systems.vercel.app';

export function bypassVercel() {
  if (process.env.STRESS_VERCEL_BYPASS) return process.env.STRESS_VERCEL_BYPASS.trim();
  const ruta = join(DIR_OUT, 'vercel-bypass.txt');
  if (existsSync(ruta)) return readFileSync(ruta, 'utf8').trim();
  throw new Error('Falta el secreto de "Protection Bypass for Automation" (STRESS_VERCEL_BYPASS o stress/out/vercel-bypass.txt).');
}

/** Acciones que usa el escenario de carga. */
const ACCIONES = [
  'loginAction', 'createSolicitudAction', 'aprobarSolicitudAction', 'rechazarSolicitudAction', 'priorizarSolicitudAction',
  'asignarEncargadoAction', 'calendarizarSolicitudAction', 'despacharSolicitudAction', 'recibirSolicitudAction',
  'finalizarSolicitudAction', 'getSolicitudDetalleAction', 'getAuditoriaAction', 'getObservacionesAction',
  'getBandejaNotificacionesAction', 'getVehiculosDeSucursalAction',
];
const PAGINAS_ACCIONES = ['/login', '/solicitudes', '/solicitudes/aprobaciones', '/solicitudes/prioridades',
  '/solicitudes/recepciones', '/logistica/calendarizaciones', '/logistica/transito', '/dashboard', '/admin/vehiculos', '/admin/sucursales'];

const SESIONES = 'sesiones.json';
const MARGEN_EXPIRACION_S = 20 * 60;

/** Inicia sesión como lo hace @supabase/ssr en la app y devuelve las cookies resultantes. */
async function iniciarSesion(env, email, password) {
  const jar = new Map();
  const sb = createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: (lista) => lista.forEach(({ name, value }) => (value ? jar.set(name, value) : jar.delete(name))),
    },
  });
  const t0 = Date.now();
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  const ms = Date.now() - t0;
  if (error) return { error: `${error.status ?? ''} ${error.message}`, ms };
  return { cookies: [...jar].map(([name, value]) => ({ name, value })), expira: data.session.expires_at, ms };
}

async function sesiones(env, usuarios) {
  const { password } = secretoSimulacion();
  const previas = existsSync(join(DIR_OUT, SESIONES)) ? leerJson(SESIONES) : {};
  const ahora = Date.now() / 1000;
  const metricas = { logins: 0, errores: [], ms: [] };
  for (const u of usuarios) {
    const p = previas[u.email];
    if (p && p.expira - ahora > MARGEN_EXPIRACION_S) continue;
    let r = await iniciarSesion(env, u.email, password);
    for (let intento = 1; r.error && /429|rate/i.test(r.error) && intento <= 5; intento++) {
      metricas.errores.push({ email: u.email, error: r.error });
      await esperar(15_000 * intento);
      r = await iniciarSesion(env, u.email, password);
    }
    if (r.error) throw new Error(`login ${u.email}: ${r.error}`);
    previas[u.email] = { cookies: r.cookies, expira: r.expira };
    metricas.logins += 1;
    metricas.ms.push(r.ms);
    await esperar(800); // ritmo humano: no saturar Auth desde una sola IP
  }
  guardarJson(SESIONES, previas);
  if (metricas.logins) {
    const ord = [...metricas.ms].sort((a, b) => a - b);
    log(`sesiones: ${metricas.logins} logins directos a Auth, p50 ${ord[Math.floor(ord.length / 2)]} ms, máx ${ord.at(-1)} ms, ${metricas.errores.length} reintentos por límite`);
  }
  return { porEmail: previas, metricas };
}

/** Extrae `createServerReference("<id>", ..., "<nombre>")` de los chunks del deploy. */
async function idsDeAcciones(base, bypass, cookieHeader) {
  const headers = { 'x-vercel-protection-bypass': bypass, cookie: cookieHeader };
  const chunks = new Set();
  for (const pagina of PAGINAS_ACCIONES) {
    const res = await fetch(base + pagina, { headers, redirect: 'follow' });
    const html = await res.text();
    for (const m of html.matchAll(/\/_next\/static\/[^"'\s]+?\.js/g)) chunks.add(m[0]);
  }
  const ids = {};
  for (const c of chunks) {
    const js = await (await fetch(base + c, { headers })).text();
    for (const m of js.matchAll(/createServerReference\)\("([0-9a-f]{40,44})",[^)]*?,"(\w+)"\)/g)) ids[m[2]] = m[1];
  }
  const faltan = ACCIONES.filter((a) => !ids[a]);
  if (faltan.length) throw new Error(`No se encontraron estas acciones en el deploy: ${faltan.join(', ')}`);
  return Object.fromEntries(ACCIONES.map((a) => [a, ids[a]]));
}

async function todas(q) {
  const out = [];
  for (let d = 0; ; d += 1000) {
    const filas = ok(await q().range(d, d + 999), 'consulta');
    out.push(...filas);
    if (filas.length < 1000) return out;
  }
}

async function colas(db, usuarios) {
  const suc = idsSucursalesSim();
  const sol = await todas(() => db.from('solicitud')
    .select('id, estado, sucursal, ejecutivo_id, tipo_solicitud, solicitud_vehiculo(id, disponibilidad)')
    .gte('sucursal', CONFIG.sucursalDesde)
    .in('estado', ['pendiente_aprobacion', 'aprobada', 'priorizada', 'asignada', 'calendarizada', 'en_transito', 'entregada'])
    .order('fecha_creacion', { ascending: true }));
  const recientes = await todas(() => db.from('solicitud').select('id, sucursal, ejecutivo_id')
    .gte('sucursal', CONFIG.sucursalDesde).order('fecha_creacion', { ascending: false }).limit(3000));

  // Vehículos libres: stock sin reserva activa (chasis STRESSL...).
  const libres = await todas(() => db.from('vehiculo').select('id, ubicacion').like('chasis', 'STRESSL%').not('ubicacion', 'is', null));
  const reservados = new Set((await todas(() => db.from('solicitud_vehiculo').select('vehiculo_id, solicitud!inner(estado)')
    .gte('sucursal_origen', CONFIG.sucursalDesde).eq('disponibilidad', 'reservado'))).map((r) => r.vehiculo_id));
  const stock = {};
  for (const v of libres) if (!reservados.has(v.id)) (stock[v.ubicacion] ??= []).push(v.id);

  const porEstado = (estado) => sol.filter((s) => s.estado === estado);
  const deSucursal = (lista, s) => lista.filter((x) => x.sucursal === s).map((x) => x.id);
  // 5 vehículos de cada sucursal quedan en un pozo compartido: miden conflictos de reserva.
  const disputados = suc.flatMap((s) => (stock[s] ?? []).splice(0, 5));

  const ejecutivos = usuarios.filter((u) => u.rol === 'ejecutivo');
  const logisticas = usuarios.filter((u) => u.rol === 'logistica');
  const porSucursalEjec = {};
  for (const e of ejecutivos) (porSucursalEjec[e.sucursal_id] ??= []).push(e);

  for (const u of usuarios) {
    u.lectura = recientes.filter((r) => r.sucursal === u.sucursal_id).slice(0, 40).map((r) => r.id);
    if (!u.lectura.length) u.lectura = recientes.slice(0, 40).map((r) => r.id);
    u.cola = {};
  }
  for (const e of ejecutivos) {
    const companeros = porSucursalEjec[e.sucursal_id];
    const k = companeros.indexOf(e);
    const reparto = (lista) => lista.filter((_, i) => i % companeros.length === k);
    // Venta: vehículos de otras sucursales (nunca del destino). Evento: de la propia.
    const otras = suc.filter((s) => s !== e.sucursal_id);
    e.cola.venta = otras.flatMap((s) => reparto(stock[s] ?? []).slice(0, 2)).slice(0, 40);
    e.cola.evento = reparto(stock[e.sucursal_id] ?? []).slice(0, 10);
    e.cola.finalizar = porEstado('entregada').filter((s) => s.ejecutivo_id === e.id).map((s) => s.id);
  }
  // Las colas de venta de distintos ejecutivos no se cruzan: cada vehículo libre va a uno solo.
  const usados = new Set();
  for (const e of ejecutivos) {
    e.cola.venta = e.cola.venta.filter((v) => !usados.has(v) && usados.add(v));
    e.cola.evento = e.cola.evento.filter((v) => !usados.has(v) && usados.add(v));
  }
  for (const j of usuarios.filter((u) => u.rol === 'jefe_local')) {
    j.cola.aprobar = deSucursal(porEstado('pendiente_aprobacion'), j.sucursal_id);
    j.cola.priorizar = deSucursal(porEstado('aprobada'), j.sucursal_id);
    j.cola.recibir = deSucursal(porEstado('en_transito'), j.sucursal_id);
  }
  logisticas.forEach((l, k) => {
    const reparto = (lista) => lista.filter((_, i) => i % logisticas.length === k);
    l.cola.asignar = reparto(porEstado('priorizada')).map((s) => s.id);
    l.cola.calendarizar = reparto(porEstado('asignada')).map((s) => s.id);
    l.cola.despachar = reparto(porEstado('calendarizada')).map((s) => ({
      id: s.id,
      guias: Object.fromEntries(s.solicitud_vehiculo.filter((v) => v.disponibilidad === 'reservado').map((v) => [v.id, `CARGA-${v.id.slice(0, 8)}`])),
    }));
  });
  return {
    disputados,
    resumen: {
      pendientes: porEstado('pendiente_aprobacion').length, aprobadas: porEstado('aprobada').length,
      priorizadas: porEstado('priorizada').length, asignadas: porEstado('asignada').length,
      calendarizadas: porEstado('calendarizada').length, enTransito: porEstado('en_transito').length,
      entregadas: porEstado('entregada').length, vehiculosLibres: Object.values(stock).flat().length,
    },
  };
}

async function main() {
  const env = cargarEntorno();
  const base = (process.env.STRESS_BASE_URL || BASE_POR_DEFECTO).replace(/\/+$/, '');
  const bypass = bypassVercel();
  const db = clienteAdmin(env);

  const usuarios = ok(await db.from('usuario').select('id, email, rol, sucursal_id').like('email', `%@${CONFIG.dominioCorreo}`).order('email'), 'usuarios');
  if (usuarios.length < 100) throw new Error(`Solo hay ${usuarios.length} usuarios de simulación: ejecuta primero 01-generar-datos.mjs.`);

  const { porEmail, metricas } = await sesiones(env, usuarios);
  const admin = usuarios.find((u) => u.rol === 'administrador');
  const cookieAdmin = porEmail[admin.email].cookies.map((c) => `${c.name}=${c.value}`).join('; ');
  const acciones = await idsDeAcciones(base, bypass, cookieAdmin);
  log(`acciones: ${Object.keys(acciones).length} IDs extraídos del deploy`);

  const { disputados, resumen } = await colas(db, usuarios);
  log('colas:', JSON.stringify(resumen));

  const { password } = secretoSimulacion();
  const carga = {
    generado: new Date().toISOString(),
    base,
    acciones,
    camiones: Array.from({ length: CONFIG.camiones }, (_, k) => `STRZ${String(k + 1).padStart(2, '0')}`),
    disputados,
    password,
    usuarios: usuarios.map((u) => ({ ...u, cookies: porEmail[u.email].cookies })),
  };
  const ruta = guardarJson('carga.json', carga);
  guardarJson('preparacion.json', { generado: carga.generado, base, resumen, loginsDirectos: metricas });
  log(`listo: ${ruta}`);
}

// Solo se ejecuta al lanzarlo directamente (03-ejecutar.mjs importa `bypassVercel`).
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error('ERROR:', e.message);
    process.exit(1);
  });
}
