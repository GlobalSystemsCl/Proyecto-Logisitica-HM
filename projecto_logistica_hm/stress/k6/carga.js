// Escenario de carga por perfiles para k6. Lo lanza stress/03-ejecutar.mjs:
//   k6 run -e VUS=80 -e BYPASS=... stress/k6/carga.js
// Simula ejecutivos, jefes de local, logística y administradores contra el deploy
// de preview (correo bloqueado), usando páginas y Server Actions reales.
import http from 'k6/http';
import { check, sleep } from 'k6';
import exec from 'k6/execution';
import { Counter, Rate, Trend } from 'k6/metrics';

const CARGA = JSON.parse(open('../out/carga.json'));
const VUS = Number(__ENV.VUS || 20);
const SOSTENER = __ENV.SOSTENER || '3m';
const RAMPA = __ENV.RAMPA || '1m';
const BYPASS = __ENV.BYPASS;
const BASE = CARGA.base;

const OPS = [
  'login', 'pag_solicitudes', 'pag_dashboard', 'pag_aprobaciones', 'pag_prioridades', 'pag_recepciones',
  'pag_calendarizaciones', 'pag_transito', 'pag_slots', 'pag_reportes', 'pag_admin_usuarios', 'pag_admin_historial',
  'pag_admin_vehiculos', 'pag_admin_sucursales', 'detalle', 'historial', 'observaciones', 'bandeja', 'vehiculos_sucursal',
  'crear_venta', 'crear_evento', 'aprobar', 'rechazar', 'priorizar', 'asignar', 'calendarizar', 'despachar', 'recibir', 'finalizar',
];

// Un umbral por operación hace que k6 reporte p50/p95/p99 de cada una. Los de corte
// detienen la corrida: errores HTTP > 5 % o p95 > 5 s (tras 60 s de evaluación).
const thresholds = {
  http_req_failed: [{ threshold: 'rate<0.05', abortOnFail: true, delayAbortEval: '60s' }],
  http_req_duration: [{ threshold: 'p(95)<5000', abortOnFail: true, delayAbortEval: '60s' }],
  negocio_ok: ['rate>=0'],
};
for (const op of OPS) thresholds[`http_req_duration{op:${op}}`] = ['p(95)>=0'];

export const options = {
  scenarios: {
    carga: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: RAMPA, target: VUS },
        { duration: SOSTENER, target: VUS },
        { duration: '20s', target: 0 },
      ],
      gracefulRampDown: '30s',
    },
  },
  thresholds,
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)', 'count'],
  insecureSkipTLSVerify: false,
  userAgent: 'hm-stress-test/1.0 (k6)',
  discardResponseBodies: false,
};

const negocioOk = new Rate('negocio_ok');
const conflictos = new Counter('conflictos_actualizacion');
const rechazosNegocio = new Counter('errores_negocio');
const sinTrabajo = new Counter('colas_vacias');
const loginMs = new Trend('login_app_ms', true);

// Reparto de roles del escenario objetivo (90/30 + logística + 2 administradores).
const POR_ROL = {};
for (const u of CARGA.usuarios) (POR_ROL[u.rol] ??= []).push(u);
function rolDeVu(n) {
  const x = (n * 0.6180339887) % 1; // dispersión determinista para mezclar roles en la rampa
  if (x < 0.74) return 'ejecutivo';
  if (x < 0.965) return 'jefe_local';
  if (x < 0.985) return 'logistica';
  return 'administrador';
}

let yo = null; // usuario de este VU
let indices = {};

function cabeceras(extra) {
  return Object.assign({ 'x-vercel-protection-bypass': BYPASS }, extra || {});
}

function iniciar() {
  const n = exec.vu.idInTest;
  const rol = rolDeVu(n);
  const lista = POR_ROL[rol];
  yo = lista[(n - 1) % lista.length];
  indices = {};
  const jar = http.cookieJar();
  // Algunos VU inician sesión por la app (loginAction); el resto reutiliza una sesión ya creada.
  if (n % 4 === 0 && loginPorApp()) return;
  for (const c of yo.cookies) jar.set(BASE, c.name, c.value, { path: '/', secure: true });
}

