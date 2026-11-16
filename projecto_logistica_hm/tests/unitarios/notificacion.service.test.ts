import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSupabaseMock, fila, filaConCount } from '../mocks/supabase';
import type { SolicitudLista } from '@/types/solicitud.types';
import type { TrasladoInterno } from '@/types/traslado.types';

const admin = createSupabaseMock();
const enviarCorreo = vi.fn();
const getSolicitudCompleta = vi.fn();
const getTrasladoById = vi.fn();
const getBranch = vi.fn();

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => admin }));
vi.mock('@/services/email.service', () => ({
  EmailService: { enviarCorreo: (...a: unknown[]) => enviarCorreo(...a) },
}));
vi.mock('@/services/solicitudes.service', () => ({
  SolicitudesService: { getSolicitudCompleta: (id: string) => getSolicitudCompleta(id) },
}));
vi.mock('@/services/traslado.service', () => ({
  TrasladoService: { getTrasladoById: (id: string) => getTrasladoById(id) },
}));
vi.mock('@/services/organizacion.service', () => ({
  OrganizacionService: { getBranch: (id: number) => getBranch(id) },
}));

const { NotificacionService } = await import('@/services/notificacion.service');

const persona = (id: string, email = `${id}@test.cl`) => ({ id, email, nombre: id.toUpperCase() });

function solicitud(overrides: Partial<SolicitudLista> = {}): SolicitudLista {
  return {
    id: 'abcd1234-0000-0000-0000-000000000000',
    sucursal: 1,
    sucursal_nombre: 'Centro',
    sucursal_destino: 2,
    sucursal_destino_nombre: 'Norte',
    estado: 'aprobada',
    tipo_solicitud: 'venta',
    posicion_prioridad: null,
    ejecutivo_id: 'eje',
    ejecutivo_nombre: 'Eje',
    jefe_local_id: 'jl1',
    jefe_local_nombre: 'JL',
    logistica_id: 'log',
    logistica_nombre: 'Log',
    fecha_creacion: null,
    fecha_tentativa_despacho: '2026-10-15T00:00:00Z',
    fecha_despacho: null,
    fecha_entrega: null,
    fecha_limite: '2026-10-20T00:00:00Z',
    fecha_confirmacion: null,
    fecha_inicio_transito: null,
    fecha_recepcion: null,
    fecha_entrega_cliente: null,
    motivo_cancelacion: null,
    direccion_evento: null,
    titulo_evento: null,
    sucursal_zona_id: 7,
    vehiculos: [
      {
        solicitud_vehiculo_id: 'sv',
        disponibilidad: 'reservado',
        patente: 'ABCD-12',
        chasis: 'X',
        marca: 'Toyota',
        modelo: 'Corolla',
        anio: 2024,
        color: null,
      },
    ],
    ...overrides,
  } as SolicitudLista;
}

