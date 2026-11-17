// Borra SOLO lo que tiene la marca de simulación.
//   node stress/04-limpieza.mjs              -> simulacro: cuenta lo que borraría y verifica seguridad
//   node stress/04-limpieza.mjs --ejecutar   -> borra
// Se detiene sin borrar nada si encuentra un dato real que dependa de un dato de simulación
// (por ejemplo, una solicitud real que reservó un vehículo STRESS).
import { CONFIG } from './config.mjs';
import { clienteAdmin, esperar, guardarJson, log, ok, trozos } from './lib/comun.mjs';

const EJECUTAR = process.argv.includes('--ejecutar');
const SUC_MIN = CONFIG.sucursalDesde;
const SUC_MAX = CONFIG.sucursalDesde + 98;

async function todas(q) {
  const out = [];
  for (let d = 0; ; d += 1000) {
    const filas = ok(await q().range(d, d + 999), 'consulta');
    out.push(...filas);
    if (filas.length < 1000) return out;
  }
}

async function borrar(db, tabla, columna, ids, extra, tam = 200) {
  let n = 0;
  for (const grupo of trozos(ids, tam)) {
    let q = db.from(tabla).delete({ count: 'exact' }).in(columna, grupo);
    if (extra) q = extra(q);
    const res = await q;
    ok(res, `borrar ${tabla}`);
    n += res.count ?? 0;
    await esperar(100);
  }
  log(`  ${tabla}: ${n} filas borradas`);
  return n;
}

