import type { EstadoSolicitud, SolicitudLista } from '@/types/solicitud.types';
import type { UserRole } from '@/types/auth.types';
import { coincideCodigoSolicitud } from '@/lib/codigoSolicitud';

/**
 * Filtro por **grupos de estado** de la lista de solicitudes.
 *
 * El enum `estado_solicitud` tiene 12 valores, pero el usuario piensa en
 * fases: "está esperando", "ya está aprobada", "me toca entregarla", "no
 * salieron". Este módulo traduce los estados a grupos y es la única fuente de
 * la barra de filtros, para que las tarjetas de métricas, los chips y la tabla
 * no puedan discrepar entre sí.
 *
 * Funciones puras: no tocan la BD ni React.
 */

export type GrupoFiltroSolicitud =
  | 'todas'
  | 'pendientes'
  | 'en_curso'
  | 'por_entregar'
  | 'rechazadas'
  | 'finalizadas';

export interface GrupoFiltroDef {
  id: GrupoFiltroSolicitud;
  label: string;
  /** Descripción corta para el tooltip y para lectores de pantalla. */
  descripcion: string;
  estados: EstadoSolicitud[];
}

const ESTADOS_PENDIENTES: EstadoSolicitud[] = ['pendiente_aprobacion', 'pendiente'];
const ESTADOS_EN_CURSO: EstadoSolicitud[] = ['aprobada', 'priorizada', 'asignada', 'calendarizada', 'despachada', 'en_transito'];
const ESTADOS_POR_ENTREGAR: EstadoSolicitud[] = ['entregada'];

/**
 * Estados cerrados: ya no esperan ninguna acción. No suman en el total
 * ("Activas") para no confundir con trabajo pendiente.
 */
export const ESTADOS_CERRADOS: readonly EstadoSolicitud[] = ['finalizada', 'rechazada', 'cancelada'];

export const GRUPOS_FILTRO_SOLICITUDES: GrupoFiltroDef[] = [
  {
    // El id se mantiene por compatibilidad con `?grupo=todas`.
    id: 'todas',
    label: 'Activas',
    descripcion: 'Solicitudes sin cerrar: pendientes, en curso y por entregar',
    estados: [...ESTADOS_PENDIENTES, ...ESTADOS_EN_CURSO, ...ESTADOS_POR_ENTREGAR],
  },
  {
    id: 'pendientes',
    label: 'Pendientes de aprobación',
    descripcion: 'Esperando aprobación del jefe de local',
    estados: ESTADOS_PENDIENTES,
  },
  {
    id: 'en_curso',
    label: 'En curso',
    descripcion: 'Aprobadas y en camino',
    estados: ESTADOS_EN_CURSO,
  },
  {
    id: 'por_entregar',
    label: 'Por entregar',
    descripcion: 'Ya recepcionadas, falta la entrega al cliente',
    estados: ESTADOS_POR_ENTREGAR,
  },
  {
    id: 'rechazadas',
    label: 'Rechazadas / canceladas',
    descripcion: 'Rechazadas o canceladas, con su motivo',
    estados: ['rechazada', 'cancelada'],
  },
  {
    id: 'finalizadas',
    label: 'Finalizadas',
    descripcion: 'Entregadas al cliente',
    estados: ['finalizada'],
  },
];

/**
 * Grupo con que abre la lista: el de la URL (`?grupo=`) si es válido; si no,
 * "Por entregar" para Ejecutivo y Jefe de Local (su acción pendiente) y
 * "Activas" para el resto.
 */
export function grupoInicialSolicitudes(grupoUrl: unknown, rol: UserRole): GrupoFiltroSolicitud {
  if (typeof grupoUrl === 'string' && GRUPOS_FILTRO_SOLICITUDES.some((g) => g.id === grupoUrl)) {
    return grupoUrl as GrupoFiltroSolicitud;
  }
  return rol === 'ejecutivo' || rol === 'jefe_local' ? 'por_entregar' : 'todas';
}

/** Definición de un grupo por id; `todas` si el id no existe. */
export function grupoFiltro(id: GrupoFiltroSolicitud | string): GrupoFiltroDef {
  return GRUPOS_FILTRO_SOLICITUDES.find((g) => g.id === id) ?? GRUPOS_FILTRO_SOLICITUDES[0];
}

/** `true` si el estado pertenece al grupo ("todas" = cualquier estado no cerrado). */
export function estadoEnGrupo(estado: EstadoSolicitud, id: GrupoFiltroSolicitud | string): boolean {
  return grupoFiltro(id).estados.includes(estado);
}

/** Filtra la lista por grupo de estado, sin mutar el arreglo original. */
export function filtrarPorGrupo<T extends { estado: EstadoSolicitud }>(
  solicitudes: T[],
  id: GrupoFiltroSolicitud | string
): T[] {
  const grupo = grupoFiltro(id);
  return solicitudes.filter((s) => grupo.estados.includes(s.estado));
}

/** Cuántas solicitudes hay en cada grupo ("todas" cuenta solo las activas). */
export function contarPorGrupo(
  solicitudes: Array<{ estado: EstadoSolicitud }>
): Record<GrupoFiltroSolicitud, number> {
  const conteo = {} as Record<GrupoFiltroSolicitud, number>;
  for (const grupo of GRUPOS_FILTRO_SOLICITUDES) {
    conteo[grupo.id] = solicitudes.filter((s) => grupo.estados.includes(s.estado)).length;
  }
  return conteo;
}

/** Destino legible de una solicitud: sucursal destino o dirección del evento. */
export function destinoDeSolicitud(sol: SolicitudLista): string {
  if (sol.tipo_solicitud === 'venta') {
    return sol.sucursal_destino_nombre || (sol.sucursal_destino ? `#${sol.sucursal_destino}` : '—');
  }
  return sol.direccion_evento || sol.titulo_evento || '—';
}

/**
 * Búsqueda de texto sobre los campos que el usuario recuerda de una
 * solicitud: sucursal, N° de solicitud (o su uuid), personas, destino y patente.
 */
export function coincideBusqueda(sol: SolicitudLista, term: string): boolean {
  const t = term.trim().toLowerCase();
  if (!t) return true;
  return (
    (sol.sucursal_nombre || '').toLowerCase().includes(t) ||
    coincideCodigoSolicitud(sol, t) ||
    (sol.ejecutivo_nombre || '').toLowerCase().includes(t) ||
    (sol.jefe_local_nombre || '').toLowerCase().includes(t) ||
    (sol.logistica_nombre || '').toLowerCase().includes(t) ||
    (sol.sucursal_destino_nombre || '').toLowerCase().includes(t) ||
    (sol.direccion_evento || '').toLowerCase().includes(t) ||
    (sol.titulo_evento || '').toLowerCase().includes(t) ||
    sol.vehiculos.some((v) => (v.patente ?? '').toLowerCase().includes(t))
  );
}
