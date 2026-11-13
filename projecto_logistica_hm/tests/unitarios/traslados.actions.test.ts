import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UserProfile } from '@/types/auth.types';

/**
 * R8: cancelar un traslado interno en tránsito es solo de Logística. El
 * administrador queda excluido a propósito (decisión de negocio, 2026-10-13).
 */

const getCurrentUserProfile = vi.fn();
const cancelarTraslado = vi.fn();
const crearTrasladosEnLote = vi.fn();
const notificarTrasladoInterno = vi.fn(async () => ({ enviados: 1, fallidos: 0 }));
const getBranch = vi.fn();
const getTrasladoById = vi.fn();
const getDocumentos = vi.fn(async () => [{ id: 'd-1' }]);
const getURLsVistaPrevia = vi.fn(async () => ({ 'd-1': 'https://vista' }));
const subirDocumentos = vi.fn(async () => ({ success: true, subidos: 1 }));
const getTrasladoIdDeDocumento = vi.fn();
const getURLDescarga = vi.fn(async () => ({ success: true, url: 'https://descarga' }));
const getSucursalIdsDeZonasUsuario = vi.fn(async () => [] as number[]);
const getUserAssignedBranches = vi.fn(async () => [] as Array<{ id: number }>);

vi.mock('@/services/auth.service', () => ({
  AuthService: { getCurrentUserProfile: () => getCurrentUserProfile() },
}));
vi.mock('@/services/solicitudes.service', () => ({ SolicitudesService: {} }));
vi.mock('@/services/traslado.service', () => ({
  TrasladoService: {
    cancelarTraslado: (...a: unknown[]) => cancelarTraslado(...a),
    crearTrasladosEnLote: (...a: unknown[]) => crearTrasladosEnLote(...a),
    getTrasladoById: (...a: unknown[]) => getTrasladoById(...a),
    getDocumentos: (...a: unknown[]) => getDocumentos(...(a as [])),
    getURLsVistaPrevia: (...a: unknown[]) => getURLsVistaPrevia(...(a as [])),
    subirDocumentos: (...a: unknown[]) => subirDocumentos(...(a as [])),
    getTrasladoIdDeDocumento: (...a: unknown[]) => getTrasladoIdDeDocumento(...a),
    getURLDescarga: (...a: unknown[]) => getURLDescarga(...(a as [])),
  },
}));
vi.mock('@/services/organizacion.service', () => ({
  OrganizacionService: {
    getBranch: (id: number) => getBranch(id),
    getSucursalIdsDeZonasUsuario: (...a: unknown[]) => getSucursalIdsDeZonasUsuario(...(a as [])),
    getUserAssignedBranches: (...a: unknown[]) => getUserAssignedBranches(...(a as [])),
  },
}));
vi.mock('@/services/sucursales.service', () => ({ SucursalesService: {} }));
vi.mock('@/services/notificacion.service', () => ({
  NotificacionService: {
    notificarTrasladoInterno: (...a: unknown[]) => notificarTrasladoInterno(...(a as [])),
  },
}));
// Ejecuta la tarea de inmediato para poder verificarla.
vi.mock('@/lib/segundoPlano', () => ({
  enSegundoPlano: (tarea: () => Promise<unknown>) => {
    void tarea();
  },
}));
vi.mock('@/lib/rutas', () => ({ revalidarSolicitudes: vi.fn() }));

const {
  cancelarTrasladoAction,
  crearTrasladosAction,
  descargarDocumentoTrasladoAction,
  getDocumentosTrasladoAction,
  getVistasPreviasTrasladoAction,
  subirDocumentosTrasladoAction,
} = await import('@/app/actions/traslados.actions');
const { revalidarSolicitudes } = await import('@/lib/rutas');

function perfil(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    id: 'u-1',
    email: 'u@test.com',
    nombre: 'U',
    apellido: 'Test',
    rol: 'logistica',
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

const tick = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUserProfile.mockResolvedValue(perfil());
});

describe('cancelarTrasladoAction', () => {
  it('should_cancel_and_notify_when_user_is_logistica', async () => {
    cancelarTraslado.mockResolvedValue({ success: true });
    getBranch.mockResolvedValue({ id: 1, nombre: 'Centro', zona_id: 7 });

    const res = await cancelarTrasladoAction('t-1', ' Camión averiado ', 1);
    await tick();

    expect(res.success).toBe(true);
    expect(cancelarTraslado).toHaveBeenCalledWith('t-1', 'u-1', ' Camión averiado ', 1);
    expect(notificarTrasladoInterno).toHaveBeenCalledWith('traslado_interno_cancelado', 't-1', 'u-1', {
      motivo: 'Camión averiado',
      ubicacionFinal: 'Centro',
    });
  });

  it('should_reject_admin_when_cancelling_traslado_in_transit', async () => {
    getCurrentUserProfile.mockResolvedValue(perfil({ rol: 'administrador' }));

    const res = await cancelarTrasladoAction('t-1', 'Motivo válido', null);

    expect(res).toEqual({ success: false, error: 'Solo Logística puede cancelar un traslado en tránsito.' });
    expect(cancelarTraslado).not.toHaveBeenCalled();
  });

  it('should_reject_jefe_local_when_cancelling_traslado_in_transit', async () => {
    getCurrentUserProfile.mockResolvedValue(perfil({ rol: 'jefe_local' }));

    const res = await cancelarTrasladoAction('t-1', 'Motivo válido', null);

    expect(res).toEqual({ success: false, error: 'Solo Logística puede cancelar un traslado en tránsito.' });
    expect(cancelarTraslado).not.toHaveBeenCalled();
  });

  it('should_not_notify_when_service_fails', async () => {
    cancelarTraslado.mockResolvedValue({ success: false, error: 'Solo los traslados en tránsito pueden cancelarse.' });

    const res = await cancelarTrasladoAction('t-1', 'Motivo válido', null);
    await tick();

    expect(res).toEqual({ success: false, error: 'Solo los traslados en tránsito pueden cancelarse.' });
    expect(notificarTrasladoInterno).not.toHaveBeenCalled();
  });
});

