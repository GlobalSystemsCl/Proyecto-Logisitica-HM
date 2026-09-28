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
      admin.results.sucursal = [{ data: null, error: null }];
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

    it('should_assign_all_branches_as_manager_when_role_is_jefe_local', async () => {
      admin.results.usuario = [{ data: null, error: null }, fila({ id: 'u-3', rol: 'jefe_local' })];
      admin.results.sucursal = [{ data: null, error: null }, { data: null, error: null }];
      admin.results.usuario_zona = [{ data: null, error: null }];
      admin.auth.admin.createUser.mockResolvedValue({
        data: { user: { id: 'u-3' } },
        error: null,
      });

      const res = await UsersService.createUser({
        nombre: 'Juan',
        apellido: 'Pérez',
        email: 'jefe@test.com',
        rol: 'jefe_local',
        sucursal_id: 1,
        sucursales_ids: [2, 3],
      });

      expect(res.success).toBe(true);
      expect(admin.callsTo('sucursal')[0]).toEqual(['update', { usuario_id: null }]);
      const assign = admin
        .callsTo('sucursal')
        .find((c: [string, ...unknown[]]) => c[0] === 'update' && (c[1] as { usuario_id?: string })?.usuario_id === 'u-3');
      expect(assign).toBeTruthy();
      const inCall = admin.callsTo('sucursal').find((c) => c[0] === 'in');
      expect(inCall).toEqual(['in', 'id', [1, 2, 3]]);
    });

    it('should_not_assign_branches_when_role_is_not_manager', async () => {
      admin.results.usuario = [{ data: null, error: null }, fila({ id: 'u-4' })];
      admin.results.sucursal = [{ data: null, error: null }];
      admin.results.usuario_zona = [{ data: null, error: null }];
      admin.auth.admin.createUser.mockResolvedValue({
        data: { user: { id: 'u-4' } },
        error: null,
      });

      const res = await UsersService.createUser({
        nombre: 'Luis',
        apellido: 'Rojas',
        email: 'ejecutivo@test.com',
        rol: 'ejecutivo',
        sucursal_id: 1,
        sucursales_ids: [2],
      });

      expect(res.success).toBe(true);
      const assign = admin
        .callsTo('sucursal')
        .find((c: [string, ...unknown[]]) => c[0] === 'update' && (c[1] as { usuario_id?: string })?.usuario_id === 'u-4');
      expect(assign).toBeUndefined();
    });
  });

  describe('getUsers', () => {
    it('should_merge_principal_branch_and_managed_branches', async () => {
      const base = {
        email: 'j1@test.com',
        nombre: 'Jefe',
        apellido: 'Uno',
        rol: 'jefe_local',
        activo: true,
        created_at: '2026-01-01T00:00:00Z',
      };
      admin.results.usuario = [
        fila([
          {
            id: 'u-1',
            sucursal_id: 1,
            sucursal: { id: 1, nombre: 'Casa Matriz' },
            ...base,
          },
        ]),
      ];
      admin.results.sucursal = [
        fila([{ id: 1, nombre: 'Casa Matriz', usuario_id: 'u-1' }, { id: 2, nombre: 'Norte', usuario_id: 'u-1' }]),
      ];
      admin.results.usuario_zona = [fila([])];

      const users = await UsersService.getUsers();

      expect(users).toHaveLength(1);
      const sucursales = users[0].sucursales || [];
      const ids = sucursales.map((s) => s.id).sort();
      expect(ids).toEqual([1, 2]);
      expect(sucursales.find((s) => s.id === 2)?.nombre).toBe('Norte');
    });
  });

  describe('updateUser', () => {
    const base = {
      email: 'j2@test.com',
      nombre: 'Marta',
      apellido: 'López',
      rol: 'jefe_local',
      activo: true,
      creado: new Date().toISOString(),
      created_at: '2026-01-01T00:00:00Z',
    };

    it('should_preserve_managed_branches_when_role_stays_jefe', async () => {
      admin.results.usuario = [fila({ id: 'u-5', sucursal_id: 1, ...base })];
      admin.results.sucursal = [
        fila([{ id: 2 }, { id: 1 }]),
        { data: null, error: null },
        { data: null, error: null },
      ];
      admin.auth.admin.updateUserById.mockResolvedValue({ data: {}, error: null });

      const res = await UsersService.updateUser('u-5', { rol: 'jefe_local' });

      expect(res.success).toBe(true);
      const inCall = admin.callsTo('sucursal').find((c) => c[0] === 'in');
      expect(inCall).toEqual(['in', 'id', [2, 1]]);
    });

    it('should_unassign_all_branches_when_role_is_demoted', async () => {
      admin.results.usuario = [fila({ id: 'u-6', sucursal_id: null, ...base })];
      admin.results.sucursal = [
        { data: null, error: null },
        { data: null, error: null },
      ];
      admin.auth.admin.updateUserById.mockResolvedValue({ data: {}, error: null });

      const res = await UsersService.updateUser('u-6', { rol: 'ejecutivo' });

      expect(res.success).toBe(true);
      const assign = admin
        .callsTo('sucursal')
        .find((c: [string, ...unknown[]]) => c[0] === 'update' && (c[1] as { usuario_id?: string })?.usuario_id === 'u-6');
      expect(assign).toBeUndefined();
      const nullUpdate = admin
        .callsTo('sucursal')
        .find((c: [string, ...unknown[]]) => c[0] === 'update' && (c[1] as { usuario_id: string | null })?.usuario_id === null);
      expect(nullUpdate).toEqual(['update', { usuario_id: null }]);
    });
  });
});