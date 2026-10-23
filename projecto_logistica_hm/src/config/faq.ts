import type { UserRole } from '@/types/auth.types';

/**
 * Preguntas frecuentes por rol y por vista (fase H). Es la única fuente del
 * contenido de `/faq`. El botón de ayuda de cada página abre `/faq?vista=<vista>`
 * con las preguntas de esa pantalla primero.
 *
 * Al cambiar una regla de negocio, actualizar aquí la respuesta que la explica.
 */

export type VistaFaq =
  | 'general'
  | 'dashboard'
  | 'solicitudes'
  | 'aprobaciones'
  | 'prioridades'
  | 'recepciones'
  | 'calendario'
  | 'traslados'
  | 'movimientos'
  | 'reportes'
  | 'slots'
  | 'inventario'
  | 'usuarios'
  | 'sucursales'
  | 'historial'
  | 'perfil';

export const ETIQUETA_VISTA: Record<VistaFaq, string> = {
  general: 'Generales',
  dashboard: 'Inicio (dashboard)',
  solicitudes: 'Solicitudes',
  aprobaciones: 'Aprobaciones',
  prioridades: 'Prioridades',
  recepciones: 'Recepciones',
  calendario: 'Calendario de traslados',
  traslados: 'Traslados internos',
  movimientos: 'Movimientos (factura del transportista)',
  reportes: 'Reportes de Logística',
  slots: 'Slots de estacionamiento',
  inventario: 'Inventario de vehículos',
  usuarios: 'Usuarios',
  sucursales: 'Sucursales',
  historial: 'Historial',
  perfil: 'Mi perfil',
};

/** Orden en que se muestran las vistas en `/faq`. */
export const ORDEN_VISTAS: readonly VistaFaq[] = Object.keys(ETIQUETA_VISTA) as VistaFaq[];

export interface PreguntaFaq {
  vista: VistaFaq;
  /** Roles que ven la pregunta. Sin `roles`, la ven todos. */
  roles?: readonly UserRole[];
  pregunta: string;
  respuesta: string;
}

const GESTION: readonly UserRole[] = ['administrador', 'jefe_local'];
const CREAN: readonly UserRole[] = ['administrador', 'jefe_local', 'ejecutivo'];
const CALENDARIO: readonly UserRole[] = ['administrador', 'jefe_local', 'logistica'];
const INVENTARIO: readonly UserRole[] = ['administrador', 'jefe_local', 'logistica', 'operaciones'];
const OPERAN_TRASLADOS: readonly UserRole[] = ['administrador', 'logistica'];
const SOLO_ADMIN: readonly UserRole[] = ['administrador'];