describe('crearTrasladosAction', () => {
  const input = { origen_id: 1, destino_id: 2, transporte: { patente: 'ABCD12', conductorNombre: null } };

  it('should_create_batch_with_actor_and_refresh_when_some_are_created', async () => {
    crearTrasladosEnLote.mockResolvedValue({ success: true, creados: [{ vehiculoId: 'v1', trasladoId: 't1' }], omitidos: [] });

    const res = await crearTrasladosAction(input, ['v1']);

    expect(res.success).toBe(true);
    expect(crearTrasladosEnLote).toHaveBeenCalledWith(input, ['v1'], 'u-1');
    expect(revalidarSolicitudes).toHaveBeenCalled();
  });

  it('should_not_refresh_when_nothing_was_created', async () => {
    crearTrasladosEnLote.mockResolvedValue({ success: false, creados: [], omitidos: [{ vehiculoId: 'v1', error: 'x' }] });
    await crearTrasladosAction(input, ['v1']);
    expect(revalidarSolicitudes).not.toHaveBeenCalled();
  });

  it('should_reject_when_user_is_not_logistica', async () => {
    getCurrentUserProfile.mockResolvedValue(perfil({ rol: 'ejecutivo' }));
    const res = await crearTrasladosAction(input, ['v1']);
    expect(res).toEqual({
      success: false,
      creados: [],
      omitidos: [],
      error: 'Solo Logística o el Administrador pueden crear traslados internos.',
    });
    expect(crearTrasladosEnLote).not.toHaveBeenCalled();
  });
});

describe('documentos de traslado (QA #49)', () => {
  const traslado = { id: 't-1', logistica_id: 'log-9', origen_id: 101, destino_id: 135 };

  it('should_list_documents_and_previews_when_jefe_receives_at_destination', async () => {
    getCurrentUserProfile.mockResolvedValue(perfil({ rol: 'jefe_local' }));
    getTrasladoById.mockResolvedValue(traslado);
    getUserAssignedBranches.mockResolvedValue([{ id: 135 }]);

    expect(await getDocumentosTrasladoAction('t-1')).toEqual([{ id: 'd-1' }]);
    expect(await getVistasPreviasTrasladoAction('t-1')).toEqual({ 'd-1': 'https://vista' });
  });

  it('should_deny_documents_when_jefe_has_no_branch_in_the_transfer', async () => {
    getCurrentUserProfile.mockResolvedValue(perfil({ rol: 'jefe_local' }));
    getTrasladoById.mockResolvedValue(traslado);
    getUserAssignedBranches.mockResolvedValue([{ id: 999 }]);

    expect(await getDocumentosTrasladoAction('t-1')).toEqual([]);
    expect(getDocumentos).not.toHaveBeenCalled();
    const fd = new FormData();
    fd.append('archivos', new File(['x'], 'a.png', { type: 'image/png' }));
    expect(await subirDocumentosTrasladoAction('t-1', fd)).toEqual({ success: false, error: 'No tienes acceso a este traslado.' });
    expect(subirDocumentos).not.toHaveBeenCalled();
  });

  it('should_upload_photos_when_logistica_zone_covers_origin', async () => {
    getCurrentUserProfile.mockResolvedValue(perfil({ rol: 'logistica' }));
    getTrasladoById.mockResolvedValue(traslado);
    getSucursalIdsDeZonasUsuario.mockResolvedValue([101]);
    const fd = new FormData();
    fd.append('archivos', new File(['x'], 'a.png', { type: 'image/png' }));

    const res = await subirDocumentosTrasladoAction('t-1', fd);

    expect(res.success).toBe(true);
    expect(subirDocumentos).toHaveBeenCalledWith('t-1', 'u-1', [expect.objectContaining({ nombre: 'a.png', tipo: 'image/png' })]);
  });

  it('should_check_access_through_the_document_transfer_before_signing_download', async () => {
    getCurrentUserProfile.mockResolvedValue(perfil({ rol: 'ejecutivo' }));
    getTrasladoIdDeDocumento.mockResolvedValue('t-1');
    getTrasladoById.mockResolvedValue(traslado);

    const res = await descargarDocumentoTrasladoAction('d-1');

    expect(res).toEqual({ success: false, error: 'No tienes acceso a este traslado.' });
    expect(getURLDescarga).not.toHaveBeenCalled();
  });
});
