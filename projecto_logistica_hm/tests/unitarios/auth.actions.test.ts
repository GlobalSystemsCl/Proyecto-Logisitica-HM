import { beforeEach, describe, expect, it, vi } from 'vitest';

const register = vi.fn();
const notificarNuevoUsuario = vi.fn<(...a: unknown[]) => Promise<number>>(async () => 1);

vi.mock('@/services/auth.service', () => ({
  AuthService: { register: (...a: unknown[]) => register(...a) },
}));
vi.mock('@/services/notificacion.service', () => ({
  NotificacionService: { notificarNuevoUsuario: (...a: unknown[]) => notificarNuevoUsuario(...a) },
}));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

const { registerAction } = await import('@/app/actions/auth.actions');

const CLAVE = 'ClaveSegura123';

function formulario(overrides: Record<string, string> = {}): FormData {
  const f = new FormData();
  const datos = {
    nombre: 'Ana',
    apellido: 'Soto',
    email: ' Ana@HMotores.cl ',
    password: CLAVE,
    confirmPassword: CLAVE,
    sucursal: '5',
    ...overrides,
  };
  Object.entries(datos).forEach(([k, v]) => f.set(k, v));
  return f;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('registerAction', () => {
  it('should_notify_admins_and_return_pending_message_with_branch_when_registration_succeeds', async () => {
    register.mockResolvedValue({ success: true, usuarioId: 'u-new', sucursalNombre: 'Centro' });

    const res = await registerAction(null, formulario());

    expect(res.success).toBe(true);
    expect(res.message).toContain('en la sucursal Centro');
    expect(res.message).toContain('El administrador debe activarla');
    expect(notificarNuevoUsuario).toHaveBeenCalledWith({
      id: 'u-new',
      nombre: 'Ana Soto',
      email: 'ana@hmotores.cl',
      sucursal: 'Centro',
    });
  });

  it('should_not_notify_when_registration_fails', async () => {
    register.mockResolvedValue({ success: false, error: 'Solo se pueden crear cuentas con correo corporativo (@hmotores.cl).' });

    const res = await registerAction(null, formulario({ email: 'ana@gmail.com' }));

    expect(res).toEqual({ success: false, error: 'Solo se pueden crear cuentas con correo corporativo (@hmotores.cl).' });
    expect(notificarNuevoUsuario).not.toHaveBeenCalled();
  });

  it('should_reject_without_registering_when_passwords_do_not_match', async () => {
    const res = await registerAction(null, formulario({ confirmPassword: 'OtraClave123' }));

    expect(res).toEqual({ success: false, error: 'Las contraseñas no coinciden.' });
    expect(register).not.toHaveBeenCalled();
  });
});
