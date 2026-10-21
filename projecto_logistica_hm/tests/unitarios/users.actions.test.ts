import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UserProfile } from '@/types/auth.types';

const getCurrentUserProfile = vi.fn();
const activarCuentasMasivo = vi.fn();
const getUsers = vi.fn();
const createUser = vi.fn();
const getSucursales = vi.fn();
const getZonas = vi.fn();
const revalidatePath = vi.fn();

vi.mock('@/services/auth.service', () => ({
  AuthService: { getCurrentUserProfile: () => getCurrentUserProfile() },
}));
vi.mock('@/services/users.service', () => ({
  UsersService: {
    activarCuentasMasivo: (...a: unknown[]) => activarCuentasMasivo(...a),
    getUsers: () => getUsers(),
    createUser: (...a: unknown[]) => createUser(...a),
  },
}));
vi.mock('@/services/sucursales.service', () => ({
  SucursalesService: { getSucursales: () => getSucursales() },
}));
vi.mock('@/services/organizacion.service', () => ({
  OrganizacionService: { getZonas: () => getZonas() },
}));
vi.mock('next/cache', () => ({ revalidatePath: (p: string) => revalidatePath(p) }));

const { approveUsersBulkAction, importUsuariosAction } = await import('@/app/actions/users.actions');

function perfil(rol: UserProfile['rol']): UserProfile {
  return {
    id: 'adm-1',
    email: 'adm@hmotores.cl',
    nombre: 'A',
    apellido: 'D',
    rol,
    activo: true,
    aprobado: true,
    requiere_cambio_clave: false,
    sucursal_id: null,
    sucursales: [],
    zonas: [],
    created_at: '',
    updated_at: '',
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('approveUsersBulkAction', () => {
  it('should_delegate_to_service_and_revalidate_when_some_account_was_activated', async () => {
    getCurrentUserProfile.mockResolvedValue(perfil('administrador'));
    const resultado = { success: true, activadas: ['a@hmotores.cl'], fallidas: [] };
    activarCuentasMasivo.mockResolvedValue(resultado);

    const res = await approveUsersBulkAction(['u-1'], { rol: 'ejecutivo', sucursal: 'registro' });

    expect(res).toEqual(resultado);
    expect(activarCuentasMasivo).toHaveBeenCalledWith(['u-1'], { rol: 'ejecutivo', sucursal: 'registro' });
    expect(revalidatePath).toHaveBeenCalledWith('/admin/usuarios');
  });

  it('should_not_revalidate_when_nothing_was_activated', async () => {
    getCurrentUserProfile.mockResolvedValue(perfil('administrador'));
    activarCuentasMasivo.mockResolvedValue({ success: true, activadas: [], fallidas: [{ email: 'a', error: 'x' }] });

    await approveUsersBulkAction(['u-1'], { rol: 'ejecutivo', sucursal: 'registro' });

    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('should_reject_users_that_are_not_admin', async () => {
    getCurrentUserProfile.mockResolvedValue(perfil('jefe_local'));

    const res = await approveUsersBulkAction(['u-1'], { rol: 'ejecutivo', sucursal: 'registro' });

    expect(res.success).toBe(false);
    expect(activarCuentasMasivo).not.toHaveBeenCalled();
  });
});

describe('importUsuariosAction', () => {
  const filaBase = { fila: 2, nombre: 'Juan', apellido: 'Pérez', email: 'juan@hmotores.cl', rol: 'Ejecutivo', sucursal: 'Centro', zona: '' };

  beforeEach(() => {
    getCurrentUserProfile.mockResolvedValue(perfil('administrador'));
    getUsers.mockResolvedValue([
      { id: 'u-9', email: 'ya@hmotores.cl', nombre: 'Ya', apellido: 'Existe', rol: 'ejecutivo', sucursal_id: 1, sucursales: [] },
    ]);
    getSucursales.mockResolvedValue([{ id: 1, nombre: 'Centro' }]);
    getZonas.mockResolvedValue([]);
  });

  it('should_create_valid_rows_and_report_invalid_ones_revalidated_on_server', async () => {
    createUser.mockResolvedValue({ success: true, emailSent: false, tempPassword: 'Tmp12345678' });

    const res = await importUsuariosAction([filaBase, { ...filaBase, fila: 3, email: 'ya@hmotores.cl' }]);

    expect(res.success).toBe(true);
    expect(res.resultados).toEqual([
      { fila: 2, email: 'juan@hmotores.cl', ok: true, tempPassword: 'Tmp12345678' },
      { fila: 3, email: 'ya@hmotores.cl', ok: false, error: 'Ya existe una cuenta con este correo.' },
    ]);
    expect(createUser).toHaveBeenCalledTimes(1);
    expect(createUser).toHaveBeenCalledWith(expect.objectContaining({ email: 'juan@hmotores.cl', rol: 'ejecutivo', sucursal_id: 1 }));
    expect(revalidatePath).toHaveBeenCalledWith('/admin/usuarios');
  });

  it('should_report_service_error_for_a_row', async () => {
    createUser.mockResolvedValue({ success: false, error: 'Error al crear el usuario.' });

    const res = await importUsuariosAction([filaBase]);

    expect(res.resultados).toEqual([{ fila: 2, email: 'juan@hmotores.cl', ok: false, error: 'Error al crear el usuario.' }]);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('should_reject_batches_larger_than_the_limit_without_creating', async () => {
    const filas = Array.from({ length: 21 }, (_, i) => ({ ...filaBase, fila: i + 2, email: `u${i}@hmotores.cl` }));

    const res = await importUsuariosAction(filas);

    expect(res.success).toBe(false);
    expect(createUser).not.toHaveBeenCalled();
  });

  it('should_reject_empty_batch', async () => {
    expect((await importUsuariosAction([])).success).toBe(false);
  });

  it('should_reject_users_that_are_not_admin', async () => {
    getCurrentUserProfile.mockResolvedValue(perfil('logistica'));

    const res = await importUsuariosAction([filaBase]);

    expect(res.success).toBe(false);
    expect(getUsers).not.toHaveBeenCalled();
  });
});
