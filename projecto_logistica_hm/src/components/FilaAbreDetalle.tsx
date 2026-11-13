'use client';

import type { MouseEvent, ReactNode } from 'react';

/**
 * QA #8: un clic en cualquier parte de la tarjeta abre el detalle, no solo en
 * el número. Busca el botón de `AbrirSolicitudDetalle` dentro de la fila y lo
 * activa; los clics en enlaces, botones o campos siguen haciendo lo suyo.
 */
/** `true` si el clic cayó en un control (enlace, botón, campo): la fila no debe reaccionar. */
export function esClicEnControl(e: MouseEvent<HTMLElement>): boolean {
  return Boolean((e.target as HTMLElement).closest('a, button, input, select, textarea, label, [role="button"]'));
}

export function abrirDetalleDeFila(e: MouseEvent<HTMLElement>) {
  if (esClicEnControl(e)) return;
  e.currentTarget.querySelector<HTMLButtonElement>('[data-abrir-detalle]')?.click();
}

export const CLASE_FILA_CLICKABLE = 'cursor-pointer hover:bg-neutral-50 transition-colors';

/** `<li>` que abre el detalle de su solicitud; para usar desde componentes de servidor. */
export default function FilaAbreDetalle({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <li onClick={abrirDetalleDeFila} className={`${CLASE_FILA_CLICKABLE} ${className ?? ''}`}>
      {children}
    </li>
  );
}
