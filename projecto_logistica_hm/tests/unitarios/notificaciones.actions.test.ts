import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UserProfile } from '@/types/auth.types';
import type { SolicitudMinima } from '@/services/solicitudes.service';

/**
 * R7 y notificaciones en la app: las actions agendan el aviso del cambio de
 * estado solo cuando la operación salió bien.
 */

const getCurrentUserProfile = vi.fn();
const notificarSolicitud = vi.fn(async () => ({ enviados: 1, fallidos: 0 }));
const svc = {
  getSolicitudById: vi.fn(),
  aprobarSolicitud: vi.fn(),
  rechazarSolicitud: vi.fn(),
  recalendarizarSolicitud: vi.fn(),
  calendarizarSolicitud: vi.fn(),
  cancelarEnTransito: vi.fn(),
  recibirSolicitud: vi.fn(),
  priorizarSolicitud: vi.fn(),
  priorizarEnPosicion: vi.fn(),
  cancelarSolicitud: vi.fn(),
  insistirSolicitud: vi.fn(),
  agregarObservacion: vi.fn(),
  descalendarizarSolicitud: vi.fn(),
  cancelarDespacharSolicitud: vi.fn(),
  finalizarSolicitud: vi.fn(),
  asignarEncargadoLogistica: vi.fn(),
};
const getBranch = vi.fn();
const usuarioTieneSucursal = vi.fn(async () => true);

vi.mock('@/services/auth.service', () => ({
  AuthService: { getCurrentUserProfile: () => getCurrentUserProfile() },
}));
vi.mock('@/services/solicitudes.service', () => ({ SolicitudesService: svc }));
vi.mock('@/services/users.service', () => ({ UsersService: {} }));
vi.mock('@/services/organizacion.service', () => ({
  OrganizacionService: {
    getBranch: (id: number) => getBranch(id),
    usuarioTieneSucursal: () => usuarioTieneSucursal(),
    getUserAssignedBranches: async () => [{ id: 1, nombre: 'Centro' }],
  },
}));
vi.mock('@/services/notificacion.service', () => ({
  NotificacionService: { notificarSolicitud: (...a: unknown[]) => notificarSolicitud(...(a as [])) },
}));
// Ejecuta la tarea de inmediato para poder verificarla.
vi.mock('@/lib/segundoPlano', () => ({
  enSegundoPlano: (tarea: () => Promise<unknown>) => {
    void tarea();
  },
}));
vi.mock('@/lib/rutas', () => ({ revalidarSolicitudes: vi.fn() }));

const actions = await import('@/app/actions/solicitudes.actions');

function perfil(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    id: 'u-1',
    email: 'u@test.com',
    nombre: 'U',
    apellido: 'Test',
    rol: 'administrador',
    activo: true,
    aprobado: true,
    requiere_cambio_clave: false,
    sucursal_id: 1,
    sucursales: [],
    zonas: [{ id: 7, nombre: 'N' }],
    created_at: '',
    updated_at: '',
    ...overrides,
  };
}

const solicitud: SolicitudMinima = {
  id: 's-1',
  estado: 'calendarizada',
  sucursal: 1,
  sucursal_destino: 2,
  ejecutivo_id: 'e-1',
  jefe_local_id: null,
  logistica_id: 'u-1',
  tipo_solicitud: 'venta',
  posicion_prioridad: null,
  fecha_tentativa_despacho: null,
  fecha_despacho: null,
  fecha_entrega: null,
  fecha_inicio_transito: null,
};

const tick = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUserProfile.mockResolvedValue(perfil());
  svc.getSolicitudById.mockResolvedValue(solicitud);
});

