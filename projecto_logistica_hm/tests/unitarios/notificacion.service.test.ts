import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSupabaseMock, fila } from '../mocks/supabase';
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

    expect(res).toEqual({ enviados: 3, fallidos: 0 });
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

  it('should_do_nothing_when_solicitud_does_not_exist', async () => {
    getSolicitudCompleta.mockResolvedValue(null);
    expect(await NotificacionService.notificarSolicitud('solicitud_creada', 's-x', null)).toEqual({ enviados: 0, fallidos: 0 });
    expect(enviarCorreo).not.toHaveBeenCalled();
  });

  it('should_never_throw_when_something_fails', async () => {
    getSolicitudCompleta.mockRejectedValue(new Error('BD caída'));
    expect(await NotificacionService.notificarSolicitud('solicitud_creada', 's-1', null)).toEqual({ enviados: 0, fallidos: 0 });
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
  });
});
