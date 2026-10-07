import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UserProfile } from '@/types/auth.types';
import type { SolicitudMinima } from '@/services/solicitudes.service';

const getCurrentUserProfile = vi.fn();
const getSolicitudById = vi.fn();
const getSolicitudIdDeDocumento = vi.fn();
const getSolicitudIdDeReserva = vi.fn();
const getBranch = vi.fn();

vi.mock('@/services/auth.service', () => ({
  AuthService: { getCurrentUserProfile: () => getCurrentUserProfile() },
}));
vi.mock('@/services/solicitudes.service', () => ({
  SolicitudesService: {
    getSolicitudById: (id: string) => getSolicitudById(id),
    getSolicitudIdDeDocumento: (id: string) => getSolicitudIdDeDocumento(id),
    getSolicitudIdDeReserva: (id: string) => getSolicitudIdDeReserva(id),
  },
}));
vi.mock('@/services/organizacion.service', () => ({
  OrganizacionService: { getBranch: (id: number) => getBranch(id) },
}));

const {
  MENSAJE_CAMBIO_CLAVE,
  MENSAJE_SESION_INVALIDA,
  MENSAJE_SIN_ACCESO_SOLICITUD,
  puedeAccederSolicitud,
  requireDocumentoAccess,
  requireProfile,
  requireRole,
  requireSolicitudAccess,
  requireSolicitudVehiculoAccess,
  sucursalesDelPerfil,
} = await import('@/lib/auth/guards');
const { ErrorUsuario } = await import('@/lib/errores');

