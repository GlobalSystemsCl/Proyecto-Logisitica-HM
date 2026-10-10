import type { SolicitudLista } from '@/types/solicitud.types';
import { estadoPlazo } from '@/lib/calendario';

/**
 * Reportería de Logística (R17): mide a cada encargado por su tiempo de
 * respuesta y por lo que tiene pendiente o atrasado.
 *
 * Definiciones:
 *  - Pendiente de gestionar: aprobada, priorizada o asignada, aún sin
 *    programar. Si no tiene encargado se atribuye a "Sin asignar".
 *  - Tiempo de respuesta: desde la aprobación del Jefe de Local
 *    (`fecha_confirmacion`) hasta la primera calendarización (auditoría
 *    `calendarizacion`). Es la métrica principal de Logística.
 *  - Antigüedad de un pendiente: horas desde la aprobación hasta ahora.
 *  - Atrasada: aún no se recibe y ya pasó la fecha límite de entrega propuesta.
 *  - A tiempo: recibida a más tardar el día de la fecha límite propuesta.
 *  - Semáforo contra el plazo objetivo (SLA): verde ≤ SLA, amarillo ≤ 2×SLA,
 *    rojo > 2×SLA.
 *
 * Las métricas de "lo hecho" (respuestas, recepciones, reprogramaciones,
 * cancelaciones) se cuentan dentro del período elegido; las de "lo pendiente"
 * son una foto del momento actual.
 *
 * Funciones puras: no tocan la BD ni React.
 */

/** Plazo objetivo inicial para calendarizar una solicitud aprobada (horas). */
export const SLA_RESPUESTA_HORAS = 24;

export const SIN_ASIGNAR = 'sin_asignar';

export type Semaforo = 'verde' | 'amarillo' | 'rojo' | 'sin_datos';

export interface EventoAuditoria {
  entidad_id: string;
  usuario_id: string;
  accion: 'calendarizacion' | 'recalendarizacion' | 'cancelacion_transito' | string;
  created_at: string;
}

export interface UsuarioLogistica {
  id: string;
  nombre: string;
}

export interface OpcionesReporte {
  /** Inicio y fin del período, `YYYY-MM-DD` inclusive. */
  desde: string;
  hasta: string;
  /** Momento de referencia (ISO) para antigüedades y atrasos. */
  ahora: string;
  slaHoras?: number;
}

export interface FilaEncargado {
  id: string;
  nombre: string;
  pendientes: number;
  pendientesFueraDeSla: number;
  antiguedadMaximaHoras: number | null;
  enCurso: number;
  atrasadas: number;
  respondidas: number;
  respuestaPromedioHoras: number | null;
  respuestaMedianaHoras: number | null;
  respuestasDentroDeSla: number;
  recibidas: number;
  recibidasATiempo: number;
  reprogramaciones: number;
  cancelaciones: number;
  semaforo: Semaforo;
}

export interface PendienteDetalle {
  id: string;
  ruta: string;
  encargado: string;
  zonaId: number | null;
  antiguedadHoras: number;
  fechaLimite: string | null;
  atrasada: boolean;
}

export interface ReporteLogistica {
  slaHoras: number;
  totales: Omit<FilaEncargado, 'id' | 'nombre'>;
  porEncargado: FilaEncargado[];
  /** Pendientes de gestionar, de la más antigua a la más nueva. */
  pendientesMasAntiguos: PendienteDetalle[];
}

const ESTADOS_PENDIENTES = ['aprobada', 'priorizada', 'asignada'];
const ESTADOS_EN_CURSO = ['calendarizada', 'en_transito'];

function horasEntre(desde: string, hasta: string): number {
  return (new Date(hasta).getTime() - new Date(desde).getTime()) / 3_600_000;
}

function enPeriodo(fechaIso: string | null | undefined, desde: string, hasta: string): boolean {
  if (!fechaIso) return false;
  const dia = fechaIso.slice(0, 10);
  return dia >= desde && dia <= hasta;
}

function redondear(n: number | null): number | null {
  return n === null ? null : Math.round(n * 10) / 10;
}

export function promedio(valores: number[]): number | null {
  if (valores.length === 0) return null;
  return valores.reduce((a, b) => a + b, 0) / valores.length;
}

export function mediana(valores: number[]): number | null {
  if (valores.length === 0) return null;
  const ord = [...valores].sort((a, b) => a - b);
  const m = Math.floor(ord.length / 2);
  return ord.length % 2 === 0 ? (ord[m - 1] + ord[m]) / 2 : ord[m];
}