/** Login real por el formulario de la app (Server Action con FormData). */
function loginPorApp() {
  const id = CARGA.acciones.loginAction;
  // React serializa (estadoPrevio, FormData) así: campos "1_*" del FormData y "0" con los argumentos.
  const limite = '----hmstress' + Math.floor(Math.random() * 1e9);
  const campos = { '1_email': yo.email, '1_password': CARGA.password, 0: '[null,"$K1"]' };
  const cuerpo = Object.entries(campos)
    .map(([k, v]) => `--${limite}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`)
    .join('') + `--${limite}--\r\n`;
  const t0 = Date.now();
  const res = http.post(`${BASE}/login`, cuerpo, {
    headers: cabeceras({ 'Next-Action': id, Accept: 'text/x-component', 'Content-Type': `multipart/form-data; boundary=${limite}` }),
    redirects: 0,
    tags: { op: 'login', tipo: 'accion' },
  });
  loginMs.add(Date.now() - t0);
  const okLogin = (res.status === 303 || res.status === 200) && String(res.headers['X-Action-Redirect'] || res.headers['x-action-redirect'] || '').includes('/dashboard');
  check(res, { 'login por la app': () => okLogin });
  return okLogin;
}

function pagina(ruta, op) {
  const res = http.get(`${BASE}${ruta}`, { headers: cabeceras(), tags: { op, tipo: 'pagina' } });
  const bien = res.status === 200 && !String(res.url).includes('/login');
  check(res, { [`${op} 200`]: () => bien });
  return bien;
}

/** Llama una Server Action como lo hace el navegador (args serializados en JSON). */
function accion(nombre, args, op, rutaOrigen) {
  const res = http.post(`${BASE}${rutaOrigen || '/solicitudes'}`, JSON.stringify(args), {
    headers: cabeceras({ 'Next-Action': CARGA.acciones[nombre], 'Content-Type': 'text/plain;charset=UTF-8', Accept: 'text/x-component' }),
    tags: { op, tipo: 'accion' },
  });
  const cuerpo = String(res.body || '');
  const exito = res.status === 200 && !/"success":false/.test(cuerpo);
  if (res.status === 200 && !exito) {
    const choque = /Solo se pueden|ya está reservado|ya están reservados|no está en estado|cambió de estado|ya fue/i.test(cuerpo);
    if (choque) conflictos.add(1, { op });
    else rechazosNegocio.add(1, { op });
  }
  negocioOk.add(exito, { op });
  check(res, { [`${op} HTTP 200`]: (r) => r.status === 200 });
  return { res, exito, cuerpo };
}

function siguiente(cola) {
  const lista = (yo.cola && yo.cola[cola]) || [];
  const i = indices[cola] || 0;
  if (i >= lista.length) {
    sinTrabajo.add(1, { cola });
    return null;
  }
  indices[cola] = i + 1;
  return lista[i];
}

const azar = (lista) => lista[Math.floor(Math.random() * lista.length)];
const lectura = () => azar(yo.lectura);
const fechaEn = (dias) => new Date(Date.now() + dias * 86400000).toISOString().slice(0, 10);
const piensa = () => sleep(2 + Math.random() * 6); // 2-8 s entre acciones

function elegir(pesos) {
  const total = pesos.reduce((a, p) => a + p[0], 0);
  let x = Math.random() * total;
  for (const [peso, fn] of pesos) if ((x -= peso) <= 0) return fn;
  return pesos[0][1];
}

function crearSolicitud(tipo) {
  let vehiculo = siguiente(tipo === 'venta' ? 'venta' : 'evento');
  // 1 de cada 10 intenta un vehículo del pozo disputado: mide conflictos de reserva.
  if (tipo === 'venta' && Math.random() < 0.1) vehiculo = azar(CARGA.disputados);
  if (!vehiculo) return pagina('/solicitudes', 'pag_solicitudes');
  const datos = {
    sucursal: yo.sucursal_id,
    tipo_solicitud: tipo,
    fecha_limite: fechaEn(10),
    vehiculo_ids: [vehiculo],
    observacion: 'Generada por la prueba de carga.',
  };
  if (tipo === 'venta') datos.sucursal_destino = yo.sucursal_id;
  else Object.assign(datos, { titulo_evento: 'Exhibición STRESS', direccion_evento: 'Av. Simulada 1234, Santiago' });
  return accion('createSolicitudAction', [datos], tipo === 'venta' ? 'crear_venta' : 'crear_evento');
}

