import type { EstadoSolicitud, SolicitudLista } from '@/types/solicitud.types';

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

export const GRUPOS_FILTRO_SOLICITUDES: GrupoFiltroDef[] = [
  {
    id: 'todas',
    label: 'Todas',
    descripcion: 'Todas las solicitudes',
    estados: [],
  },
  {
    id: 'pendientes',
    label: 'Pendientes de aprobación',
    descripcion: 'Esperando aprobación del jefe de local',
    estados: ['pendiente_aprobacion', 'pendiente'],
  },
  {
    id: 'en_curso',
    label: 'En curso',
    descripcion: 'Aprobadas y en camino',
    estados: ['aprobada', 'priorizada', 'asignada', 'calendarizada', 'despachada', 'en_transito'],
  },
  {
    id: 'por_entregar',
    label: 'Por entregar',
    descripcion: 'Ya recepcionadas, falta la entrega al cliente',
    estados: ['entregada'],
  },
  {
    id: 'rechazadas',
    label: 'Rechazadas',
    descripcion: 'Rechazadas con su motivo',
    estados: ['rechazada'],
  },
  {
    id: 'finalizadas',
    label: 'Finalizadas',
    descripcion: 'Entregadas al cliente',
    estados: ['finalizada'],
  },
];

/** Definición de un grupo por id; `todas` si el id no existe. */
export function grupoFiltro(id: GrupoFiltroSolicitud | string): GrupoFiltroDef {
  return GRUPOS_FILTRO_SOLICITUDES.find((g) => g.id === id) ?? GRUPOS_FILTRO_SOLICITUDES[0];
}

/** `true` si el estado pertenece al grupo (o si el grupo es "todas"). */
export function estadoEnGrupo(estado: EstadoSolicitud, id: GrupoFiltroSolicitud | string): boolean {
  const grupo = grupoFiltro(id);
  if (grupo.id === 'todas') return true;
  return grupo.estados.includes(estado);
}

/** Filtra la lista por grupo de estado, sin mutar el arreglo original. */
export function filtrarPorGrupo<T extends { estado: EstadoSolicitud }>(
  solicitudes: T[],
  id: GrupoFiltroSolicitud | string
): T[] {
  const grupo = grupoFiltro(id);
  if (grupo.id === 'todas') return [...solicitudes];
  return solicitudes.filter((s) => grupo.estados.includes(s.estado));
}

/** Cuántas solicitudes hay en cada grupo (incluido "todas"). */
export function contarPorGrupo(
  solicitudes: Array<{ estado: EstadoSolicitud }>
): Record<GrupoFiltroSolicitud, number> {
  const conteo = {} as Record<GrupoFiltroSolicitud, number>;
  for (const grupo of GRUPOS_FILTRO_SOLICITUDES) conteo[grupo.id] = 0;
  conteo.todas = solicitudes.length;
  for (const sol of solicitudes) {
    for (const grupo of GRUPOS_FILTRO_SOLICITUDES) {
      if (grupo.id !== 'todas' && grupo.estados.includes(sol.estado)) {
        conteo[grupo.id] += 1;
        break;
      }
    }
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
 * solicitud: sucursal, ID, personas, destino y patente.
 */
export function coincideBusqueda(sol: SolicitudLista, term: string): boolean {
  const t = term.trim().toLowerCase();
  if (!t) return true;
  return (
    (sol.sucursal_nombre || '').toLowerCase().includes(t) ||
    sol.id.toLowerCase().includes(t) ||
    (sol.ejecutivo_nombre || '').toLowerCase().includes(t) ||
    (sol.jefe_local_nombre || '').toLowerCase().includes(t) ||
    (sol.logistica_nombre || '').toLowerCase().includes(t) ||
    (sol.sucursal_destino_nombre || '').toLowerCase().includes(t) ||
    (sol.direccion_evento || '').toLowerCase().includes(t) ||
    (sol.titulo_evento || '').toLowerCase().includes(t) ||
    sol.vehiculos.some((v) => (v.patente ?? '').toLowerCase().includes(t))
  );
}
