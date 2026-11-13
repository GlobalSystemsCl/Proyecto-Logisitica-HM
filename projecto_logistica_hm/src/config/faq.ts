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
  | 'transportistas'
  | 'transito'
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
  transportistas: 'Empresas de transporte',
  transito: 'Vehículos en tránsito',
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
// QA #15: importar, registrar, editar y mover vehículos es solo de Logística y el administrador.
const GESTION_INVENTARIO: readonly UserRole[] = ['administrador', 'logistica'];
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
      'Pendiente de aprobación: espera al jefe de local. Aprobada: lista para entrar a la cola. Priorizada: tiene una posición en la cola de su sucursal. Asignada: ya tiene Logística asignada. Programada: tiene fecha de despacho, camión y transportista. En tránsito: el vehículo salió. Recepcionada: llegó a la sucursal de destino. Entregada al cliente: cierre de la venta. Rechazada o Cancelada: terminó sin traslado.',
  },
  {
    vista: 'general',
    pregunta: '¿Cómo me entero de los cambios en mis solicitudes?',
    respuesta:
      'La campana del encabezado muestra los cambios de estado de las solicitudes y traslados en que participas, en el momento. Los hitos importantes (creada, aprobada, rechazada, programada, reprogramada, despachada, recibida y cancelación en tránsito) también llegan por correo. Nunca se te avisa de una acción que hiciste tú. Al abrir un aviso vas directo a la pantalla donde te toca actuar (por ejemplo, Aprobaciones o Recepciones) con el detalle de esa solicitud abierto.',
  },
  {
    vista: 'general',
    pregunta: '¿Cómo se numeran las solicitudes?',
    respuesta:
      'Con el código de la sucursal de origen y un correlativo propio de esa sucursal: 101-15 es la solicitud número 15 creada en la sucursal 101. El número se asigna al crearla y no cambia. Puedes buscar una solicitud escribiendo su número (o solo el comienzo, como 101-1) en la lista de solicitudes o en el calendario.',
  },
  {
    vista: 'general',
    pregunta: '¿Cómo veo el detalle de una solicitud?',
    respuesta:
      'Haz clic en el número de la solicitud (por ejemplo 101-15, subrayado) en cualquier lista: paneles del inicio, prioridades, recepciones, reportes o sucursales. Se abre el detalle con sus vehículos, historial, observaciones y documentos. Las acciones sobre la solicitud se hacen en la pantalla que corresponde.',
  },
  {
    vista: 'general',
    pregunta: 'Olvidé mi contraseña o mi cuenta está bloqueada, ¿qué hago?',
    respuesta:
      'Usa "¿Olvidaste tu contraseña?" en la página de inicio de sesión: te llegará un enlace por correo que vence en 1 hora y sirve una sola vez (puedes abrirlo en el celular aunque lo hayas pedido en el computador). Después de 5 intentos fallidos la cuenta se bloquea 15 minutos. Si tu cuenta fue desactivada, contacta al administrador.',
  },
  {
    vista: 'general',
    pregunta: 'Me registré, ¿ya puedo entrar? ¿Y si mi rol no es Ejecutivo?',
    respuesta:
      'Las cuentas creadas desde el registro quedan activas como Ejecutivo en la sucursal que elegiste, así que puedes entrar de inmediato. Solo se aceptan correos corporativos (@hmotores.cl). Si no puedes entrar, revisa la contraseña o usa "¿Olvidaste tu contraseña?". Si tu rol o sucursal no corresponden, contacta al administrador.',
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
    pregunta: '¿Qué hago cuando alguien se registra?',
    respuesta:
      'Nada, si es vendedor: las cuentas del registro quedan activas como Ejecutivo en la sucursal que eligieron. Te llega un aviso en la campana; ábrelo para ver la cuenta en Usuarios y, si el rol o la sucursal no corresponden, cámbialos con "Editar usuario".',
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
      'Usa "Nueva Solicitud", elige el tipo (venta o evento), los vehículos (al menos uno; puedes buscarlos por chasis o patente; solo aparecen los que tienen sucursal de origen, los que están en tránsito o en container no se pueden pedir) y la fecha límite de entrega propuesta, que no puede ser anterior a hoy. Si la crea un ejecutivo, en una venta el destino es su sucursal y queda pendiente de aprobación. Si la crea un jefe de local, queda aprobada.',
  },
  {
    vista: 'solicitudes',
    roles: CREAN,
    pregunta: '¿Y si el vehículo ya está en mi sucursal?',
    respuesta:
      'Crea la solicitud de venta igual. Si todos los vehículos ya están en la sucursal de destino, el formulario lo indica: no requiere traslado. Cuando el jefe de local la aprueba, queda directo "Recepcionada" (lista para entregar), sin pasar por la cola ni por Logística, y el ejecutivo recibe el aviso para usar "Entregar a cliente". No se pueden mezclar en una misma solicitud vehículos que ya están en la sucursal con otros que vienen de otra: crea dos solicitudes.',
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
      'Sí, en las pestañas Observaciones y Documentos del detalle. Se aceptan PDF, Excel (.xlsx o .xls) e imágenes (PNG, JPG o WEBP), de hasta 10 MB cada uno. Las imágenes se ven en miniatura (clic para ampliarlas) y los PDF se abren con el ojo, sin descargarlos. Las solicitudes rechazadas o canceladas ya no aceptan observaciones ni documentos.',
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
      'Cada sucursal de origen tiene su propia cola. Arrastra las solicitudes aprobadas desde "Por Priorizar" a la cola y ordénalas arrastrando: la posición 1 es la que Logística debe programar primero. Reordenar no envía avisos; entrar a la cola sí avisa al ejecutivo. En el celular, mantén presionada la tarjeta un momento antes de arrastrarla, o usa el botón "Priorizar" (la agrega al final) y las flechas para subirla o bajarla un puesto.',
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
      'Sí. Los traslados internos en camino a tus sucursales aparecen en su propia sección y se reciben igual. No se pueden rechazar: si llegó con problemas, regístralo en las novedades. Puedes adjuntar fotos al recibir; quedan en el detalle del traslado. Los traslados se identifican como T-15.',
  },

  // ---------- Calendario ----------
  {
    vista: 'calendario',
    roles: ['logistica'],
    pregunta: '¿Cómo programo un traslado?',
    respuesta:
      'Arrastra la solicitud desde "Por programar" al día del despacho, o usa el botón "Programar" de la tarjeta y elige el día (la forma más cómoda en el celular). Luego escribe la patente del camión (obligatoria): se completan la empresa de transporte con su RUT y el transportista habitual, que puedes cambiar para ese viaje. Si la patente no está registrada, regístrala ahí mismo con su empresa (existente o nueva). Si la fecha queda después de la fecha límite, el sistema avisa pero te deja continuar.',
  },
  {
    vista: 'calendario',
    roles: ['logistica'],
    pregunta: '¿Cómo reprogramo una fecha?',
    respuesta:
      'En la vista semanal arrastra la solicitud a otro día, o usa "Reprogramar" en la tarjeta. Debes indicar un motivo y puedes cambiar el camión (patente) o el transportista. Solo Logística puede reprogramar, y el aviso llega como urgente al ejecutivo y a los jefes de origen y destino.',
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
      'Usa "Despachar" en la tarjeta de la solicitud programada e ingresa el número de guía de cada vehículo (es obligatorio; si una guía ampara varios autos, usa "Usar para todos"). Pasa a En tránsito y el jefe de destino recibe el aviso para recibirlo. La guía queda en el detalle, en Recepciones y en los Excel.',
  },
  {
    vista: 'calendario',
    roles: CALENDARIO,
    pregunta: '¿Puedo descargar la programación en Excel?',
    respuesta:
      'Sí, con "Descargar Excel". Por defecto trae los traslados de mañana, y puedes elegir un rango de hasta 93 días. Incluye una fila por vehículo con origen, destino, chasis, N° de guía, patente del camión, transportista, empresa de transporte con su RUT y Logística asignada.',
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
      'Solo vehículos disponibles que estén en la sucursal de origen: no se pueden trasladar los reservados en una solicitud activa, los entregados al cliente ni los que no tienen sucursal. Búscalos por chasis o patente. Al crear el traslado debes indicar la patente del camión y el transportista.',
  },
  {
    vista: 'traslados',
    roles: OPERAN_TRASLADOS,
    pregunta: '¿Puedo trasladar varios vehículos a la vez?',
    respuesta:
      'Sí. Elige el origen (la lista muestra los vehículos de esa sucursal), marca los vehículos uno por uno o con "Seleccionar los de esta página" y usa "Crear N traslados". Se crea un traslado por vehículo, con el mismo origen, destino y camión, hasta 50 a la vez. Si alguno no se puede crear, el sistema dice cuál y por qué, y lo deja seleccionado para que lo corrijas.',
  },
  {
    vista: 'traslados',
    roles: OPERAN_TRASLADOS,
    pregunta: '¿Puedo cancelar un traslado interno?',
    respuesta:
      'Solo cuando está en tránsito, y solo Logística (la asignada o la de la zona): con un motivo e indicando dónde queda el vehículo. Se avisa a todos los involucrados.',
  },

  // ---------- Movimientos ----------
  {
    vista: 'movimientos',
    roles: OPERAN_TRASLADOS,
    pregunta: '¿Para qué sirve el reporte de movimientos?',
    respuesta:
      'Para revisar la factura del transportista: muestra todo lo despachado en el período (solicitudes y traslados internos), con una fila por vehículo. Por defecto muestra el mes en curso. Filtra por empresa de transporte, patente del camión o RUT, origen, destino, tipo, estado, chasis o guía, y compara con el panel "Vehículos por transportista".',
  },
  {
    vista: 'movimientos',
    roles: OPERAN_TRASLADOS,
    pregunta: '¿Cómo veo el desempeño de cada empresa de transporte?',
    respuesta:
      'En Movimientos elige el período y usa las pestañas "Por empresa", "Por camión" o "Por tramo". Para cada una ves los viajes, los vehículos, cuántos se recibieron, el tiempo promedio y mediano de llegada (del despacho a la recepción), el porcentaje a tiempo (recibido a más tardar en la fecha límite; solo solicitudes) y los atrasados que siguen en camino. Respeta los filtros de la pantalla y se exporta en el mismo Excel.',
  },
  {
    vista: 'movimientos',
    roles: OPERAN_TRASLADOS,
    pregunta: '¿Cómo lo exporto?',
    respuesta:
      '"Exportar a Excel" descarga lo filtrado: el detalle, el resumen por transportista y las hojas por empresa, por camión y por tramo. Lo programado antes del 20-10-2026 aparece como "Sin registrar" porque aún no se pedía el transportista.',
  },
  {
    vista: 'transito',
    roles: OPERAN_TRASLADOS,
    pregunta: '¿Qué muestra "En tránsito"?',
    respuesta:
      'Todo lo despachado que aún no se recepciona (solicitudes y traslados internos de tus zonas), un vehículo por fila, con su guía, camión, transportista y los días que lleva en camino. Las solicitudes que ya pasaron su fecha límite aparecen como atrasadas. Puedes buscar por chasis, guía, código, patente del camión o RUT, y exportar a Excel. No hay estados intermedios: el vehículo deja de aparecer cuando se recepciona.',
  },
  {
    vista: 'transportistas',
    roles: OPERAN_TRASLADOS,
    pregunta: '¿Cómo registro una empresa de transporte y sus camiones?',
    respuesta:
      'En "Transportistas" usa "Nueva empresa" con su nombre y RUT. Luego, en la tarjeta de la empresa, agrega cada camión con su patente (por ejemplo ABCD-12) y, si quieres, el transportista que lo maneja habitualmente. Una patente pertenece a una sola empresa.',
  },
  {
    vista: 'transportistas',
    roles: OPERAN_TRASLADOS,
    pregunta: '¿Puedo borrar una empresa o un camión?',
    respuesta:
      'No se borran, porque quedan en el historial de los traslados. Usa "Desactivar": deja de ofrecerse al programar y puedes volver a activarlo cuando quieras. Con "Mostrar inactivas" las vuelves a ver.',
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
  {
    vista: 'slots',
    roles: CALENDARIO,
    pregunta: '¿Cómo veo qué vehículos hay en una sucursal?',
    respuesta:
      'Haz clic en el nombre de la sucursal. Se abre la lista de los vehículos que están ahí (disponibles o reservados) y de los que van en camino hacia ella, con su guía y camión. Con "Excel" la descargas. El jefe de local solo ve sus sucursales.',
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
    roles: GESTION_INVENTARIO,
    pregunta: '¿Cómo cambio la ubicación de varios vehículos a la vez?',
    respuesta:
      'Marca las casillas de los vehículos (o usa "Seleccionar los N disponibles del filtro"), elige la sucursal de destino y usa "Mover". Se omiten, con el motivo, los reservados, los entregados al cliente, los que están en un traslado interno y los que ya están en esa sucursal. Cada cambio queda en el historial. Para asignar sucursal a los importados sin ubicación, usa "Ver y asignar ubicación" (o el filtro "Sin ubicación"). Para mover una lista de autos puntual, pega sus chasis o IDV en el buscador, separados por espacios o comas.',
  },
  {
    vista: 'inventario',
    roles: INVENTARIO,
    pregunta: '¿Por qué no puedo editar un vehículo?',
    respuesta:
      'Solo Logística y el administrador registran, editan, importan y mueven vehículos; el jefe de local y Operaciones consultan el inventario. Además, los reservados en una solicitud activa o entregados al cliente quedan bloqueados, y solo el administrador puede eliminar vehículos.',
  },
  {
    vista: 'inventario',
    roles: GESTION_INVENTARIO,
    pregunta: '¿Cómo cargo el stock desde Excel?',
    respuesta:
      'Usa "Importar Stock" y elige el Excel de stock o de compras tal como viene, con las columnas Tipo de vehículo, Marca, Marca completa, Modelo, IDV, Chasis, Color, Ubicación y Patente. Los chasis repetidos se informan y no se duplican, y los que no tienen 17 caracteres se informan como error. Los vehículos sin ubicación quedan "En viaje / Container" y no se pueden pedir en una solicitud hasta que les asignes una sucursal.',
  },

  // ---------- Usuarios ----------
  {
    vista: 'usuarios',
    roles: SOLO_ADMIN,
    pregunta: '¿Cómo creo un usuario?',
    respuesta:
      'Con "Registrar Nuevo Usuario": nombre, correo corporativo, rol y sus sucursales o zonas (un usuario de Logística puede tener varias). El usuario recibe por correo una contraseña provisoria y debe cambiarla al entrar. Si el correo falla, la contraseña se muestra en pantalla para que se la entregues.',
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
    pregunta: '¿Qué hago si alguien de Logística sale de vacaciones?',
    respuesta:
      'En "Ausencias" registra a quien se ausenta, su sustituto y las fechas (la fecha hasta es su último día). El primer día la cuenta del titular se congela, sus solicitudes y traslados en curso pasan al sustituto y este atiende también sus zonas. El día siguiente a la fecha hasta todo vuelve solo: la cuenta se reactiva y lo traspasado que siga abierto regresa al titular (lo que el sustituto cerró queda a su nombre). Puedes terminarla antes con "Terminar ahora".',
  },
  {
    vista: 'usuarios',
    roles: SOLO_ADMIN,
    pregunta: '¿Cómo cambio el rol de una cuenta recién registrada?',
    respuesta:
      'Busca la cuenta (el aviso de la campana ya la deja filtrada) y usa "Editar usuario" para cambiar el rol y sus sucursales o zonas (un usuario de Logística puede tener varias). Si le quitas el rol de Logística a alguien con solicitudes o traslados sin cerrar, el formulario te pide a qué otro usuario de Logística pasárselos. Si quedara alguna cuenta pendiente de una etapa anterior, filtra por "Pendientes", márcalas y usa "Activar seleccionadas".',
  },
  {
    vista: 'usuarios',
    roles: SOLO_ADMIN,
    pregunta: '¿Qué pasa si desactivo a un usuario?',
    respuesta:
      'Pierde el acceso de inmediato y ve un mensaje con el correo de soporte. Puedes reactivarlo cuando quieras. La cuenta del administrador principal no se puede desactivar. Un usuario de Logística con solicitudes o traslados sin cerrar no se puede desactivar: primero pasa su trabajo a otro usuario de Logística (cambiándole el rol en "Editar usuario") o registra una ausencia con sustituto.',
  },

  // ---------- Sucursales ----------
  {
    vista: 'sucursales',
    roles: SOLO_ADMIN,
    pregunta: '¿Qué puedo administrar en Sucursales?',
    respuesta:
      'Crear y editar sucursales: código, nombre, dirección, espacios totales (slots) y zona. El código es el de la planilla de concesionarios (101, 102...), numera las solicitudes de la sucursal (101-1, 101-2...) y no se puede cambiar después de crearla. El jefe de local a cargo se asigna desde Usuarios, y cada sucursal tiene uno solo. Al abrir una sucursal ves sus vehículos y sus solicitudes; el número abre el detalle. Una sucursal sin zona no la ve ningún usuario de Logística: el aviso amarillo indica cuántas hay y el filtro "Sin zona" las lista para asignarles una.',
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
      'Tu nombre, apellido y teléfono. El rol, la sucursal y las zonas los asigna el administrador: si no corresponden, contáctalo.',
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
  ['/logistica/transportistas', 'transportistas'],
  ['/logistica/transito', 'transito'],
  ['/logistica/reportes', 'reportes'],
  ['/logistica/slots', 'slots'],
  ['/admin/vehiculos', 'inventario'],
  ['/admin/usuarios', 'usuarios'],
  ['/admin/ausencias', 'usuarios'],
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
