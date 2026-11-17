// Generación masiva e idempotente de datos de simulación.
//   node stress/01-generar-datos.mjs            -> crea lo que falte
//   node stress/01-generar-datos.mjs --plan     -> solo calcula el plan (no escribe)
//
// Todo queda en la zona 9001, sucursales 9001-9029, usuarios @prueba-carga.invalid,
// vehículos con chasis STRESS* y el transportista RUT 99999990-1. Antes de escribir
// verifica que nada de eso choque con datos reales; si choca, se detiene.
import { CONFIG, emailSim, idsSucursalesSim } from './config.mjs';
import { clienteAdmin, esperar, guardarJson, log, ok, prng, secretoSimulacion, trozos, uuidDet } from './lib/comun.mjs';

const SOLO_PLAN = process.argv.includes('--plan');
const H = 3600_000;
const DIA = 24 * H;

const NOMBRES = ['Camila', 'Valentina', 'Javiera', 'Francisca', 'Catalina', 'Constanza', 'Fernanda', 'Daniela', 'Sofía', 'Antonia',
  'Matías', 'Sebastián', 'Benjamín', 'Vicente', 'Martín', 'Joaquín', 'Tomás', 'Felipe', 'Diego', 'Nicolás', 'Cristóbal', 'Ignacio'];
const APELLIDOS = ['González', 'Muñoz', 'Rojas', 'Díaz', 'Pérez', 'Soto', 'Contreras', 'Silva', 'Martínez', 'Sepúlveda',
  'Morales', 'Rodríguez', 'López', 'Fuentes', 'Hernández', 'Torres', 'Araya', 'Flores', 'Espinoza', 'Valenzuela'];
const COLORES = ['Blanco', 'Negro', 'Gris', 'Plata', 'Rojo', 'Azul'];
const MOTIVOS_RECHAZO = [
  'La unidad está comprometida para otra venta: elige otro vehículo.',
  'Falta la orden de compra firmada por el cliente.',
  'El cliente no tiene aprobado el crédito todavía.',
];
const MOTIVOS_CANCELACION = ['El cliente desistió de la compra.', 'El evento fue suspendido por el organizador.', 'Se cambió por otra unidad.'];
const EVENTOS = ['Feria Automotriz', 'Lanzamiento modelo', 'Exhibición mall', 'Test drive corporativo'];

// ---------------------------------------------------------------------------
// Plan determinista
// ---------------------------------------------------------------------------
function planUsuarios() {
  const r = prng(CONFIG.historia.semilla + 1);
  const suc = idsSucursalesSim();
  const lista = [];
  for (const [rol, total] of Object.entries(CONFIG.usuarios)) {
    for (let n = 1; n <= total; n++) {
      const sucursal = rol === 'jefe_local' ? suc[n - 1] : rol === 'ejecutivo' ? suc[(n - 1) % suc.length] : suc[0];
      lista.push({
        email: emailSim(rol, n),
        rol,
        n,
        sucursal_id: sucursal,
        nombre: r.de(NOMBRES),
        apellido: `${r.de(APELLIDOS)} [${CONFIG.marca}]`,
      });
    }
  }
  return lista;
}