const ROLES = {
  ejecutivo: [
    [28, () => pagina('/solicitudes', 'pag_solicitudes')],
    [18, () => accion('getSolicitudDetalleAction', [lectura()], 'detalle')],
    [10, () => accion('getAuditoriaAction', [lectura()], 'historial')],
    [5, () => accion('getObservacionesAction', [lectura()], 'observaciones')],
    [10, () => accion('getBandejaNotificacionesAction', [], 'bandeja')],
    [6, () => crearSolicitud('venta')],
    [2, () => crearSolicitud('evento')],
    [3, () => { const id = siguiente('finalizar'); return id ? accion('finalizarSolicitudAction', [id], 'finalizar') : null; }],
  ],
  jefe_local: [
    [14, () => pagina('/dashboard', 'pag_dashboard')],
    [14, () => pagina('/solicitudes/aprobaciones', 'pag_aprobaciones')],
    [9, () => pagina('/solicitudes/prioridades', 'pag_prioridades')],
    [5, () => pagina('/solicitudes/recepciones', 'pag_recepciones')],
    [8, () => pagina('/solicitudes', 'pag_solicitudes')],
    [6, () => accion('getVehiculosDeSucursalAction', [yo.sucursal_id], 'vehiculos_sucursal', '/admin/sucursales')],
    [10, () => accion('getSolicitudDetalleAction', [lectura()], 'detalle')],
    [5, () => accion('getBandejaNotificacionesAction', [], 'bandeja')],
    [8, () => { const id = siguiente('aprobar'); return id ? accion('aprobarSolicitudAction', [id, fechaEn(12)], 'aprobar', '/solicitudes/aprobaciones') : null; }],
    [2, () => { const id = siguiente('aprobar'); return id ? accion('rechazarSolicitudAction', [id, 'Falta la orden de compra firmada (prueba de carga).'], 'rechazar', '/solicitudes/aprobaciones') : null; }],
    [6, () => { const id = siguiente('priorizar'); return id ? accion('priorizarSolicitudAction', [id], 'priorizar', '/solicitudes/prioridades') : null; }],
    [4, () => { const id = siguiente('recibir'); return id ? accion('recibirSolicitudAction', [id, { conNovedades: false, observacion: null }], 'recibir', '/solicitudes/recepciones') : null; }],
  ],
  logistica: [
    [12, () => pagina('/dashboard', 'pag_dashboard')],
    [14, () => pagina('/logistica/calendarizaciones', 'pag_calendarizaciones')],
    [8, () => pagina('/logistica/transito', 'pag_transito')],
    [5, () => pagina('/logistica/slots', 'pag_slots')],
    [4, () => pagina('/logistica/reportes', 'pag_reportes')],
    [8, () => accion('getSolicitudDetalleAction', [lectura()], 'detalle', '/logistica/calendarizaciones')],
    [7, () => { const id = siguiente('asignar'); return id ? accion('asignarEncargadoAction', [id], 'asignar', '/logistica/calendarizaciones') : null; }],
    [7, () => { const id = siguiente('calendarizar'); return id ? accion('calendarizarSolicitudAction', [id, fechaEn(3), { patente: azar(CARGA.camiones), conductorNombre: null }], 'calendarizar', '/logistica/calendarizaciones') : null; }],
    [6, () => { const s = siguiente('despachar'); return s ? accion('despacharSolicitudAction', [s.id, s.guias], 'despachar', '/logistica/calendarizaciones') : null; }],
  ],
  administrador: [
    [15, () => pagina('/dashboard', 'pag_dashboard')],
    [10, () => pagina('/admin/usuarios', 'pag_admin_usuarios')],
    [8, () => pagina('/admin/historial', 'pag_admin_historial')],
    [8, () => pagina('/admin/vehiculos', 'pag_admin_vehiculos')],
    [6, () => pagina('/admin/sucursales', 'pag_admin_sucursales')],
    [8, () => pagina('/logistica/reportes', 'pag_reportes')],
    [8, () => pagina('/solicitudes', 'pag_solicitudes')],
    [5, () => accion('getSolicitudDetalleAction', [lectura()], 'detalle')],
  ],
};

export default function () {
  if (!yo) {
    iniciar();
    sleep(Math.random() * 5); // nadie entra exactamente al mismo tiempo
  }
  const op = elegir(ROLES[yo.rol]);
  const r = op();
  if (r === null) pagina(yo.rol === 'logistica' ? '/logistica/calendarizaciones' : '/solicitudes', yo.rol === 'logistica' ? 'pag_calendarizaciones' : 'pag_solicitudes');
  piensa();
}

export function handleSummary(data) {
  return { [`../out/k6-${VUS}vus.json`]: JSON.stringify(data, null, 1) };
}