function perfil(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    id: 'u-1',
    email: 'u@test.com',
    nombre: 'U',
    apellido: 'Test',
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
    jefe_local_id: null,
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

beforeEach(() => {
  vi.clearAllMocks();
});

describe('requireProfile', () => {
  it('should_return_profile_when_account_is_usable', async () => {
    const p = perfil();
    getCurrentUserProfile.mockResolvedValue(p);
    await expect(requireProfile()).resolves.toBe(p);
  });

  it('should_throw_ErrorUsuario_when_there_is_no_session', async () => {
    getCurrentUserProfile.mockResolvedValue(null);
    await expect(requireProfile()).rejects.toThrow(MENSAJE_SESION_INVALIDA);
    await expect(requireProfile()).rejects.toBeInstanceOf(ErrorUsuario);
  });

  it('should_throw_when_account_is_inactive_or_not_approved', async () => {
    getCurrentUserProfile.mockResolvedValue(perfil({ activo: false }));
    await expect(requireProfile()).rejects.toThrow(MENSAJE_SESION_INVALIDA);
    getCurrentUserProfile.mockResolvedValue(perfil({ aprobado: false }));
    await expect(requireProfile()).rejects.toThrow(MENSAJE_SESION_INVALIDA);
  });

  it('should_throw_when_temporary_password_must_be_changed', async () => {
    // Brecha 009: la contraseña temporal no permite operar.
    getCurrentUserProfile.mockResolvedValue(perfil({ requiere_cambio_clave: true }));
    await expect(requireProfile()).rejects.toThrow(MENSAJE_CAMBIO_CLAVE);
  });
});

describe('requireRole', () => {
  it('should_pass_when_role_is_allowed', () => {
    expect(() => requireRole(perfil({ rol: 'logistica' }), ['logistica', 'administrador'])).not.toThrow();
  });

  it('should_throw_custom_message_when_role_is_not_allowed', () => {
    expect(() => requireRole(perfil(), ['administrador'], 'Solo admin.')).toThrow('Solo admin.');
  });

  it('should_throw_default_message_when_none_is_given', () => {
    expect(() => requireRole(perfil(), ['administrador'])).toThrow('No tienes permisos para realizar esta acción.');
  });
});

describe('sucursalesDelPerfil', () => {
  it('should_merge_principal_and_managed_branches_without_duplicates', () => {
    const p = perfil({ sucursal_id: 1, sucursales: [{ id: 1, nombre: 'A' }, { id: 4, nombre: 'D' }] });
    expect(sucursalesDelPerfil(p).sort()).toEqual([1, 4]);
  });

  it('should_return_empty_when_user_has_no_branches', () => {
    expect(sucursalesDelPerfil(perfil({ sucursal_id: null, sucursales: undefined }))).toEqual([]);
  });
});

describe('puedeAccederSolicitud', () => {
  it('should_allow_admin_always', () => {
    expect(puedeAccederSolicitud(perfil({ rol: 'administrador' }), solicitud(), null)).toBe(true);
  });

  it('should_deny_operaciones_always', () => {
    expect(puedeAccederSolicitud(perfil({ rol: 'operaciones', id: 'e-1' }), solicitud(), null)).toBe(false);
  });

  it('should_allow_ejecutivo_only_on_own_solicitud', () => {
    expect(puedeAccederSolicitud(perfil({ id: 'e-1' }), solicitud(), null)).toBe(true);
    expect(puedeAccederSolicitud(perfil({ id: 'e-2' }), solicitud(), null)).toBe(false);
  });

  it('should_allow_jefe_local_on_origin_or_destination_branch', () => {
    const jl = perfil({ rol: 'jefe_local', id: 'jl-1', sucursal_id: 9, sucursales: [{ id: 2, nombre: 'B' }] });
    expect(puedeAccederSolicitud(jl, solicitud({ sucursal: 2, sucursal_destino: 5 }), null)).toBe(true);
    expect(puedeAccederSolicitud(jl, solicitud({ sucursal: 5, sucursal_destino: 2 }), null)).toBe(true);
    expect(puedeAccederSolicitud(jl, solicitud({ sucursal: 5, sucursal_destino: 6 }), null)).toBe(false);
    expect(puedeAccederSolicitud(jl, solicitud({ sucursal: 5, sucursal_destino: null }), null)).toBe(false);
  });

  it('should_allow_logistica_when_origin_zone_is_assigned', () => {
    const log = perfil({ rol: 'logistica', id: 'l-1', sucursal_id: null, zonas: [{ id: 7, nombre: 'N' }] });
    expect(puedeAccederSolicitud(log, solicitud(), 7)).toBe(true);
    expect(puedeAccederSolicitud(log, solicitud(), 8)).toBe(false);
    expect(puedeAccederSolicitud(log, solicitud(), null)).toBe(false);
  });

  it('should_allow_assigned_participants_outside_their_scope', () => {
    const log = perfil({ rol: 'logistica', id: 'l-1', zonas: [] });
    expect(puedeAccederSolicitud(log, solicitud({ logistica_id: 'l-1' }), null)).toBe(true);
    const jl = perfil({ rol: 'jefe_local', id: 'jl-1', sucursal_id: null });
    expect(puedeAccederSolicitud(jl, solicitud({ jefe_local_id: 'jl-1' }), null)).toBe(true);
  });
});

describe('requireSolicitudAccess', () => {
  it('should_return_solicitud_when_user_has_access', async () => {
    const s = solicitud();
    getSolicitudById.mockResolvedValue(s);
    await expect(requireSolicitudAccess(perfil({ id: 'e-1' }), 's-1')).resolves.toBe(s);
    expect(getBranch).not.toHaveBeenCalled();
  });

  it('should_throw_same_message_when_solicitud_does_not_exist_or_is_foreign', async () => {
    getSolicitudById.mockResolvedValue(null);
    await expect(requireSolicitudAccess(perfil(), 's-x')).rejects.toThrow(MENSAJE_SIN_ACCESO_SOLICITUD);

    getSolicitudById.mockResolvedValue(solicitud({ ejecutivo_id: 'otro' }));
    await expect(requireSolicitudAccess(perfil(), 's-1')).rejects.toThrow(MENSAJE_SIN_ACCESO_SOLICITUD);
  });

  it('should_throw_when_id_is_empty', async () => {
    await expect(requireSolicitudAccess(perfil(), '')).rejects.toThrow('Solicitud inválida.');
    expect(getSolicitudById).not.toHaveBeenCalled();
  });

  it('should_resolve_origin_zone_for_logistica', async () => {
    getSolicitudById.mockResolvedValue(solicitud({ sucursal: 3 }));
    getBranch.mockResolvedValue({ id: 3, nombre: 'C', zona_id: 7 });
    const log = perfil({ rol: 'logistica', id: 'l-1', zonas: [{ id: 7, nombre: 'N' }] });

    await expect(requireSolicitudAccess(log, 's-1')).resolves.toBeTruthy();
    expect(getBranch).toHaveBeenCalledWith(3);
  });

  it('should_deny_logistica_when_branch_has_no_zone', async () => {
    getSolicitudById.mockResolvedValue(solicitud());
    getBranch.mockResolvedValue(null);
    const log = perfil({ rol: 'logistica', id: 'l-1', zonas: [{ id: 7, nombre: 'N' }] });
    await expect(requireSolicitudAccess(log, 's-1')).rejects.toThrow(MENSAJE_SIN_ACCESO_SOLICITUD);
  });
});

describe('requireDocumentoAccess', () => {
  it('should_check_access_on_the_document_solicitud', async () => {
    getSolicitudIdDeDocumento.mockResolvedValue('s-1');
    getSolicitudById.mockResolvedValue(solicitud());
    await expect(requireDocumentoAccess(perfil({ id: 'e-1' }), 'd-1')).resolves.toBeTruthy();
    expect(getSolicitudById).toHaveBeenCalledWith('s-1');
  });

  it('should_throw_when_document_does_not_exist', async () => {
    getSolicitudIdDeDocumento.mockResolvedValue(null);
    await expect(requireDocumentoAccess(perfil(), 'd-x')).rejects.toThrow('Documento no encontrado.');
  });

  it('should_throw_when_document_id_is_empty', async () => {
    await expect(requireDocumentoAccess(perfil(), '')).rejects.toThrow('Documento inválido.');
  });

  it('should_deny_document_of_foreign_solicitud', async () => {
    getSolicitudIdDeDocumento.mockResolvedValue('s-1');
    getSolicitudById.mockResolvedValue(solicitud({ ejecutivo_id: 'otro' }));
    await expect(requireDocumentoAccess(perfil(), 'd-1')).rejects.toThrow(MENSAJE_SIN_ACCESO_SOLICITUD);
  });
});

describe('requireSolicitudVehiculoAccess', () => {
  it('should_check_access_on_the_reservation_solicitud', async () => {
    getSolicitudIdDeReserva.mockResolvedValue('s-1');
    getSolicitudById.mockResolvedValue(solicitud());
    await expect(requireSolicitudVehiculoAccess(perfil({ id: 'e-1' }), 'sv-1')).resolves.toBeTruthy();
  });

  it('should_throw_when_reservation_does_not_exist', async () => {
    getSolicitudIdDeReserva.mockResolvedValue(null);
    await expect(requireSolicitudVehiculoAccess(perfil(), 'sv-x')).rejects.toThrow('Reserva no encontrada.');
  });

  it('should_throw_when_reservation_id_is_empty', async () => {
    await expect(requireSolicitudVehiculoAccess(perfil(), '')).rejects.toThrow('Reserva inválida.');
  });
});
