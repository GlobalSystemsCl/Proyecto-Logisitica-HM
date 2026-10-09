import type { SolicitudLista } from '@/types/solicitud.types';
import type { TrasladoInterno } from '@/types/traslado.types';
import { etiquetaVehiculo } from '@/lib/vehiculo';

/**
 * Paneles de acciones del dashboard (R11, R12). Cada contenedor muestra las
 * primeras filas de una lista y el total, con un acceso "Ver todas".
 *
 * Funciones puras: no tocan la BD ni React.
 */

/** Filas visibles por contenedor en el dashboard del Jefe de Local. */
export const LIMITE_PANEL_JEFE_LOCAL = 7;
/** Filas visibles por contenedor en el panel del Ejecutivo. */
export const LIMITE_PANEL_EJECUTIVO = 5;

export interface Recorte<T> {
  items: T[];
  total: number;
  restantes: number;
}

export function recortar<T>(lista: T[] | null | undefined, limite: number): Recorte<T> {
  const todos = Array.isArray(lista) ? lista : [];
  const items = todos.slice(0, Math.max(limite, 0));
  return { items, total: todos.length, restantes: todos.length - items.length };
}

/** Fila de la bandeja de recepciones: una solicitud o un traslado interno. */
export interface ItemRecepcion {
  clave: string;
  tipo: 'solicitud' | 'traslado';
  id: string;
  ruta: string;
  vehiculos: string;
  /** Fecha que ordena la bandeja: la límite propuesta (solicitud) o el despacho (traslado). */
  fechaReferencia: string | null;
}

/**
 * Une solicitudes y traslados internos en tránsito en una sola lista,
 * ordenada por la fecha de referencia más próxima (sin fecha, al final).
 */
export function itemsRecepcion(solicitudes: SolicitudLista[], traslados: TrasladoInterno[]): ItemRecepcion[] {
  const deSolicitudes: ItemRecepcion[] = solicitudes.map((s) => ({
    clave: `s-${s.id}`,
    tipo: 'solicitud',
    id: s.id,
    ruta: `${s.sucursal_nombre ?? `Sucursal ${s.sucursal}`} → ${s.sucursal_destino_nombre ?? s.titulo_evento ?? 'Evento'}`,
    vehiculos: s.vehiculos.map((v) => etiquetaVehiculo(v)).filter(Boolean).join(' · ') || 'Sin vehículos',
    fechaReferencia: s.fecha_limite,
  }));
  const deTraslados: ItemRecepcion[] = traslados.map((t) => ({
    clave: `t-${t.id}`,
    tipo: 'traslado',
    id: t.id,
    ruta: `${t.origen_nombre ?? `Sucursal ${t.origen_id}`} → ${t.destino_nombre ?? `Sucursal ${t.destino_id}`}`,
    vehiculos: t.vehiculos.map((v) => `${v.patente ?? v.chasis} · ${v.marca} ${v.modelo}`).join(' · ') || 'Sin vehículo',
    fechaReferencia: t.fecha_despacho,
  }));

  const valor = (f: string | null) => (f ? new Date(f).getTime() : Number.POSITIVE_INFINITY);
  return [...deSolicitudes, ...deTraslados].sort((a, b) => valor(a.fechaReferencia) - valor(b.fechaReferencia));
}

/** Contenedores del panel del Ejecutivo, en orden de aparición (R12). */
export const GRUPOS_PANEL_EJECUTIVO = ['pendientes', 'en_curso', 'por_entregar', 'rechazadas'] as const;
export type GrupoPanelEjecutivo = (typeof GRUPOS_PANEL_EJECUTIVO)[number];

const ESTADOS_GRUPO_EJECUTIVO: Record<GrupoPanelEjecutivo, readonly string[]> = {
  pendientes: ['pendiente_aprobacion', 'pendiente'],
  en_curso: ['aprobada', 'priorizada', 'asignada', 'calendarizada', 'despachada', 'en_transito'],
  por_entregar: ['entregada'],
  rechazadas: ['rechazada'],
};

function tiempo(fecha: string | null | undefined, siFalta: number): number {
  return fecha ? new Date(fecha).getTime() : siFalta;
}

/**
 * Agrupa las solicitudes del Ejecutivo por la acción que le corresponde, con
 * el orden útil para cada grupo:
 *  - pendientes: la más antigua primero (la que más espera)
 *  - en curso: la fecha programada o límite más próxima primero
 *  - por entregar: la recibida hace más tiempo primero
 *  - rechazadas: la más reciente primero (mismo grupo que el filtro de la tabla)
 */
export function gruposPanelEjecutivo(solicitudes: SolicitudLista[]): Record<GrupoPanelEjecutivo, SolicitudLista[]> {
  const INF = Number.POSITIVE_INFINITY;
  const de = (g: GrupoPanelEjecutivo) => solicitudes.filter((s) => ESTADOS_GRUPO_EJECUTIVO[g].includes(s.estado));
  return {
    pendientes: de('pendientes').sort((a, b) => tiempo(a.fecha_creacion, INF) - tiempo(b.fecha_creacion, INF)),
    en_curso: de('en_curso').sort(
      (a, b) =>
        tiempo(a.fecha_tentativa_despacho ?? a.fecha_limite, INF) - tiempo(b.fecha_tentativa_despacho ?? b.fecha_limite, INF)
    ),
    por_entregar: de('por_entregar').sort(
      (a, b) => tiempo(a.fecha_recepcion ?? a.fecha_entrega, INF) - tiempo(b.fecha_recepcion ?? b.fecha_entrega, INF)
    ),
    rechazadas: de('rechazadas').sort((a, b) => tiempo(b.fecha_creacion, 0) - tiempo(a.fecha_creacion, 0)),
  };
}
