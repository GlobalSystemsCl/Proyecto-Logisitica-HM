import type { SolicitudLista } from '@/types/solicitud.types';

/**
 * Calendario de logística (R16): vistas mensual, semanal y diaria, filtros
 * detallados e indicadores del período.
 *
 * Cómo se buscan los datos:
 *  1. La vista y la fecha viajan en la URL (`?vista=semana&fecha=2026-10-09`).
 *  2. El servidor calcula el rango visible con `rangoVista` y consulta solo las
 *     solicitudes programadas dentro de ese rango (más las pendientes de
 *     programar, que no tienen fecha).
 *  3. Los filtros finos (`FiltrosCalendario`) se aplican sobre ese conjunto ya
 *     acotado y también quedan en la URL para compartir o recargar la vista.
 *
 * Las fechas se manejan como texto `YYYY-MM-DD` y la aritmética en UTC, para
 * no depender de la zona horaria del servidor ni del navegador.
 *
 * Funciones puras: no tocan la BD ni React.
 */

export type VistaCalendario = 'mes' | 'semana' | 'dia';
export const VISTAS_CALENDARIO: VistaCalendario[] = ['mes', 'semana', 'dia'];

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

const FECHA_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function aUTC(fecha: string): Date {
  const [a, m, d] = fecha.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d));
}

function aTexto(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** `true` si el texto es una fecha `YYYY-MM-DD` válida. */
export function esFechaValida(fecha: string | null | undefined): fecha is string {
  if (!fecha || !FECHA_REGEX.test(fecha)) return false;
  return aTexto(aUTC(fecha)) === fecha;
}

export function sumarDias(fecha: string, dias: number): string {
  const d = aUTC(fecha);
  d.setUTCDate(d.getUTCDate() + dias);
  return aTexto(d);
}

/** Lunes de la semana de la fecha (la semana empieza en lunes). */
export function inicioSemana(fecha: string): string {
  const diaSemana = aUTC(fecha).getUTCDay(); // 0 = domingo
  return sumarDias(fecha, -((diaSemana + 6) % 7));
}

export interface RangoVista {
  desde: string;
  hasta: string;
  dias: string[];
}

/**
 * Días visibles de una vista. El mes se muestra en semanas completas (de lunes
 * a domingo), por eso puede incluir días del mes anterior y del siguiente.
 */
export function rangoVista(vista: VistaCalendario, fecha: string): RangoVista {
  let desde: string;
  let hasta: string;
  if (vista === 'dia') {
    desde = hasta = fecha;
  } else if (vista === 'semana') {
    desde = inicioSemana(fecha);
    hasta = sumarDias(desde, 6);
  } else {
    const primero = `${fecha.slice(0, 7)}-01`;
    const d = aUTC(primero);
    const ultimo = aTexto(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)));
    desde = inicioSemana(primero);
    hasta = sumarDias(inicioSemana(ultimo), 6);
  }
  const dias: string[] = [];
  for (let f = desde; f <= hasta; f = sumarDias(f, 1)) dias.push(f);
  return { desde, hasta, dias };
}

/** Fecha de referencia al avanzar o retroceder `delta` períodos. */
export function desplazar(vista: VistaCalendario, fecha: string, delta: number): string {
  if (vista === 'dia') return sumarDias(fecha, delta);
  if (vista === 'semana') return sumarDias(fecha, delta * 7);
  const d = aUTC(`${fecha.slice(0, 7)}-01`);
  return aTexto(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + delta, 1)));
}

