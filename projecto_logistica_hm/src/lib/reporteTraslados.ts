import type { SolicitudLista } from '@/types/solicitud.types';
import type { TrasladoInterno } from '@/types/traslado.types';
import { formatFecha, partesFecha } from '@/lib/fechas';
import { esFechaValida, sumarDias } from '@/lib/calendario';
import { formatearRut } from '@/lib/rut';
import { codigoSolicitud, codigoTraslado } from '@/lib/codigoSolicitud';

/**
 * Exportes de Logística (pedido del cliente, 2026-10-19). Funciones puras:
 *  - Calendarización: lo programado en un rango, para pasarlo al transportista.
 *  - Movimientos: todo lo despachado en un rango (solicitudes y traslados
 *    internos), una fila por vehículo, para revisar la factura del transportista.
 */

/** Rango máximo de un exporte: evita consultas enormes por error de tipeo. */
export const MAX_DIAS_RANGO_EXPORTE = 93;

/** Estados que tienen un traslado programado o en curso (calendario). */
export const ESTADOS_CALENDARIZACION_EXPORTE = ['calendarizada', 'en_transito'] as const;

const ETIQUETA_ESTADO: Record<string, string> = {
  calendarizada: 'Programada',
  en_transito: 'En tránsito',
  entregada: 'Recepcionada',
  finalizada: 'Entregada al cliente',
  cancelada: 'Cancelada',
  pendiente: 'Pendiente',
  recepcionado: 'Recepcionado',
  cancelado: 'Cancelado',
};

export function etiquetaEstadoMovimiento(estado: string): string {
  return ETIQUETA_ESTADO[estado] ?? estado;
}

/** Día (`YYYY-MM-DD`) de una fecha, en la hora de Chile si trae hora. */
export function diaChile(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const p = partesFecha(iso);
  if (!p) return null;
  return `${p.anio}-${String(p.mes).padStart(2, '0')}-${String(p.dia).padStart(2, '0')}`;
}

/** "De un día para otro": por defecto se exporta lo programado para mañana. */
export function rangoPorDefectoCalendarizacion(hoy: string): { desde: string; hasta: string } {
  const manana = sumarDias(hoy, 1);
  return { desde: manana, hasta: manana };
}

/** Mensaje de error del rango, o `null` si es válido. */
export function validarRangoExporte(desde: string, hasta: string): string | null {
  if (!esFechaValida(desde) || !esFechaValida(hasta)) return 'Indica las fechas desde y hasta.';
  if (desde > hasta) return 'La fecha desde no puede ser posterior a la fecha hasta.';
  if (sumarDias(desde, MAX_DIAS_RANGO_EXPORTE - 1) < hasta) {
    return `El rango no puede superar ${MAX_DIAS_RANGO_EXPORTE} días.`;
  }
  return null;
}

// -----------------------------------------------------------------------------
// Calendarización
// -----------------------------------------------------------------------------

/** Filas del Excel de la calendarización: una por vehículo, por fecha programada. */
export function filasExcelCalendarizacion(solicitudes: SolicitudLista[]): Array<Record<string, string>> {
  const ordenadas = [...solicitudes].sort((a, b) =>
    (a.fecha_tentativa_despacho ?? '').localeCompare(b.fecha_tentativa_despacho ?? '') ||
    (a.sucursal_nombre ?? '').localeCompare(b.sucursal_nombre ?? '')
  );
  return ordenadas.flatMap((s) => {
    const vehiculos = s.vehiculos.length > 0 ? s.vehiculos : [null];
    return vehiculos.map((v) => ({
      Solicitud: codigoSolicitud(s),
      'Fecha programada': formatFecha(s.fecha_tentativa_despacho),
      Origen: s.sucursal_nombre ?? '',
      Destino: s.sucursal_destino_nombre ?? s.titulo_evento ?? '',
      Chasis: v?.chasis ?? '',
      Patente: v?.patente ?? '',
      Marca: v?.marca ?? '',
      Modelo: v?.modelo ?? '',
      Color: v?.color ?? '',
      Tipo: s.tipo_solicitud === 'evento' ? 'Evento' : 'Sala de venta',
      Transportista: s.transportista?.nombre ?? '',
      'RUT transportista': s.transportista ? formatearRut(s.transportista.rut) : '',
      'Logística asignada': s.logistica_nombre ?? '',
      Estado: etiquetaEstadoMovimiento(s.estado),
    }));
  });
}

