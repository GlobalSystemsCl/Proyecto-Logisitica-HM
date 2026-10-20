import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ACCIONES_DESHACER_TRASLADO, textoConfirmacionDeshacer } from '@/lib/textos';

describe('textoConfirmacionDeshacer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should_explain_that_request_returns_to_queue_when_action_is_volver_a_cola', () => {
    const texto = textoConfirmacionDeshacer('volver_a_cola', '#ABC12345');
    expect(texto).toContain('¿Volver a la cola la solicitud #ABC12345?');
    expect(texto).toContain('cola de prioridades');
  });

  it('should_explain_that_date_is_kept_when_action_is_revertir_despacho', () => {
    const texto = textoConfirmacionDeshacer('revertir_despacho', '#ABC12345');
    expect(texto).toContain('¿Revertir despacho la solicitud #ABC12345?');
    expect(texto).toContain('conserva la fecha');
  });

  it('should_use_distinct_labels_when_comparing_both_actions', () => {
    expect(ACCIONES_DESHACER_TRASLADO.volver_a_cola.etiqueta).not.toBe(ACCIONES_DESHACER_TRASLADO.revertir_despacho.etiqueta);
  });
});
