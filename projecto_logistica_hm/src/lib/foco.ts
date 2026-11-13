/**
 * QA #55 (2026-11-12): con un modal abierto, Tab no debe salir a la página de
 * atrás. Función pura: dado el índice del elemento enfocado, cuántos hay y si
 * se presionó Shift, devuelve a qué índice saltar (o null si el navegador
 * puede seguir solo).
 */
export function siguienteFoco(indiceActual: number, total: number, haciaAtras: boolean): number | null {
  if (total === 0) return null;
  if (indiceActual === -1) return haciaAtras ? total - 1 : 0;
  if (haciaAtras && indiceActual === 0) return total - 1;
  if (!haciaAtras && indiceActual === total - 1) return 0;
  return null;
}

/** Selector de los elementos que pueden recibir foco con Tab. */
export const SELECTOR_ENFOCABLES =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Capas que cuentan como modal: las marcadas `aria-modal` y los fondos
 * oscuros a pantalla completa que usan todos los modales de la app.
 */
export const SELECTOR_CAPAS_MODALES = '[aria-modal="true"], .fixed.inset-0[class*="bg-black"]';
