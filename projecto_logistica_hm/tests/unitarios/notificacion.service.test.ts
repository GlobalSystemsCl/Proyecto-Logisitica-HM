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

    expect(res).toEqual({ enviados: 3, fallidos: 0, enApp: 3 });
    const destinos = enviarCorreo.mock.calls.map((c) => (c[0] as { toEmail: string }).toEmail);
    expect(destinos.sort()).toEqual(['eje@test.cl', 'jl1@test.cl', 'jl2@test.cl']);
    const correo = enviarCorreo.mock.calls[0][0] as { asunto: string; html: string };
    expect(correo.asunto).toContain('[URGENTE]');
    expect(correo.html).toContain('12/10/2026');
    expect(correo.html).toContain('http://localhost:3000/solicitudes');
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

  it('should_create_in_app_notification_without_email_for_in_app_only_events', async () => {
    getSolicitudCompleta.mockResolvedValue(solicitud({ estado: 'finalizada' }));
    participantes();

    const res = await NotificacionService.notificarSolicitud('solicitud_finalizada', 's-1', 'eje');

    expect(enviarCorreo).not.toHaveBeenCalled();
    expect(res).toEqual({ enviados: 0, fallidos: 0, enApp: 2 });
    const filas = admin.callsTo('notificacion').find((c) => c[0] === 'insert')?.[1] as Array<{ usuario_id: string }>;
    expect(filas.map((f) => f.usuario_id).sort()).toEqual(['jl1', 'log']);
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

    expect(res).toEqual({ enviados: 1, fallidos: 0, enApp: 0 });
  });

  it('should_do_nothing_when_solicitud_does_not_exist', async () => {
    getSolicitudCompleta.mockResolvedValue(null);
    expect(await NotificacionService.notificarSolicitud('solicitud_creada', 's-x', null)).toEqual({ enviados: 0, fallidos: 0, enApp: 0 });
    expect(enviarCorreo).not.toHaveBeenCalled();
  });

  it('should_never_throw_when_something_fails', async () => {
    getSolicitudCompleta.mockRejectedValue(new Error('BD caída'));
    expect(await NotificacionService.notificarSolicitud('solicitud_creada', 's-1', null)).toEqual({ enviados: 0, fallidos: 0, enApp: 0 });
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
    expect(correo.html).toContain('http://localhost:3000/solicitudes/traslados');
    expect(res.enApp).toBe(3);
    const filas = admin.callsTo('notificacion').find((c) => c[0] === 'insert')?.[1] as Array<Record<string, unknown>>;
    expect(filas[0]).toMatchObject({
      tipo: 'TRASLADO_INTERNO_CANCELADO',
      entidad: 'traslado_interno',
      entidad_id: 'ffff0000-0000-0000-0000-000000000000',
      ruta: '/solicitudes/traslados',
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
        ruta: '/admin/usuarios?estado=pendientes',
        titulo: 'Nueva cuenta por activar',
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