/** Estados en orden del flujo con el rango de horas hasta el siguiente paso. */
function planHistoria(usuarios) {
  const r = prng(CONFIG.historia.semilla);
  const fin = new Date(CONFIG.historia.fin).getTime();
  const total = CONFIG.historia.meses * CONFIG.historia.porMes;
  const inicio = fin - 365 * DIA;
  const ventana = (fin - inicio) / CONFIG.historia.meses;
  const ejecutivos = usuarios.filter((u) => u.rol === 'ejecutivo');
  const logisticas = usuarios.filter((u) => u.rol === 'logistica');
  const jefePorSucursal = Object.fromEntries(usuarios.filter((u) => u.rol === 'jefe_local').map((u) => [u.sucursal_id, u.email]));
  const sucursales = idsSucursalesSim();

  const solicitudes = [];
  let vehiculoN = 0;
  for (let i = 0; i < total; i++) {
    const mes = Math.floor(i / CONFIG.historia.porMes);
    // Hora hábil: 08:00-19:00 de Chile (UTC-3).
    const base = inicio + mes * ventana + r() * ventana;
    const d = new Date(base);
    d.setUTCHours(11 + r.entero(0, 10), r.entero(0, 59), r.entero(0, 59), 0);
    const creada = Math.min(d.getTime(), fin - H);
    const ejec = r.de(ejecutivos);
    const tipo = r() < 0.85 ? 'venta' : 'evento';
    const nVeh = r() < 0.8 ? 1 : r() < 0.85 ? 2 : 3;
    const origen = tipo === 'venta' ? r.de(sucursales.filter((s) => s !== ejec.sucursal_id)) : ejec.sucursal_id;
    const logi = r.de(logisticas);

    // Recorrido del flujo: se detiene en el primer paso que caería después de `fin`.
    const eventos = [{ estado: 'pendiente_aprobacion', t: creada, actor: ejec.email }];
    let t = creada;
    let estado = 'pendiente_aprobacion';
    const cancelarEn = r() < 0.07 ? r.de(['pendiente_aprobacion', 'aprobada', 'priorizada', 'asignada', 'calendarizada']) : null;
    const rechazar = r() < 0.06;
    const pasos = [
      ['aprobada', 1, 36, jefePorSucursal[ejec.sucursal_id]],
      ['priorizada', 1, 24, jefePorSucursal[ejec.sucursal_id]],
      ['asignada', 1, 24, logi.email],
      ['calendarizada', 2, 48, logi.email],
      ['en_transito', 24, 120, logi.email],
      ['entregada', 6, 48, jefePorSucursal[ejec.sucursal_id]],
      ['finalizada', 24, r() < 0.08 ? 24 * 120 : 240, ejec.email],
    ];
    let fechaTentativa = null;
    for (const [siguiente, hMin, hMax, actor] of pasos) {
      const tSig = t + r.entre(hMin, hMax) * H;
      if (estado === cancelarEn) {
        const tc = t + r.entre(0.5, Math.max(1, (tSig - t) / H)) * H;
        if (tc < fin) {
          eventos.push({ estado: 'cancelada', t: tc, actor: ejec.email, motivo: r.de(MOTIVOS_CANCELACION), desde: estado });
          estado = 'cancelada';
        }
        break;
      }
      if (estado === 'pendiente_aprobacion' && rechazar) {
        if (tSig < fin) {
          eventos.push({ estado: 'rechazada', t: tSig, actor: jefePorSucursal[ejec.sucursal_id], motivo: r.de(MOTIVOS_RECHAZO), desde: estado });
          estado = 'rechazada';
        }
        break;
      }
      if (siguiente === 'calendarizada') fechaTentativa = tSig + r.entre(24, 120) * H;
      // El despacho ocurre en la fecha tentativa programada.
      const tReal = siguiente === 'en_transito' ? Math.max(fechaTentativa, tSig) : tSig;
      if (tReal >= fin) break;
      eventos.push({ estado: siguiente, t: tReal, actor, desde: estado });
      estado = siguiente;
      t = tReal;
    }

    const vehiculos = [];
    for (let k = 0; k < nVeh; k++) {
      vehiculoN += 1;
      vehiculos.push({ n: vehiculoN, origen });
    }
    solicitudes.push({
      i,
      id: uuidDet(`sol:${i}`),
      ejecutivo: ejec.email,
      jefe: jefePorSucursal[ejec.sucursal_id],
      logistica: eventos.some((e) => e.estado === 'asignada') ? logi.email : null,
      sucursal: ejec.sucursal_id,
      tipo,
      estado,
      eventos,
      fechaTentativa,
      fechaLimite: creada + r.entre(7, 21) * DIA,
      vehiculos,
      titulo: tipo === 'evento' ? `${r.de(EVENTOS)} ${CONFIG.marca}` : null,
      direccion: tipo === 'evento' ? `Av. Ficticia ${r.entero(100, 9999)}, Santiago` : null,
      color: r.de(COLORES),
      precio: r.entero(12, 45) * 1_000_000,
      conObservacion: r() < 0.2,
    });
  }
  solicitudes.sort((a, b) => a.eventos[0].t - b.eventos[0].t);
  return solicitudes;
}