export function semaforo(horas: number | null, sla: number): Semaforo {
  if (horas === null) return 'sin_datos';
  if (horas <= sla) return 'verde';
  if (horas <= 2 * sla) return 'amarillo';
  return 'rojo';
}

/** Primera calendarización de cada solicitud (fecha y autor). */
export function primeraCalendarizacion(eventos: EventoAuditoria[]): Map<string, EventoAuditoria> {
  const mapa = new Map<string, EventoAuditoria>();
  for (const e of eventos) {
    if (e.accion !== 'calendarizacion') continue;
    const actual = mapa.get(e.entidad_id);
    if (!actual || e.created_at < actual.created_at) mapa.set(e.entidad_id, e);
  }
  return mapa;
}

function filaVacia(id: string, nombre: string): FilaEncargado {
  return {
    id,
    nombre,
    pendientes: 0,
    pendientesFueraDeSla: 0,
    antiguedadMaximaHoras: null,
    enCurso: 0,
    atrasadas: 0,
    respondidas: 0,
    respuestaPromedioHoras: null,
    respuestaMedianaHoras: null,
    respuestasDentroDeSla: 0,
    recibidas: 0,
    recibidasATiempo: 0,
    reprogramaciones: 0,
    cancelaciones: 0,
    semaforo: 'sin_datos',
  };
}