export function tituloPeriodo(vista: VistaCalendario, fecha: string): string {
  const d = aUTC(fecha);
  if (vista === 'mes') {
    const mes = MESES[d.getUTCMonth()];
    return `${mes.charAt(0).toUpperCase()}${mes.slice(1)} ${d.getUTCFullYear()}`;
  }
  if (vista === 'dia') {
    const dia = DIAS[d.getUTCDay()];
    return `${dia.charAt(0).toUpperCase()}${dia.slice(1)} ${d.getUTCDate()} de ${MESES[d.getUTCMonth()]} de ${d.getUTCFullYear()}`;
  }
  const { desde, hasta } = rangoVista('semana', fecha);
  const a = aUTC(desde);
  const b = aUTC(hasta);
  const mismoMes = a.getUTCMonth() === b.getUTCMonth();
  return mismoMes
    ? `Semana del ${a.getUTCDate()} al ${b.getUTCDate()} de ${MESES[b.getUTCMonth()]} de ${b.getUTCFullYear()}`
    : `Semana del ${a.getUTCDate()} de ${MESES[a.getUTCMonth()]} al ${b.getUTCDate()} de ${MESES[b.getUTCMonth()]} de ${b.getUTCFullYear()}`;
}

/** Día del calendario en que se muestra una solicitud programada. */
export function fechaEnCalendario(s: Pick<SolicitudLista, 'fecha_tentativa_despacho' | 'fecha_despacho' | 'fecha_entrega'>): string | null {
  const f = s.fecha_tentativa_despacho ?? s.fecha_despacho ?? s.fecha_entrega;
  return f ? f.slice(0, 10) : null;
}

export function agruparPorDia(solicitudes: SolicitudLista[]): Record<string, SolicitudLista[]> {
  const mapa: Record<string, SolicitudLista[]> = {};
  for (const s of solicitudes) {
    const f = fechaEnCalendario(s);
    if (!f) continue;
    (mapa[f] ??= []).push(s);
  }
  return mapa;
}

// -----------------------------------------------------------------------------
// Plazos
// -----------------------------------------------------------------------------

export type EstadoPlazo = 'atrasada' | 'fuera_de_plazo' | 'a_tiempo';

/**
 *  - `atrasada`: aún no se recibe y ya pasó la fecha límite de entrega propuesta
 *  - `fuera_de_plazo`: está programada para despachar después de esa fecha
 *  - `a_tiempo`: ninguno de los anteriores (o sin fecha límite)
 */
export function estadoPlazo(
  s: Pick<SolicitudLista, 'estado' | 'fecha_limite' | 'fecha_tentativa_despacho'>,
  hoy: string
): EstadoPlazo {
  const limite = s.fecha_limite?.slice(0, 10);
  if (!limite) return 'a_tiempo';
  const pendiente = ['priorizada', 'asignada', 'calendarizada', 'en_transito'].includes(s.estado);
  if (pendiente && hoy > limite) return 'atrasada';
  const programada = s.fecha_tentativa_despacho?.slice(0, 10);
  if (pendiente && programada && programada > limite) return 'fuera_de_plazo';
  return 'a_tiempo';
}

// -----------------------------------------------------------------------------
// Filtros
// -----------------------------------------------------------------------------

export interface FiltrosCalendario {
  origen: string;
  destino: string;
  zona: string;
  estado: '' | 'calendarizada' | 'en_transito' | 'entregada';
  tipo: '' | 'venta' | 'evento';
  encargado: string;
  busqueda: string;
  plazo: '' | 'atrasada' | 'fuera_de_plazo';
  soloReprogramadas: boolean;
}

export const FILTROS_CALENDARIO_INICIALES: FiltrosCalendario = {
  origen: '',
  destino: '',
  zona: '',
  estado: '',
  tipo: '',
  encargado: '',
  busqueda: '',
  plazo: '',
  soloReprogramadas: false,
};

type Params = Record<string, string | string[] | undefined>;

function valor(params: Params, clave: string): string {
  const v = params[clave];
  return (Array.isArray(v) ? v[0] : v)?.trim() ?? '';
}

export function filtrosDesdeParams(params: Params): FiltrosCalendario {
  const estado = valor(params, 'estado');
  const tipo = valor(params, 'tipo');
  const plazo = valor(params, 'plazo');
  return {
    origen: valor(params, 'origen'),
    destino: valor(params, 'destino'),
    zona: valor(params, 'zona'),
    estado: (['calendarizada', 'en_transito', 'entregada'].includes(estado) ? estado : '') as FiltrosCalendario['estado'],
    tipo: (['venta', 'evento'].includes(tipo) ? tipo : '') as FiltrosCalendario['tipo'],
    encargado: valor(params, 'encargado'),
    busqueda: valor(params, 'q').slice(0, 40),
    plazo: (['atrasada', 'fuera_de_plazo'].includes(plazo) ? plazo : '') as FiltrosCalendario['plazo'],
    soloReprogramadas: valor(params, 'reprogramadas') === '1',
  };
}

