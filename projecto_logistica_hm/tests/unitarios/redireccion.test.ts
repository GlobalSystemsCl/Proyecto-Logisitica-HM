import { describe, expect, it } from 'vitest';
import { destinoCallbackSeguro } from '@/lib/redireccion';

describe('destinoCallbackSeguro', () => {
  it('should_return_next_when_it_is_whitelisted', () => {
    expect(destinoCallbackSeguro('/establecer-clave')).toBe('/establecer-clave');
    expect(destinoCallbackSeguro('/dashboard')).toBe('/dashboard');
  });

  it('should_return_default_when_next_is_other_internal_route', () => {
    expect(destinoCallbackSeguro('/admin/usuarios')).toBe('/establecer-clave');
  });

  it('should_return_default_when_next_is_external_or_protocol_relative', () => {
    expect(destinoCallbackSeguro('https://evil.test')).toBe('/establecer-clave');
    expect(destinoCallbackSeguro('//evil.test')).toBe('/establecer-clave');
  });

  it('should_return_default_when_next_is_missing', () => {
    expect(destinoCallbackSeguro(null)).toBe('/establecer-clave');
    expect(destinoCallbackSeguro(undefined)).toBe('/establecer-clave');
    expect(destinoCallbackSeguro('')).toBe('/establecer-clave');
  });
});