export function calcularReporte(
  solicitudes: SolicitudLista[],
  eventos: EventoAuditoria[],
  usuarios: UsuarioLogistica[],
  o: OpcionesReporte
): ReporteLogistica {
  const sla = o.slaHoras ?? SLA_RESPUESTA_HORAS;
  const hoy = o.ahora.slice(0, 10);
  const filas = new Map<string, FilaEncargado>();
  const respuestas = new Map<string, number[]>();
  const nombres = new Map(usuarios.map((u) => [u.id, u.nombre]));

  const fila = (id: string | null | undefined): FilaEncargado => {
    const clave = id ?? SIN_ASIGNAR;
    if (!filas.has(clave)) {
      const nombre = clave === SIN_ASIGNAR ? 'Sin asignar' : nombres.get(clave) ?? 'Usuario sin nombre';
      filas.set(clave, filaVacia(clave, nombre));
    }
    return filas.get(clave)!;
  };
  usuarios.forEach((u) => fila(u.id));

  const calendarizaciones = primeraCalendarizacion(eventos);
  const pendientesMasAntiguos: PendienteDetalle[] = [];

  for (const s of solicitudes) {
    const f = fila(s.logistica_id);
    const atrasada = estadoPlazo(s, hoy) === 'atrasada';

    if (ESTADOS_PENDIENTES.includes(s.estado)) {
      f.pendientes += 1;
      const antiguedad = s.fecha_confirmacion ? horasEntre(s.fecha_confirmacion, o.ahora) : null;
      if (antiguedad !== null) {
        if (antiguedad > sla) f.pendientesFueraDeSla += 1;
        f.antiguedadMaximaHoras = Math.max(f.antiguedadMaximaHoras ?? 0, antiguedad);
      }
      pendientesMasAntiguos.push({
        id: s.id,
        ruta: `${s.sucursal_nombre ?? s.sucursal} → ${s.sucursal_destino_nombre ?? s.titulo_evento ?? 'Evento'}`,
        encargado: f.nombre,
        zonaId: s.sucursal_zona_id,
        antiguedadHoras: antiguedad ?? 0,
        fechaLimite: s.fecha_limite,
        atrasada,
      });
    }
    if (ESTADOS_EN_CURSO.includes(s.estado)) f.enCurso += 1;
    if (atrasada) f.atrasadas += 1;

    // Respuesta: atribuida a quien calendarizó, dentro del período.
    const cal = calendarizaciones.get(s.id);
    if (cal && s.fecha_confirmacion && enPeriodo(cal.created_at, o.desde, o.hasta)) {
      const horas = Math.max(horasEntre(s.fecha_confirmacion, cal.created_at), 0);
      const responsable = fila(cal.usuario_id);
      responsable.respondidas += 1;
      if (horas <= sla) responsable.respuestasDentroDeSla += 1;
      respuestas.set(responsable.id, [...(respuestas.get(responsable.id) ?? []), horas]);
    }

    // Recepciones del período y si fueron a tiempo.
    if (s.fecha_recepcion && enPeriodo(s.fecha_recepcion, o.desde, o.hasta)) {
      f.recibidas += 1;
      const limite = s.fecha_limite?.slice(0, 10);
      if (!limite || s.fecha_recepcion.slice(0, 10) <= limite) f.recibidasATiempo += 1;
    }
  }

  for (const e of eventos) {
    if (!enPeriodo(e.created_at, o.desde, o.hasta)) continue;
    if (e.accion === 'recalendarizacion') fila(e.usuario_id).reprogramaciones += 1;
    if (e.accion === 'cancelacion_transito') fila(e.usuario_id).cancelaciones += 1;
  }

  for (const f of filas.values()) {
    const lista = respuestas.get(f.id) ?? [];
    f.respuestaPromedioHoras = redondear(promedio(lista));
    f.respuestaMedianaHoras = redondear(mediana(lista));
    f.antiguedadMaximaHoras = redondear(f.antiguedadMaximaHoras);
    // El semáforo combina la velocidad de respuesta y lo que hoy espera.
    const peor = Math.max(f.respuestaPromedioHoras ?? 0, f.antiguedadMaximaHoras ?? 0);
    f.semaforo = f.respuestaPromedioHoras === null && f.antiguedadMaximaHoras === null ? 'sin_datos' : semaforo(peor, sla);
  }

  const porEncargado = [...filas.values()]
    .filter((f) => f.id !== SIN_ASIGNAR || f.pendientes + f.enCurso + f.atrasadas > 0)
    .sort((a, b) => b.pendientesFueraDeSla - a.pendientesFueraDeSla || b.pendientes - a.pendientes || a.nombre.localeCompare(b.nombre));

  const todas = [...respuestas.values()].flat();
  const suma = (k: keyof FilaEncargado) => porEncargado.reduce((acc, f) => acc + (f[k] as number), 0);
  const antiguedades = porEncargado.map((f) => f.antiguedadMaximaHoras).filter((x): x is number => x !== null);
  const promedioGlobal = redondear(promedio(todas));
  const antiguedadMaxima = antiguedades.length ? Math.max(...antiguedades) : null;

  return {
    slaHoras: sla,
    totales: {
      pendientes: suma('pendientes'),
      pendientesFueraDeSla: suma('pendientesFueraDeSla'),
      antiguedadMaximaHoras: antiguedadMaxima,
      enCurso: suma('enCurso'),
      atrasadas: suma('atrasadas'),
      respondidas: suma('respondidas'),
      respuestaPromedioHoras: promedioGlobal,
      respuestaMedianaHoras: redondear(mediana(todas)),
      respuestasDentroDeSla: suma('respuestasDentroDeSla'),
      recibidas: suma('recibidas'),
      recibidasATiempo: suma('recibidasATiempo'),
      reprogramaciones: suma('reprogramaciones'),
      cancelaciones: suma('cancelaciones'),
      semaforo:
        promedioGlobal === null && antiguedadMaxima === null
          ? 'sin_datos'
          : semaforo(Math.max(promedioGlobal ?? 0, antiguedadMaxima ?? 0), sla),
    },
    porEncargado,
    pendientesMasAntiguos: pendientesMasAntiguos.sort((a, b) => b.antiguedadHoras - a.antiguedadHoras),
  };
}

/**
 * Indicadores de un encargado para su propio dashboard: su fila y lo que
 * espera sin encargado en sus zonas (también le toca tomarlo).
 */
export function indicadoresDeEncargado(
  reporte: ReporteLogistica,
  usuarioId: string
): { propia: FilaEncargado; sinAsignar: FilaEncargado | null } {
  const propia = reporte.porEncargado.find((f) => f.id === usuarioId) ?? filaVacia(usuarioId, '');
  const sinAsignar = reporte.porEncargado.find((f) => f.id === SIN_ASIGNAR) ?? null;
  return { propia, sinAsignar };
}

/** "3 h", "1 d 4 h" o "—". */
export function formatoHoras(horas: number | null): string {
  if (horas === null) return '—';
  if (horas < 24) return `${Math.round(horas)} h`;
  const dias = Math.floor(horas / 24);
  const resto = Math.round(horas - dias * 24);
  return resto > 0 ? `${dias} d ${resto} h` : `${dias} d`;
}

/** Porcentaje entero, o "—" si no hay base. */
export function porcentaje(parte: number, total: number): string {
  return total > 0 ? `${Math.round((parte / total) * 100)}%` : '—';
}
