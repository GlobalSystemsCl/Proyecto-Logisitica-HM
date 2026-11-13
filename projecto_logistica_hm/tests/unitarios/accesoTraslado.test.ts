import { describe, expect, it } from 'vitest';
import { puedeAccederTraslado } from '@/lib/accesoTraslado';

const traslado = { logistica_id: 'log-1', origen_id: 101, destino_id: 135 };

describe('puedeAccederTraslado', () => {
  it('should_allow_admin_and_assigned_logistica', () => {
    expect(puedeAccederTraslado('administrador', 'x', traslado, [])).toBe(true);
    expect(puedeAccederTraslado('logistica', 'log-1', traslado, [])).toBe(true);
  });

  it('should_allow_logistica_or_jefe_when_origin_or_destination_is_in_scope', () => {
    expect(puedeAccederTraslado('logistica', 'log-2', traslado, [101])).toBe(true);
    expect(puedeAccederTraslado('jefe_local', 'j-1', traslado, [135])).toBe(true);
  });

  it('should_deny_when_out_of_scope_or_role_has_no_access', () => {
    expect(puedeAccederTraslado('jefe_local', 'j-1', traslado, [999])).toBe(false);
    expect(puedeAccederTraslado('ejecutivo', 'e-1', traslado, [101])).toBe(false);
    expect(puedeAccederTraslado('operaciones', 'o-1', traslado, [135])).toBe(false);
  });
});