/** Parámetros de URL de los filtros activos (los vacíos no se incluyen). */
export function filtrosAParams(f: FiltrosCalendario): Record<string, string> {
  const r: Record<string, string> = {};
  if (f.origen) r.origen = f.origen;
  if (f.destino) r.destino = f.destino;
  if (f.zona) r.zona = f.zona;
  if (f.estado) r.estado = f.estado;
  if (f.tipo) r.tipo = f.tipo;
  if (f.encargado) r.encargado = f.encargado;
  if (f.busqueda) r.q = f.busqueda;
  if (f.plazo) r.plazo = f.plazo;
  if (f.soloReprogramadas) r.reprogramadas = '1';
  return r;
}

export function hayFiltrosCalendario(f: FiltrosCalendario): boolean {
  return Object.keys(filtrosAParams(f)).length > 0;
}

export interface ContextoFiltros {
  hoy: string;
  /** Cantidad de reprogramaciones por solicitud. */
  reprogramaciones: Record<string, number>;
}

export function cumpleFiltros(s: SolicitudLista, f: FiltrosCalendario, ctx: ContextoFiltros): boolean {
  if (f.origen && String(s.sucursal) !== f.origen) return false;
  if (f.destino && String(s.sucursal_destino ?? '') !== f.destino) return false;
  if (f.zona && String(s.sucursal_zona_id ?? '') !== f.zona) return false;
  if (f.estado && s.estado !== f.estado) return false;
  if (f.tipo && s.tipo_solicitud !== f.tipo) return false;
  if (f.encargado && s.logistica_id !== f.encargado) return false;
  if (f.plazo && estadoPlazo(s, ctx.hoy) !== f.plazo) return false;
  if (f.soloReprogramadas && !(ctx.reprogramaciones[s.id] > 0)) return false;
  if (f.busqueda) {
    const q = f.busqueda.toLowerCase();
    const enVehiculos = s.vehiculos.some(
      (v) => (v.patente ?? '').toLowerCase().includes(q) || v.chasis.toLowerCase().includes(q)
    );
    if (!enVehiculos && !s.id.toLowerCase().startsWith(q)) return false;
  }
  return true;
}

// -----------------------------------------------------------------------------
// Indicadores
// -----------------------------------------------------------------------------

export interface IndicadoresCalendario {
  /** Programados en el período (calendarizados aún sin despachar). */
  programados: number;
  enTransito: number;
  recepcionados: number;
  atrasados: number;
  fueraDePlazo: number;
  /** Aprobadas o priorizadas que todavía no tienen fecha (no dependen del período). */
  sinProgramar: number;
  reprogramados: number;
}

export function indicadoresCalendario(
  programadas: SolicitudLista[],
  porProgramar: SolicitudLista[],
  ctx: ContextoFiltros
): IndicadoresCalendario {
  const plazo = (s: SolicitudLista) => estadoPlazo(s, ctx.hoy);
  return {
    programados: programadas.filter((s) => s.estado === 'calendarizada').length,
    enTransito: programadas.filter((s) => s.estado === 'en_transito').length,
    recepcionados: programadas.filter((s) => s.estado === 'entregada' || s.estado === 'finalizada').length,
    atrasados: [...programadas, ...porProgramar].filter((s) => plazo(s) === 'atrasada').length,
    fueraDePlazo: programadas.filter((s) => plazo(s) === 'fuera_de_plazo').length,
    sinProgramar: porProgramar.length,
    reprogramados: programadas.filter((s) => (ctx.reprogramaciones[s.id] ?? 0) > 0).length,
  };
}
