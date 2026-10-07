import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UserProfile, UsuarioDetalle } from '@/types/auth.types';
import type { SolicitudMinima } from '@/services/solicitudes.service';

const getCurrentUserProfile = vi.fn();
const svc = {
  getSolicitudById: vi.fn(),
  getObservaciones: vi.fn(async () => [{ id: 'o-1' }]),
  getAuditoria: vi.fn(async () => [{ id: 'a-1' }]),
  getDocumentos: vi.fn(async () => [{ id: 'd-1' }]),
  getURLDescarga: vi.fn(async () => ({ success: true, url: 'https://firmada' })),
  getSolicitudIdDeDocumento: vi.fn(),
  agregarObservacion: vi.fn(async () => ({ success: true })),
  cancelarSolicitud: vi.fn(async () => ({ success: true })),
};
const getUsuarioDetalleById = vi.fn();
const getBranch = vi.fn();
const usuarioTieneSucursal = vi.fn<(u: string, s: number) => Promise<boolean>>(async () => false);

vi.mock('@/services/auth.service', () => ({
  AuthService: { getCurrentUserProfile: () => getCurrentUserProfile() },
}));
vi.mock('@/services/solicitudes.service', () => ({ SolicitudesService: svc }));
vi.mock('@/services/users.service', () => ({
  UsersService: { getUsuarioDetalleById: (id: string) => getUsuarioDetalleById(id) },
}));
vi.mock('@/services/organizacion.service', () => ({
  OrganizacionService: {
    getBranch: (id: number) => getBranch(id),
    usuarioTieneSucursal: (u: string, s: number) => usuarioTieneSucursal(u, s),
  },
}));
vi.mock('@/lib/rutas', () => ({ revalidarSolicitudes: vi.fn() }));

const actions = await import('@/app/actions/solicitudes.actions');

function perfil(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    id: 'e-1',
    email: 'e@test.com',
    nombre: 'E',
    apellido: 'Uno',
    rol: 'ejecutivo',
    activo: true,
    aprobado: true,
    requiere_cambio_clave: false,
    sucursal_id: 1,
    sucursales: [],
    zonas: [],
    created_at: '',
    updated_at: '',
    ...overrides,
  };
}

function solicitud(overrides: Partial<SolicitudMinima> = {}): SolicitudMinima {
  return {
    id: 's-1',
    estado: 'aprobada',
    sucursal: 1,
    sucursal_destino: 2,
    ejecutivo_id: 'e-1',
    jefe_local_id: 'jl-1',
    logistica_id: null,
    tipo_solicitud: 'venta',
    posicion_prioridad: null,
    fecha_tentativa_despacho: null,
    fecha_despacho: null,
    fecha_entrega: null,
    fecha_inicio_transito: null,
    ...overrides,
  };
}

