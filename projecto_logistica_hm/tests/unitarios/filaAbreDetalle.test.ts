import { describe, expect, it, vi } from 'vitest';
import type { MouseEvent } from 'react';
import { abrirDetalleDeFila, esClicEnControl } from '@/components/FilaAbreDetalle';

/** Evento mínimo: `closest` simula si el clic cayó dentro de un control. */
function evento(enControl: boolean, boton: { click: () => void } | null = null) {
  return {
    target: { closest: vi.fn(() => (enControl ? {} : null)) },
    currentTarget: { querySelector: vi.fn(() => boton) },
  } as unknown as MouseEvent<HTMLElement>;
}

describe('esClicEnControl (QA #8)', () => {
  it('should_return_true_when_click_lands_on_a_button_or_link', () => {
    expect(esClicEnControl(evento(true))).toBe(true);
  });

  it('should_return_false_when_click_lands_on_plain_text', () => {
    expect(esClicEnControl(evento(false))).toBe(false);
  });
});

describe('abrirDetalleDeFila', () => {
  it('should_click_the_detail_button_when_row_text_is_clicked', () => {
    const boton = { click: vi.fn() };
    abrirDetalleDeFila(evento(false, boton));
    expect(boton.click).toHaveBeenCalled();
  });

  it('should_do_nothing_when_click_was_on_a_control', () => {
    const boton = { click: vi.fn() };
    abrirDetalleDeFila(evento(true, boton));
    expect(boton.click).not.toHaveBeenCalled();
  });
});
