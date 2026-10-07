import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSupabaseMock, fila } from '../mocks/supabase';

const admin = createSupabaseMock();

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => admin }));
vi.mock('@/services/email.service', () => ({
  EmailService: { sendUserCredentialsEmail: vi.fn(async () => ({ success: true })) },
}));

const { UsersService } = await import('@/services/users.service');
const { validarPassword } = await import('@/lib/validaciones');

describe('UsersService', () => {
  beforeEach(() => {
    admin.reset();
    vi.clearAllMocks();
  });

  afterEach(() => {});

  describe('approveUser', () => {
    it('should_approve_and_activate_user_and_lift_auth_ban', async () => {
      admin.results.usuario = [fila({ id: 'u-1' })];

      const res = await UsersService.approveUser('u-1');

      expect(res).toEqual({ success: true });
      const update = admin.callsTo('usuario').find((c) => c[0] === 'update');
      // Brecha 003: aprobado y activo van juntos (CHECK usuario_no_aprobado_inactivo).
      expect(update?.[1]).toEqual({ aprobado: true, activo: true });
      expect(admin.callsTo('usuario')).toContainEqual(['eq', 'id', 'u-1']);
      expect(admin.auth.admin.updateUserById).toHaveBeenCalledWith('u-1', { ban_duration: 'none' });
    });

    it('should_not_write_approval_in_user_metadata', async () => {
      admin.results.usuario = [fila({ id: 'u-1' })];

      await UsersService.approveUser('u-1');

      const llamadas = admin.auth.admin.updateUserById.mock.calls as Array<[string, Record<string, unknown>]>;
      expect(llamadas.some(([, attrs]) => 'user_metadata' in attrs)).toBe(false);
    });

    it('should_return_generic_error_when_db_update_fails', async () => {
      admin.results.usuario = [{ data: null, error: { message: 'no existe columna' } }];

      const res = await UsersService.approveUser('u-1');

      expect(res.success).toBe(false);
      expect(res.error).toMatch(/^No se pudo autorizar al usuario\./);
      expect(res.error).not.toContain('columna');
      expect(admin.auth.admin.updateUserById).not.toHaveBeenCalled();
    });

    it('should_return_error_when_no_user_row_is_returned', async () => {
      admin.results.usuario = [fila(null)];

      const res = await UsersService.approveUser('u-1');

      expect(res.success).toBe(false);
      expect(res.error).toBe('No se pudo autorizar al usuario.');
      expect(admin.auth.admin.updateUserById).not.toHaveBeenCalled();
    });

    it('should_succeed_even_when_auth_unban_fails', async () => {
      admin.results.usuario = [fila({ id: 'u-1' })];
      admin.auth.admin.updateUserById.mockResolvedValue({
        data: {},
        error: { message: 'User not found' },
      });

      const res = await UsersService.approveUser('u-1');

      expect(res).toEqual({ success: true });
    });
  });

  describe('generateTempPassword', () => {
    it('should_generate_16_chars_meeting_password_policy', () => {
      for (let i = 0; i < 50; i++) {
        const pass = UsersService.generateTempPassword();
        expect(pass).toHaveLength(16);
        expect(validarPassword(pass)).toBeNull();
      }
    });

    it('should_not_use_predictable_prefix_nor_repeat_values', () => {
      const valores = new Set(Array.from({ length: 200 }, () => UsersService.generateTempPassword()));
      expect(valores.size).toBe(200);
      expect([...valores].every((v) => !v.startsWith('HM-'))).toBe(true);
    });
  });

  describe('toggleUserStatus', () => {
    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it('should_reject_when_admin_tries_to_deactivate_itself', async () => {
      const res = await UsersService.toggleUserStatus('u-1', false, 'u-1');
      expect(res.success).toBe(false);
      expect(admin.callsTo('usuario')).toHaveLength(0);
    });

    it('should_deactivate_and_ban_user_in_auth', async () => {
      admin.results.usuario = [fila({ email: 'a@test.com', aprobado: true }), fila(null)];

      const res = await UsersService.toggleUserStatus('u-2', false, 'u-1');

      expect(res).toEqual({ success: true });
      expect(admin.callsTo('usuario')).toContainEqual(['update', { activo: false }]);
      expect(admin.auth.admin.updateUserById).toHaveBeenCalledWith('u-2', { ban_duration: '876000h' });
    });

    it('should_reactivate_and_lift_ban_in_auth', async () => {
      admin.results.usuario = [fila({ email: 'a@test.com', aprobado: true }), fila(null)];

      const res = await UsersService.toggleUserStatus('u-2', true, 'u-1');

      expect(res).toEqual({ success: true });
      expect(admin.auth.admin.updateUserById).toHaveBeenCalledWith('u-2', { ban_duration: 'none' });
    });

    it('should_reject_activation_when_account_is_not_approved', async () => {
      admin.results.usuario = [fila({ email: 'a@test.com', aprobado: false })];

      const res = await UsersService.toggleUserStatus('u-2', true, 'u-1');

      expect(res.success).toBe(false);
      expect(res.error).toMatch(/aún no está autorizada/);
      expect(admin.callsTo('usuario').some((c) => c[0] === 'update')).toBe(false);
    });

    it('should_protect_principal_admin_configured_by_env', async () => {
      vi.stubEnv('ADMIN_PRINCIPAL_EMAIL', 'jefe@empresa.cl');
      admin.results.usuario = [fila({ email: 'Jefe@Empresa.cl', aprobado: true })];

      const res = await UsersService.toggleUserStatus('u-2', false, 'u-1');

      expect(res).toEqual({
        success: false,
        error: 'La cuenta del Administrador Principal no puede ser desactivada.',
      });
    });

    it('should_still_succeed_when_auth_ban_fails', async () => {
      admin.results.usuario = [fila({ email: 'a@test.com', aprobado: true }), fila(null)];
      admin.auth.admin.updateUserById.mockResolvedValue({ data: {}, error: { message: 'x' } });

      const res = await UsersService.toggleUserStatus('u-2', false, 'u-1');

      expect(res).toEqual({ success: true });
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
      // Brecha 002: el rol no viaja en user_metadata; lo fija el upsert.
      const metadata = admin.auth.admin.createUser.mock.calls[0][0].user_metadata;
      expect(metadata).toEqual({ nombre: 'Ana', apellido: 'Díaz' });
      const upsert = admin.callsTo('usuario').find((c) => c[0] === 'upsert');
      expect(upsert?.[1]).toMatchObject({ aprobado: true, activo: true, rol: 'administrador' });
    });

    it('should_not_return_temp_password_when_email_was_sent', async () => {
      admin.results.usuario = [{ data: null, error: null }, fila({ id: 'u-2' })];
      admin.auth.admin.createUser.mockResolvedValue({ data: { user: { id: 'u-2' } }, error: null });

      const res = await UsersService.createUser({ nombre: 'Ana', apellido: 'Díaz', email: 'a@test.com', rol: 'ejecutivo' });

      expect(res.emailSent).toBe(true);
      expect(res.tempPassword).toBeUndefined();
    });

    it('should_return_temp_password_when_email_failed', async () => {
      const { EmailService } = await import('@/services/email.service');
      vi.mocked(EmailService.sendUserCredentialsEmail).mockResolvedValueOnce({ success: false, error: 'x' });
      admin.results.usuario = [{ data: null, error: null }, fila({ id: 'u-2' })];
      admin.auth.admin.createUser.mockResolvedValue({ data: { user: { id: 'u-2' } }, error: null });

      const res = await UsersService.createUser({ nombre: 'Ana', apellido: 'Díaz', email: 'a@test.com', rol: 'ejecutivo' });

      expect(res.emailSent).toBe(false);
      expect(res.tempPassword).toHaveLength(16);
    });

    it('should_reject_weak_custom_password', async () => {
      const res = await UsersService.createUser(
        { nombre: 'Ana', apellido: 'Díaz', email: 'a@test.com', rol: 'ejecutivo' },
        'debil'
      );

      expect(res.success).toBe(false);
      expect(res.error).toMatch(/al menos 10 caracteres/);
      expect(admin.auth.admin.createUser).not.toHaveBeenCalled();
    });

    it('should_reject_names_with_html', async () => {
      const res = await UsersService.createUser({
        nombre: '<b>Ana</b>',
        apellido: 'Díaz',
        email: 'a@test.com',
        rol: 'ejecutivo',
      });

      expect(res.success).toBe(false);
      expect(res.error).toBe('El nombre contiene caracteres no permitidos.');
    });

    it('should_return_generic_error_when_profile_upsert_fails', async () => {
      admin.results.usuario = [{ data: null, error: null }, { data: null, error: { message: 'column "aprobado" does not exist' } }];
      admin.auth.admin.createUser.mockResolvedValue({ data: { user: { id: 'u-2' } }, error: null });

      const res = await UsersService.createUser({ nombre: 'Ana', apellido: 'Díaz', email: 'a@test.com', rol: 'ejecutivo' });

      expect(res.success).toBe(false);
      expect(res.error).not.toContain('aprobado');
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

    it('should_assign_zones_when_role_is_logistica', async () => {
      admin.results.usuario = [{ data: null, error: null }, fila({ id: 'u-log', rol: 'logistica' })];
      admin.results.sucursal = [{ data: null, error: null }];
      admin.results.usuario_zona = [{ data: null, error: null }, { data: null, error: null }];
      admin.auth.admin.createUser.mockResolvedValue({
        data: { user: { id: 'u-log' } },
        error: null,
      });

      const res = await UsersService.createUser({
        nombre: 'Leo',
        apellido: 'Zona',
        email: 'logistica@test.com',
        rol: 'logistica',
        zonas_ids: [1, 2],
      });

      expect(res.success).toBe(true);
      const inserts = admin.callsTo('usuario_zona').filter((c) => c[0] === 'insert');
      expect(inserts).toHaveLength(1);
      expect(inserts[0][1]).toEqual([
        { usuario_id: 'u-log', zona_id: 1 },
        { usuario_id: 'u-log', zona_id: 2 },
      ]);
    });

    it('should_not_assign_zones_when_role_is_not_logistica', async () => {
      admin.results.usuario = [{ data: null, error: null }, fila({ id: 'u-8', rol: 'ejecutivo' })];
      admin.results.sucursal = [{ data: null, error: null }];
      admin.results.usuario_zona = [{ data: null, error: null }];
      admin.auth.admin.createUser.mockResolvedValue({
        data: { user: { id: 'u-8' } },
        error: null,
      });

      const res = await UsersService.createUser({
        nombre: 'Rolando',
        apellido: 'Vera',
        email: 'ejecutivo2@test.com',
        rol: 'ejecutivo',
        zonas_ids: [1, 2],
      });

      expect(res.success).toBe(true);
      const inserts = admin.callsTo('usuario_zona').filter((c) => c[0] === 'insert');
      expect(inserts).toHaveLength(0);
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

  describe('getUsuarioDetalleById', () => {
    it('should_return_basic_contact_data', async () => {
      admin.results.usuario = [
        fila({
          id: 'u-20',
          email: 'a@test.com',
          nombre: 'Ana',
          apellido: 'Pérez',
          rol: 'ejecutivo',
          activo: true,
          telefono: '+56912345678',
          sucursal_id: 1,
          created_at: '2026-01-01T00:00:00Z',
          sucursal: { nombre: 'Casa Matriz' },
        }),
      ];
      admin.results.sucursal = [fila([])];
      admin.results.usuario_zona = [fila([])];

      const detalle = await UsersService.getUsuarioDetalleById('u-20');

      expect(detalle).toMatchObject({
        id: 'u-20',
        email: 'a@test.com',
        nombre: 'Ana',
        apellido: 'Pérez',
        rol: 'ejecutivo',
        activo: true,
        telefono: '+56912345678',
        sucursal_id: 1,
        sucursal_nombre: 'Casa Matriz',
        sucursales: [{ id: 1, nombre: 'Casa Matriz' }],
        zonas: [],
      });
    });

    it('should_include_managed_branches_and_zones', async () => {
      admin.results.usuario = [
        fila({
          id: 'u-21',
          email: 'j@test.com',
          nombre: 'Jefe',
          apellido: 'Local',
          rol: 'jefe_local',
          activo: true,
          telefono: null,
          sucursal_id: 1,
          created_at: '2026-01-01T00:00:00Z',
          sucursal: { nombre: 'Casa Matriz' },
        }),
      ];
      admin.results.sucursal = [fila([{ id: 2, nombre: 'Norte' }, { id: 3, nombre: 'Sur' }])];
      admin.results.usuario_zona = [fila([{ zona_id: 5, zona: { id: 5, nombre: 'Zona Norte' } }])];

      const detalle = await UsersService.getUsuarioDetalleById('u-21');

      const ids = (detalle?.sucursales || []).map((s) => s.id).sort();
      expect(ids).toEqual([1, 2, 3]);
      expect(detalle?.zonas).toEqual([{ id: 5, nombre: 'Zona Norte' }]);
    });

    it('should_not_duplicate_main_branch_when_also_managed', async () => {
      admin.results.usuario = [
        fila({
          id: 'u-22',
          email: 'j@test.com',
          nombre: 'Jefe',
          apellido: 'Local',
          rol: 'jefe_local',
          activo: true,
          telefono: null,
          sucursal_id: 1,
          created_at: '2026-01-01T00:00:00Z',
          sucursal: { nombre: 'Casa Matriz' },
        }),
      ];
      admin.results.sucursal = [fila([{ id: 1, nombre: 'Casa Matriz' }])];
      admin.results.usuario_zona = [fila([])];

      const detalle = await UsersService.getUsuarioDetalleById('u-22');

      expect(detalle?.sucursales).toEqual([{ id: 1, nombre: 'Casa Matriz' }]);
    });

    it('should_return_null_when_usuario_query_fails', async () => {
      admin.results.usuario = [{ data: null, error: { message: 'no existe columna' } }];

      const detalle = await UsersService.getUsuarioDetalleById('u-23');

      expect(detalle).toBeNull();
    });

    it('should_return_detail_with_empty_lists_when_aux_queries_fail', async () => {
      admin.results.usuario = [
        fila({
          id: 'u-24',
          email: 'l@test.com',
          nombre: 'Log',
          apellido: 'R',
          rol: 'logistica',
          activo: true,
          telefono: null,
          sucursal_id: null,
          created_at: '2026-01-01T00:00:00Z',
          sucursal: null,
        }),
      ];
      admin.results.sucursal = [{ data: null, error: { message: 'boom' } }];
      admin.results.usuario_zona = [{ data: null, error: { message: 'boom' } }];

      const detalle = await UsersService.getUsuarioDetalleById('u-24');

      expect(detalle).toMatchObject({ id: 'u-24', sucursal_nombre: null, sucursales: [], zonas: [] });
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

    it('should_clear_zones_when_role_is_demoted_from_logistica', async () => {
      admin.results.usuario = [fila({ id: 'u-9', sucursal_id: null, ...base, rol: 'logistica' })];
      admin.results.sucursal = [
        { data: null, error: null },
        { data: null, error: null },
      ];
      admin.results.usuario_zona = [{ data: null, error: null }];
      admin.auth.admin.updateUserById.mockResolvedValue({ data: {}, error: null });

      const res = await UsersService.updateUser('u-9', { rol: 'jefe_local' });

      expect(res.success).toBe(true);
      const inserts = admin.callsTo('usuario_zona').filter((c) => c[0] === 'insert');
      expect(inserts).toHaveLength(0);
      expect(admin.callsTo('usuario_zona')).toContainEqual(['delete']);
    });

    it('should_assign_zones_when_role_is_logistica', async () => {
      admin.results.usuario = [fila({ id: 'u-10', sucursal_id: null, ...base, rol: 'ejecutivo' })];
      admin.results.sucursal = [
        { data: null, error: null },
        { data: null, error: null },
      ];
      admin.results.usuario_zona = [{ data: null, error: null }, { data: null, error: null }];
      admin.auth.admin.updateUserById.mockResolvedValue({ data: {}, error: null });

      const res = await UsersService.updateUser('u-10', { rol: 'logistica', zonas_ids: [5] });

      expect(res.success).toBe(true);
      const inserts = admin.callsTo('usuario_zona').filter((c) => c[0] === 'insert');
      expect(inserts).toHaveLength(1);
      expect(inserts[0][1]).toEqual([{ usuario_id: 'u-10', zona_id: 5 }]);
    });
  });
});