export const PREGUNTAS_FAQ: readonly PreguntaFaq[] = [
  // ---------- Generales ----------
  {
    vista: 'general',
    pregunta: '¿Qué es una solicitud de traslado?',
    respuesta:
      'Es el pedido para mover uno o más vehículos desde una sucursal de origen hacia otra sucursal o hacia un evento. Pasa por aprobación del jefe de local, la cola de prioridades de la sucursal, la programación de Logística, el despacho, la recepción en destino y, en una venta, la entrega al cliente.',
  },
  {
    vista: 'general',
    pregunta: '¿Qué significa cada estado de una solicitud?',
    respuesta:
      'Pendiente de aprobación: espera al jefe de local. Aprobada: lista para entrar a la cola. Priorizada: tiene una posición en la cola de su sucursal. Asignada: ya tiene Logística asignada. Programada: tiene fecha de despacho y transportista. En tránsito: el vehículo salió. Recepcionada: llegó a la sucursal de destino. Entregada al cliente: cierre de la venta. Rechazada o Cancelada: terminó sin traslado.',
  },
  {
    vista: 'general',
    pregunta: '¿Cómo me entero de los cambios en mis solicitudes?',
    respuesta:
      'La campana del encabezado muestra los cambios de estado de las solicitudes y traslados en que participas, en el momento. Los hitos importantes (creada, aprobada, rechazada, programada, reprogramada, despachada, recibida y cancelación en tránsito) también llegan por correo. Nunca se te avisa de una acción que hiciste tú.',
  },
  {
    vista: 'general',
    pregunta: '¿Cómo veo el detalle de una solicitud?',
    respuesta:
      'Haz clic en el número de la solicitud (#XXXXXXXX, subrayado) en cualquier lista: paneles del inicio, prioridades, recepciones, reportes o sucursales. Se abre el detalle con sus vehículos, historial, observaciones y documentos. Las acciones sobre la solicitud se hacen en la pantalla que corresponde.',
  },
  {
    vista: 'general',
    pregunta: 'Olvidé mi contraseña o mi cuenta está bloqueada, ¿qué hago?',
    respuesta:
      'Usa "¿Olvidaste tu contraseña?" en la página de inicio de sesión: te llegará un enlace por correo. Después de 5 intentos fallidos la cuenta se bloquea 15 minutos. Si tu cuenta fue desactivada, contacta al administrador.',
  },
  {
    vista: 'general',
    pregunta: 'Me registré y no puedo entrar, ¿por qué?',
    respuesta:
      'Las cuentas creadas desde el registro quedan pendientes hasta que el administrador las active y confirme tu rol y sucursal. El administrador recibe un aviso cuando te registras. Solo se aceptan correos corporativos (@hmotores.cl).',
  },

  // ---------- Dashboard ----------
  {
    vista: 'dashboard',
    roles: ['jefe_local'],
    pregunta: '¿Qué muestra "Tus pendientes"?',
    respuesta:
      'Tres cuadros: solicitudes por aprobar, vehículos en camino a tus sucursales (para recibir) y solicitudes aprobadas que aún no entran a la cola. El cuadro de priorizaciones es informativo: la cola se ordena arrastrando en Prioridades.',
  },
  {
    vista: 'dashboard',
    roles: ['logistica'],
    pregunta: '¿Qué muestra "Tus pendientes"?',
    respuesta:
      'Las solicitudes por programar, las programadas que aún no se despachan y los traslados internos a tu cargo pendientes de despacho. El número abre el detalle; "Ver" te lleva al calendario con la solicitud ya buscada.',
  },
  {
    vista: 'dashboard',
    roles: SOLO_ADMIN,
    pregunta: '¿Cómo activo las cuentas que se registraron?',
    respuesta:
      'En "Cuentas por activar" usa "Activar cuenta" para revisar una por una (eliges rol y sucursal), o marca varias y usa "Activar seleccionadas" para darles el mismo rol de una vez. Por defecto cada cuenta conserva la sucursal que indicó al registrarse.',
  },
  {
    vista: 'dashboard',
    pregunta: '¿Dónde están los módulos del sistema?',
    respuesta:
      'En las tarjetas del inicio, agrupadas en Gestión, Operación y Soporte. Cada rol ve solo las que le corresponden. El ejecutivo entra directo a Solicitudes, donde tiene su panel.',
  },

  // ---------- Solicitudes ----------
  {
    vista: 'solicitudes',
    roles: CREAN,
    pregunta: '¿Cómo creo una solicitud?',
    respuesta:
      'Usa "Nueva Solicitud", elige el tipo (venta o evento), los vehículos (al menos uno; puedes buscarlos por chasis o patente) y la fecha límite de entrega propuesta, que no puede ser anterior a hoy. Si la crea un ejecutivo, en una venta el destino es su sucursal y queda pendiente de aprobación. Si la crea un jefe de local, queda aprobada.',
  },
  {
    vista: 'solicitudes',
    roles: ['ejecutivo'],
    pregunta: '¿Qué muestra mi panel?',
    respuesta:
      'Cuatro cuadros: pendientes de aprobación, en curso (aprobadas, programadas o en camino), por entregar al cliente (ya recibidas en tu sucursal) y rechazadas o canceladas. "Ver todas" abre la lista filtrada. La lista parte en "Por entregar" y "Activas" no incluye las cerradas.',
  },
  {
    vista: 'solicitudes',
    roles: ['ejecutivo', 'jefe_local', 'administrador'],
    pregunta: '¿Cómo registro la entrega al cliente?',
    respuesta:
      'Cuando la solicitud está Recepcionada, usa "Entregar" en el panel del ejecutivo o "Entregar a cliente" en la lista de solicitudes. La solicitud pasa a Entregada al cliente y el vehículo sale del inventario. Puede hacerlo el ejecutivo que la creó o el jefe de local de destino.',
  },
  {
    vista: 'solicitudes',
    roles: ['ejecutivo'],
    pregunta: '¿Para qué sirve "Insistir"?',
    respuesta:
      'Para avisar que tu solicitud lleva demasiado tiempo sin avanzar. Solo en solicitudes propias y una vez cada 24 horas por solicitud.',
  },
  {
    vista: 'solicitudes',
    pregunta: '¿Puedo cancelar una solicitud?',
    respuesta:
      'Antes del despacho sí, con un motivo de al menos 5 caracteres: el ejecutivo las suyas, el jefe de local las de sus sucursales, Logística las de sus zonas y el administrador cualquiera. Una solicitud en tránsito solo la puede cancelar Logística, indicando dónde queda el vehículo.',
  },
  {
    vista: 'solicitudes',
    roles: ['administrador', 'jefe_local', 'logistica'],
    pregunta: '¿Puedo cambiar los vehículos de una solicitud?',
    respuesta:
      'Sí, desde el detalle, mientras no se haya despachado. La solicitud debe quedar con al menos un vehículo, y un vehículo no puede estar reservado en dos solicitudes activas.',
  },
  {
    vista: 'solicitudes',
    pregunta: 'Me rechazaron una solicitud, ¿puedo apelar?',
    respuesta:
      'No. El rechazo lleva un motivo que ves en el detalle. Si aún necesitas el traslado, crea una solicitud nueva.',
  },
  {
    vista: 'solicitudes',
    pregunta: '¿Puedo adjuntar documentos u observaciones?',
    respuesta:
      'Sí, en las pestañas Observaciones y Documentos del detalle. Los documentos tienen un máximo de 10 MB. Las solicitudes rechazadas o canceladas ya no aceptan observaciones ni documentos.',
  },

  // ---------- Aprobaciones ----------
  {
    vista: 'aprobaciones',
    roles: GESTION,
    pregunta: '¿Cómo apruebo una solicitud?',
    respuesta:
      'Revisa la solicitud y usa "Aprobar". Debes aceptar o cambiar la fecha límite de entrega propuesta (no puede ser anterior a hoy). Al aprobarla, el ejecutivo y Logística de la zona reciben el aviso.',
  },
  {
    vista: 'aprobaciones',
    roles: GESTION,
    pregunta: '¿Cómo rechazo una solicitud?',
    respuesta:
      'Usa "Rechazar" e indica el motivo (mínimo 5 caracteres). El ejecutivo lo ve en el detalle y recibe un correo. Una solicitud rechazada no se puede reabrir.',
  },

  // ---------- Prioridades ----------
  {
    vista: 'prioridades',
    roles: GESTION,
    pregunta: '¿Cómo funciona la cola de prioridades?',
    respuesta:
      'Cada sucursal de origen tiene su propia cola. Arrastra las solicitudes aprobadas desde "Por Priorizar" a la cola y ordénalas arrastrando: la posición 1 es la que Logística debe programar primero. Reordenar no envía avisos; entrar a la cola sí avisa al ejecutivo. En el celular, mantén presionada la tarjeta un momento antes de arrastrarla.',
  },
  {
    vista: 'prioridades',
    roles: GESTION,
    pregunta: '¿Puedo ver el detalle sin mover la tarjeta?',
    respuesta: 'Sí. Haz clic en el número de la solicitud: se abre el detalle y la tarjeta no se arrastra.',
  },

  // ---------- Recepciones ----------
  {
    vista: 'recepciones',
    roles: GESTION,
    pregunta: '¿Cómo registro la llegada de un vehículo?',
    respuesta:
      'En Recepciones (o en "Recepciones pendientes" del inicio) usa "Recibir". Puedes indicar novedades, una observación y fotos. La solicitud pasa a Recepcionada, el vehículo queda en tu sucursal y el ejecutivo recibe el aviso para entregarlo al cliente.',
  },
  {
    vista: 'recepciones',
    roles: GESTION,
    pregunta: '¿También recibo los traslados internos aquí?',
    respuesta:
      'Sí. Los traslados internos en camino a tus sucursales aparecen en su propia sección y se reciben igual. No se pueden rechazar: si llegó con problemas, regístralo en las novedades.',
  },

  // ---------- Calendario ----------
  {
    vista: 'calendario',
    roles: ['logistica'],
    pregunta: '¿Cómo programo un traslado?',
    respuesta:
      'Arrastra la solicitud desde "Por programar" al día del despacho, o usa el botón "Programar" de la tarjeta y elige el día (la forma más cómoda en el celular). Luego indica el transportista (obligatorio). Si no está en la lista, créalo ahí mismo con su nombre y RUT. Si la fecha queda después de la fecha límite, el sistema avisa pero te deja continuar.',
  },
  {
    vista: 'calendario',
    roles: ['logistica'],
    pregunta: '¿Cómo reprogramo una fecha?',
    respuesta:
      'En la vista semanal arrastra la solicitud a otro día, o usa "Reprogramar" en la tarjeta. Debes indicar un motivo y puedes cambiar el transportista. Solo Logística puede reprogramar, y el aviso llega como urgente al ejecutivo y a los jefes de origen y destino.',
  },
  {
    vista: 'calendario',
    roles: OPERAN_TRASLADOS,
    pregunta: '¿Qué diferencia hay entre "Volver a la cola" y "Revertir despacho"?',
    respuesta:
      '"Volver a la cola" se usa en una solicitud programada: quita la fecha y la Logística asignada, y la solicitud vuelve al final de la cola de su sucursal. "Revertir despacho" se usa en una solicitud en tránsito cuyo vehículo no salió: vuelve a Programada y conserva la fecha. Ambos piden confirmación.',
  },
  {
    vista: 'calendario',
    roles: OPERAN_TRASLADOS,
    pregunta: '¿Cómo marco que un vehículo salió?',
    respuesta:
      'Usa "Despachar" en la tarjeta de la solicitud programada. Pasa a En tránsito y el jefe de destino recibe el aviso para recibirlo.',
  },
  {
    vista: 'calendario',
    roles: CALENDARIO,
    pregunta: '¿Puedo descargar la programación en Excel?',
    respuesta:
      'Sí, con "Descargar Excel". Por defecto trae los traslados de mañana, y puedes elegir un rango de hasta 93 días. Incluye una fila por vehículo con origen, destino, chasis, transportista, RUT y Logística asignada.',
  },
  {
    vista: 'calendario',
    roles: CALENDARIO,
    pregunta: '¿Por qué una sucursal aparece sin slots y aun así se puede programar?',
    respuesta:
      'Durante la marcha blanca los slots solo avisan: nunca bloquean una programación ni una recepción.',
  },

  // ---------- Traslados internos ----------
  {
    vista: 'traslados',
    roles: ['administrador', 'jefe_local', 'logistica'],
    pregunta: '¿Qué es un traslado interno?',
    respuesta:
      'Es mover un vehículo del inventario entre sucursales sin una solicitud de venta ni de evento. No pasa por aprobación ni cola y no ocupa slots (solo los informa). Lo crea Logística o el administrador y lo recibe el jefe de local de destino.',
  },
  {
    vista: 'traslados',
    roles: OPERAN_TRASLADOS,
    pregunta: '¿Qué vehículos puedo trasladar?',
    respuesta:
      'Solo vehículos disponibles: no se pueden trasladar los reservados en una solicitud activa ni los entregados al cliente. Búscalos por chasis o patente. Al crear el traslado debes elegir el transportista.',
  },
  {
    vista: 'traslados',
    roles: OPERAN_TRASLADOS,
    pregunta: '¿Puedo cancelar un traslado interno?',
    respuesta:
      'Solo cuando está en tránsito, y solo Logística: con un motivo e indicando dónde queda el vehículo. Se avisa a todos los involucrados.',
  },

  // ---------- Movimientos ----------
  {
    vista: 'movimientos',
    roles: OPERAN_TRASLADOS,
    pregunta: '¿Para qué sirve el reporte de movimientos?',
    respuesta:
      'Para revisar la factura del transportista: muestra todo lo despachado en el período (solicitudes y traslados internos), con una fila por vehículo. Por defecto muestra el mes en curso. Filtra por transportista, origen, destino, tipo, estado o chasis, y compara con el panel "Vehículos por transportista".',
  },
  {
    vista: 'movimientos',
    roles: OPERAN_TRASLADOS,
    pregunta: '¿Cómo lo exporto?',
    respuesta:
      '"Exportar a Excel" descarga lo filtrado en dos hojas: el detalle y el resumen por transportista. Lo programado antes del 20-10-2026 aparece como "Sin registrar" porque aún no se pedía el transportista.',
  },

  // ---------- Reportes ----------
  {
    vista: 'reportes',
    roles: SOLO_ADMIN,
    pregunta: '¿Qué muestran los reportes de Logística?',
    respuesta:
      'Indicadores por usuario de Logística y por zona, y la lista "Pendientes que más esperan" con su antigüedad (en rojo si supera el plazo). Haz clic en el número para ver el detalle. "Exportar Excel" descarga el reporte.',
  },

  // ---------- Slots ----------
  {
    vista: 'slots',
    roles: CALENDARIO,
    pregunta: '¿Qué es un slot?',
    respuesta:
      'Es un lugar de estacionamiento en una sucursal. La pantalla muestra la capacidad de cada sucursal, los lugares libres y las que están excedidas. Durante la marcha blanca los slots solo avisan y nunca bloquean.',
  },

  // ---------- Inventario ----------
  {
    vista: 'inventario',
    roles: INVENTARIO,
    pregunta: '¿Qué significa cada estado de un vehículo?',
    respuesta:
      'Disponible: puede tomar una solicitud o un traslado. Reservado: está en una solicitud activa. Entregado al cliente: la venta se cerró y el vehículo salió del inventario. "En camino a…" indica que va en tránsito hacia otra sucursal.',
  },
  {
    vista: 'inventario',
    roles: INVENTARIO,
    pregunta: '¿Cómo cambio la ubicación de varios vehículos a la vez?',
    respuesta:
      'Marca las casillas de los vehículos (o usa "Seleccionar los N disponibles del filtro"), elige la sucursal de destino y usa "Mover". Se omiten, con el motivo, los reservados, los entregados al cliente, los que están en un traslado interno y los que ya están en esa sucursal. Cada cambio queda en el historial.',
  },
  {
    vista: 'inventario',
    roles: INVENTARIO,
    pregunta: '¿Por qué no puedo editar un vehículo?',
    respuesta:
      'Los vehículos reservados en una solicitud activa o entregados al cliente quedan bloqueados. Solo el administrador puede eliminar vehículos.',
  },
  {
    vista: 'inventario',
    roles: INVENTARIO,
    pregunta: '¿Cómo cargo el stock desde Excel?',
    respuesta:
      'Usa "Importar Stock" y elige el archivo Excel o CSV. Los chasis repetidos se informan y no se duplican. Los vehículos sin sucursal quedan "En viaje / Container" hasta que les asignes ubicación.',
  },

  // ---------- Usuarios ----------
  {
    vista: 'usuarios',
    roles: SOLO_ADMIN,
    pregunta: '¿Cómo creo un usuario?',
    respuesta:
      'Con "Registrar Nuevo Usuario": nombre, correo corporativo, rol y sus sucursales o zona. El usuario recibe por correo una contraseña provisoria y debe cambiarla al entrar. Si el correo falla, la contraseña se muestra en pantalla para que se la entregues.',
  },
  {
    vista: 'usuarios',
    roles: SOLO_ADMIN,
    pregunta: '¿Cómo cargo muchos usuarios a la vez?',
    respuesta:
      'Con "Carga masiva (Excel)": descarga la plantilla, complétala (la hoja Opciones lista los roles, sucursales y zonas válidos) y súbela. Antes de crear verás qué filas tienen errores. Hasta 200 usuarios por archivo; los administradores se crean de a uno.',
  },
  {
    vista: 'usuarios',
    roles: SOLO_ADMIN,
    pregunta: '¿Cómo activo varias cuentas pendientes?',
    respuesta:
      'Filtra por "Pendientes" (o haz clic en la tarjeta de pendientes), marca las cuentas y usa "Activar seleccionadas". Eliges un rol en común (Ejecutivo, Logística u Operaciones) y la sucursal, o mantienes la que cada uno indicó. Jefes de local y administradores se activan de a uno.',
  },
  {
    vista: 'usuarios',
    roles: SOLO_ADMIN,
    pregunta: '¿Qué pasa si desactivo a un usuario?',
    respuesta:
      'Pierde el acceso de inmediato y ve un mensaje con el correo de soporte. Puedes reactivarlo cuando quieras. La cuenta del administrador principal no se puede desactivar.',
  },

  // ---------- Sucursales ----------
  {
    vista: 'sucursales',
    roles: SOLO_ADMIN,
    pregunta: '¿Qué puedo administrar en Sucursales?',
    respuesta:
      'Crear y editar sucursales: nombre, dirección, espacios totales (slots) y zona. El jefe de local a cargo se asigna desde Usuarios, y cada sucursal tiene uno solo. Al abrir una sucursal ves sus vehículos y sus solicitudes; el número abre el detalle.',
  },

  // ---------- Historial ----------
  {
    vista: 'historial',
    roles: SOLO_ADMIN,
    pregunta: '¿Qué registra el historial?',
    respuesta:
      'Cada acción sobre solicitudes, vehículos y traslados: quién la hizo, cuándo y qué cambió (por ejemplo, la ubicación anterior y la nueva de un vehículo). Puedes filtrarlo y exportarlo a Excel.',
  },

  // ---------- Perfil ----------
  {
    vista: 'perfil',
    pregunta: '¿Qué puedo cambiar en mi perfil?',
    respuesta:
      'Tu nombre, apellido y teléfono. El rol, la sucursal y la zona los asigna el administrador: si no corresponden, contáctalo.',
  },
];

