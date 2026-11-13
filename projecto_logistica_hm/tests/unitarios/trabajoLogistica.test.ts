import { describe, expect, it } from 'vitest';
import { debeTraspasarTrabajo, textoTrabajoAbierto, tieneTrabajoAbierto } from '@/lib/trabajoLogistica';

describe('tieneTrabajoAbierto', () => {
  it('should_be_true_with_any_open_request_or_transfer', () => {
    expect(tieneTrabajoAbierto({ solicitudes: 1, traslados: 0 })).toBe(true);
    expect(tieneTrabajoAbierto({ solicitudes: 0, traslados: 2 })).toBe(true);
  });

  it('should_be_false_without_work_or_data', () => {
    expect(tieneTrabajoAbierto({ solicitudes: 0, traslados: 0 })).toBe(false);
    expect(tieneTrabajoAbierto(null)).toBe(false);
  });
});

describe('textoTrabajoAbierto', () => {
  it('should_use_singular_and_plural_and_join_both_kinds', () => {
    expect(textoTrabajoAbierto({ solicitudes: 1, traslados: 0 })).toBe('Tiene a su cargo 1 solicitud sin cerrar.');
    expect(textoTrabajoAbierto({ solicitudes: 3, traslados: 1 })).toBe('Tiene a su cargo 3 solicitudes y 1 traslado interno sin cerrar.');
    expect(textoTrabajoAbierto({ solicitudes: 0, traslados: 2 })).toBe('Tiene a su cargo 2 traslados internos sin cerrar.');
  });
});

describe('debeTraspasarTrabajo', () => {
  const trabajo = { solicitudes: 1, traslados: 0 };

  it('should_require_a_receiver_only_when_a_logistics_user_leaves_the_role_with_open_work', () => {
    expect(debeTraspasarTrabajo('logistica', 'ejecutivo', trabajo)).toBe(true);
    expect(debeTraspasarTrabajo('logistica', 'logistica', trabajo)).toBe(false);
    expect(debeTraspasarTrabajo('jefe_local', 'ejecutivo', trabajo)).toBe(false);
    expect(debeTraspasarTrabajo('logistica', 'ejecutivo', { solicitudes: 0, traslados: 0 })).toBe(false);
  });
});
