import type { MovimientoTraslado } from '@/lib/reporteTraslados';
import { formatoHoras, mediana, promedio } from '@/lib/reporteLogistica';
import { formatearPatente } from '@/lib/patente';
import { formatearRut } from '@/lib/rut';

/**
 * R16 (2026-11-12): reportería de las empresas de transporte, con el mismo
 * enfoque que la de Logística. Se calcula sobre los movimientos del período
 * (y los filtros) de la pantalla de Movimientos: por empresa, por camión y por
 * tramo (origen → destino). Funciones puras.
 *
 * Definiciones:
 *  - Viaje: una solicitud o un traslado interno (un código); un viaje puede
 *    llevar varios vehículos.
 *  - Tiempo de llegada: horas desde el despacho hasta la recepción en destino,
 *    solo de los vehículos ya recibidos.
 *  - A tiempo: recibido a más tardar el día de la fecha límite propuesta
 *    (solo solicitudes; los traslados internos no tienen fecha límite).
 *  - Atrasado en camino: sin recibir y ya pasó la fecha límite.
 */

export interface ResumenTransporte {
  clave: string;
  /** Empresa, patente del camión o tramo. */
  nombre: string;
  /** RUT de la empresa, empresa del camión, etc. */
  detalle: string;
  viajes: number;
  vehiculos: number;
  recibidos: number;
  horasPromedio: number | null;
  horasMediana: number | null;
  /** Recibidos con fecha límite: base del porcentaje a tiempo. */
  conPlazo: number;
  aTiempo: number;
  atrasadosEnCamino: number;
}

/** Horas entre dos fechas ISO, o null si falta alguna o el orden es inválido. */
export function horasEntre(desde: string | null, hasta: string | null): number | null {
  if (!desde || !hasta) return null;
  const ms = Date.parse(hasta) - Date.parse(desde);
  return Number.isFinite(ms) && ms >= 0 ? ms / 3_600_000 : null;
}

const SIN_EMPRESA = 'sin_empresa';
const SIN_CAMION = 'sin_camion';

function agrupar(
  movimientos: MovimientoTraslado[],
  hoy: string,
  clave: (m: MovimientoTraslado) => string,
  nombre: (m: MovimientoTraslado) => string,
  detalle: (m: MovimientoTraslado) => string
): ResumenTransporte[] {
  const grupos = new Map<string, { base: MovimientoTraslado; filas: MovimientoTraslado[] }>();
  for (const m of movimientos) {
    if (m.estado === 'cancelada' || m.estado === 'cancelado') continue;
    const k = clave(m);
    const g = grupos.get(k) ?? { base: m, filas: [] };
    g.filas.push(m);
    grupos.set(k, g);
  }
  return [...grupos.entries()]
    .map(([k, { base, filas }]) => {
      const horas = filas.map((m) => horasEntre(m.despachoISO, m.recepcionISO)).filter((h): h is number => h !== null);
      const conPlazo = filas.filter((m) => m.fechaLimite && m.fechaRecepcion);
      return {
        clave: k,
        nombre: nombre(base),
        detalle: detalle(base),
        viajes: new Set(filas.map((m) => m.codigo)).size,
        vehiculos: filas.length,
        recibidos: filas.filter((m) => m.fechaRecepcion).length,
        horasPromedio: promedio(horas),
        horasMediana: mediana(horas),
        conPlazo: conPlazo.length,
        aTiempo: conPlazo.filter((m) => (m.fechaRecepcion as string) <= (m.fechaLimite as string)).length,
        atrasadosEnCamino: filas.filter((m) => !m.fechaRecepcion && m.fechaLimite !== null && m.fechaLimite < hoy).length,
      };
    })
    .sort((a, b) => b.vehiculos - a.vehiculos || a.nombre.localeCompare(b.nombre));
}

/** Por empresa de transporte. */
export function resumenPorEmpresa(movimientos: MovimientoTraslado[], hoy: string): ResumenTransporte[] {
  return agrupar(
    movimientos,
    hoy,
    (m) => m.transportistaId ?? SIN_EMPRESA,
    (m) => m.transportistaNombre ?? 'Sin empresa registrada',
    (m) => (m.transportistaRut ? formatearRut(m.transportistaRut) : '')
  );
}

/** Por camión (patente). Lo programado antes de registrar patentes queda "Sin camión registrado". */
export function resumenPorCamion(movimientos: MovimientoTraslado[], hoy: string): ResumenTransporte[] {
  return agrupar(
    movimientos,
    hoy,
    (m) => m.patenteCamion ?? SIN_CAMION,
    (m) => (m.patenteCamion ? formatearPatente(m.patenteCamion) : 'Sin camión registrado'),
    (m) => [m.conductor, m.transportistaNombre].filter(Boolean).join(' · ')
  );
}

/** Por tramo (origen → destino). */
export function resumenPorTramo(movimientos: MovimientoTraslado[], hoy: string): ResumenTransporte[] {
  return agrupar(
    movimientos,
    hoy,
    (m) => `${m.origen}→${m.destino}`,
    (m) => `${m.origen} → ${m.destino}`,
    () => ''
  );
}

/** Porcentaje a tiempo como texto ("80 %"), o "—" sin base. */
export function textoATiempo(r: Pick<ResumenTransporte, 'aTiempo' | 'conPlazo'>): string {
  return r.conPlazo > 0 ? `${Math.round((r.aTiempo / r.conPlazo) * 100)} %` : '—';
}

/** Filas de una hoja del Excel; `titulo` nombra la primera columna (Empresa, Camión o Tramo). */
export function filasExcelResumen(filas: ResumenTransporte[], titulo: string, tituloDetalle: string): Array<Record<string, string | number>> {
  return filas.map((r) => ({
    [titulo]: r.nombre,
    [tituloDetalle]: r.detalle,
    Viajes: r.viajes,
    Vehículos: r.vehiculos,
    Recibidos: r.recibidos,
    'Tiempo promedio de llegada': formatoHoras(r.horasPromedio),
    'Tiempo mediano de llegada': formatoHoras(r.horasMediana),
    'A tiempo': textoATiempo(r),
    'Atrasados en camino': r.atrasadosEnCamino,
  }));
}
