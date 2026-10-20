/**
 * Transportista que realiza un traslado (`public.transportista`). El RUT se
 * guarda normalizado: `12345678-9` (ver `lib/rut.ts`).
 */
export interface Transportista {
  id: string;
  nombre: string;
  rut: string;
  activo: boolean;
}

/** Lo que se muestra junto a una solicitud o traslado. */
export type TransportistaResumen = Pick<Transportista, 'id' | 'nombre' | 'rut'>;