describe('notificaciones desde las actions', () => {
  it('should_notify_approval_after_success', async () => {
    svc.aprobarSolicitud.mockResolvedValue({ success: true });
    await actions.aprobarSolicitudAction('s-1', '2099-01-01');
    await tick();
    expect(notificarSolicitud).toHaveBeenCalledWith('solicitud_aprobada', 's-1', 'u-1', undefined);
  });

  it('should_not_notify_when_operation_fails', async () => {
    svc.aprobarSolicitud.mockResolvedValue({ success: false, error: 'x' });
    await actions.aprobarSolicitudAction('s-1', '2099-01-01');
    await tick();
    expect(notificarSolicitud).not.toHaveBeenCalled();
  });

  it('should_send_rejection_reason', async () => {
    svc.rechazarSolicitud.mockResolvedValue({ success: true });
    await actions.rechazarSolicitudAction('s-1', '  Sin stock en destino ');
    await tick();
    expect(notificarSolicitud).toHaveBeenCalledWith('solicitud_rechazada', 's-1', 'u-1', { motivo: 'Sin stock en destino' });
  });

  it('should_send_urgent_rescheduling_with_previous_date', async () => {
    getCurrentUserProfile.mockResolvedValue(perfil({ rol: 'logistica' }));
    getBranch.mockResolvedValue({ id: 1, nombre: 'Centro', zona_id: 7 });
    svc.recalendarizarSolicitud.mockResolvedValue({ success: true, fechaAnterior: '2026-10-12T12:00:00Z' });

    await actions.recalendarizarSolicitudAction('s-1', '2026-10-15', 'Lluvia');
    await tick();

    expect(notificarSolicitud).toHaveBeenCalledWith(
      'solicitud_recalendarizada',
      's-1',
      'u-1',
      expect.objectContaining({ motivo: 'Lluvia', fechaAnterior: expect.stringContaining('12') })
    );
  });

  it('should_reject_scheduling_when_transportista_is_missing', async () => {
    getCurrentUserProfile.mockResolvedValue(perfil({ rol: 'logistica' }));
    const res = await actions.calendarizarSolicitudAction('s-1', '2099-01-01', null);
    expect(res).toEqual({ success: false, error: 'Indica la patente del camión y el transportista del traslado.' });
    expect(svc.calendarizarSolicitud).not.toHaveBeenCalled();
  });

  it('should_pass_transportista_and_notify_when_scheduling', async () => {
    getCurrentUserProfile.mockResolvedValue(perfil({ rol: 'logistica' }));
    getBranch.mockResolvedValue({ id: 1, nombre: 'Centro', zona_id: 7 });
    svc.getSolicitudById.mockResolvedValue({ ...solicitud, estado: 'priorizada' });
    svc.calendarizarSolicitud.mockResolvedValue({ success: true });

    const res = await actions.calendarizarSolicitudAction('s-1', '2099-01-01', { patente: 'ABCD12', conductorNombre: null });
    await tick();

    expect(res.success).toBe(true);
    expect(svc.calendarizarSolicitud).toHaveBeenCalledWith('s-1', '2099-01-01', 'u-1', 'logistica', { patente: 'ABCD12', conductorNombre: null });
    expect(notificarSolicitud).toHaveBeenCalledWith('solicitud_calendarizada', 's-1', 'u-1', undefined);
  });

  it('should_pass_new_transportista_when_rescheduling', async () => {
    getCurrentUserProfile.mockResolvedValue(perfil({ rol: 'logistica' }));
    getBranch.mockResolvedValue({ id: 1, nombre: 'Centro', zona_id: 7 });
    svc.recalendarizarSolicitud.mockResolvedValue({ success: true, fechaAnterior: null });

    await actions.recalendarizarSolicitudAction('s-1', '2026-10-15', 'Lluvia', { patente: 'ABCD12', conductorNombre: null });

    expect(svc.recalendarizarSolicitud).toHaveBeenCalledWith('s-1', '2026-10-15', 'u-1', 'Lluvia', { patente: 'ABCD12', conductorNombre: null });
  });

  it('should_send_cancellation_with_reason_and_final_location_name', async () => {
    getCurrentUserProfile.mockResolvedValue(perfil({ rol: 'logistica' }));
    getBranch.mockResolvedValue({ id: 1, nombre: 'Centro', zona_id: 7 });
    svc.getSolicitudById.mockResolvedValue({ ...solicitud, estado: 'en_transito' });
    svc.cancelarEnTransito.mockResolvedValue({ success: true });

    await actions.cancelarEnTransitoAction('s-1', 'Camión averiado', 1);
    await tick();

    expect(notificarSolicitud).toHaveBeenCalledWith('solicitud_cancelada_transito', 's-1', 'u-1', {
      motivo: 'Camión averiado',
      ubicacionFinal: 'Centro',
    });
  });

  it('should_reject_rescheduling_and_cancellation_for_non_logistics_roles', async () => {
    getCurrentUserProfile.mockResolvedValue(perfil({ rol: 'jefe_local' }));
    const r1 = await actions.recalendarizarSolicitudAction('s-1', '2026-10-15');
    const r2 = await actions.cancelarEnTransitoAction('s-1', 'Motivo válido', null);
    expect(r1).toEqual({ success: false, error: 'Solo Logística puede reprogramar traslados.' });
    expect(r2).toEqual({ success: false, error: 'Solo Logística puede cancelar un traslado en tránsito.' });
    expect(svc.recalendarizarSolicitud).not.toHaveBeenCalled();
    expect(svc.cancelarEnTransito).not.toHaveBeenCalled();
  });

  it('should_reject_admin_when_rescheduling_or_cancelling_in_transit', async () => {
    // Decisión de negocio (2026-10-13): solo Logística, también sin el administrador.
    getCurrentUserProfile.mockResolvedValue(perfil({ rol: 'administrador' }));
    const r1 = await actions.recalendarizarSolicitudAction('s-1', '2026-10-15');
    const r2 = await actions.cancelarEnTransitoAction('s-1', 'Motivo válido', null);
    expect(r1).toEqual({ success: false, error: 'Solo Logística puede reprogramar traslados.' });
    expect(r2).toEqual({ success: false, error: 'Solo Logística puede cancelar un traslado en tránsito.' });
    expect(svc.recalendarizarSolicitud).not.toHaveBeenCalled();
    expect(svc.cancelarEnTransito).not.toHaveBeenCalled();
  });

  it('should_send_reception_news', async () => {
    svc.getSolicitudById.mockResolvedValue({ ...solicitud, estado: 'en_transito' });
    svc.recibirSolicitud.mockResolvedValue({ success: true });

    await actions.recibirSolicitudAction('s-1', { conNovedades: true, observacion: ' Rayón ' });
    await tick();

    expect(notificarSolicitud).toHaveBeenCalledWith('solicitud_recepcionada', 's-1', 'u-1', {
      conNovedades: true,
      observacion: 'Rayón',
    });
  });

  it('should_notify_when_solicitud_enters_the_queue', async () => {
    svc.getSolicitudById.mockResolvedValue({ ...solicitud, estado: 'aprobada' });
    svc.priorizarSolicitud.mockResolvedValue({ success: true, posicion: 1 });
    await actions.priorizarSolicitudAction('s-1');
    await tick();
    expect(notificarSolicitud).toHaveBeenCalledWith('solicitud_priorizada', 's-1', 'u-1', undefined);
  });

  it('should_not_notify_when_queue_is_only_reordered', async () => {
    svc.getSolicitudById.mockResolvedValue({ ...solicitud, estado: 'priorizada' });
    svc.priorizarEnPosicion.mockResolvedValue({ success: true, posicion: 2 });
    await actions.priorizarEnPosicionAction('s-1', 2);
    await tick();
    expect(notificarSolicitud).not.toHaveBeenCalled();
  });

  it('should_notify_cancellation_with_reason', async () => {
    svc.cancelarSolicitud.mockResolvedValue({ success: true });
    await actions.cancelarSolicitudAction('s-1', ' Cliente desistió ');
    await tick();
    expect(notificarSolicitud).toHaveBeenCalledWith('solicitud_cancelada', 's-1', 'u-1', {
      motivo: 'Cliente desistió',
      estadoAnterior: 'calendarizada',
      canceladoPor: 'U Test (Administrador)',
    });
  });

  it('should_send_previous_state_when_executive_cancels_pending_request', async () => {
    getCurrentUserProfile.mockResolvedValue(perfil({ id: 'e-1', rol: 'ejecutivo', nombre: 'Eva', apellido: 'Rojas' }));
    svc.getSolicitudById.mockResolvedValue({ ...solicitud, estado: 'pendiente_aprobacion' });
    svc.cancelarSolicitud.mockResolvedValue({ success: true });

    await actions.cancelarSolicitudAction('s-1', 'Ya no lo necesito');
    await tick();

    expect(notificarSolicitud).toHaveBeenCalledWith('solicitud_cancelada', 's-1', 'e-1', {
      motivo: 'Ya no lo necesito',
      estadoAnterior: 'pendiente_aprobacion',
      canceladoPor: 'Eva Rojas (Ejecutivo)',
    });
  });

  it('should_send_cancelled_date_when_schedule_is_removed', async () => {
    svc.getSolicitudById.mockResolvedValue({ ...solicitud, fecha_tentativa_despacho: '2026-11-20T00:00:00Z' });
    svc.descalendarizarSolicitud.mockResolvedValue({ success: true });

    await actions.descalendarizarSolicitudAction('s-1');
    await tick();

    expect(notificarSolicitud).toHaveBeenCalledWith('solicitud_descalendarizada', 's-1', 'u-1', { fechaAnterior: '20/11/2026' });
  });

  it('should_notify_who_holds_the_request_when_executive_insists', async () => {
    getCurrentUserProfile.mockResolvedValue(perfil({ id: 'e-1', rol: 'ejecutivo' }));
    svc.insistirSolicitud.mockResolvedValue({ success: true, proxima_insistencia_en_h: 24 });

    const res = await actions.insistirSolicitudAction('s-1', '  El cliente viene el lunes ');
    await tick();

    expect(res.success).toBe(true);
    expect(notificarSolicitud).toHaveBeenCalledWith('solicitud_insistencia', 's-1', 'e-1', { mensaje: 'El cliente viene el lunes' });
  });

  it('should_not_notify_when_insistence_is_in_cooldown', async () => {
    getCurrentUserProfile.mockResolvedValue(perfil({ id: 'e-1', rol: 'ejecutivo' }));
    svc.insistirSolicitud.mockResolvedValue({ success: false, error: 'Ya insististe', proxima_insistencia_en_h: 5 });

    await actions.insistirSolicitudAction('s-1');
    await tick();

    expect(notificarSolicitud).not.toHaveBeenCalled();
  });

  it('should_send_insistence_without_message_as_null', async () => {
    getCurrentUserProfile.mockResolvedValue(perfil({ id: 'e-1', rol: 'ejecutivo' }));
    svc.insistirSolicitud.mockResolvedValue({ success: true, proxima_insistencia_en_h: 24 });

    await actions.insistirSolicitudAction('s-1', '   ');
    await tick();

    expect(notificarSolicitud).toHaveBeenCalledWith('solicitud_insistencia', 's-1', 'e-1', { mensaje: null });
  });

  it('should_notify_new_observation_in_app', async () => {
    svc.agregarObservacion.mockResolvedValue({ success: true });

    await actions.agregarObservacionAction('s-1', '  Llega con patente provisoria ');
    await tick();

    expect(notificarSolicitud).toHaveBeenCalledWith('nueva_observacion', 's-1', 'u-1', { mensaje: 'Llega con patente provisoria' });
  });

  it('should_not_notify_observation_when_saving_fails', async () => {
    svc.agregarObservacion.mockResolvedValue({ success: false, error: 'x' });
    await actions.agregarObservacionAction('s-1', 'hola');
    await tick();
    expect(notificarSolicitud).not.toHaveBeenCalled();
  });

  it.each([
    ['cancelarDespachoSolicitudAction', 'cancelarDespacharSolicitud', 'solicitud_despacho_revertido'],
    ['finalizarSolicitudAction', 'finalizarSolicitud', 'solicitud_finalizada'],
    ['asignarEncargadoAction', 'asignarEncargadoLogistica', 'solicitud_asignada'],
  ] as const)('should_notify_state_change_when_%s_succeeds', async (action, metodo, evento) => {
    svc[metodo].mockResolvedValue({ success: true });
    await actions[action]('s-1');
    await tick();
    expect(notificarSolicitud).toHaveBeenCalledWith(evento, 's-1', 'u-1', undefined);
  });

  it('should_not_notify_state_change_when_service_fails', async () => {
    svc.finalizarSolicitud.mockResolvedValue({ success: false, error: 'x' });
    await actions.finalizarSolicitudAction('s-1');
    await tick();
    expect(notificarSolicitud).not.toHaveBeenCalled();
  });
});
