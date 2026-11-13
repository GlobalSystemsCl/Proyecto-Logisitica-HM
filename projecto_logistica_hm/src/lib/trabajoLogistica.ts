/**
 * QA #25 (2026-11-12): trabajo abierto de un usuario de Logística. Al quitarle
 * el rol o desactivarlo, sus solicitudes y traslados en curso no pueden quedar
 * sin nadie que los atienda. Funciones puras.
 */

export interface TrabajoAbierto {
  solicitudes: number;
  traslados: number;
}

/** `true` si tiene al menos una solicitud o traslado abierto. */
export function tieneTrabajoAbierto(t: TrabajoAbierto | null | undefined): boolean {
  return !!t && t.solicitudes + t.traslados > 0;
}

/** "Tiene a su cargo 3 solicitudes y 1 traslado interno sin cerrar." */
export function textoTrabajoAbierto(t: TrabajoAbierto): string {
  const partes = [
    t.solicitudes > 0 ? `${t.solicitudes} ${t.solicitudes === 1 ? 'solicitud' : 'solicitudes'}` : '',
    t.traslados > 0 ? `${t.traslados} ${t.traslados === 1 ? 'traslado interno' : 'traslados internos'}` : '',
  ].filter(Boolean);
  return `Tiene a su cargo ${partes.join(' y ')} sin cerrar.`;
}

/**
 * Hay que elegir a quién traspasar si el usuario era de Logística, deja de
 * serlo y tiene trabajo abierto.
 */
export function debeTraspasarTrabajo(rolOriginal: string, rolNuevo: string, trabajo: TrabajoAbierto | null | undefined): boolean {
  return rolOriginal === 'logistica' && rolNuevo !== 'logistica' && tieneTrabajoAbierto(trabajo);
}
