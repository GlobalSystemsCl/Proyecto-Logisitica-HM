import type { UserRole } from '@/types/auth.types';

/**
 * Catálogo único de las cards del dashboard. Es la **única** fuente de verdad
 * de qué ve cada rol: la UI no debe decidir módulos con condicionales sueltos.
 *
 * El `icono` es el nombre del icono de `lucide-react` (string, no componente)
 * para que el catálogo sea serializable y se pueda probar sin renderizar.
 *
 * Visibilidad: una card sin `soloAdmin` la ven el administrador y todos los
 * roles que tengan título propio en `tituloPorRol`.
 *
 * El `ejecutivo` **no tiene cards**: `/dashboard` lo redirige a `/solicitudes`,
 * que es su página principal y ya reúne todo lo que puede hacer (crear, editar,
 * seguir y entregar). Un hub con una sola destination sería redundante.
 */

export type DashboardCardGrupo = 'gestion' | 'operacion' | 'soporte';

export interface DashboardCard {
  /** Identificador estable, único en el catálogo. */
  clave: string;
  href: string;
  icono: string;
  grupo: DashboardCardGrupo;
  /** Orden explícito dentro del grupo. */
  orden: number;
  /** Nomenclatura de administración; la ve el `administrador`. */
  tituloAdmin: string;
  /** Nomenclatura específica del rol; su presencia también habilita la card. */
  tituloPorRol: Partial<Record<UserRole, string>>;
  descripcion: string;
  /** Acciones concretas que se pueden realizar en el módulo. */
  acciones: string[];
  soloAdmin?: boolean;
}

export const DASHBOARD_CARDS: DashboardCard[] = [
  {
    clave: 'sucursales',
    href: '/admin/sucursales',
    icono: 'Building2',
    grupo: 'gestion',
    orden: 5,
    tituloAdmin: 'Gestión de Zonas y Sucursales',
    tituloPorRol: {},
    descripcion:
      'Alta de zonas territoriales, agrupación de sucursales por zona y capacidades de estacionamiento por punto.',
    acciones: [
      'Crear y editar zonas territoriales',
      'Agrupar sucursales por zona',
      'Definir la capacidad de estacionamiento por sucursal',
      'Consultar las capacidades por sucursal',
    ],
    soloAdmin: true,
  },
  {
    clave: 'solicitudes',
    href: '/solicitudes',
    icono: 'FileText',
    grupo: 'gestion',
    orden: 10,
    tituloAdmin: 'Gestión de Solicitudes',
    tituloPorRol: {
      jefe_local: 'Solicitudes',
      logistica: 'Solicitudes',
    },
    descripcion:
      'Módulo principal del flujo: aquí nacen y se siguen los traslados de vehículos entre sucursales.',
    acciones: [
      'Crear una solicitud de traslado o de evento',
      'Reservar y liberar los vehículos de la solicitud',
      'Recibir y registrar la entrega al cliente final',
      'Ver el detalle, la trazabilidad y los documentos',
    ],
  },
  {
    clave: 'aprobaciones',
    href: '/solicitudes/aprobaciones',
    icono: 'CheckCircle2',
    grupo: 'gestion',
    orden: 20,
    tituloAdmin: 'Aprobaciones',
    tituloPorRol: { jefe_local: 'Aprobaciones' },
    descripcion:
      'Revisión de las solicitudes pendientes: se aprueba aceptando o ajustando la fecha límite de entrega propuesta, o se rechaza con un motivo.',
    acciones: [
      'Aprobar solicitudes confirmando la fecha límite de entrega propuesta',
      'Rechazar solicitudes indicando el motivo',
      'Consultar el estado y el motivo de rechazo de tus solicitudes',
    ],
  },
  {
    clave: 'prioridades',
    href: '/solicitudes/prioridades',
    icono: 'ListOrdered',
    grupo: 'gestion',
    orden: 30,
    tituloAdmin: 'Prioridades',
    tituloPorRol: { jefe_local: 'Prioridades' },
    descripcion:
      'Cola de solicitudes ordenadas por urgencia. La posición 1 es lo más urgente de la sucursal.',
    acciones: [
      'Priorizar solicitudes arrastrándolas a la posición deseada',
      'Reordenar la cola de prioridad',
      'Sacar solicitudes de la cola',
    ],
  },
  {
    clave: 'traslados',
    href: '/solicitudes/traslados',
    icono: 'Truck',
    grupo: 'gestion',
    orden: 35,
    tituloAdmin: 'Traslados',
    tituloPorRol: { jefe_local: 'Traslados', logistica: 'Traslados' },
    descripcion:
      'Traslados de vehículos ya vendidos entre sucursales, sin ocupar slots ni generar solicitudes.',
    acciones: [
      'Crear traslados con origen, destino y vehículos vendidos',
      'Despachar y confirmar el inicio del tránsito',
      'Recepcionar el traslado en la sucursal destino',
    ],
  },
  {
    clave: 'logistica',
    href: '/logistica/calendarizaciones',
    icono: 'CalendarDays',
    grupo: 'operacion',
    orden: 50,
    tituloAdmin: 'Gestión Logística',
    tituloPorRol: {
      jefe_local: 'Calendarización de traslados',
      logistica: 'Calendarización de traslados',
    },
    descripcion:
      'Seguimiento visual del traslado: calendarización, despacho, tránsito y entrega en destino.',
    acciones: [
      'Calendarizar el traslado con su fecha tentativa',
      'Despachar y confirmar el inicio del tránsito',
      'Recepcionar en destino y finalizar la entrega',
    ],
  },
  {
    clave: 'vehiculos',
    href: '/admin/vehiculos',
    icono: 'CarFront',
    grupo: 'soporte',
    orden: 40,
    tituloAdmin: 'Gestión de Vehículos',
    tituloPorRol: {
      jefe_local: 'Carga de vehículos',
      logistica: 'Carga de vehículos',
      operaciones: 'Carga de vehículos',
    },
    descripcion:
      'Alta de vehículos al inventario interno con sus datos completos y control de dónde están ubicados.',
    acciones: [
      'Cargar vehículos con chasis, patente, marca, modelo y año',
      'Editar el precio y los datos de un vehículo',
      'Consultar la disponibilidad y la sucursal de cada vehículo',
      'Filtrar el inventario por sucursal, estado y fecha de registro',
    ],
  },
  {
    clave: 'slots',
    href: '/logistica/slots',
    icono: 'Grid2x2',
    grupo: 'soporte',
    orden: 41,
    tituloAdmin: 'Slots de Estacionamiento',
    tituloPorRol: {
      jefe_local: 'Slots de Estacionamiento',
      logistica: 'Slots de Estacionamiento',
    },
    descripcion:
      'Capacidad de estacionamiento de tus sucursales: slots ocupados, reservados y disponibles.',
    acciones: [
      'Revisar los slots libres de cada sucursal',
      'Detectar las sucursales sin disponibilidad',
    ],
  },
  {
    clave: 'usuarios',
    href: '/admin/usuarios',
    icono: 'Users',
    grupo: 'soporte',
    orden: 42,
    tituloAdmin: 'Gestión de Usuarios',
    tituloPorRol: {},
    descripcion:
      'Alta, edición y activación de cuentas del sistema, con envío de las credenciales por correo.',
    acciones: [
      'Crear usuarios y asignar su rol',
      'Editar datos, rol y sucursal',
      'Asignar zonas y sucursales a cargo',
      'Resetear la contraseña y activar o desactivar cuentas',
    ],
    soloAdmin: true,
  },
  {
    clave: 'historial',
    href: '/admin/historial',
    icono: 'History',
    grupo: 'soporte',
    orden: 43,
    tituloAdmin: 'Historial y Trazabilidad',
    tituloPorRol: {},
    descripcion:
      'Registro inmutable de cada acción del sistema: quién hizo qué, cuándo y sobre qué solicitud.',
    acciones: [
      'Consultar la auditoría con filtros',
      'Revisar las métricas operativas',
      'Exportar el historial a Excel',
    ],
    soloAdmin: true,
  },
];