// -----------------------------------------------------------------------------
// Movimientos (revisión de la factura del transportista)
// -----------------------------------------------------------------------------

export type TipoMovimiento = 'solicitud' | 'interno';

export interface MovimientoTraslado {
  /** Clave única de la fila (traslado + vehículo). */
  clave: string;
  tipo: TipoMovimiento;
  codigo: string;
  /** Día del despacho en hora de Chile, `YYYY-MM-DD`. */
  fechaDespacho: string;
  fechaRecepcion: string | null;
  origen: string;
  destino: string;
  chasis: string;
  patente: string | null;
  marca: string;
  modelo: string;
  transportistaId: string | null;
  transportistaNombre: string | null;
  transportistaRut: string | null;
  logistica: string | null;
  estado: string;
}

/** Movimientos de las solicitudes despachadas (una fila por vehículo). */
export function movimientosDesdeSolicitudes(solicitudes: SolicitudLista[]): MovimientoTraslado[] {
  return solicitudes.flatMap((s) => {
    const fechaDespacho = diaChile(s.fecha_despacho);
    if (!fechaDespacho) return [];
    return s.vehiculos.map((v) => ({
      clave: `${s.id}:${v.solicitud_vehiculo_id}`,
      tipo: 'solicitud' as const,
      codigo: codigoSolicitud(s),
      fechaDespacho,
      fechaRecepcion: diaChile(s.fecha_recepcion),
      origen: s.sucursal_nombre ?? '',
      destino: s.sucursal_destino_nombre ?? s.titulo_evento ?? '',
      chasis: v.chasis,
      patente: v.patente,
      marca: v.marca,
      modelo: v.modelo,
      transportistaId: s.transportista?.id ?? null,
      transportistaNombre: s.transportista?.nombre ?? null,
      transportistaRut: s.transportista?.rut ?? null,
      logistica: s.logistica_nombre,
      estado: s.estado,
    }));
  });
}

/** Movimientos de los traslados internos despachados (una fila por vehículo). */
export function movimientosDesdeTraslados(traslados: TrasladoInterno[]): MovimientoTraslado[] {
  return traslados.flatMap((t) => {
    const fechaDespacho = diaChile(t.fecha_despacho);
    if (!fechaDespacho) return [];
    return t.vehiculos.map((v) => ({
      clave: `${t.id}:${v.traslado_vehiculo_id}`,
      tipo: 'interno' as const,
      codigo: codigoTraslado(t.id),
      fechaDespacho,
      fechaRecepcion: diaChile(t.fecha_recepcion),
      origen: t.origen_nombre ?? '',
      destino: t.destino_nombre ?? '',
      chasis: v.chasis,
      patente: v.patente,
      marca: v.marca,
      modelo: v.modelo,
      transportistaId: t.transportista?.id ?? null,
      transportistaNombre: t.transportista?.nombre ?? null,
      transportistaRut: t.transportista?.rut ?? null,
      logistica: t.logistica_nombre,
      estado: t.estado,
    }));
  });
}

/** Une ambos tipos, deja solo los despachados dentro del rango y ordena por fecha. */
export function unirMovimientos(
  solicitudes: SolicitudLista[],
  traslados: TrasladoInterno[],
  desde: string,
  hasta: string
): MovimientoTraslado[] {
  return [...movimientosDesdeSolicitudes(solicitudes), ...movimientosDesdeTraslados(traslados)]
    .filter((m) => m.fechaDespacho >= desde && m.fechaDespacho <= hasta)
    .sort((a, b) => a.fechaDespacho.localeCompare(b.fechaDespacho) || a.codigo.localeCompare(b.codigo));
}