async function main() {
  const db = clienteAdmin();
  const usuarios = ok(await db.from('usuario').select('id, email').like('email', `%@${CONFIG.dominioCorreo}`), 'usuarios');
  const uids = usuarios.map((u) => u.id);
  const sucursales = ok(await db.from('sucursal').select('id, nombre').gte('id', SUC_MIN).lte('id', SUC_MAX), 'sucursales');
  if (sucursales.some((s) => !String(s.nombre).startsWith(CONFIG.marca))) throw new Error('Hay una sucursal en el rango 9001+ sin la marca STRESS. Se detiene.');
  const sucIds = sucursales.map((s) => s.id);
  const solicitudes = await todas(() => db.from('solicitud').select('id').gte('sucursal', SUC_MIN).lte('sucursal', SUC_MAX));
  const solIds = solicitudes.map((s) => s.id);
  const vehiculos = await todas(() => db.from('vehiculo').select('id').like('chasis', 'STRESS%'));
  const vehIds = vehiculos.map((v) => v.id);
  const trans = ok(await db.from('transportista').select('id').eq('rut', CONFIG.transportista.rut).eq('nombre', CONFIG.transportista.nombre), 'transportista');

  // --- Seguridad: nada real puede depender de lo que se borra -----------------
  const problemas = [];
  const svVeh = new Set(vehIds);
  const reservasReales = (await todas(() => db.from('solicitud_vehiculo').select('solicitud_id, vehiculo_id, solicitud!inner(sucursal)').lt('solicitud.sucursal', SUC_MIN)))
    .filter((r) => svVeh.has(r.vehiculo_id));
  if (reservasReales.length) problemas.push(`${reservasReales.length} solicitudes reales reservaron vehículos de simulación`);
  let solReales = 0;
  for (const col of ['ejecutivo_id', 'jefe_local_id', 'logistica_id', 'creado_por']) {
    for (const grupo of trozos(uids, 60)) {
      solReales += ok(await db.from('solicitud').select('id').lt('sucursal', SUC_MIN).in(col, grupo), 'solicitudes reales').length;
    }
  }
  if (solReales) problemas.push(`${solReales} solicitudes reales referencian usuarios de simulación`);
  const traslados = ok(await db.from('traslado_interno').select('id').or(`origen_id.gte.${SUC_MIN},destino_id.gte.${SUC_MIN}`), 'traslados');
  if (traslados.length) problemas.push(`${traslados.length} traslados internos tocan sucursales de simulación`);
  const vehRealesEnSim = ok(await db.from('vehiculo').select('id').gte('ubicacion', SUC_MIN).lte('ubicacion', SUC_MAX).not('chasis', 'like', 'STRESS%'), 'vehículos reales');
  if (vehRealesEnSim.length) problemas.push(`${vehRealesEnSim.length} vehículos reales están ubicados en sucursales de simulación`);
  const notifAReales = [];
  const audRealesSobreSim = [];
  const sim = new Set(uids);
  for (const grupo of trozos(solIds, 300)) {
    const n = ok(await db.from('notificacion').select('id, usuario_id').in('entidad_id', grupo), 'notificaciones');
    notifAReales.push(...n.filter((x) => !sim.has(x.usuario_id)));
    const a = ok(await db.from('auditoria').select('id, usuario_id').in('entidad_id', grupo), 'auditoría');
    audRealesSobreSim.push(...a.filter((x) => !sim.has(x.usuario_id)));
  }

  const plan = {
    usuarios: uids.length, sucursales: sucIds.length, solicitudes: solIds.length, vehiculos: vehIds.length,
    notificacionesAUsuariosReales: notifAReales.length,
    auditoriaDeUsuariosRealesSobreSimulacion: audRealesSobreSim.length, problemas,
  };
  log('plan de limpieza:', JSON.stringify(plan));
  if (problemas.length) {
    guardarJson('limpieza.json', { ...plan, ejecutado: false });
    throw new Error(`No se borra nada: ${problemas.join('; ')}. Revisar a mano.`);
  }
  if (!EJECUTAR) {
    log('Simulacro: no se borró nada. Para borrar: --ejecutar');
    return;
  }

  const t0 = Date.now();
  const res = {};
  // Hijos primero. Las notificaciones y correos a usuarios reales causados por la simulación también se van.
  res.correo_envio = await borrar(db, 'correo_envio', 'entidad_id', solIds);
  res.correo_envio_usuarios = await borrar(db, 'correo_envio', 'usuario_id', uids);
  res.notificacion = await borrar(db, 'notificacion', 'entidad_id', solIds);
  res.notificacion_usuarios = await borrar(db, 'notificacion', 'usuario_id', uids);
  res.insistencia = await borrar(db, 'insistencia', 'solicitud_id', solIds);
  res.auditoria_solicitudes = await borrar(db, 'auditoria', 'entidad_id', solIds, null, 300);
  res.auditoria_usuarios = await borrar(db, 'auditoria', 'usuario_id', uids, null, 50);
  res.observacion = await borrar(db, 'observacion', 'solicitud_id', solIds, null, 300);
  // Las solicitudes arrastran sus solicitud_vehiculo (ON DELETE CASCADE).
  res.solicitud = await borrar(db, 'solicitud', 'id', solIds, (q) => q.gte('sucursal', SUC_MIN).lte('sucursal', SUC_MAX), 100);
  res.vehiculo = await borrar(db, 'vehiculo', 'id', vehIds, (q) => q.like('chasis', 'STRESS%'), 500);
  res.usuario_zona = await borrar(db, 'usuario_zona', 'usuario_id', uids);
  let cuentas = 0;
  for (const u of usuarios) {
    if (!u.email.endsWith(`@${CONFIG.dominioCorreo}`)) continue;
    ok(await db.auth.admin.deleteUser(u.id), `deleteUser ${u.email}`); // borra public.usuario por cascada
    cuentas += 1;
  }
  res.cuentas = cuentas;
  log(`  cuentas de Auth: ${cuentas} borradas`);
  if (trans[0]) {
    res.camion = await borrar(db, 'camion', 'transportista_id', [trans[0].id]);
    res.transportista = await borrar(db, 'transportista', 'id', [trans[0].id], (q) => q.eq('rut', CONFIG.transportista.rut));
  }
  res.sucursal = await borrar(db, 'sucursal', 'id', sucIds, (q) => q.like('nombre', `${CONFIG.marca}%`));
  res.zona = await borrar(db, 'zona', 'id', [CONFIG.zonaId], (q) => q.eq('nombre', CONFIG.zonaNombre));
  guardarJson('limpieza.json', { ...plan, ejecutado: true, borrado: res, ms: Date.now() - t0 });
  log(`limpieza terminada en ${((Date.now() - t0) / 1000).toFixed(0)} s. Ahora: inventario final (stress/sql/inventario.sql).`);
}

main().catch((e) => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
