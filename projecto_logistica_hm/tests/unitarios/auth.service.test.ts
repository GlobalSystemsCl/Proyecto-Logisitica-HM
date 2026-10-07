import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSupabaseMock, fila } from '../mocks/supabase';
import { authUser, createServerClientMock } from '../mocks/supabase-server';

const admin = createSupabaseMock();
const server = createServerClientMock();

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => admin }));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => server }));

const {
  AuthService,
  MENSAJE_LOGIN_FALLIDO,
  MENSAJE_PENDIENTE_APROBACION,
  MENSAJE_CUENTA_DESACTIVADA,
} = await import('@/services/auth.service');

const ADMIN_PRINCIPAL = 'principal@empresa.test';
const CLAVE_VALIDA = 'Secreto2026x';

function perfil(overrides: Record<string, unknown> = {}) {
  return {
    id: 'u-1',
    email: 'user@test.com',
    nombre: 'Juan',
    apellido: 'Pérez',
    rol: 'ejecutivo',
    activo: true,
    aprobado: true,
    requiere_cambio_clave: false,
    ...overrides,
  };
}

const credencialesInvalidas = {
  data: { user: null },
  error: { message: 'Invalid login credentials' },
};

describe('AuthService', () => {
  beforeEach(() => {
    admin.reset();
    server.reset();
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-15T12:00:00Z'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubEnv('ADMIN_PRINCIPAL_EMAIL', ADMIN_PRINCIPAL);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  describe('signIn', () => {
    it('should_normalize_email_before_querying', async () => {
      admin.results.usuario = [fila(perfil())];
      await AuthService.signIn('  USER@Test.COM ', 'pass');
      expect(admin.callsTo('usuario')).toContainEqual(['eq', 'email', 'user@test.com']);
    });

    it('should_not_try_password_and_return_generic_message_when_account_is_locked', async () => {
      admin.results.usuario = [
        fila(perfil({ bloqueado_hasta: '2026-01-15T12:10:00Z', intentos_fallidos: 5 })),
      ];
      const res = await AuthService.signIn('user@test.com', 'pass');
      expect(res).toEqual({ success: false, error: MENSAJE_LOGIN_FALLIDO });
      expect(server.auth.signInWithPassword).not.toHaveBeenCalled();
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

    it('should_return_same_message_when_user_does_not_exist_or_password_is_wrong', async () => {
      // Brecha 012: no se puede distinguir una cuenta existente por el mensaje.
      admin.results.usuario = [{ data: null, error: { message: 'PGRST116' } }];
      server.auth.signInWithPassword.mockResolvedValue(credencialesInvalidas);
      const inexistente = await AuthService.signIn('nadie@test.com', 'wrong');

      admin.reset();
      admin.results.usuario = [fila(perfil({ intentos_fallidos: 2 }))];
      const existente = await AuthService.signIn('user@test.com', 'wrong');

      expect(inexistente).toEqual({ success: false, error: MENSAJE_LOGIN_FALLIDO });
      expect(existente).toEqual(inexistente);
    });

    it('should_not_register_attempt_when_user_does_not_exist', async () => {
      admin.results.usuario = [{ data: null, error: { message: 'PGRST116' } }];
      server.auth.signInWithPassword.mockResolvedValue(credencialesInvalidas);
      await AuthService.signIn('nadie@test.com', 'wrong');
      expect(admin.rpc).not.toHaveBeenCalled();
    });

    it('should_increment_attempts_atomically_through_rpc_on_failure', async () => {
      admin.results.usuario = [fila(perfil({ intentos_fallidos: 1, id: 'u-7' }))];
      server.auth.signInWithPassword.mockResolvedValue(credencialesInvalidas);

      await AuthService.signIn('user@test.com', 'wrong');

      expect(admin.rpc).toHaveBeenCalledWith('fn_registrar_intento_fallido', {
        p_usuario_id: 'u-7',
        p_max_intentos: 5,
        p_minutos_bloqueo: 15,
      });
      expect(admin.callsTo('usuario').some((c) => c[0] === 'update')).toBe(false);
    });

    it('should_fallback_to_direct_update_when_rpc_is_missing', async () => {
      admin.rpc.mockResolvedValueOnce({ data: null, error: { message: 'function does not exist' } });
      admin.results.usuario = [fila(perfil({ intentos_fallidos: 1, id: 'u-7' })), { data: null, error: null }];
      server.auth.signInWithPassword.mockResolvedValue(credencialesInvalidas);

      await AuthService.signIn('user@test.com', 'wrong');

      const update = admin.callsTo('usuario').find((c) => c[0] === 'update');
      expect(update?.[1]).toEqual({ intentos_fallidos: 2, bloqueado_hasta: null });
      expect(admin.callsTo('usuario')).toContainEqual(['eq', 'id', 'u-7']);
    });

    it('should_block_for_15_minutes_in_fallback_after_5_failed_attempts', async () => {
      admin.rpc.mockResolvedValueOnce({ data: null, error: { message: 'function does not exist' } });
      admin.results.usuario = [fila(perfil({ intentos_fallidos: 4 })), { data: null, error: null }];
      server.auth.signInWithPassword.mockResolvedValue(credencialesInvalidas);

      const res = await AuthService.signIn('user@test.com', 'wrong');

      expect(res.error).toBe(MENSAJE_LOGIN_FALLIDO);
      const update = admin.callsTo('usuario').find((c) => c[0] === 'update');
      expect(update?.[1]).toEqual({ intentos_fallidos: 5, bloqueado_hasta: '2026-01-15T12:15:00.000Z' });
    });

    it('should_reject_with_generic_message_when_auth_returns_no_user', async () => {
      admin.results.usuario = [fila(perfil())];
      server.auth.signInWithPassword.mockResolvedValue({ data: { user: null }, error: null });
      const res = await AuthService.signIn('user@test.com', 'pass');
      expect(res).toEqual({ success: false, error: MENSAJE_LOGIN_FALLIDO });
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

    it('should_reveal_deactivation_only_after_valid_password_and_sign_out', async () => {
      admin.results.usuario = [fila(perfil({ activo: false })), fila(perfil({ activo: false }))];
      server.auth.signInWithPassword.mockResolvedValue({ data: { user: authUser() }, error: null });
      const res = await AuthService.signIn('user@test.com', 'pass');
      expect(res).toEqual({ success: false, error: MENSAJE_CUENTA_DESACTIVADA });
      expect(server.auth.signOut).toHaveBeenCalled();
      expect(admin.callsTo('usuario').some((c) => c[0] === 'update')).toBe(false);
    });

    it('should_sign_out_when_profile_is_pending_approval_after_auth', async () => {
      admin.results.usuario = [
        fila(perfil({ aprobado: false, activo: false })),
        fila(perfil({ aprobado: false, activo: false })),
      ];
      server.auth.signInWithPassword.mockResolvedValue({ data: { user: authUser() }, error: null });
      const res = await AuthService.signIn('user@test.com', 'pass');
      expect(res).toEqual({ success: false, error: MENSAJE_PENDIENTE_APROBACION });
      expect(server.auth.signOut).toHaveBeenCalled();
    });

    it('should_register_missing_profile_as_pending_and_deny_access', async () => {
      admin.results.usuario = [fila(perfil()), { data: null, error: null }, { data: null, error: null }];
      server.auth.signInWithPassword.mockResolvedValue({ data: { user: authUser() }, error: null });

      const res = await AuthService.signIn('user@test.com', 'pass');

      expect(res).toEqual({ success: false, error: MENSAJE_PENDIENTE_APROBACION });
      const upsert = admin.callsTo('usuario').find((c) => c[0] === 'upsert');
      expect(upsert?.[1]).toMatchObject({ rol: 'ejecutivo', activo: false, aprobado: false });
      expect(server.auth.signOut).toHaveBeenCalled();
    });

    it('should_never_create_administrador_for_principal_email', async () => {
      // Brecha 025: el correo del admin principal ya no otorga rol.
      admin.results.usuario = [fila(perfil({ email: ADMIN_PRINCIPAL })), { data: null, error: null }];
      server.auth.signInWithPassword.mockResolvedValue({
        data: { user: authUser({ email: ADMIN_PRINCIPAL }) },
        error: null,
      });
      await AuthService.signIn(ADMIN_PRINCIPAL, 'pass');
      const upsert = admin.callsTo('usuario').find((c) => c[0] === 'upsert');
      expect(upsert?.[1]).toMatchObject({ rol: 'ejecutivo' });
    });
  });

  describe('register', () => {
    const datos = (overrides: Record<string, unknown> = {}) => ({
      nombre: 'Juan',
      apellido: 'Pérez',
      email: 'user@test.com',
      password: CLAVE_VALIDA,
      ...overrides,
    });

    it('should_reject_when_email_is_already_registered', async () => {
      admin.results.usuario = [fila({ id: 'u-9' })];
      const res = await AuthService.register(datos());
      expect(res).toEqual({ success: false, error: 'Ya existe un usuario registrado con ese correo.' });
      expect(server.auth.signUp).not.toHaveBeenCalled();
    });

    it('should_reject_when_email_format_is_invalid', async () => {
      const res = await AuthService.register(datos({ email: 'correo-sin-arroba' }));
      expect(res.error).toBe('El formato del correo electrónico no es válido.');
      expect(server.auth.signUp).not.toHaveBeenCalled();
      expect(admin.callsTo('usuario')).toHaveLength(0);
    });

    it('should_reject_when_password_does_not_meet_policy', async () => {
      const res = await AuthService.register(datos({ password: 'secret123' }));
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/al menos 10 caracteres/);
      expect(server.auth.signUp).not.toHaveBeenCalled();
    });

    it('should_reject_when_password_exceeds_max_length', async () => {
      const res = await AuthService.register(datos({ password: 'Aa1' + 'a'.repeat(70) }));
      expect(res.error).toBe('La contraseña no puede superar los 72 caracteres.');
    });

    it('should_reject_when_name_contains_html', async () => {
      const res = await AuthService.register(datos({ nombre: '<b>Juan</b>' }));
      expect(res.error).toBe('El nombre contiene caracteres no permitidos.');
    });

    it('should_translate_signup_error_when_email_is_already_in_auth', async () => {
      admin.results.usuario = [{ data: null, error: null }];
      server.auth.signUp.mockResolvedValue({ data: { user: null }, error: { message: 'User already registered' } });
      const res = await AuthService.register(datos());
      expect(res).toEqual({ success: false, error: 'Ya existe un usuario registrado con ese correo.' });
    });

    it('should_normalize_email_to_lowercase', async () => {
      admin.results.usuario = [{ data: null, error: null }];
      server.auth.signUp.mockResolvedValue({ data: { user: authUser() }, error: null });
      await AuthService.register(datos({ nombre: ' Juan ', apellido: ' Pérez ', email: '  USER@Test.COM ' }));
      expect(admin.callsTo('usuario')).toContainEqual(['eq', 'email', 'user@test.com']);
      expect(server.auth.signUp).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'user@test.com', password: CLAVE_VALIDA })
      );
    });

    it('should_never_send_role_or_approval_in_signup_metadata', async () => {
      admin.results.usuario = [{ data: null, error: null }];
      server.auth.signUp.mockResolvedValue({ data: { user: authUser() }, error: null });
      await AuthService.register(datos());
      const metadata = server.auth.signUp.mock.calls[0][0].options.data;
      expect(metadata).toEqual({ nombre: 'Juan', apellido: 'Pérez', sucursal_id: null });
    });

    it('should_create_profile_as_inactive_pending_ejecutivo', async () => {
      admin.results.usuario = [{ data: null, error: null }];
      server.auth.signUp.mockResolvedValue({ data: { user: authUser() }, error: null });
      const res = await AuthService.register(datos());
      expect(res).toEqual({ success: true });
      const upsert = admin.callsTo('usuario').find((c) => c[0] === 'upsert');
      expect(upsert?.[1]).toMatchObject({
        email: 'user@test.com',
        rol: 'ejecutivo',
        activo: false,
        aprobado: false,
      });
    });

    it('should_send_sucursal_to_the_trigger_and_upsert', async () => {
      admin.results.usuario = [{ data: null, error: null }];
      admin.results.sucursal = [fila({ id: 5 })];
      server.auth.signUp.mockResolvedValue({ data: { user: authUser() }, error: null });

      const res = await AuthService.register(datos({ sucursal_id: 5 }));

      expect(res.success).toBe(true);
      expect(server.auth.signUp.mock.calls[0][0].options.data).toMatchObject({ sucursal_id: 5 });
      expect(admin.callsTo('sucursal')).toContainEqual(['eq', 'id', 5]);
      const upsert = admin.callsTo('usuario').find((c) => c[0] === 'upsert');
      expect(upsert?.[1]).toMatchObject({ sucursal_id: 5 });
    });

    it('should_reject_when_sucursal_does_not_exist', async () => {
      admin.results.usuario = [{ data: null, error: null }];
      admin.results.sucursal = [fila(null)];
      const res = await AuthService.register(datos({ sucursal_id: 99 }));
      expect(res).toEqual({ success: false, error: 'La sucursal seleccionada no es válida.' });
      expect(server.auth.signUp).not.toHaveBeenCalled();
    });

    it('should_reject_admin_principal_email_on_self_registration', async () => {
      const res = await AuthService.register(datos({ email: ADMIN_PRINCIPAL.toUpperCase() }));
      expect(res).toEqual({
        success: false,
        error: 'El correo del Administrador Principal no puede registrarse de forma autónoma.',
      });
      expect(server.auth.signUp).not.toHaveBeenCalled();
    });

    it('should_confirm_email_on_registration', async () => {
      admin.results.usuario = [{ data: null, error: null }];
      server.auth.signUp.mockResolvedValue({ data: { user: authUser() }, error: null });
      await AuthService.register(datos());
      expect(admin.auth.admin.updateUserById).toHaveBeenCalledWith('u-1', { email_confirm: true });
    });

    it('should_return_error_when_profile_upsert_fails', async () => {
      admin.results.usuario = [{ data: null, error: null }, { data: null, error: { message: 'column x' } }];
      server.auth.signUp.mockResolvedValue({ data: { user: authUser() }, error: null });
      const res = await AuthService.register(datos());
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/^No se pudo completar el registro/);
      expect(res.error).not.toContain('column');
    });

    it('should_return_generic_error_when_sign_up_fails', async () => {
      admin.results.usuario = [{ data: null, error: null }];
      server.auth.signUp.mockResolvedValue({ data: { user: null }, error: { message: 'smtp down at 10.0.0.1' } });
      const res = await AuthService.register(datos());
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/^No se pudo crear la cuenta\./);
      expect(res.error).not.toContain('10.0.0.1');
    });

    it('should_return_error_when_sign_up_returns_no_user', async () => {
      admin.results.usuario = [{ data: null, error: null }];
      server.auth.signUp.mockResolvedValue({ data: { user: null }, error: null });
      const res = await AuthService.register(datos());
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

    it('should_reject_when_name_contains_html', async () => {
      server.auth.getUser.mockResolvedValue({ data: { user: authUser() }, error: null });
      const res = await AuthService.updateProfile({ nombre: 'Juan', apellido: '<i>x</i>' });
      expect(res.error).toBe('El apellido contiene caracteres no permitidos.');
      expect(admin.callsTo('usuario')).toHaveLength(0);
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

    it('should_return_generic_error_when_update_fails', async () => {
      server.auth.getUser.mockResolvedValue({ data: { user: authUser() }, error: null });
      admin.results.usuario = [{ data: null, error: { message: 'columna inexistente' } }];
      const res = await AuthService.updateProfile({ nombre: 'Juan', apellido: 'Pérez' });
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/^No se pudo actualizar el perfil\./);
      expect(res.error).not.toContain('columna');
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
      server.results.sucursal = [{ data: [], error: null }];
      server.results.usuario_zona = [{ data: [], error: null }];
      const res = await AuthService.getCurrentUserProfile();
      expect(res?.sucursal_nombre).toBe('Centro');
      expect(res?.sucursales).toEqual([]);
      expect(res?.zonas).toEqual([]);
    });

    it('should_map_assigned_branches_and_zones', async () => {
      server.auth.getUser.mockResolvedValue({ data: { user: authUser() }, error: null });
      server.results.usuario = [fila(perfil())];
      server.results.sucursal = [{ data: [{ id: 1, nombre: 'Centro' }], error: null }];
      server.results.usuario_zona = [
        { data: [{ zona_id: 2, zona: [{ id: 2, nombre: 'Zona Norte' }] }], error: null },
      ];
      const res = await AuthService.getCurrentUserProfile();
      expect(res?.sucursales).toEqual([{ id: 1, nombre: 'Centro' }]);
      expect(res?.zonas).toEqual([{ id: 2, nombre: 'Zona Norte' }]);
    });

    it('should_register_missing_profile_as_pending_and_return_null', async () => {
      server.auth.getUser.mockResolvedValue({
        data: { user: authUser({ user_metadata: { nombre: 'Ana', apellido: 'Díaz', rol: 'administrador' } }) },
        error: null,
      });
      server.results.usuario = [{ data: null, error: { message: 'PGRST116' } }];
      admin.results.usuario = [{ data: null, error: null }];

      const res = await AuthService.getCurrentUserProfile();

      expect(res).toBeNull();
      const upsert = admin.callsTo('usuario').find((c) => c[0] === 'upsert');
      expect(upsert?.[1]).toMatchObject({
        nombre: 'Ana',
        apellido: 'Díaz',
        rol: 'ejecutivo',
        activo: false,
        aprobado: false,
      });
      expect(upsert?.[2]).toEqual({ onConflict: 'id', ignoreDuplicates: true });
    });

    it('should_return_null_when_registering_missing_profile_fails', async () => {
      server.auth.getUser.mockResolvedValue({ data: { user: authUser() }, error: null });
      server.results.usuario = [{ data: null, error: { message: 'PGRST116' } }];
      admin.results.usuario = [{ data: null, error: { message: 'violación' } }];
      expect(await AuthService.getCurrentUserProfile()).toBeNull();
    });
  });

  describe('registrarIntentoFallido', () => {
    it('should_use_rpc_without_direct_update_when_available', async () => {
      await AuthService.registrarIntentoFallido(admin as never, perfil({ id: 'u-3' }) as never);
      expect(admin.rpc).toHaveBeenCalledWith('fn_registrar_intento_fallido', expect.objectContaining({ p_usuario_id: 'u-3' }));
      expect(admin.callsTo('usuario')).toHaveLength(0);
    });

    it('should_treat_null_counter_as_zero_in_fallback', async () => {
      admin.rpc.mockResolvedValueOnce({ data: null, error: { message: 'x' } });
      await AuthService.registrarIntentoFallido(admin as never, perfil({ intentos_fallidos: null }) as never);
      expect(admin.callsTo('usuario')).toContainEqual(['update', { intentos_fallidos: 1, bloqueado_hasta: null }]);
    });
  });

  describe('updatePassword', () => {
    it('should_reject_when_password_does_not_meet_policy', async () => {
      const res = await AuthService.updatePassword('corta');
      expect(res).toEqual({ success: false, error: 'La contraseña debe tener al menos 10 caracteres.' });
      expect(server.auth.getUser).not.toHaveBeenCalled();
    });

    it('should_reject_when_session_is_invalid', async () => {
      server.auth.getUser.mockResolvedValue({ data: { user: null }, error: { message: 'x' } });
      const res = await AuthService.updatePassword(CLAVE_VALIDA);
      expect(res).toEqual({
        success: false,
        error: 'Sesión no válida o expirada. Por favor solicita un nuevo enlace.',
      });
    });

    it('should_update_password_and_clear_requirements', async () => {
      server.auth.getUser.mockResolvedValue({ data: { user: authUser() }, error: null });
      server.auth.updateUser.mockResolvedValue({ data: { user: authUser() }, error: null });
      const res = await AuthService.updatePassword(CLAVE_VALIDA);
      expect(res).toEqual({ success: true });
      expect(server.auth.updateUser).toHaveBeenCalledWith({ password: CLAVE_VALIDA });
      const update = admin.callsTo('usuario').find((c) => c[0] === 'update');
      expect(update?.[1]).toEqual({ requiere_cambio_clave: false, intentos_fallidos: 0, bloqueado_hasta: null });
      expect(admin.callsTo('usuario')).toContainEqual(['eq', 'id', 'u-1']);
    });

    it('should_translate_known_auth_error_codes', async () => {
      server.auth.getUser.mockResolvedValue({ data: { user: authUser() }, error: null });
      server.auth.updateUser.mockResolvedValue({ data: { user: null }, error: { message: 'x', code: 'same_password' } });
      expect((await AuthService.updatePassword(CLAVE_VALIDA)).error).toBe(
        'La nueva contraseña debe ser distinta de la anterior.'
      );

      server.auth.updateUser.mockResolvedValue({ data: { user: null }, error: { message: 'x', code: 'weak_password' } });
      expect((await AuthService.updatePassword(CLAVE_VALIDA)).error).toMatch(/demasiado débil/);
    });

    it('should_return_generic_error_when_update_fails', async () => {
      server.auth.getUser.mockResolvedValue({ data: { user: authUser() }, error: null });
      server.auth.updateUser.mockResolvedValue({ data: { user: null }, error: { message: 'internal 500' } });
      const res = await AuthService.updatePassword(CLAVE_VALIDA);
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/^No se pudo actualizar la contraseña\./);
    });
  });

  describe('sendPasswordResetEmail', () => {
    it('should_report_success_without_sending_when_account_is_deactivated', async () => {
      admin.results.usuario = [fila({ activo: false, aprobado: true })];
      const res = await AuthService.sendPasswordResetEmail('user@test.com');
      expect(res).toEqual({ success: true });
      expect(server.auth.resetPasswordForEmail).not.toHaveBeenCalled();
    });

    it('should_report_success_without_sending_when_account_does_not_exist', async () => {
      admin.results.usuario = [{ data: null, error: { message: 'PGRST116' } }];
      const res = await AuthService.sendPasswordResetEmail('nadie@test.com');
      expect(res).toEqual({ success: true });
      expect(server.auth.resetPasswordForEmail).not.toHaveBeenCalled();
    });

    it('should_report_success_without_sending_when_account_is_pending', async () => {
      admin.results.usuario = [fila({ activo: false, aprobado: false })];
      expect(await AuthService.sendPasswordResetEmail('user@test.com')).toEqual({ success: true });
      expect(server.auth.resetPasswordForEmail).not.toHaveBeenCalled();
    });

    it('should_send_reset_email_for_active_account', async () => {
      admin.results.usuario = [fila({ activo: true, aprobado: true })];
      const res = await AuthService.sendPasswordResetEmail('  USER@Test.COM ');
      expect(res).toEqual({ success: true });
      expect(server.auth.resetPasswordForEmail).toHaveBeenCalledWith('user@test.com', {
        redirectTo: 'http://localhost:3000/auth/callback?next=/establecer-clave',
      });
    });

    it('should_use_provided_redirect_url', async () => {
      admin.results.usuario = [fila({ activo: true })];
      await AuthService.sendPasswordResetEmail('user@test.com', 'https://app.test/reset');
      expect(server.auth.resetPasswordForEmail).toHaveBeenCalledWith('user@test.com', {
        redirectTo: 'https://app.test/reset',
      });
    });

    it('should_return_generic_error_when_supabase_fails', async () => {
      admin.results.usuario = [fila({ activo: true })];
      server.auth.resetPasswordForEmail.mockResolvedValue({ data: {}, error: { message: 'rate limited' } });
      const res = await AuthService.sendPasswordResetEmail('user@test.com');
      expect(res).toEqual({
        success: false,
        error: 'No se pudo enviar el correo en este momento. Intenta más tarde.',
      });
    });
  });

  describe('signOut', () => {
    it('should_close_the_current_session', async () => {
      await AuthService.signOut();
      expect(server.auth.signOut).toHaveBeenCalled();
    });
  });
});