/** Valor del filtro de transportista para los movimientos sin transportista. */
export const SIN_TRANSPORTISTA = 'sin_transportista';

export interface FiltrosMovimientos {
  /** Id del transportista, `SIN_TRANSPORTISTA` o vacío (todos). */
  transportista: string;
  origen: string;
  destino: string;
  tipo: '' | TipoMovimiento;
  estado: string;
  /** Búsqueda por chasis o patente. */
  vehiculo: string;
}

export const FILTROS_MOVIMIENTOS_VACIOS: FiltrosMovimientos = {
  transportista: '',
  origen: '',
  destino: '',
  tipo: '',
  estado: '',
  vehiculo: '',
};

export function filtrarMovimientos(movimientos: MovimientoTraslado[], f: FiltrosMovimientos): MovimientoTraslado[] {
  const busqueda = f.vehiculo.trim().toLowerCase();
  return movimientos.filter((m) => {
    if (f.transportista === SIN_TRANSPORTISTA ? m.transportistaId !== null : f.transportista && m.transportistaId !== f.transportista) {
      return false;
    }
    if (f.origen && m.origen !== f.origen) return false;
    if (f.destino && m.destino !== f.destino) return false;
    if (f.tipo && m.tipo !== f.tipo) return false;
    if (f.estado && m.estado !== f.estado) return false;
    if (busqueda && !m.chasis.toLowerCase().includes(busqueda) && !(m.patente ?? '').toLowerCase().includes(busqueda)) {
      return false;
    }
    return true;
  });
}

/** Opciones de los filtros, a partir de los movimientos cargados. */
export function opcionesFiltrosMovimientos(movimientos: MovimientoTraslado[]) {
  const unicos = (valores: string[]) => [...new Set(valores.filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const transportistas = new Map<string, string>();
  for (const m of movimientos) {
    if (m.transportistaId) transportistas.set(m.transportistaId, m.transportistaNombre ?? '');
  }
  return {
    transportistas: [...transportistas.entries()]
      .map(([id, nombre]) => ({ id, nombre }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre)),
    origenes: unicos(movimientos.map((m) => m.origen)),
    destinos: unicos(movimientos.map((m) => m.destino)),
    estados: unicos(movimientos.map((m) => m.estado)),
  };
}

/** Vehículos movidos por transportista (para cuadrar con la factura). */
export function resumenPorTransportista(
  movimientos: MovimientoTraslado[]
): Array<{ transportista: string; rut: string; vehiculos: number }> {
  const porClave = new Map<string, { transportista: string; rut: string; vehiculos: number }>();
  for (const m of movimientos) {
    const clave = m.transportistaId ?? SIN_TRANSPORTISTA;
    const fila = porClave.get(clave) ?? {
      transportista: m.transportistaNombre ?? 'Sin transportista',
      rut: m.transportistaRut ? formatearRut(m.transportistaRut) : '',
      vehiculos: 0,
    };
    fila.vehiculos += 1;
    porClave.set(clave, fila);
  }
  return [...porClave.values()].sort((a, b) => b.vehiculos - a.vehiculos || a.transportista.localeCompare(b.transportista));
}

/** Filas del Excel de movimientos (mismas columnas que la tabla). */
export function filasExcelMovimientos(movimientos: MovimientoTraslado[]): Array<Record<string, string>> {
  return movimientos.map((m) => ({
    'Fecha despacho': formatFecha(m.fechaDespacho),
    Tipo: m.tipo === 'solicitud' ? 'Solicitud' : 'Traslado interno',
    Código: m.codigo,
    Origen: m.origen,
    Destino: m.destino,
    Chasis: m.chasis,
    Patente: m.patente ?? '',
    Marca: m.marca,
    Modelo: m.modelo,
    Transportista: m.transportistaNombre ?? '',
    'RUT transportista': m.transportistaRut ? formatearRut(m.transportistaRut) : '',
    'Logística': m.logistica ?? '',
    Estado: etiquetaEstadoMovimiento(m.estado),
    'Fecha recepción': m.fechaRecepcion ? formatFecha(m.fechaRecepcion) : '',
  }));
}
