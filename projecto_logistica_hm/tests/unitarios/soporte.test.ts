import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getSoporteEmail, mensajeCuentaDesactivada } from '@/lib/soporte';

describe('getSoporteEmail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('should_return_trimmed_email_when_env_is_set', () => {
    vi.stubEnv('NEXT_PUBLIC_SOPORTE_EMAIL', '  soporte@hmotores.cl ');
    expect(getSoporteEmail()).toBe('soporte@hmotores.cl');
  });

  it('should_return_null_when_env_is_missing_or_blank', () => {
    vi.stubEnv('NEXT_PUBLIC_SOPORTE_EMAIL', '   ');
    expect(getSoporteEmail()).toBeNull();
  });
});

describe('mensajeCuentaDesactivada', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('should_include_support_email_when_configured', () => {
    vi.stubEnv('NEXT_PUBLIC_SOPORTE_EMAIL', 'soporte@hmotores.cl');
    expect(mensajeCuentaDesactivada()).toBe(
      'Tu cuenta fue desactivada. Para consultas o para volver a activarla, escribe a un encargado de la plataforma a soporte@hmotores.cl.'
    );
  });

  it('should_ask_to_contact_platform_manager_when_email_is_not_configured', () => {
    vi.stubEnv('NEXT_PUBLIC_SOPORTE_EMAIL', '');
    expect(mensajeCuentaDesactivada()).toBe(
      'Tu cuenta fue desactivada. Para consultas o para volver a activarla, contacta a un encargado de la plataforma.'
    );
  });
});
