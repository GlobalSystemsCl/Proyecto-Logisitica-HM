import { describe, expect, it } from 'vitest';
import { opcionesAviso, opcionesConfirmacion } from '@/lib/confirmacion';

describe('opcionesConfirmacion', () => {
  it('should_fill_default_texts_when_input_is_a_plain_message', () => {
    expect(opcionesConfirmacion('¿Seguro?')).toEqual({
      soloAviso: false,
      titulo: 'Confirmar acción',
      mensaje: '¿Seguro?',
      textoConfirmar: 'Confirmar',
      textoCancelar: 'Cancelar',
      peligro: false,
    });
  });

  it('should_keep_custom_texts_and_danger_flag_when_given', () => {
    const o = opcionesConfirmacion({
      titulo: 'Entregar',
      mensaje: 'No se puede deshacer.',
      textoConfirmar: 'Sí, entregar',
      peligro: true,
    });
    expect(o).toMatchObject({ titulo: 'Entregar', textoConfirmar: 'Sí, entregar', textoCancelar: 'Cancelar', peligro: true });
  });

  it('should_use_defaults_when_custom_texts_are_blank', () => {
    const o = opcionesConfirmacion({ mensaje: 'x', titulo: '  ', textoConfirmar: '' });
    expect(o.titulo).toBe('Confirmar acción');
    expect(o.textoConfirmar).toBe('Confirmar');
  });
});

describe('opcionesAviso', () => {
  it('should_show_single_entendido_button_when_used_as_alert', () => {
    const o = opcionesAviso('Fecha vencida', 'No se pudo aprobar');
    expect(o).toMatchObject({ titulo: 'No se pudo aprobar', mensaje: 'Fecha vencida', textoConfirmar: 'Entendido', soloAviso: true });
  });

  it('should_use_atencion_as_default_title', () => {
    expect(opcionesAviso('x').titulo).toBe('Atención');
  });
});
