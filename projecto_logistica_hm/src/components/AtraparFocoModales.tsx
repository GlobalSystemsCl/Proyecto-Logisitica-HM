'use client';

import { useEffect } from 'react';
import { SELECTOR_CAPAS_MODALES, SELECTOR_ENFOCABLES, siguienteFoco } from '@/lib/foco';

/**
 * QA #55: con un modal abierto, Tab y Shift+Tab recorren solo sus controles y
 * no salen a la página de atrás. Se monta una vez en el layout raíz y cubre
 * todos los modales (el de más arriba es la última capa visible del DOM).
 */
export default function AtraparFocoModales() {
  useEffect(() => {
    function alPresionar(e: KeyboardEvent) {
      if (e.key !== 'Tab' || e.defaultPrevented) return;
      const capas = Array.from(document.querySelectorAll<HTMLElement>(SELECTOR_CAPAS_MODALES)).filter(
        (el) => el.getClientRects().length > 0
      );
      const modal = capas[capas.length - 1];
      if (!modal) return;
      const enfocables = Array.from(modal.querySelectorAll<HTMLElement>(SELECTOR_ENFOCABLES)).filter(
        (el) => el.getClientRects().length > 0
      );
      const actual = enfocables.indexOf(document.activeElement as HTMLElement);
      const destino = siguienteFoco(actual, enfocables.length, e.shiftKey);
      if (destino !== null) {
        e.preventDefault();
        enfocables[destino].focus();
      }
    }
    document.addEventListener('keydown', alPresionar);
    return () => document.removeEventListener('keydown', alPresionar);
  }, []);
  return null;
}
