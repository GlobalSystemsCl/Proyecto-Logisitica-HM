import { afterEach, describe, expect, it, vi } from 'vitest';
import { getAppUrl } from '@/lib/env';

describe('getAppUrl', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('should_return_configured_url_without_trailing_slash', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://logistica.hmotores.cl/');
    expect(getAppUrl()).toBe('https://logistica.hmotores.cl');
  });

  it('should_return_localhost_when_missing_in_development', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', '');
    vi.stubEnv('NODE_ENV', 'development');
    expect(getAppUrl()).toBe('http://localhost:3000');
  });

  it('should_throw_when_missing_in_production', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', '  ');
    vi.stubEnv('NODE_ENV', 'production');
    expect(() => getAppUrl()).toThrow('Falta la variable de entorno NEXT_PUBLIC_APP_URL.');
  });
});