function detalle(overrides: Partial<UsuarioDetalle> = {}): UsuarioDetalle {
  return {
    id: 'x-1',
    email: 'x@test.com',
    nombre: 'X',
    apellido: 'Dos',
    rol: 'ejecutivo',
    activo: true,
    telefono: '+56 9 0000 0000',
    sucursal_id: 9,
    sucursal_nombre: 'Otra',
    sucursales: [],
    zonas: [],
    created_at: '',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('getObservacionesAction / getAuditoriaAction (brecha 004)', () => {
  it('should_return_empty_without_querying_when_there_is_no_session', async () => {
    getCurrentUserProfile.mockResolvedValue(null);

    expect(await actions.getObservacionesAction('s-1')).toEqual([]);
    expect(await actions.getAuditoriaAction('s-1')).toEqual([]);
    expect(svc.getObservaciones).not.toHaveBeenCalled();
    expect(svc.getAuditoria).not.toHaveBeenCalled();
  });

  it('should_return_empty_when_solicitud_belongs_to_another_ejecutivo', async () => {
    getCurrentUserProfile.mockResolvedValue(perfil({ id: 'e-2' }));
    svc.getSolicitudById.mockResolvedValue(solicitud());

    expect(await actions.getObservacionesAction('s-1')).toEqual([]);
    expect(svc.getObservaciones).not.toHaveBeenCalled();
  });

  it('should_return_data_when_user_owns_the_solicitud', async () => {
    getCurrentUserProfile.mockResolvedValue(perfil());
    svc.getSolicitudById.mockResolvedValue(solicitud());

    expect(await actions.getObservacionesAction('s-1')).toEqual([{ id: 'o-1' }]);
    expect(await actions.getAuditoriaAction('s-1')).toEqual([{ id: 'a-1' }]);
  });
});

describe('documentos (brecha 006)', () => {
  it('should_not_sign_download_of_foreign_document', async () => {
    getCurrentUserProfile.mockResolvedValue(perfil({ id: 'e-2' }));
    svc.getSolicitudIdDeDocumento.mockResolvedValue('s-1');
    svc.getSolicitudById.mockResolvedValue(solicitud());

    const res = await actions.descargarDocumentoSolicitudAction('d-1');

    expect(res).toEqual({ success: false, error: 'No tienes acceso a esta solicitud.' });
    expect(svc.getURLDescarga).not.toHaveBeenCalled();
  });

  it('should_sign_download_when_user_has_access', async () => {
    getCurrentUserProfile.mockResolvedValue(perfil());
    svc.getSolicitudIdDeDocumento.mockResolvedValue('s-1');
    svc.getSolicitudById.mockResolvedValue(solicitud());

    expect(await actions.descargarDocumentoSolicitudAction('d-1')).toEqual({ success: true, url: 'https://firmada' });
  });

  it('should_not_list_documents_of_foreign_solicitud', async () => {
    getCurrentUserProfile.mockResolvedValue(perfil({ id: 'e-2' }));
    svc.getSolicitudById.mockResolvedValue(solicitud());

    expect(await actions.getDocumentosSolicitudAction('s-1')).toEqual([]);
    expect(svc.getDocumentos).not.toHaveBeenCalled();
  });
});

describe('agregarObservacionAction (brecha 006)', () => {
  it('should_reject_comment_on_foreign_solicitud', async () => {
    getCurrentUserProfile.mockResolvedValue(perfil({ id: 'e-2' }));
    svc.getSolicitudById.mockResolvedValue(solicitud());

    const res = await actions.agregarObservacionAction('s-1', 'hola');

    expect(res).toEqual({ success: false, error: 'No tienes acceso a esta solicitud.' });
    expect(svc.agregarObservacion).not.toHaveBeenCalled();
  });

  it('should_reject_when_temporary_password_is_pending', async () => {
    getCurrentUserProfile.mockResolvedValue(perfil({ requiere_cambio_clave: true }));

    const res = await actions.agregarObservacionAction('s-1', 'hola');

    expect(res.success).toBe(false);
    expect(res.error).toBe('Debes establecer una nueva contraseña antes de continuar.');
  });
});

describe('cancelarSolicitudAction (brecha 008)', () => {
  it('should_deny_logistica_outside_its_zones', async () => {
    getCurrentUserProfile.mockResolvedValue(perfil({ rol: 'logistica', id: 'l-1', zonas: [{ id: 7, nombre: 'N' }] }));
    svc.getSolicitudById.mockResolvedValue(solicitud());
    getBranch.mockResolvedValue({ id: 1, nombre: 'A', zona_id: 8 });

    const res = await actions.cancelarSolicitudAction('s-1', 'motivo largo');

    expect(res.success).toBe(false);
    expect(svc.cancelarSolicitud).not.toHaveBeenCalled();
  });

  it('should_allow_logistica_inside_its_zones', async () => {
    getCurrentUserProfile.mockResolvedValue(perfil({ rol: 'logistica', id: 'l-1', zonas: [{ id: 7, nombre: 'N' }] }));
    svc.getSolicitudById.mockResolvedValue(solicitud());
    getBranch.mockResolvedValue({ id: 1, nombre: 'A', zona_id: 7 });

    const res = await actions.cancelarSolicitudAction('s-1', 'motivo largo');

    expect(res.success).toBe(true);
    expect(svc.cancelarSolicitud).toHaveBeenCalledWith('s-1', 'motivo largo', 'l-1');
  });
});

describe('getUsuarioDetalleAction (brecha 006)', () => {
  it('should_hide_contact_of_unrelated_user', async () => {
    getCurrentUserProfile.mockResolvedValue(perfil());
    getUsuarioDetalleById.mockResolvedValue(detalle());

    const res = await actions.getUsuarioDetalleAction('x-1');

    expect(res?.email).toBe('');
    expect(res?.telefono).toBeNull();
    expect(res?.contacto_oculto).toBe(true);
    expect(res?.nombre).toBe('X');
  });

  it('should_show_contact_when_target_participates_in_accessible_solicitud', async () => {
    getCurrentUserProfile.mockResolvedValue(perfil({ rol: 'logistica', id: 'l-1', sucursal_id: null, zonas: [{ id: 7, nombre: 'N' }] }));
    getUsuarioDetalleById.mockResolvedValue(detalle({ id: 'e-1' }));
    svc.getSolicitudById.mockResolvedValue(solicitud());
    getBranch.mockResolvedValue({ id: 1, nombre: 'A', zona_id: 7 });

    const res = await actions.getUsuarioDetalleAction('e-1', 's-1');

    expect(res?.email).toBe('x@test.com');
    expect(res?.contacto_oculto).toBeUndefined();
  });

  it('should_hide_contact_when_solicitud_is_not_accessible', async () => {
    getCurrentUserProfile.mockResolvedValue(perfil({ id: 'e-2' }));
    getUsuarioDetalleById.mockResolvedValue(detalle({ id: 'e-1' }));
    svc.getSolicitudById.mockResolvedValue(solicitud());

    const res = await actions.getUsuarioDetalleAction('e-1', 's-1');

    expect(res?.contacto_oculto).toBe(true);
  });

  it('should_return_null_without_session', async () => {
    getCurrentUserProfile.mockResolvedValue(null);
    expect(await actions.getUsuarioDetalleAction('x-1')).toBeNull();
    expect(getUsuarioDetalleById).not.toHaveBeenCalled();
  });
});
