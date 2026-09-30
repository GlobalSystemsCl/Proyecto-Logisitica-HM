import { UserRole } from '@/types/auth.types';

export interface SolicitudesTab {
  href: string;
  label: string;
  active: boolean;
}

export type TabSolicitudes = 'general' | 'traslados' | 'aprobaciones' | 'prioridades';

const RUTAS_TABS: Record<TabSolicitudes, string> = {
  general: '/solicitudes',
  traslados: '/solicitudes/traslados',
  aprobaciones: '/solicitudes/aprobaciones',
  prioridades: '/solicitudes/prioridades',
};

const LABELS_TABS: Record<TabSolicitudes, string> = {
  general: 'General',
  traslados: 'Traslados',
  aprobaciones: 'Aprobaciones',
  prioridades: 'Prioridades',
};

const TAB_DE_PATH: Record<string, TabSolicitudes> = {
  '/solicitudes': 'general',
  '/solicitudes/traslados': 'traslados',
  '/solicitudes/aprobaciones': 'aprobaciones',
  '/solicitudes/prioridades': 'prioridades',
};

const TABS_POR_ROL: Record<UserRole, TabSolicitudes[]> = {
  administrador: ['general', 'traslados', 'aprobaciones', 'prioridades'],
  jefe_local: ['general', 'traslados', 'aprobaciones', 'prioridades'],
  logistica: ['general', 'traslados'],
  ejecutivo: ['general', 'aprobaciones'],
  operaciones: [],
};

/**
 * Tabs del encabezado del módulo de Solicitudes, consistentes para todas las
 * subpáginas (General, Traslados, Aprobaciones, Prioridades): mismo conjunto y
 * mismo orden de tabs según el rol, marcando activo el que corresponda.
 */
export function getSolicitudesTabs(rol: UserRole, activo: TabSolicitudes): SolicitudesTab[] {
  return (TABS_POR_ROL[rol] || []).map((k) => ({
    href: RUTAS_TABS[k],
    label: LABELS_TABS[k],
    active: k === activo,
  }));
}

/** Mapea la ruta del módulo de Solicitudes a la tab activa (`general` por defecto). */
export function tabSolicitudesDePath(path: string): TabSolicitudes {
  return TAB_DE_PATH[path] ?? 'general';
}