beforeEach(() => {
  admin.reset();
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  enviarCorreo.mockResolvedValue({ success: true });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('NotificacionService.usuariosPorIds', () => {
  it('should_return_active_users_with_email_filtered_by_role', async () => {
    admin.results.usuario = [
      fila([
        { id: 'a', email: 'a@x.cl', nombre: 'Ana', apellido: 'Paz', rol: 'jefe_local', activo: true },
        { id: 'b', email: 'b@x.cl', nombre: 'Bea', apellido: 'Sol', rol: 'administrador', activo: true },
        { id: 'c', email: 'c@x.cl', nombre: 'Ceci', apellido: 'Rey', rol: 'jefe_local', activo: false },
      ]),
    ];

    const res = await NotificacionService.usuariosPorIds(['a', 'b', 'c', null, 'a'], ['jefe_local']);

    expect(res).toEqual([{ id: 'a', email: 'a@x.cl', nombre: 'Ana Paz' }]);
    expect(admin.callsTo('usuario')).toContainEqual(['in', 'id', ['a', 'b', 'c']]);
  });

  it('should_not_query_when_there_are_no_ids', async () => {
    expect(await NotificacionService.usuariosPorIds([null, undefined])).toEqual([]);
    expect(admin.callsTo('usuario')).toHaveLength(0);
  });
});

describe('NotificacionService.logisticaDeSucursal', () => {
  it('should_return_empty_when_branch_has_no_zone', async () => {
    getBranch.mockResolvedValue({ id: 1, nombre: 'C', zona_id: null });
    expect(await NotificacionService.logisticaDeSucursal(1)).toEqual([]);
    expect(admin.callsTo('usuario_zona')).toHaveLength(0);
  });

  it('should_return_logistics_users_of_the_branch_zone', async () => {
    getBranch.mockResolvedValue({ id: 1, nombre: 'C', zona_id: 7 });
    admin.results.usuario_zona = [fila([{ usuario_id: 'log' }])];
    admin.results.usuario = [fila([{ id: 'log', email: 'l@x.cl', nombre: 'Lu', apellido: 'Ro', rol: 'logistica', activo: true }])];

    expect(await NotificacionService.logisticaDeSucursal(1)).toEqual([{ id: 'log', email: 'l@x.cl', nombre: 'Lu Ro' }]);
    expect(admin.callsTo('usuario_zona')).toContainEqual(['eq', 'zona_id', 7]);
  });
});

describe('NotificacionService.notificarSolicitud', () => {
  function participantes() {
    vi.spyOn(NotificacionService, 'usuariosPorIds').mockImplementation(async (ids) =>
      ids.filter((id): id is string => Boolean(id)).map((id) => persona(id))
    );
    vi.spyOn(NotificacionService, 'jefesDeSucursal').mockImplementation(async (id) =>
      id === 1 ? [persona('jl1')] : [persona('jl2')]
    );
    vi.spyOn(NotificacionService, 'logisticaDeSucursal').mockResolvedValue([persona('logz')]);
  }

  it('should_send_urgent_rescheduling_to_executive_and_both_branch_managers', async () => {
    getSolicitudCompleta.mockResolvedValue(solicitud({ estado: 'calendarizada' }));
    participantes();

    const res = await NotificacionService.notificarSolicitud('solicitud_recalendarizada', 's-1', 'log', {
      fechaAnterior: '12/10/2026',
    });

    expect(res).toEqual({ enviados: 3, fallidos: 0, omitidos: 0, enApp: 3 });
    const destinos = enviarCorreo.mock.calls.map((c) => (c[0] as { toEmail: string }).toEmail);
    expect(destinos.sort()).toEqual(['eje@test.cl', 'jl1@test.cl', 'jl2@test.cl']);
    const correo = enviarCorreo.mock.calls[0][0] as { asunto: string; html: string };
    expect(correo.asunto).toContain('[URGENTE]');
    expect(correo.html).toContain('12/10/2026');
    expect(correo.html).toContain('http://localhost:3000/solicitudes');
  });

  it('should_use_branch_code_and_number_in_subject_when_request_has_number', async () => {
    getSolicitudCompleta.mockResolvedValue(solicitud({ estado: 'calendarizada', sucursal: 101, numero: 15 }));
    participantes();

    await NotificacionService.notificarSolicitud('solicitud_recalendarizada', 's-1', 'log', {
      fechaAnterior: '12/10/2026',
    });

    const correo = enviarCorreo.mock.calls[0][0] as { asunto: string };
    expect(correo.asunto).toContain('Traslado de la solicitud 101-15 reprogramado');
  });

  it('should_notify_zone_logistics_only_on_approval', async () => {
    getSolicitudCompleta.mockResolvedValue(solicitud());
    participantes();

    await NotificacionService.notificarSolicitud('solicitud_aprobada', 's-1', 'jl1');

    const destinos = enviarCorreo.mock.calls.map((c) => (c[0] as { toEmail: string }).toEmail);
    expect(destinos.sort()).toEqual(['eje@test.cl', 'logz@test.cl']);
    expect(NotificacionService.logisticaDeSucursal).toHaveBeenCalledWith(1);
  });

  it('should_use_origin_as_reception_branch_for_events', async () => {
    getSolicitudCompleta.mockResolvedValue(solicitud({ sucursal_destino: null, tipo_solicitud: 'evento', titulo_evento: 'Feria' }));
    participantes();

    await NotificacionService.notificarSolicitud('solicitud_despachada', 's-1', 'log');

    expect(NotificacionService.jefesDeSucursal).toHaveBeenCalledWith(1);
    expect(NotificacionService.jefesDeSucursal).not.toHaveBeenCalledWith(2);
  });

  it('should_count_failed_emails_without_throwing', async () => {
    getSolicitudCompleta.mockResolvedValue(solicitud());
    participantes();
    enviarCorreo.mockResolvedValueOnce({ success: false, error: 'x' });

    const res = await NotificacionService.notificarSolicitud('solicitud_cancelada_transito', 's-1', 'log', { motivo: 'Panne' });

    expect(res.fallidos).toBe(1);
    expect(res.enviados).toBe(2);
  });

  it('should_create_one_in_app_notification_per_recipient_excluding_actor', async () => {
    getSolicitudCompleta.mockResolvedValue(solicitud({ estado: 'calendarizada' }));
    participantes();

    const res = await NotificacionService.notificarSolicitud('solicitud_calendarizada', 's-1', 'jl1');

    expect(res.enApp).toBe(2);
    const insert = admin.callsTo('notificacion').find((c) => c[0] === 'insert');
    const filas = insert?.[1] as Array<Record<string, unknown>>;
    expect(filas.map((f) => f.usuario_id).sort()).toEqual(['eje', 'jl2']);
    expect(filas[0]).toMatchObject({
      emisor_id: 'jl1',
      tipo: 'SOLICITUD_CALENDARIZADA',
      titulo: 'Traslado programado',
      entidad: 'solicitud',
      entidad_id: 'abcd1234-0000-0000-0000-000000000000',
      ruta: '/solicitudes?solicitud=abcd1234-0000-0000-0000-000000000000',
    });
    expect(filas[0].mensaje).toContain('#ABCD1234 (Centro → Norte)');
  });

  it('should_link_each_recipient_to_the_screen_of_its_action_in_app_and_email', async () => {
    getSolicitudCompleta.mockResolvedValue(solicitud({ estado: 'en_transito' }));
    participantes();

    await NotificacionService.notificarSolicitud('solicitud_despachada', 's-1', 'log');

    const filas = admin.callsTo('notificacion').find((c) => c[0] === 'insert')?.[1] as Array<Record<string, unknown>>;
    const rutas = Object.fromEntries(filas.map((f) => [f.usuario_id, f.ruta]));
    expect(rutas).toEqual({
      jl2: '/solicitudes/recepciones?solicitud=abcd1234-0000-0000-0000-000000000000',
      eje: '/solicitudes?solicitud=abcd1234-0000-0000-0000-000000000000',
    });
    const correos = Object.fromEntries(
      enviarCorreo.mock.calls.map((c) => [(c[0] as { toEmail: string }).toEmail, (c[0] as { html: string }).html])
    );
    expect(correos['jl2@test.cl']).toContain('http://localhost:3000/solicitudes/recepciones?solicitud=abcd1234-0000-0000-0000-000000000000');
  });

  it('should_create_in_app_notification_without_email_for_in_app_only_events', async () => {
    getSolicitudCompleta.mockResolvedValue(solicitud({ estado: 'asignada' }));
    participantes();

    const res = await NotificacionService.notificarSolicitud('solicitud_asignada', 's-1', 'jl1');

    expect(enviarCorreo).not.toHaveBeenCalled();
    expect(res).toEqual({ enviados: 0, fallidos: 0, omitidos: 0, enApp: 2 });
    const filas = admin.callsTo('notificacion').find((c) => c[0] === 'insert')?.[1] as Array<{ usuario_id: string }>;
    expect(filas.map((f) => f.usuario_id).sort()).toEqual(['eje', 'log']);
  });

  it('should_skip_in_app_notifications_when_there_is_no_actor', async () => {
    getSolicitudCompleta.mockResolvedValue(solicitud());
    participantes();

    const res = await NotificacionService.notificarSolicitud('solicitud_creada', 's-1', null);

    expect(res.enApp).toBe(0);
    expect(admin.callsTo('notificacion')).toHaveLength(0);
  });

  it('should_keep_emails_when_in_app_insert_fails', async () => {
    getSolicitudCompleta.mockResolvedValue(solicitud());
    participantes();
    admin.results.notificacion = [{ data: null, error: { message: 'insert falló' } }];

    const res = await NotificacionService.notificarSolicitud('solicitud_rechazada', 's-1', 'jl1', { motivo: 'Sin stock' });

    expect(res).toEqual({ enviados: 1, fallidos: 0, omitidos: 0, enApp: 0 });
  });

  it('should_do_nothing_when_solicitud_does_not_exist', async () => {
    getSolicitudCompleta.mockResolvedValue(null);
    expect(await NotificacionService.notificarSolicitud('solicitud_creada', 's-x', null)).toEqual({ enviados: 0, fallidos: 0, omitidos: 0, enApp: 0 });
    expect(enviarCorreo).not.toHaveBeenCalled();
  });

  it('should_never_throw_when_something_fails', async () => {
    getSolicitudCompleta.mockRejectedValue(new Error('BD caída'));
    expect(await NotificacionService.notificarSolicitud('solicitud_creada', 's-1', null)).toEqual({ enviados: 0, fallidos: 0, omitidos: 0, enApp: 0 });
  });
});

describe('NotificacionService.notificarTrasladoInterno', () => {
  it('should_notify_both_branch_managers_and_the_assigned_logistics', async () => {
    getTrasladoById.mockResolvedValue({
      id: 'ffff0000-0000-0000-0000-000000000000',
      origen_id: 1,
      origen_nombre: 'Centro',
      destino_id: 2,
      destino_nombre: 'Norte',
      logistica_id: 'log',
      vehiculos: [{ patente: 'ABCD-12', chasis: 'X', marca: 'Toyota', modelo: 'Yaris' }],
    } as unknown as TrasladoInterno);
    vi.spyOn(NotificacionService, 'jefesDeSucursal').mockImplementation(async (id) =>
      id === 1 ? [persona('jl1')] : [persona('jl2')]
    );
    vi.spyOn(NotificacionService, 'usuariosPorIds').mockResolvedValue([persona('log')]);

    const res = await NotificacionService.notificarTrasladoInterno('traslado_interno_cancelado', 't-1', 'otro', {
      motivo: 'Panne',
      ubicacionFinal: 'Centro',
    });

    expect(res.enviados).toBe(3);
    const correo = enviarCorreo.mock.calls[0][0] as { asunto: string; html: string };
    expect(correo.asunto).toContain('Traslado interno #FFFF0000 cancelado');
    expect(correo.html).toContain('http://localhost:3000/solicitudes/traslados?traslado=ffff0000-0000-0000-0000-000000000000');
    expect(res.enApp).toBe(3);
    const filas = admin.callsTo('notificacion').find((c) => c[0] === 'insert')?.[1] as Array<Record<string, unknown>>;
    expect(filas[0]).toMatchObject({
      tipo: 'TRASLADO_INTERNO_CANCELADO',
      entidad: 'traslado_interno',
      entidad_id: 'ffff0000-0000-0000-0000-000000000000',
      ruta: '/solicitudes/traslados?traslado=ffff0000-0000-0000-0000-000000000000',
    });
  });
});

describe('NotificacionService.crearNotificaciones', () => {
  it('should_not_insert_when_there_are_no_recipients', async () => {
    const n = await NotificacionService.crearNotificaciones('solicitud_aprobada', [], 'jl1', 'solicitud', 's-1', {
      codigo: 'X',
      origen: 'A',
      destino: 'B',
    });
    expect(n).toBe(0);
    expect(admin.callsTo('notificacion')).toHaveLength(0);
  });
});

describe('NotificacionService.notificarNuevoUsuario', () => {
  const nuevo = { id: 'u-new', nombre: 'Ana Soto', email: 'ana@hmotores.cl', sucursal: 'Centro' };

  it('should_insert_one_bell_notification_per_active_admin_without_email', async () => {
    admin.results.usuario = [fila([{ id: 'adm-1' }, { id: 'adm-2' }])];
    admin.results.notificacion = [fila(null)];

    const n = await NotificacionService.notificarNuevoUsuario(nuevo);

    expect(n).toBe(2);
    expect(admin.callsTo('usuario')).toContainEqual(['eq', 'rol', 'administrador']);
    expect(admin.callsTo('usuario')).toContainEqual(['eq', 'activo', true]);
    const insert = admin.callsTo('notificacion').find((c) => c[0] === 'insert');
    expect(insert?.[1]).toEqual([
      expect.objectContaining({
        usuario_id: 'adm-1',
        emisor_id: 'u-new',
        tipo: 'NUEVO_USUARIO',
        entidad: 'usuario',
        entidad_id: 'u-new',
        ruta: '/admin/usuarios?q=ana%40hmotores.cl',
        titulo: 'Nuevo usuario registrado',
      }),
      expect.objectContaining({ usuario_id: 'adm-2' }),
    ]);
    expect(enviarCorreo).not.toHaveBeenCalled();
  });

  it('should_not_insert_when_there_are_no_active_admins', async () => {
    admin.results.usuario = [fila([])];
    expect(await NotificacionService.notificarNuevoUsuario(nuevo)).toBe(0);
    expect(admin.callsTo('notificacion')).toHaveLength(0);
  });

  it('should_return_zero_without_throwing_when_insert_fails', async () => {
    admin.results.usuario = [fila([{ id: 'adm-1' }])];
    admin.results.notificacion = [{ data: null, error: { message: 'boom' } }];
    expect(await NotificacionService.notificarNuevoUsuario(nuevo)).toBe(0);
  });

  it('should_return_zero_when_admin_query_fails', async () => {
    admin.results.usuario = [{ data: null, error: { message: 'boom' } }];
    expect(await NotificacionService.notificarNuevoUsuario(nuevo)).toBe(0);
    expect(admin.callsTo('notificacion')).toHaveLength(0);
  });
});

describe('NotificacionService.getBandeja', () => {
  it('should_return_latest_notifications_and_unread_count_of_the_user', async () => {
    const item = { id: 'n1', tipo: 'SOLICITUD_APROBADA', titulo: 'T', mensaje: 'M', leida: false, ruta: '/x', created_at: '2026-10-14' };
    admin.results.notificacion = [fila([item]), filaConCount(4)];

    const res = await NotificacionService.getBandeja('u-1');

    expect(res).toEqual({ items: [item], noLeidas: 4 });
    const llamadas = admin.callsTo('notificacion');
    expect(llamadas).toContainEqual(['eq', 'usuario_id', 'u-1']);
    expect(llamadas).toContainEqual(['eq', 'leida', false]);
    expect(llamadas).toContainEqual(['limit', 20]);
  });

  it('should_return_empty_inbox_when_query_fails', async () => {
    admin.results.notificacion = [{ data: null, error: { message: 'x' } }, filaConCount(2)];
    expect(await NotificacionService.getBandeja('u-1')).toEqual({ items: [], noLeidas: 0 });
  });
});

describe('NotificacionService.marcarLeida', () => {
  it('should_only_update_notifications_of_the_user', async () => {
    expect(await NotificacionService.marcarLeida('u-1', 'n1')).toBe(true);
    const llamadas = admin.callsTo('notificacion');
    expect(llamadas).toContainEqual(['update', { leida: true }]);
    expect(llamadas).toContainEqual(['eq', 'id', 'n1']);
    expect(llamadas).toContainEqual(['eq', 'usuario_id', 'u-1']);
  });

  it('should_return_false_when_update_fails', async () => {
    admin.results.notificacion = [{ data: null, error: { message: 'x' } }];
    expect(await NotificacionService.marcarLeida('u-1', 'n1')).toBe(false);
  });
});

describe('NotificacionService.marcarTodasLeidas', () => {
  it('should_update_only_unread_notifications_of_the_user', async () => {
    expect(await NotificacionService.marcarTodasLeidas('u-1')).toBe(true);
    const llamadas = admin.callsTo('notificacion');
    expect(llamadas).toContainEqual(['eq', 'usuario_id', 'u-1']);
    expect(llamadas).toContainEqual(['eq', 'leida', false]);
  });
});

describe('NotificacionService.notificarSolicitud (avisos completos, 2026-11-11)', () => {
  const jefes: Record<number, string> = { 1: 'jl1', 2: 'jl2', 5: 'jlu' };

  function participantes() {
    vi.spyOn(NotificacionService, 'usuariosPorIds').mockImplementation(async (ids) =>
      ids.filter((id): id is string => Boolean(id)).map((id) => persona(id))
    );
    vi.spyOn(NotificacionService, 'jefesDeSucursal').mockImplementation(async (id) =>
      id && jefes[id] ? [persona(jefes[id])] : []
    );
    vi.spyOn(NotificacionService, 'logisticaDeSucursal').mockResolvedValue([persona('logz')]);
  }

  const conVehiculoEn = (ubicacion: number) =>
    solicitud({
      estado: 'calendarizada',
      vehiculos: [{ ...solicitud().vehiculos[0], ubicacion }],
      transportista: { id: 'tr', nombre: 'Transportes Sur', rut: '1-9' },
    });

  const destinos = () => enviarCorreo.mock.calls.map((c) => (c[0] as { toEmail: string }).toEmail).sort();

  it('should_email_the_manager_of_the_branch_where_the_vehicle_is_when_scheduled', async () => {
    getSolicitudCompleta.mockResolvedValue(conVehiculoEn(5));
    getBranch.mockResolvedValue({ id: 5, nombre: 'Bodega Sur', zona_id: 7 });
    participantes();

    await NotificacionService.notificarSolicitud('solicitud_calendarizada', 's-1', 'log');

    expect(destinos()).toEqual(['eje@test.cl', 'jl1@test.cl', 'jl2@test.cl', 'jlu@test.cl']);
    const correo = enviarCorreo.mock.calls.find((c) => (c[0] as { toEmail: string }).toEmail === 'jlu@test.cl')?.[0] as {
      html: string;
      texto: string;
    };
    expect(correo.html).toContain('Transportes Sur');
    expect(correo.html).toContain('Bodega Sur');
    expect(correo.html).toContain('Jefe de Local de la sucursal donde está el vehículo');
    expect(correo.texto).toContain('- Retiro en: Bodega Sur');
  });

  it('should_notify_vehicle_branch_manager_in_app_only_when_dispatched', async () => {
    getSolicitudCompleta.mockResolvedValue({ ...conVehiculoEn(5), estado: 'en_transito', fecha_despacho: '2026-11-12T18:30:00Z' });
    participantes();

    await NotificacionService.notificarSolicitud('solicitud_despachada', 's-1', 'log');

    expect(destinos()).toEqual(['eje@test.cl', 'jl2@test.cl']);
    const filas = admin.callsTo('notificacion').find((c) => c[0] === 'insert')?.[1] as Array<{ usuario_id: string }>;
    expect(filas.map((f) => f.usuario_id).sort()).toEqual(['eje', 'jl2', 'jlu']);
    expect((enviarCorreo.mock.calls[0][0] as { html: string }).html).toContain('12/11/2026 15:30');
  });

  it('should_only_email_manager_and_executive_when_pending_request_is_cancelled', async () => {
    getSolicitudCompleta.mockResolvedValue(solicitud({ estado: 'cancelada', logistica_id: null }));
    participantes();

    await NotificacionService.notificarSolicitud('solicitud_cancelada', 's-1', 'eje', {
      motivo: 'Desistió',
      estadoAnterior: 'pendiente_aprobacion',
    });

    expect(destinos()).toEqual(['jl1@test.cl']);
    expect(NotificacionService.logisticaDeSucursal).not.toHaveBeenCalled();
  });

  it('should_email_zone_logistics_when_cancelled_request_had_no_assignee', async () => {
    getSolicitudCompleta.mockResolvedValue(solicitud({ estado: 'cancelada', logistica_id: null }));
    participantes();

    await NotificacionService.notificarSolicitud('solicitud_cancelada', 's-1', 'jl1', { estadoAnterior: 'priorizada' });

    expect(destinos()).toEqual(['eje@test.cl', 'logz@test.cl']);
  });

  it('should_email_assignee_and_vehicle_branch_when_scheduled_request_is_cancelled', async () => {
    getSolicitudCompleta.mockResolvedValue({ ...conVehiculoEn(5), estado: 'cancelada' });
    participantes();

    await NotificacionService.notificarSolicitud('solicitud_cancelada', 's-1', 'jl1', { estadoAnterior: 'calendarizada' });

    expect(destinos()).toEqual(['eje@test.cl', 'jl2@test.cl', 'jlu@test.cl', 'log@test.cl']);
    expect(NotificacionService.logisticaDeSucursal).not.toHaveBeenCalled();
  });

  it('should_send_insistence_to_the_branch_manager_when_pending_approval', async () => {
    getSolicitudCompleta.mockResolvedValue(solicitud({ estado: 'pendiente_aprobacion', logistica_id: null }));
    participantes();

    await NotificacionService.notificarSolicitud('solicitud_insistencia', 's-1', 'eje', { mensaje: 'Urge' });

    expect(destinos()).toEqual(['jl1@test.cl']);
    const correo = enviarCorreo.mock.calls[0][0] as { asunto: string; html: string };
    expect(correo.asunto).toContain('El ejecutivo pide avanzar la solicitud');
    expect(correo.html).toContain('/solicitudes/aprobaciones?solicitud=');
    expect(correo.html).toContain('Urge');
  });

  it('should_send_insistence_to_the_logistics_assignee_when_scheduled', async () => {
    getSolicitudCompleta.mockResolvedValue(solicitud({ estado: 'calendarizada' }));
    participantes();

    await NotificacionService.notificarSolicitud('solicitud_insistencia', 's-1', 'eje');

    expect(destinos()).toEqual(['log@test.cl']);
    const filas = admin.callsTo('notificacion').find((c) => c[0] === 'insert')?.[1] as Array<Record<string, unknown>>;
    expect(filas[0]).toMatchObject({ tipo: 'SOLICITUD_INSISTENCIA', ruta: expect.stringContaining('/logistica/calendarizaciones') });
  });

  it('should_create_only_bell_notifications_for_a_new_observation', async () => {
    getSolicitudCompleta.mockResolvedValue(solicitud());
    participantes();

    const res = await NotificacionService.notificarSolicitud('nueva_observacion', 's-1', 'jl1', { mensaje: 'Revisar llantas' });

    expect(enviarCorreo).not.toHaveBeenCalled();
    expect(res.enApp).toBe(2);
    const filas = admin.callsTo('notificacion').find((c) => c[0] === 'insert')?.[1] as Array<Record<string, unknown>>;
    expect(filas[0]).toMatchObject({ tipo: 'NUEVA_OBSERVACION' });
    expect(filas[0].mensaje).toContain('"Revisar llantas"');
  });

  it('should_email_executive_and_manager_when_request_is_finalized', async () => {
    getSolicitudCompleta.mockResolvedValue(solicitud({ estado: 'finalizada' }));
    participantes();

    const res = await NotificacionService.notificarSolicitud('solicitud_finalizada', 's-1', 'eje');

    expect(destinos()).toEqual(['jl1@test.cl']);
    expect(res.enApp).toBe(2);
  });
});

describe('NotificacionService.enviar (topes y anti-duplicado)', () => {
  const datos = { codigo: '101-15', origen: 'Centro', destino: 'Norte', vehiculos: [] };
  const d = (id: string) => ({ ...persona(id), rol: 'ejecutivo' as const });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  function registro() {
    return admin.callsTo('correo_envio').find((c) => c[0] === 'insert')?.[1] as Array<Record<string, unknown>>;
  }

  it('should_send_and_log_each_email_with_brevo_id', async () => {
    enviarCorreo.mockResolvedValue({ success: true, messageId: 'm-1' });

    const res = await NotificacionService.enviar('solicitud_aprobada', [d('eje')], datos, 'solicitud', 's-1');

    expect(res).toEqual({ enviados: 1, fallidos: 0, omitidos: 0, enApp: 0 });
    expect(registro()).toEqual([
      expect.objectContaining({ evento: 'solicitud_aprobada', entidad_id: 's-1', usuario_id: 'eje', estado: 'enviado', message_id: 'm-1', urgente: false }),
    ]);
    expect((enviarCorreo.mock.calls[0][0] as { texto: string }).texto).toContain('SOLICITUD APROBADA');
  });

  it('should_skip_non_urgent_email_when_daily_cap_is_reached', async () => {
    vi.stubEnv('CORREOS_TOPE_DIARIO', '10');
    admin.results.correo_envio = [filaConCount(10), fila([])];

    const res = await NotificacionService.enviar('solicitud_aprobada', [d('eje')], datos, 'solicitud', 's-1');

    expect(enviarCorreo).not.toHaveBeenCalled();
    expect(res.omitidos).toBe(1);
    expect(registro()[0]).toMatchObject({ estado: 'omitido_tope' });
  });

  it('should_send_urgent_email_even_when_daily_cap_is_reached', async () => {
    vi.stubEnv('CORREOS_TOPE_DIARIO', '10');
    admin.results.correo_envio = [filaConCount(10), fila([])];

    const res = await NotificacionService.enviar('solicitud_recalendarizada', [d('eje')], datos, 'solicitud', 's-1');

    expect(res.enviados).toBe(1);
    expect(registro()[0]).toMatchObject({ estado: 'enviado', urgente: true });
  });

  it('should_skip_user_that_reached_the_per_user_cap', async () => {
    vi.stubEnv('CORREOS_TOPE_USUARIO', '2');
    const previos = [1, 2].map((i) => ({
      usuario_id: 'eje',
      evento: 'solicitud_creada',
      entidad_id: `s-${i + 10}`,
      urgente: false,
      created_at: '2026-11-12T10:00:00Z',
    }));
    admin.results.correo_envio = [filaConCount(2), fila(previos)];

    const res = await NotificacionService.enviar('solicitud_aprobada', [d('eje'), d('otro')], datos, 'solicitud', 's-1');

    expect(res).toMatchObject({ enviados: 1, omitidos: 1 });
    expect((enviarCorreo.mock.calls[0][0] as { toEmail: string }).toEmail).toBe('otro@test.cl');
  });

  it('should_not_repeat_the_same_notice_within_minutes', async () => {
    const hace2min = new Date(Date.now() - 2 * 60_000).toISOString();
    admin.results.correo_envio = [
      filaConCount(1),
      fila([{ usuario_id: 'eje', evento: 'solicitud_aprobada', entidad_id: 's-1', urgente: false, created_at: hace2min }]),
    ];

    const res = await NotificacionService.enviar('solicitud_aprobada', [d('eje')], datos, 'solicitud', 's-1');

    expect(enviarCorreo).not.toHaveBeenCalled();
    expect(res.omitidos).toBe(1);
    expect(registro()[0]).toMatchObject({ estado: 'duplicado' });
  });

  it('should_send_without_caps_when_the_log_cannot_be_read', async () => {
    vi.stubEnv('CORREOS_TOPE_DIARIO', '0');
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    admin.results.correo_envio = [{ data: null, error: { message: 'relation "correo_envio" does not exist' } }, fila([])];

    const res = await NotificacionService.enviar('solicitud_aprobada', [d('eje')], datos, 'solicitud', 's-1');

    expect(res.enviados).toBe(1);
  });

  it('should_log_failed_emails_with_the_error', async () => {
    enviarCorreo.mockResolvedValue({ success: false, error: 'HTTP 401' });

    const res = await NotificacionService.enviar('solicitud_aprobada', [d('eje')], datos, 'solicitud', 's-1');

    expect(res.fallidos).toBe(1);
    expect(registro()[0]).toMatchObject({ estado: 'fallido', error: 'HTTP 401' });
  });
});

describe('NotificacionService.controlEnvio', () => {
  it('should_count_today_and_find_last_send_of_the_same_notice', async () => {
    admin.results.correo_envio = [
      filaConCount(7),
      fila([
        { usuario_id: 'a', evento: 'solicitud_aprobada', entidad_id: 's-1', urgente: false, created_at: '2026-11-12T10:00:00Z' },
        { usuario_id: 'a', evento: 'solicitud_aprobada', entidad_id: 's-1', urgente: false, created_at: '2026-11-12T11:00:00Z' },
        { usuario_id: 'a', evento: 'solicitud_recalendarizada', entidad_id: 's-2', urgente: true, created_at: '2026-11-12T12:00:00Z' },
      ]),
    ];

    const c = await NotificacionService.controlEnvio('solicitud_aprobada', 's-1', ['a']);

    expect(c?.enviadosHoy).toBe(7);
    expect(c?.noUrgentesHoy.get('a')).toBe(2);
    expect(c?.ultimoEnvio.get('a')).toBe('2026-11-12T11:00:00Z');
    expect(admin.callsTo('correo_envio')).toContainEqual(['eq', 'estado', 'enviado']);
  });
});

describe('NotificacionService.registrarEnvios', () => {
  it('should_not_insert_when_there_is_nothing_to_log', async () => {
    await NotificacionService.registrarEnvios([]);
    expect(admin.callsTo('correo_envio')).toHaveLength(0);
  });

  it('should_not_throw_when_insert_fails', async () => {
    admin.results.correo_envio = [{ data: null, error: { message: 'x' } }];
    await expect(
      NotificacionService.registrarEnvios([
        {
          evento: 'solicitud_aprobada',
          entidad: 'solicitud',
          entidad_id: 's',
          usuario_id: 'u',
          email: 'u@x.cl',
          estado: 'enviado',
          urgente: false,
          message_id: null,
          error: null,
        },
      ])
    ).resolves.toBeUndefined();
  });
});

describe('NotificacionService.jefesDeSucursales', () => {
  it('should_merge_managers_of_each_branch_without_repeating', async () => {
    vi.spyOn(NotificacionService, 'jefesDeSucursal').mockImplementation(async (id) =>
      id === 1 ? [persona('a')] : [persona('a'), persona('b')]
    );
    const res = await NotificacionService.jefesDeSucursales([1, 2, 2, 0]);
    expect(res.map((p) => p.id)).toEqual(['a', 'b']);
    expect(NotificacionService.jefesDeSucursal).toHaveBeenCalledTimes(2);
  });

  it('should_return_empty_without_branches', async () => {
    expect(await NotificacionService.jefesDeSucursales([])).toEqual([]);
  });
});

describe('NotificacionService.notificarTrasladoInterno (crear, despachar, recibir)', () => {
  const traslado = (over: Record<string, unknown> = {}) =>
    ({
      id: 'ffff0000-0000-0000-0000-000000000000',
      origen_id: 1,
      origen_nombre: 'Centro',
      destino_id: 2,
      destino_nombre: 'Norte',
      logistica_id: 'log',
      fecha_despacho: null,
      fecha_recepcion: null,
      observacion: null,
      observacion_recepcion: null,
      recepcion_con_novedades: null,
      transportista: { id: 't', nombre: 'Transportes Sur', rut: '1-9' },
      vehiculos: [{ patente: 'ABCD-12', chasis: 'X', marca: 'Toyota', modelo: 'Yaris' }],
      ...over,
    }) as unknown as TrasladoInterno;

  function jefes() {
    vi.spyOn(NotificacionService, 'jefesDeSucursal').mockImplementation(async (id) => (id === 1 ? [persona('jl1')] : [persona('jl2')]));
    vi.spyOn(NotificacionService, 'usuariosPorIds').mockResolvedValue([persona('log')]);
  }
  const destinos = () => enviarCorreo.mock.calls.map((c) => (c[0] as { toEmail: string }).toEmail).sort();

  it('should_email_both_branch_managers_when_created', async () => {
    getTrasladoById.mockResolvedValue(traslado());
    jefes();

    const res = await NotificacionService.notificarTrasladoInterno('traslado_interno_creado', 't-1', 'log');

    expect(destinos()).toEqual(['jl1@test.cl', 'jl2@test.cl']);
    expect(res.enApp).toBe(2);
    const filas = admin.callsTo('notificacion').find((c) => c[0] === 'insert')?.[1] as Array<Record<string, unknown>>;
    expect(filas[0]).toMatchObject({ tipo: 'TRASLADO_INTERNO_CREADO' });
  });

  it('should_email_only_destination_manager_with_departure_time_when_dispatched', async () => {
    getTrasladoById.mockResolvedValue(traslado({ fecha_despacho: '2026-11-12T13:05:00Z' }));
    jefes();

    await NotificacionService.notificarTrasladoInterno('traslado_interno_despachado', 't-1', 'log');

    expect(destinos()).toEqual(['jl2@test.cl']);
    const correo = enviarCorreo.mock.calls[0][0] as { html: string };
    expect(correo.html).toContain('12/11/2026 10:05');
    expect(correo.html).toContain('Transportes Sur');
  });

  it('should_not_email_when_reception_has_no_issues', async () => {
    getTrasladoById.mockResolvedValue(traslado());
    jefes();

    const res = await NotificacionService.notificarTrasladoInterno('traslado_interno_recepcionado', 't-1', 'jl2', { conNovedades: false });

    expect(enviarCorreo).not.toHaveBeenCalled();
    expect(res.enApp).toBe(2);
  });

  it('should_email_logistics_as_urgent_when_reception_has_issues', async () => {
    getTrasladoById.mockResolvedValue(traslado());
    jefes();

    await NotificacionService.notificarTrasladoInterno('traslado_interno_recepcionado', 't-1', 'jl2', {
      conNovedades: true,
      observacion: 'Rayón',
    });

    expect(destinos()).toEqual(['log@test.cl']);
    expect((enviarCorreo.mock.calls[0][0] as { asunto: string }).asunto).toContain('[URGENTE]');
  });
});

describe('NotificacionService.notificarLoteTraslados', () => {
  const t = (id: string, patente: string) =>
    ({
      id,
      origen_id: 1,
      origen_nombre: 'Centro',
      destino_id: 2,
      destino_nombre: 'Norte',
      logistica_id: 'log',
      vehiculos: [{ patente, chasis: 'X', marca: 'Toyota', modelo: 'Yaris' }],
    }) as unknown as TrasladoInterno;

  it('should_return_nothing_without_transfers', async () => {
    expect(await NotificacionService.notificarLoteTraslados([], 'log')).toEqual({ enviados: 0, fallidos: 0, omitidos: 0, enApp: 0 });
  });

  it('should_notify_a_single_transfer_as_usual', async () => {
    const spy = vi.spyOn(NotificacionService, 'notificarTrasladoInterno').mockResolvedValue({ enviados: 1, fallidos: 0, omitidos: 0, enApp: 1 });
    await NotificacionService.notificarLoteTraslados(['aaaa1111-x'], 'log');
    expect(spy).toHaveBeenCalledWith('traslado_interno_creado', 'aaaa1111-x', 'log');
  });

  it('should_send_one_notice_listing_every_vehicle_of_the_batch', async () => {
    getTrasladoById.mockImplementation(async (id: string) => (id === 'aaaa1111-x' ? t(id, 'AA-11') : t(id, 'BB-22')));
    const spy = vi.spyOn(NotificacionService, 'notificarTrasladoInterno').mockResolvedValue({ enviados: 2, fallidos: 0, omitidos: 0, enApp: 2 });

    await NotificacionService.notificarLoteTraslados(['aaaa1111-x', 'bbbb2222-y', 'aaaa1111-x'], 'log');

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith('traslado_interno_creado', 'aaaa1111-x', 'log', {
      codigo: '#AAAA1111 y 1 más',
      vehiculos: ['AA-11 · Toyota Yaris', 'BB-22 · Toyota Yaris'],
    });
  });

  it('should_not_throw_when_loading_fails', async () => {
    getTrasladoById.mockRejectedValue(new Error('BD caída'));
    expect((await NotificacionService.notificarLoteTraslados(['a', 'b'], 'log')).enviados).toBe(0);
  });
});