function resumenPlan(solicitudes) {
  const porEstado = {};
  for (const s of solicitudes) porEstado[s.estado] = (porEstado[s.estado] ?? 0) + 1;
  const vehiculos = solicitudes.reduce((a, s) => a + s.vehiculos.length, 0);
  const auditoria = solicitudes.reduce((a, s) => a + s.vehiculos.length + s.eventos.length - 1, 0);
  return { solicitudes: solicitudes.length, porEstado, vehiculosHistoricos: vehiculos, auditoria };
}

// ---------------------------------------------------------------------------
// Escritura
// ---------------------------------------------------------------------------
const iso = (t) => new Date(t).toISOString();
const fechaDia = (t) => new Date(t).toISOString().slice(0, 10);

async function verificarRangos(db) {
  const sucursales = ok(await db.from('sucursal').select('id, nombre').gte('id', CONFIG.sucursalDesde).lte('id', CONFIG.sucursalDesde + 99), 'sucursales');
  for (const s of sucursales) {
    if (!String(s.nombre ?? '').startsWith(CONFIG.marca)) throw new Error(`La sucursal ${s.id} existe y no es de simulación. Se detiene.`);
  }
  const zona = ok(await db.from('zona').select('id, nombre').eq('id', CONFIG.zonaId), 'zona');
  if (zona[0] && zona[0].nombre !== CONFIG.zonaNombre) throw new Error(`La zona ${CONFIG.zonaId} existe y no es de simulación. Se detiene.`);
  const trans = ok(await db.from('transportista').select('id, nombre').eq('rut', CONFIG.transportista.rut), 'transportista');
  if (trans[0] && trans[0].nombre !== CONFIG.transportista.nombre) throw new Error('El RUT del transportista ficticio ya existe con otro nombre. Se detiene.');
}

async function crearOrganizacion(db) {
  // zona.id es GENERATED ALWAYS: la zona se crea con stress/sql/crear-zona.sql (no gasta la secuencia real).
  const zona = ok(await db.from('zona').select('id, nombre').eq('id', CONFIG.zonaId), 'zona');
  if (zona[0]?.nombre !== CONFIG.zonaNombre) throw new Error('Falta la zona 9001: ejecuta stress/sql/crear-zona.sql primero.');
  const filas = idsSucursalesSim().map((id, k) => ({
    id,
    nombre: `${CONFIG.marca} Sucursal ${String(k + 1).padStart(2, '0')}`,
    direccion: `Calle Simulada ${100 + k}, Santiago`,
    slots: CONFIG.slotsPorSucursal,
    zona_id: CONFIG.zonaId,
  }));
  ok(await db.from('sucursal').upsert(filas, { onConflict: 'id', ignoreDuplicates: true }), 'sucursales');
  const transId = uuidDet('transportista');
  ok(await db.from('transportista').upsert({ id: transId, nombre: CONFIG.transportista.nombre, rut: CONFIG.transportista.rut }, { onConflict: 'rut', ignoreDuplicates: true }), 'transportista');
  const trans = ok(await db.from('transportista').select('id').eq('rut', CONFIG.transportista.rut).single(), 'transportista');
  const camiones = Array.from({ length: CONFIG.camiones }, (_, k) => ({
    id: uuidDet(`camion:${k}`),
    patente: `STRZ${String(k + 1).padStart(2, '0')}`,
    transportista_id: trans.id,
    conductor_nombre: `Conductor Simulado ${k + 1}`,
  }));
  const existentes = ok(await db.from('camion').select('patente, transportista_id').in('patente', camiones.map((c) => c.patente)), 'camiones');
  if (existentes.some((c) => c.transportista_id !== trans.id)) throw new Error('Una patente STRZ.. pertenece a otra empresa. Se detiene.');
  ok(await db.from('camion').upsert(camiones, { onConflict: 'patente', ignoreDuplicates: true }), 'camiones');
  return { transportistaId: trans.id, camiones };
}

