import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ACCIONES_DESHACER_TRASLADO, confirmacionEntregaCliente, etiquetaTipoSolicitud, textoConfirmacionDeshacer } from '@/lib/textos';

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

describe('etiquetaTipoSolicitud', () => {
  it('should_return_sala_de_venta_when_tipo_is_venta', () => {
    expect(etiquetaTipoSolicitud('venta')).toBe('Sala de venta');
  });

  it('should_return_evento_when_tipo_is_evento', () => {
    expect(etiquetaTipoSolicitud('evento')).toBe('Evento');
  });

  it('should_return_raw_value_or_empty_when_tipo_is_unknown_or_missing', () => {
    expect(etiquetaTipoSolicitud('otro')).toBe('otro');
    expect(etiquetaTipoSolicitud(null)).toBe('');
  });
});

describe('confirmacionEntregaCliente', () => {
  it('should_include_request_code_and_mark_action_as_dangerous', () => {
    const c = confirmacionEntregaCliente('135-23');
    expect(c.mensaje).toContain('135-23');
    expect(c.mensaje).toContain('no se puede deshacer');
    expect(c.peligro).toBe(true);
  });
});
