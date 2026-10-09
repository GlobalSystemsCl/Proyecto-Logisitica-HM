import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UserProfile } from '@/types/auth.types';
import type { SolicitudMinima } from '@/services/solicitudes.service';

/** R7: las actions agendan el correo del hito solo cuando la operación salió bien. */

const getCurrentUserProfile = vi.fn();
const notificarSolicitud = vi.fn(async () => ({ enviados: 1, fallidos: 0 }));
const svc = {
  getSolicitudById: vi.fn(),
  aprobarSolicitud: vi.fn(),
  rechazarSolicitud: vi.fn(),
  recalendarizarSolicitud: vi.fn(),
  cancelarEnTransito: vi.fn(),
  recibirSolicitud: vi.fn(),
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
});