async function crearUsuarios(db, plan) {
  const { password } = secretoSimulacion();
  const existentes = ok(await db.from('usuario').select('id, email').like('email', `%@${CONFIG.dominioCorreo}`), 'usuarios');
  const porEmail = Object.fromEntries(existentes.map((u) => [u.email, u.id]));
  const t0 = Date.now();
  let creados = 0;
  for (const grupo of trozos(plan, 4)) {
    await Promise.all(grupo.map(async (u) => {
      if (!porEmail[u.email]) {
        const res = await db.auth.admin.createUser({
          email: u.email,
          password,
          email_confirm: true,
          user_metadata: { nombre: u.nombre, apellido: u.apellido, sucursal_id: u.sucursal_id, simulacion: CONFIG.marca },
        });
        if (res.error) throw new Error(`createUser ${u.email}: ${res.error.message}`);
        porEmail[u.email] = res.data.user.id;
        creados += 1;
      }
    }));
  }
  // Perfil: rol, sucursal y cuenta activa. El jefe queda a cargo de su sucursal por trigger.
  for (const u of plan) {
    ok(await db.from('usuario').update({
      nombre: u.nombre, apellido: u.apellido, rol: u.rol, sucursal_id: u.sucursal_id,
      activo: true, aprobado: true, requiere_cambio_clave: false,
    }).eq('id', porEmail[u.email]).like('email', `%@${CONFIG.dominioCorreo}`), `perfil ${u.email}`);
  }
  const zonas = plan.filter((u) => u.rol === 'logistica').map((u) => ({ usuario_id: porEmail[u.email], zona_id: CONFIG.zonaId }));
  const yaZonas = ok(await db.from('usuario_zona').select('usuario_id').eq('zona_id', CONFIG.zonaId), 'usuario_zona');
  const faltan = zonas.filter((z) => !yaZonas.some((y) => y.usuario_id === z.usuario_id));
  if (faltan.length) ok(await db.from('usuario_zona').insert(faltan), 'usuario_zona');
  log(`usuarios: ${creados} creados, ${plan.length - creados} ya existían (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  return { porEmail, creados, ms: Date.now() - t0 };
}

async function idsExistentes(db, tabla, columna, filtro) {
  const out = new Set();
  for (let desde = 0; ; desde += 1000) {
    const q = filtro(db.from(tabla).select(columna)).range(desde, desde + 999);
    const filas = ok(await q, `${tabla} existentes`);
    filas.forEach((f) => out.add(f[columna]));
    if (filas.length < 1000) break;
  }
  return out;
}

async function insertarPorLotes(db, tabla, filas, tam, opciones, metricas) {
  const t0 = Date.now();
  let lote = 0;
  for (const grupo of trozos(filas, tam)) {
    const tl = Date.now();
    const q = opciones ? db.from(tabla).upsert(grupo, opciones) : db.from(tabla).insert(grupo);
    ok(await q, `${tabla} lote ${lote}`);
    metricas.lotes.push({ tabla, filas: grupo.length, ms: Date.now() - tl });
    lote += 1;
    if (lote % 5 === 0) log(`  ${tabla}: ${Math.min(lote * tam, filas.length)}/${filas.length}`);
    await esperar(150); // ritmo moderado: es la BD de producción
  }
  const ms = Date.now() - t0;
  metricas.tablas[tabla] = { filas: filas.length, ms, filasPorSeg: filas.length ? Math.round((filas.length / ms) * 1000) : 0 };
  log(`${tabla}: ${filas.length} filas en ${(ms / 1000).toFixed(1)} s`);
}

async function main() {
  const usuariosPlan = planUsuarios();
  const solicitudes = planHistoria(usuariosPlan);
  const resumen = resumenPlan(solicitudes);
  log('plan:', JSON.stringify(resumen));
  if (SOLO_PLAN) return;

  const db = clienteAdmin();
  const metricas = { inicio: new Date().toISOString(), tablas: {}, lotes: [], resumen };
  await verificarRangos(db);
  const org = await crearOrganizacion(db);
  const { porEmail, creados, ms: msUsuarios } = await crearUsuarios(db, usuariosPlan);
  metricas.usuarios = { creados, ms: msUsuarios };
  const uid = (email) => porEmail[email];

  // Vehículos: los del historial + stock libre para la carga en vivo.
  const vehiculos = [];
  const sv = [];
  for (const s of solicitudes) {
    const llego = s.eventos.some((e) => e.estado === 'entregada');
    const despacho = s.eventos.find((e) => e.estado === 'en_transito');
    for (const v of s.vehiculos) {
      const vendido = s.tipo === 'venta' && s.estado === 'finalizada';
      const enDestino = s.tipo === 'venta' && s.estado === 'entregada';
      const liberado = ['rechazada', 'cancelada'].includes(s.estado) || (s.tipo === 'evento' && llego);
      const id = uuidDet(`veh:${v.n}`);
      vehiculos.push({
        id, chasis: `STRESS${String(v.n).padStart(8, '0')}`, marca: CONFIG.marca, modelo: 'PRUEBA DE CARGA - NO SOLICITAR',
        tipo_vehiculo: 'Automóvil', anio: 2026, color: s.color, precio: s.precio,
        ubicacion: vendido ? null : enDestino ? s.sucursal : v.origen,
      });
      sv.push({
        id: uuidDet(`sv:${s.i}:${v.n}`), solicitud_id: s.id, vehiculo_id: id, sucursal_origen: v.origen,
        disponibilidad: vendido ? 'vendido' : liberado ? 'liberado' : 'reservado',
        numero_guia: despacho ? `STR-${s.i}-${v.n}` : null, created_at: iso(s.eventos[0].t),
      });
    }
  }
  let libres = 0;
  for (const suc of idsSucursalesSim()) {
    for (let k = 0; k < CONFIG.stockLibrePorSucursal; k++) {
      libres += 1;
      vehiculos.push({
        id: uuidDet(`veh-libre:${suc}:${k}`), chasis: `STRESSL${suc}${String(k).padStart(4, '0')}`, marca: CONFIG.marca,
        modelo: 'PRUEBA DE CARGA - NO SOLICITAR', tipo_vehiculo: 'Automóvil', anio: 2026, color: COLORES[k % COLORES.length],
        precio: 20_000_000, ubicacion: suc,
      });
    }
  }
  log(`vehículos: ${vehiculos.length} (${libres} de stock libre)`);
  const vehExist = await idsExistentes(db, 'vehiculo', 'chasis', (q) => q.like('chasis', 'STRESS%'));
  await insertarPorLotes(db, 'vehiculo', vehiculos.filter((v) => !vehExist.has(v.chasis)), 1000, null, metricas);

  // Solicitudes con su estado final y fechas coherentes.
  const posiciones = {};
  const filasSol = solicitudes.map((s) => {
    const t = (estado) => s.eventos.find((e) => e.estado === estado)?.t ?? null;
    const ultimo = s.eventos[s.eventos.length - 1];
    let posicion = null;
    if (s.estado === 'priorizada') {
      posiciones[s.sucursal] = (posiciones[s.sucursal] ?? 0) + 1;
      posicion = posiciones[s.sucursal];
    }
    const cal = t('calendarizada');
    return {
      id: s.id,
      ejecutivo_id: uid(s.ejecutivo), creado_por: uid(s.ejecutivo), jefe_local_id: uid(s.jefe),
      logistica_id: s.logistica ? uid(s.logistica) : null,
      estado: s.estado, tipo_solicitud: s.tipo, sucursal: s.sucursal,
      sucursal_destino: s.tipo === 'venta' ? s.sucursal : null,
      direccion_evento: s.direccion, titulo_evento: s.titulo,
      fecha_creacion: iso(s.eventos[0].t), fecha_actualizacion: iso(ultimo.t),
      fecha_limite: fechaDia(s.fechaLimite),
      fecha_confirmacion: t('aprobada') ? iso(t('aprobada')) : null,
      posicion_prioridad: posicion,
      fecha_tentativa_despacho: cal ? fechaDia(s.fechaTentativa) : null,
      transportista_id: cal ? org.transportistaId : null,
      patente_camion: cal ? org.camiones[s.i % org.camiones.length].patente : null,
      conductor_nombre: cal ? org.camiones[s.i % org.camiones.length].conductor_nombre : null,
      fecha_despacho: t('en_transito') ? iso(t('en_transito')) : null,
      fecha_inicio_transito: t('en_transito') ? iso(t('en_transito')) : null,
      fecha_recepcion: t('entregada') ? iso(t('entregada')) : null,
      fecha_entrega: t('entregada') ? iso(t('entregada')) : null,
      fecha_entrega_cliente: t('finalizada') ? iso(t('finalizada')) : null,
      motivo_cancelacion: s.estado === 'cancelada' ? ultimo.motivo : null,
    };
  });
  const solExist = await idsExistentes(db, 'solicitud', 'id', (q) => q.gte('sucursal', CONFIG.sucursalDesde));
  await insertarPorLotes(db, 'solicitud', filasSol.filter((f) => !solExist.has(f.id)), 500, null, metricas);

  const svExist = await idsExistentes(db, 'solicitud_vehiculo', 'id', (q) => q.gte('sucursal_origen', CONFIG.sucursalDesde));
  await insertarPorLotes(db, 'solicitud_vehiculo', sv.filter((f) => !svExist.has(f.id)), 500, null, metricas);

  // Historial (auditoría) con los mismos nombres de acción que usa la app.
  const auditoria = [];
  const observaciones = [];
  for (const s of solicitudes) {
    const t0 = s.eventos[0].t;
    s.vehiculos.forEach((v) => auditoria.push({
      id: uuidDet(`aud:${s.i}:veh:${v.n}`), usuario_id: uid(s.ejecutivo), entidad: 'solicitud_vehiculo', entidad_id: s.id,
      accion: 'ASIGNACION_VEHICULO', valor_anterior: null,
      valor_nuevo: { solicitud_id: s.id, vehiculo_id: uuidDet(`veh:${v.n}`) }, created_at: iso(t0),
    }));
    let posicion = 0;
    for (const e of s.eventos.slice(1)) {
      const base = { id: uuidDet(`aud:${s.i}:${e.estado}`), usuario_id: uid(e.actor), entidad: 'solicitud', entidad_id: s.id, created_at: iso(e.t) };
      const ant = { estado: e.desde };
      const map = {
        aprobada: ['aprobacion', ant, { estado: 'aprobada', fecha_entrega: fechaDia(s.fechaLimite), fecha_confirmacion: iso(e.t) }],
        priorizada: ['priorizacion', { estado: 'aprobada', posicion_prioridad: null }, { estado: 'priorizada', posicion_prioridad: (posicion = posicion + 1) }],
        asignada: ['asignacion_logistica', { estado: 'priorizada', logistica_id: null }, { estado: 'asignada', logistica_id: uid(e.actor) }],
        calendarizada: ['calendarizacion', { estado: 'asignada', fecha_tentativa_despacho: null },
          { estado: 'calendarizada', fecha_tentativa_despacho: fechaDia(s.fechaTentativa), transportista_id: org.transportistaId,
            patente_camion: org.camiones[s.i % org.camiones.length].patente }],
        en_transito: ['despacho', { estado: 'calendarizada', fecha_despacho: null }, { estado: 'en_transito', fecha_despacho: iso(e.t), fecha_inicio_transito: iso(e.t) }],
        entregada: ['entrega', { estado: 'en_transito', fecha_entrega: null }, { estado: 'entregada', con_novedades: false, observacion: null, fecha_entrega: iso(e.t), fecha_recepcion: iso(e.t) }],
        finalizada: ['finalizacion', { estado: 'entregada' }, { estado: 'finalizada' }],
        rechazada: ['rechazo', ant, { estado: 'rechazada', motivo: e.motivo }],
        cancelada: ['CAMBIO_ESTADO', ant, { estado: 'cancelada', motivo: e.motivo }],
      }[e.estado];
      auditoria.push({ ...base, accion: map[0], valor_anterior: map[1], valor_nuevo: map[2] });
      if (e.estado === 'rechazada') {
        observaciones.push({ id: uuidDet(`obs:${s.i}:rechazo`), solicitud_id: s.id, usuario_id: uid(e.actor), observacion: `[RECHAZO] ${e.motivo}`, created_at: iso(e.t) });
      }
    }
    if (s.conObservacion) {
      observaciones.push({ id: uuidDet(`obs:${s.i}:nota`), solicitud_id: s.id, usuario_id: uid(s.ejecutivo),
        observacion: 'Cliente solicita entrega en horario de mañana. (simulación)', created_at: iso(t0 + 10 * 60_000) });
    }
  }
  await insertarPorLotes(db, 'auditoria', auditoria, 2000, { onConflict: 'id', ignoreDuplicates: true }, metricas);
  await insertarPorLotes(db, 'observacion', observaciones, 2000, { onConflict: 'id', ignoreDuplicates: true }, metricas);

  metricas.fin = new Date().toISOString();
  const ruta = guardarJson('generacion.json', metricas);
  log(`listo. Métricas en ${ruta}`);
  log('Falta: recalcular slots de las sucursales 9001-9029 (stress/sql/recalcular-slots.sql).');
}

main().catch((e) => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
