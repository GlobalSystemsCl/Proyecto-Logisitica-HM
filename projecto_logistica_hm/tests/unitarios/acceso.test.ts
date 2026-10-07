import { describe, expect, it } from 'vitest';
import { decidirAcceso, esRutaAuth, motivoCuentaBloqueada, type EstadoCuenta } from '@/lib/auth/acceso';

const cuentaOk: EstadoCuenta = { activo: true, aprobado: true, requiere_cambio_clave: false };

describe('esRutaAuth', () => {
  it('should_return_true_when_path_is_login_or_registro', () => {
    expect(esRutaAuth('/login')).toBe(true);
    expect(esRutaAuth('/registro')).toBe(true);
    expect(esRutaAuth('/auth/callback')).toBe(true);
  });

  it('should_return_false_when_path_is_private', () => {
    expect(esRutaAuth('/dashboard')).toBe(false);
    expect(esRutaAuth('/login/otra')).toBe(false);
  });
});

describe('motivoCuentaBloqueada', () => {
  it('should_return_null_when_account_is_active_and_approved', () => {
    expect(motivoCuentaBloqueada(cuentaOk)).toBeNull();
  });

  it('should_return_pendiente_when_account_is_not_approved', () => {
    expect(motivoCuentaBloqueada({ ...cuentaOk, aprobado: false, activo: false })).toBe('pendiente_aprobacion');
  });

  it('should_return_deactivated_when_account_is_inactive', () => {
    expect(motivoCuentaBloqueada({ ...cuentaOk, activo: false })).toBe('account_deactivated');
  });

  it('should_return_deactivated_when_profile_row_is_missing', () => {
    expect(motivoCuentaBloqueada(null)).toBe('account_deactivated');
  });
});

describe('decidirAcceso', () => {
  describe('sin sesión', () => {
    it('should_continue_when_route_is_public', () => {
      expect(decidirAcceso('/login', false, null)).toEqual({ accion: 'continuar' });
      expect(decidirAcceso('/', false, null)).toEqual({ accion: 'continuar' });
      expect(decidirAcceso('/establecer-clave', false, null)).toEqual({ accion: 'continuar' });
    });

    it('should_redirect_to_login_when_route_is_private', () => {
      expect(decidirAcceso('/solicitudes', false, null)).toEqual({ accion: 'redirigir', destino: '/login' });
    });
  });

  describe('con sesión', () => {
    it('should_continue_when_account_is_ok_and_route_is_private', () => {
      expect(decidirAcceso('/solicitudes', true, cuentaOk)).toEqual({ accion: 'continuar' });
    });

    it('should_redirect_to_dashboard_when_account_is_ok_and_route_is_auth', () => {
      expect(decidirAcceso('/login', true, cuentaOk)).toEqual({ accion: 'redirigir', destino: '/dashboard' });
    });

    it('should_sign_out_and_redirect_when_account_is_not_approved', () => {
      const cuenta = { ...cuentaOk, aprobado: false, activo: false };
      expect(decidirAcceso('/dashboard', true, cuenta)).toEqual({
        accion: 'redirigir',
        destino: '/login',
        error: 'pendiente_aprobacion',
        cerrarSesion: true,
      });
    });

    it('should_sign_out_and_redirect_when_account_is_deactivated', () => {
      expect(decidirAcceso('/admin/usuarios', true, { ...cuentaOk, activo: false })).toEqual({
        accion: 'redirigir',
        destino: '/login',
        error: 'account_deactivated',
        cerrarSesion: true,
      });
    });

    it('should_sign_out_without_redirect_loop_when_blocked_account_is_on_login', () => {
      expect(decidirAcceso('/login', true, { ...cuentaOk, activo: false })).toEqual({
        accion: 'continuar',
        cerrarSesion: true,
      });
    });

    it('should_sign_out_when_profile_row_is_missing', () => {
      const res = decidirAcceso('/dashboard', true, null);
      expect(res).toMatchObject({ accion: 'redirigir', cerrarSesion: true });
    });

    it('should_redirect_to_establecer_clave_when_password_change_is_required', () => {
      const cuenta = { ...cuentaOk, requiere_cambio_clave: true };
      expect(decidirAcceso('/solicitudes', true, cuenta)).toEqual({
        accion: 'redirigir',
        destino: '/establecer-clave',
      });
      expect(decidirAcceso('/', true, cuenta)).toEqual({ accion: 'redirigir', destino: '/establecer-clave' });
    });

    it('should_allow_establecer_clave_and_callback_when_password_change_is_required', () => {
      const cuenta = { ...cuentaOk, requiere_cambio_clave: true };
      expect(decidirAcceso('/establecer-clave', true, cuenta)).toEqual({ accion: 'continuar' });
      expect(decidirAcceso('/auth/callback', true, cuenta)).toEqual({ accion: 'continuar' });
    });

    it('should_continue_when_authenticated_user_opens_auth_callback', () => {
      expect(decidirAcceso('/auth/callback', true, cuentaOk)).toEqual({ accion: 'continuar' });
    });
  });
});
