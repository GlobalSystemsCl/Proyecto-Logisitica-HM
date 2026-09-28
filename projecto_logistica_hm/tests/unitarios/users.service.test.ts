import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSupabaseMock, fila } from '../mocks/supabase';

const admin = createSupabaseMock();

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => admin }));
vi.mock('@/services/email.service', () => ({
  EmailService: { sendUserCredentialsEmail: vi.fn(async () => ({ success: true })) },
}));

const { UsersService } = await import('@/services/users.service');

describe('UsersService', () => {
  beforeEach(() => {
    admin.reset();
    vi.clearAllMocks();
  });

  afterEach(() => {});

  describe('approveUser', () => {
    it('should_approve_user_in_db_and_update_auth_metadata', async () => {
      admin.results.usuario = [fila({ id: 'u-1' })];

      const res = await UsersService.approveUser('u-1');

      expect(res).toEqual({ success: true });
      const update = admin.callsTo('usuario').find((c) => c[0] === 'update');
      expect(update?.[1]).toMatchObject({ aprobado: true });
      expect(admin.callsTo('usuario')).toContainEqual(['eq', 'id', 'u-1']);
      expect(admin.auth.admin.updateUserById).toHaveBeenCalledWith('u-1', {
        user_metadata: { aprobado: true },
      });
    });

    it('should_return_error_when_db_update_fails', async () => {
      admin.results.usuario = [{ data: null, error: { message: 'no existe columna' } }];

      const res = await UsersService.approveUser('u-1');

      expect(res.success).toBe(false);
      expect(res.error).toBe('no existe columna');
      expect(admin.auth.admin.updateUserById).not.toHaveBeenCalled();
    });

    it('should_return_error_when_no_user_row_is_returned', async () => {
      admin.results.usuario = [fila(null)];

      const res = await UsersService.approveUser('u-1');

      expect(res.success).toBe(false);
      expect(res.error).toBe('No se pudo autorizar al usuario.');
      expect(admin.auth.admin.updateUserById).not.toHaveBeenCalled();
    });

    it('should_return_error_when_auth_metadata_update_fails', async () => {
      admin.results.usuario = [fila({ id: 'u-1' })];
      admin.auth.admin.updateUserById.mockResolvedValue({
        data: {},
        error: { message: 'User not found' },
      });

      const res = await UsersService.approveUser('u-1');

      expect(res.success).toBe(false);
      expect(res.error).toBe('User not found');
    });
  });

  describe('createUser', () => {
    it('should_create_admin_user_as_pre_approved', async () => {
      admin.results.usuario = [{ data: null, error: null }, fila({ id: 'u-2' })];
      admin.results.usuario_sucursal = [{ data: null, error: null }];
      admin.results.usuario_zona = [{ data: null, error: null }];
      admin.auth.admin.createUser.mockResolvedValue({
        data: { user: { id: 'u-2' } },
        error: null,
      });

      const res = await UsersService.createUser({
        nombre: 'Ana',
        apellido: 'Díaz',
        email: 'ana@test.com',
        rol: 'administrador',
      });

      expect(res.success).toBe(true);
      const metadata = admin.auth.admin.createUser.mock.calls[0][0].user_metadata;
      expect(metadata).toMatchObject({ aprobado: true });
      const upsert = admin.callsTo('usuario').find((c) => c[0] === 'upsert');
      expect(upsert?.[1]).toMatchObject({ aprobado: true });
    });
  });
});