/** Enlaces de soporte propios del usuario, presentes para todos los roles. */
export const LINKS_SOPORTE: Array<{ href: string; icono: string; titulo: string }> = [
  { href: '/perfil', icono: 'User', titulo: 'Mi perfil' },
  { href: '/faq', icono: 'CircleHelp', titulo: 'Preguntas frecuentes' },
];

/** Título visible de una card para el rol indicado. */
export function tituloDeCard(card: DashboardCard, rol: UserRole): string {
  return card.tituloPorRol[rol] ?? card.tituloAdmin;
}

/** `true` si el rol debe ver la card en su dashboard. */
export function puedeVerCard(card: DashboardCard, rol: UserRole): boolean {
  if (card.soloAdmin) return rol === 'administrador';
  return rol === 'administrador' || card.tituloPorRol[rol] !== undefined;
}

/** Cards que ve un rol, en el orden de su campo `orden`. */
export function cardsPorRol(rol: UserRole): DashboardCard[] {
  return DASHBOARD_CARDS.filter((c) => puedeVerCard(c, rol)).sort((a, b) => a.orden - b.orden);
}

export interface DashboardSeccion {
  grupo: DashboardCardGrupo;
  titulo: string;
  descripcion: string;
  cards: DashboardCard[];
}

/** Metadatos de las secciones del dashboard, en orden de aparición. */
export const SECCIONES: Array<{ grupo: DashboardCardGrupo; titulo: string; descripcion: string }> = [
  {
    grupo: 'gestion',
    titulo: 'Gestión',
    descripcion: 'Módulos que requieren tu decisión y seguimiento',
  },
  {
    grupo: 'operacion',
    titulo: 'Operación',
    descripcion: 'Seguimiento visual de los traslados en curso',
  },
  {
    grupo: 'soporte',
    titulo: 'Soporte',
    descripcion: 'Administración del sistema y tu configuración',
  },
];

/** Secciones del dashboard de un rol, sin grupos vacíos. */
export function seccionesPorRol(rol: UserRole): DashboardSeccion[] {
  const cards = cardsPorRol(rol);
  return SECCIONES.map((s) => ({
    ...s,
    cards: cards.filter((c) => c.grupo === s.grupo),
  })).filter((s) => s.cards.length > 0);
}