/** Prefijos de ruta → vista. El primero que coincide gana. */
const RUTAS_VISTA: Array<[string, VistaFaq]> = [
  ['/solicitudes/aprobaciones', 'aprobaciones'],
  ['/solicitudes/prioridades', 'prioridades'],
  ['/solicitudes/recepciones', 'recepciones'],
  ['/solicitudes/traslados', 'traslados'],
  ['/solicitudes', 'solicitudes'],
  ['/logistica/calendarizaciones', 'calendario'],
  ['/logistica/movimientos', 'movimientos'],
  ['/logistica/reportes', 'reportes'],
  ['/logistica/slots', 'slots'],
  ['/admin/vehiculos', 'inventario'],
  ['/admin/usuarios', 'usuarios'],
  ['/admin/sucursales', 'sucursales'],
  ['/admin/historial', 'historial'],
  ['/dashboard', 'dashboard'],
  ['/perfil', 'perfil'],
];

/** Vista de ayuda de una ruta de la app (`general` si no tiene una propia). */
export function vistaDesdeRuta(pathname: string | null | undefined): VistaFaq {
  const ruta = (pathname ?? '').split(/[?#]/)[0];
  const encontrada = RUTAS_VISTA.find(([prefijo]) => ruta === prefijo || ruta.startsWith(`${prefijo}/`));
  return encontrada ? encontrada[1] : 'general';
}

/** Vista desde `?vista=`, o `null` si no es válida. */
export function vistaDesdeParam(valor: string | string[] | null | undefined): VistaFaq | null {
  const v = Array.isArray(valor) ? valor[0] : valor;
  return v && Object.prototype.hasOwnProperty.call(ETIQUETA_VISTA, v) ? (v as VistaFaq) : null;
}

/** Enlace del botón de ayuda para una ruta. */
export function hrefAyuda(pathname: string | null | undefined): string {
  return `/faq?vista=${vistaDesdeRuta(pathname)}`;
}

export function preguntaVisiblePara(p: PreguntaFaq, rol: UserRole): boolean {
  return !p.roles || p.roles.includes(rol);
}

export interface GrupoFaq {
  vista: VistaFaq;
  titulo: string;
  preguntas: PreguntaFaq[];
}

/**
 * Preguntas del rol agrupadas por vista. Si se indica `vistaActual`, su grupo
 * va primero; el resto sigue `ORDEN_VISTAS`. Los grupos vacíos se omiten.
 */
export function gruposFaq(rol: UserRole, vistaActual?: VistaFaq | null): GrupoFaq[] {
  const visibles = PREGUNTAS_FAQ.filter((p) => preguntaVisiblePara(p, rol));
  const orden = vistaActual ? [vistaActual, ...ORDEN_VISTAS.filter((v) => v !== vistaActual)] : [...ORDEN_VISTAS];
  return orden
    .map((vista) => ({ vista, titulo: ETIQUETA_VISTA[vista], preguntas: visibles.filter((p) => p.vista === vista) }))
    .filter((g) => g.preguntas.length > 0);
}
