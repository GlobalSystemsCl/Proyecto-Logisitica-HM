import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSupabaseMock, fila } from '../mocks/supabase';
import { authUser, createServerClientMock } from '../mocks/supabase-server';

const admin = createSupabaseMock();
const server = createServerClientMock();

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => admin }));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => server }));

const { AuthService } = await import('@/services/auth.service');

const ADMIN_PRINCIPAL = 'maic.hernandez.dev@gmail.com';

function perfil(overrides: Record<string, unknown> = {}) {
  return {
    id: 'u-1',
    email: 'user@test.com',
    nombre: 'Juan',
    apellido: 'Pérez',
    rol: 'ejecutivo',
    activo: true,
    requiere_cambio_clave: false,
    ...overrides,
  };
}

describe('AuthService', () => {
  beforeEach(() => {
    admin.reset();
    server.reset();
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-15T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('signIn', () => {
    it('should_normalize_email_before_querying', async () => {
      admin.results.usuario = [fila(perfil())];
      await AuthService.signIn('  USER@Test.COM ', 'pass');
      expect(admin.callsTo('usuario')).toContainEqual(['eq', 'email', 'user@test.com']);
    });

    it('should_reject_when_account_is_deactivated', async () => {
      admin.results.usuario = [fila(perfil({ activo: false }))];
      const res = await AuthService.signIn('user@test.com', 'pass');
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/desactivada por el administrador/);
      expect(server.auth.signInWithPassword).not.toHaveBeenCalled();
    });

    it('should_reject_when_account_is_pending_approval', async () => {
      admin.results.usuario = [fila(perfil({ aprobado: false }))];
      const res = await AuthService.signIn('user@test.com', 'pass');
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/no ha sido autorizada por un administrador/);
      expect(server.auth.signInWithPassword).not.toHaveBeenCalled();
    });

    it('should_reject_with_remaining_minutes_when_account_is_temporarily_locked', async () => {
      admin.results.usuario = [
        fila(perfil({ bloqueado_hasta: '2026-01-15T12:10:00Z', intentos_fallidos: 5 })),
      ];
      const res = await AuthService.signIn('user@test.com', 'pass');
      expect(res.success).toBe(false);
      expect(res.error).toBe(
        'Cuenta bloqueada temporalmente por múltiples intentos fallidos. Intenta nuevamente en 10 minuto(s).'
      );
    });

    it('should_ignore_expired_lock', async () => {
      admin.results.usuario = [
        fila(perfil({ bloqueado_hasta: '2026-01-15T11:00:00Z' })),
        fila(perfil()),
        fila(perfil()),
      ];
      server.auth.signInWithPassword.mockResolvedValue({ data: { user: authUser() }, error: null });
      const res = await AuthService.signIn('user@test.com', 'pass');
      expect(res.success).toBe(true);
    });

    it('should_reject_when_credentials_are_invalid_and_user_does_not_exist', async () => {
      admin.results.usuario = [{ data: null, error: { message: 'PGRST116' } }];
      server.auth.signInWithPassword.mockResolvedValue({
        data: { user: null },
        error: { message: 'Invalid login credentials' },
      });
      const res = await AuthService.signIn('user@test.com', 'wrong');
      expect(res.success).toBe(false);
      expect(res.error).toBe('Credenciales inválidas. Verifica tu correo y contraseña.');
    });

    it('should_report_remaining_attempts_before_the_block', async () => {
      admin.results.usuario = [fila(perfil({ intentos_fallidos: 2 })), { data: null, error: null }];
      server.auth.signInWithPassword.mockResolvedValue({
        data: { user: null },
        error: { message: 'Invalid login credentials' },
      });
      const res = await AuthService.signIn('user@test.com', 'wrong');
      expect(res.success).toBe(false);
      expect(res.error).toBe(
        'Credenciales inválidas. Te quedan 2 intento(s) antes del bloqueo temporal.'
      );
    });

    it('should_increment_attempts_counter_on_failure', async () => {
      admin.results.usuario = [fila(perfil({ intentos_fallidos: 1, id: 'u-7' })), { data: null, error: null }];
      server.auth.signInWithPassword.mockResolvedValue({
        data: { user: null },
        error: { message: 'Invalid login credentials' },
      });
      await AuthService.signIn('user@test.com', 'wrong');
      const update = admin.callsTo('usuario').find((c) => c[0] === 'update');
      expect(update?.[1]).toMatchObject({ intentos_fallidos: 2, bloqueado_hasta: null });
      expect(admin.callsTo('usuario')).toContainEqual(['eq', 'id', 'u-7']);
    });

    it('should_block_account_for_15_minutes_after_5_failed_attempts', async () => {
      admin.results.usuario = [fila(perfil({ intentos_fallidos: 4 })), { data: null, error: null }];
      server.auth.signInWithPassword.mockResolvedValue({
        data: { user: null },
        error: { message: 'Invalid login credentials' },
      });
      const res = await AuthService.signIn('user@test.com', 'wrong');
      expect(res.error).toBe(
        'Has superado el límite de 5 intentos fallidos. Tu cuenta ha sido bloqueada por 15 minutos por seguridad.'
      );
      const update = admin.callsTo('usuario').find((c) => c[0] === 'update');
      expect(update?.[1]).toMatchObject({
        intentos_fallidos: 5,
        bloqueado_hasta: '2026-01-15T12:15:00.000Z',
      });
    });

    it('should_reject_when_auth_returns_no_user', async () => {
      admin.results.usuario = [fila(perfil())];
      server.auth.signInWithPassword.mockResolvedValue({ data: { user: null }, error: null });
      const res = await AuthService.signIn('user@test.com', 'pass');
      expect(res.success).toBe(false);
      expect(res.error).toBe('No se pudo iniciar sesión. Intenta nuevamente.');
    });

    it('should_return_profile_and_reset_attempts_on_success', async () => {
      admin.results.usuario = [
        fila(perfil({ intentos_fallidos: 3 })),
        fila(perfil({ requiere_cambio_clave: true })),
        { data: null, error: null },
      ];
      server.auth.signInWithPassword.mockResolvedValue({ data: { user: authUser() }, error: null });
      const res = await AuthService.signIn('user@test.com', 'pass');
      expect(res.success).toBe(true);
      expect(res.profile?.email).toBe('user@test.com');
      expect(res.requiresPasswordChange).toBe(true);
      const reset = admin.callsTo('usuario').filter((c) => c[0] === 'update').at(-1);
      expect(reset?.[1]).toMatchObject({ intentos_fallidos: 0, bloqueado_hasta: null });
    });

    it('should_sign_out_when_profile_is_deactivated_after_auth', async () => {
      admin.results.usuario = [fila(perfil()), fila(perfil({ activo: false })), { data: null, error: null }];
      server.auth.signInWithPassword.mockResolvedValue({ data: { user: authUser() }, error: null });
      const res = await AuthService.signIn('user@test.com', 'pass');
      expect(res.success).toBe(false);
      expect(res.error).toBe('Esta cuenta ha sido desactivada por el administrador.');
      expect(server.auth.signOut).toHaveBeenCalled();
    });

    it('should_sign_out_when_profile_is_pending_approval_after_auth', async () => {
      admin.results.usuario = [
        fila(perfil()),
        fila(perfil({ aprobado: false })),
        { data: null, error: null },
      ];
      server.auth.signInWithPassword.mockResolvedValue({ data: { user: authUser() }, error: null });
      const res = await AuthService.signIn('user@test.com', 'pass');
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/no ha sido autorizada por un administrador/);
      expect(server.auth.signOut).toHaveBeenCalled();
    });

    it('should_create_profile_as_ejecutivo_when_profile_row_is_missing', async () => {
      admin.results.usuario = [
        fila(perfil()),
        { data: null, error: null },
        fila(perfil({ id: 'u-1' })),
      ];
      server.auth.signInWithPassword.mockResolvedValue({ data: { user: authUser() }, error: null });
      const res = await AuthService.signIn('user@test.com', 'pass');
      expect(res.success).toBe(true);
      const upsert = admin.callsTo('usuario').find((c) => c[0] === 'upsert');
      expect(upsert?.[1]).toMatchObject({ rol: 'ejecutivo', activo: true, intentos_fallidos: 0 });
    });

    it('should_create_profile_as_administrador_for_principal_email', async () => {
      admin.results.usuario = [
        fila(perfil({ email: ADMIN_PRINCIPAL })),
        { data: null, error: null },
        fila(perfil({ rol: 'administrador' })),
      ];
      server.auth.signInWithPassword.mockResolvedValue({
        data: { user: authUser({ email: ADMIN_PRINCIPAL }) },
        error: null,
      });
      await AuthService.signIn(ADMIN_PRINCIPAL, 'pass');
      const upsert = admin.callsTo('usuario').find((c) => c[0] === 'upsert');
      expect(upsert?.[1]).toMatchObject({ rol: 'administrador', nombre: 'Maic', apellido: 'Hernández' });
    });
  });

  describe('register', () => {
    it('should_reject_when_email_is_already_registered', async () => {
      admin.results.usuario = [fila({ id: 'u-9' })];
      const res = await AuthService.register({
        nombre: 'Juan',
        apellido: 'Pérez',
        email: 'user@test.com',
        password: 'secret123',
      });
      expect(res.success).toBe(false);
      expect(res.error).toBe('Ya existe un usuario registrado con ese correo.');
      expect(server.auth.signUp).not.toHaveBeenCalled();
    });

    it('should_normalize_email_to_lowercase', async () => {
      admin.results.usuario = [{ data: null, error: null }];
      server.auth.signUp.mockResolvedValue({ data: { user: authUser() }, error: null });
      await AuthService.register({
        nombre: ' Juan ',
        apellido: ' Pérez ',
        email: '  USER@Test.COM ',
        password: 'secret123',
      });
      expect(admin.callsTo('usuario')).toContainEqual(['eq', 'email', 'user@test.com']);
      expect(server.auth.signUp).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'user@test.com', password: 'secret123' })
      );
    });

    it('should_always_assign_ejecutivo_role_on_sign_up', async () => {
      admin.results.usuario = [{ data: null, error: null }];
      server.auth.signUp.mockResolvedValue({ data: { user: authUser() }, error: null });
      await AuthService.register({
        nombre: 'Juan',
        apellido: 'Pérez',
        email: 'user@test.com',
        password: 'secret123',
      });
      const metadata = server.auth.signUp.mock.calls[0][0].options.data;
      expect(metadata).toMatchObject({
        nombre: 'Juan',
        apellido: 'Pérez',
        sucursal_id: null,
        requiere_cambio_clave: false,
      });
      expect(metadata).not.toHaveProperty('rol');
      const upsert = admin.callsTo('usuario').find((c) => c[0] === 'upsert');
      expect(upsert?.[1]).toMatchObject({ rol: 'ejecutivo' });
    });

    it('should_mark_self_registered_account_as_pending_approval', async () => {
      admin.results.usuario = [{ data: null, error: null }];
      server.auth.signUp.mockResolvedValue({ data: { user: authUser() }, error: null });
      await AuthService.register({
        nombre: 'Juan',
        apellido: 'Pérez',
        email: 'user@test.com',
        password: 'secret123',
      });
      const metadata = server.auth.signUp.mock.calls[0][0].options.data;
      expect(metadata.aprobado).toBe(false);
      const upsert = admin.callsTo('usuario').find((c) => c[0] === 'upsert');
      expect(upsert?.[1]).toMatchObject({ aprobado: false });
    });

    it('should_send_sucursal_to_the_trigger_and_upsert', async () => {
      admin.results.usuario = [{ data: null, error: null }];
      admin.results.sucursal = [fila({ id: 5 })];
      server.auth.signUp.mockResolvedValue({ data: { user: authUser() }, error: null });

      const res = await AuthService.register({
        nombre: 'Juan',
        apellido: 'Pérez',
        email: 'user@test.com',
        password: 'secret123',
        sucursal_id: 5,
      });

      expect(res.success).toBe(true);
      expect(server.auth.signUp.mock.calls[0][0].options.data).toMatchObject({ sucursal_id: 5 });
      expect(admin.callsTo('sucursal')).toContainEqual(['eq', 'id', 5]);
      const upsert = admin.callsTo('usuario').find((c) => c[0] === 'upsert');
      expect(upsert?.[1]).toMatchObject({ sucursal_id: 5 });
    });

    it('should_reject_when_sucursal_does_not_exist', async () => {
      admin.results.usuario = [{ data: null, error: null }];
      admin.results.sucursal = [fila(null)];
      const res = await AuthService.register({
        nombre: 'Juan',
        apellido: 'Pérez',
        email: 'user@test.com',
        password: 'secret123',
        sucursal_id: 99,
      });
      expect(res).toEqual({ success: false, error: 'La sucursal seleccionada no es válida.' });
      expect(server.auth.signUp).not.toHaveBeenCalled();
    });

    it('should_assign_administrador_for_principal_email', async () => {
      admin.results.usuario = [{ data: null, error: null }];
      server.auth.signUp.mockResolvedValue({
        data: { user: authUser({ email: ADMIN_PRINCIPAL }) },
        error: null,
      });
      await AuthService.register({
        nombre: 'Maic',
        apellido: 'Hernández',
        email: ADMIN_PRINCIPAL,
        password: 'secret123',
      });
      const upsert = admin.callsTo('usuario').find((c) => c[0] === 'upsert');
      expect(upsert?.[1]).toMatchObject({ rol: 'administrador' });
    });

    it('should_approve_principal_admin_account', async () => {
      admin.results.usuario = [{ data: null, error: null }];
      server.auth.signUp.mockResolvedValue({
        data: { user: authUser({ email: ADMIN_PRINCIPAL }) },
        error: null,
      });
      await AuthService.register({
        nombre: 'Maic',
        apellido: 'Hernández',
        email: ADMIN_PRINCIPAL,
        password: 'secret123',
      });
      const upsert = admin.callsTo('usuario').find((c) => c[0] === 'upsert');
      expect(upsert?.[1]).toMatchObject({ aprobado: true });
    });

    it('should_confirm_email_on_registration', async () => {
      admin.results.usuario = [{ data: null, error: null }];
      server.auth.signUp.mockResolvedValue({ data: { user: authUser() }, error: null });
      await AuthService.register({
        nombre: 'Juan',
        apellido: 'Pérez',
        email: 'user@test.com',
        password: 'secret123',
      });
      expect(admin.auth.admin.updateUserById).toHaveBeenCalledWith('u-1', { email_confirm: true });
    });

    it('should_upsert_profile_even_when_trigger_created_it', async () => {
      admin.results.usuario = [{ data: null, error: null }];
      server.auth.signUp.mockResolvedValue({ data: { user: authUser() }, error: null });
      const res = await AuthService.register({
        nombre: 'Juan',
        apellido: 'Pérez',
        email: 'user@test.com',
        password: 'secret123',
      });
      expect(res.success).toBe(true);
      const upsert = admin.callsTo('usuario').find((c) => c[0] === 'upsert');
      expect(upsert?.[1]).toMatchObject({ email: 'user@test.com', activo: true });
    });

    it('should_return_error_when_sign_up_fails', async () => {
      admin.results.usuario = [{ data: null, error: null }];
      server.auth.signUp.mockResolvedValue({ data: { user: null }, error: { message: 'email tomado' } });
      const res = await AuthService.register({
        nombre: 'Juan',
        apellido: 'Pérez',
        email: 'user@test.com',
        password: 'secret123',
      });
      expect(res).toEqual({ success: false, error: 'email tomado' });
    });

    it('should_return_error_when_sign_up_returns_no_user', async () => {
      admin.results.usuario = [{ data: null, error: null }];
      server.auth.signUp.mockResolvedValue({ data: { user: null }, error: null });
      const res = await AuthService.register({
        nombre: 'Juan',
        apellido: 'Pérez',
        email: 'user@test.com',
        password: 'secret123',
      });
      expect(res.error).toBe('No se pudo crear la cuenta. Intenta nuevamente.');
    });
  });

  describe('updateProfile', () => {
    it('should_reject_when_session_is_invalid', async () => {
      server.auth.getUser.mockResolvedValue({ data: { user: null }, error: { message: 'no session' } });
      const res = await AuthService.updateProfile({ nombre: 'Juan', apellido: 'Pérez' });
      expect(res).toEqual({ success: false, error: 'Sesión no válida. Inicia sesión nuevamente.' });
    });

    it('should_reject_when_nombre_is_empty', async () => {
      server.auth.getUser.mockResolvedValue({ data: { user: authUser() }, error: null });
      const res = await AuthService.updateProfile({ nombre: '   ', apellido: 'Pérez' });
      expect(res).toEqual({ success: false, error: 'El nombre y el apellido son obligatorios.' });
    });

    it('should_reject_when_apellido_is_empty', async () => {
      server.auth.getUser.mockResolvedValue({ data: { user: authUser() }, error: null });
      const res = await AuthService.updateProfile({ nombre: 'Juan', apellido: '' });
      expect(res.error).toBe('El nombre y el apellido son obligatorios.');
    });

    it('should_update_profile_and_trim_fields', async () => {
      server.auth.getUser.mockResolvedValue({ data: { user: authUser() }, error: null });
      admin.results.usuario = [fila(perfil())];
      const res = await AuthService.updateProfile({
        nombre: ' Juan ',
        apellido: ' Pérez ',
        telefono: '  +56 9 1234 5678 ',
      });
      expect(res.success).toBe(true);
      const update = admin.callsTo('usuario').find((c) => c[0] === 'update');
      expect(update).toBeDefined();
      expect(update?.[1]).toEqual({ nombre: 'Juan', apellido: 'Pérez', telefono: '+56 9 1234 5678' });
      expect(admin.callsTo('usuario')).toContainEqual(['eq', 'id', 'u-1']);
    });

    it('should_store_null_telefono_when_not_provided', async () => {
      server.auth.getUser.mockResolvedValue({ data: { user: authUser() }, error: null });
      admin.results.usuario = [fila(perfil())];
      await AuthService.updateProfile({ nombre: 'Juan', apellido: 'Pérez' });
      const update = admin.callsTo('usuario').find((c) => c[0] === 'update');
      expect(update?.[1]).toMatchObject({ telefono: null });
    });

    it('should_return_error_when_update_fails', async () => {
      server.auth.getUser.mockResolvedValue({ data: { user: authUser() }, error: null });
      admin.results.usuario = [{ data: null, error: { message: 'columna inexistente' } }];
      const res = await AuthService.updateProfile({ nombre: 'Juan', apellido: 'Pérez' });
      expect(res).toEqual({ success: false, error: 'columna inexistente' });
    });
  });

  describe('getCurrentUserProfile', () => {
    it('should_return_null_when_session_is_invalid', async () => {
      server.auth.getUser.mockResolvedValue({ data: { user: null }, error: { message: 'x' } });
      expect(await AuthService.getCurrentUserProfile()).toBeNull();
    });

    it('should_return_profile_with_branch_name', async () => {
      server.auth.getUser.mockResolvedValue({ data: { user: authUser() }, error: null });
      server.results.usuario = [fila({ ...perfil(), sucursal: { nombre: 'Centro' } })];
      server.results.usuario_sucursal = [{ data: [], error: null }];
      server.results.usuario_zona = [{ data: [], error: null }];
      const res = await AuthService.getCurrentUserProfile();
      expect(res?.sucursal_nombre).toBe('Centro');
      expect(res?.sucursales).toEqual([]);
      expect(res?.zonas).toEqual([]);
    });

    it('should_map_assigned_branches_and_zones', async () => {
      server.auth.getUser.mockResolvedValue({ data: { user: authUser() }, error: null });
      server.results.usuario = [fila(perfil())];
      server.results.usuario_sucursal = [
        { data: [{ sucursal_id: 1, sucursal: { id: 1, nombre: 'Centro' } }], error: null },
      ];
      server.results.usuario_zona = [
        { data: [{ zona_id: 2, zona: [{ id: 2, nombre: 'Zona Norte' }] }], error: null },
      ];
      const res = await AuthService.getCurrentUserProfile();
      expect(res?.sucursales).toEqual([{ id: 1, nombre: 'Centro' }]);
      expect(res?.zonas).toEqual([{ id: 2, nombre: 'Zona Norte' }]);
    });

    it('should_sync_profile_when_usuario_row_is_missing', async () => {
      server.auth.getUser.mockResolvedValue({
        data: {
          user: authUser({
            user_metadata: { nombre: 'Ana', apellido: 'Díaz' },
          }),
        },
        error: null,
      });
      server.results.usuario = [{ data: null, error: { message: 'PGRST116' } }];
      admin.results.usuario = [fila(perfil({ nombre: 'Ana', apellido: 'Díaz' }))];
      const res = await AuthService.getCurrentUserProfile();
      const upsert = admin.callsTo('usuario').find((c) => c[0] === 'upsert');
      expect(upsert?.[1]).toMatchObject({ nombre: 'Ana', apellido: 'Díaz', rol: 'ejecutivo' });
      expect(res?.nombre).toBe('Ana');
    });

    it('should_return_null_when_sync_fails', async () => {
      server.auth.getUser.mockResolvedValue({ data: { user: authUser() }, error: null });
      server.results.usuario = [{ data: null, error: { message: 'PGRST116' } }];
      admin.results.usuario = [{ data: null, error: { message: 'violación' } }];
      expect(await AuthService.getCurrentUserProfile()).toBeNull();
    });
  });

  describe('updatePassword', () => {
    it('should_reject_when_password_is_shorter_than_8_characters', async () => {
      const res = await AuthService.updatePassword('corta');
      expect(res).toEqual({ success: false, error: 'La contraseña debe tener al menos 8 caracteres.' });
      expect(server.auth.getUser).not.toHaveBeenCalled();
    });

    it('should_reject_when_session_is_invalid', async () => {
      server.auth.getUser.mockResolvedValue({ data: { user: null }, error: { message: 'x' } });
      const res = await AuthService.updatePassword('secreto123');
      expect(res).toEqual({
        success: false,
        error: 'Sesión no válida o expirada. Por favor solicita un nuevo enlace.',
      });
    });

    it('should_update_password_and_clear_requirements', async () => {
      server.auth.getUser.mockResolvedValue({ data: { user: authUser() }, error: null });
      server.auth.updateUser.mockResolvedValue({ data: { user: authUser() }, error: null });
      const res = await AuthService.updatePassword('secreto123');
      expect(res).toEqual({ success: true });
      expect(server.auth.updateUser).toHaveBeenCalledWith({ password: 'secreto123' });
      const update = admin.callsTo('usuario').find((c) => c[0] === 'update');
      expect(update?.[1]).toEqual({ requiere_cambio_clave: false, intentos_fallidos: 0, bloqueado_hasta: null });
      expect(admin.callsTo('usuario')).toContainEqual(['eq', 'id', 'u-1']);
    });

    it('should_return_error_when_update_fails', async () => {
      server.auth.getUser.mockResolvedValue({ data: { user: authUser() }, error: null });
      server.auth.updateUser.mockResolvedValue({ data: { user: null }, error: { message: 'clave débil' } });
      const res = await AuthService.updatePassword('12345678');
      expect(res).toEqual({ success: false, error: 'clave débil' });
    });
  });

  describe('sendPasswordResetEmail', () => {
    it('should_reject_when_account_is_deactivated', async () => {
      admin.results.usuario = [fila({ activo: false })];
      const res = await AuthService.sendPasswordResetEmail('user@test.com');
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/cuenta desactivada/);
      expect(server.auth.resetPasswordForEmail).not.toHaveBeenCalled();
    });

    it('should_send_reset_email_for_active_account', async () => {
      admin.results.usuario = [fila({ activo: true })];
      const res = await AuthService.sendPasswordResetEmail('  USER@Test.COM ');
      expect(res).toEqual({ success: true });
      expect(server.auth.resetPasswordForEmail).toHaveBeenCalledWith('user@test.com', {
        redirectTo: expect.stringContaining('/auth/callback?next=/establecer-clave'),
      });
    });

    it('should_use_provided_redirect_url', async () => {
      admin.results.usuario = [fila({ activo: true })];
      await AuthService.sendPasswordResetEmail('user@test.com', 'https://app.test/reset');
      expect(server.auth.resetPasswordForEmail).toHaveBeenCalledWith('user@test.com', {
        redirectTo: 'https://app.test/reset',
      });
    });

    it('should_return_error_when_supabase_fails', async () => {
      admin.results.usuario = [fila({ activo: true })];
      server.auth.resetPasswordForEmail.mockResolvedValue({
        data: {},
        error: { message: 'rate limited' },
      });
      const res = await AuthService.sendPasswordResetEmail('user@test.com');
      expect(res).toEqual({ success: false, error: 'rate limited' });
    });
  });

  describe('signOut', () => {
    it('should_close_the_current_session', async () => {
      await AuthService.signOut();
      expect(server.auth.signOut).toHaveBeenCalled();
    });
  });
});
