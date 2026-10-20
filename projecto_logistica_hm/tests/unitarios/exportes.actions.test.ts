import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UserProfile } from '@/types/auth.types';

const getCurrentUserProfile = vi.fn();
const getSolicitudesFiltradas = vi.fn();

vi.mock('@/services/auth.service', () => ({
  AuthService: { getCurrentUserProfile: () => getCurrentUserProfile() },
}));
vi.mock('@/services/solicitudes.service', () => ({
  SolicitudesService: { getSolicitudesFiltradas: (...a: unknown[]) => getSolicitudesFiltradas(...a) },
}));

const { exportarCalendarizacionAction } = await import('@/app/actions/exportes.actions');

function perfil(rol: UserProfile['rol']): UserProfile {
  return {
    id: 'u-1',
    email: 'u@test.com',
    nombre: 'U',
    apellido: 'T',
    rol,
    activo: true,
    aprobado: true,
    requiere_cambio_clave: false,
    sucursal_id: 1,
    sucursales: [],
    zonas: [],
    created_at: '',
    updated_at: '',
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('exportarCalendarizacionAction', () => {
  it('should_query_scheduled_range_with_user_scope_and_return_rows', async () => {
    getCurrentUserProfile.mockResolvedValue(perfil('logistica'));
    getSolicitudesFiltradas.mockResolvedValue([]);

    const res = await exportarCalendarizacionAction('2026-10-21', '2026-10-21');

    expect(res).toEqual({ success: true, filas: [] });
    expect(getSolicitudesFiltradas).toHaveBeenCalledWith('u-1', 'logistica', {
      estados: ['calendarizada', 'en_transito'],
      programadasDesde: '2026-10-21',
      programadasHasta: '2026-10-21',
    });
  });

  it('should_reject_invalid_range_without_querying', async () => {
    getCurrentUserProfile.mockResolvedValue(perfil('logistica'));

    const res = await exportarCalendarizacionAction('2026-10-21', '2026-10-01');

    expect(res.success).toBe(false);
    expect(getSolicitudesFiltradas).not.toHaveBeenCalled();
  });

  it('should_reject_roles_without_calendar_access', async () => {
    getCurrentUserProfile.mockResolvedValue(perfil('ejecutivo'));

    const res = await exportarCalendarizacionAction('2026-10-21', '2026-10-21');

    expect(res).toEqual({ success: false, error: 'No tienes acceso al calendario de traslados.' });
    expect(getSolicitudesFiltradas).not.toHaveBeenCalled();
  });
});
