/**
 * Cambio de ubicación masivo del inventario (fase G). Logística mueve varios
 * vehículos a una sucursal de una vez, por ejemplo cuando llega un container.
 *
 * Solo se mueven los vehículos libres: los reservados en una solicitud
 * activa, los entregados al cliente y los que están en un traslado interno
 * pendiente o en tránsito cambian de ubicación por su propio flujo.
 */

export const MAX_CAMBIO_UBICACION = 500;
/** Ids por consulta `in (...)`: con uuids, más ids alargan demasiado la URL. */
export const TAMANO_GRUPO_IDS = 100;

export const MOTIVO_RESERVADO = 'Reservado en una solicitud activa.';
export const MOTIVO_ENTREGADO = 'Entregado al cliente.';
export const MOTIVO_EN_TRASLADO = 'En un traslado interno pendiente o en tránsito.';
export const MOTIVO_YA_EN_DESTINO = 'Ya está en esa sucursal.';
export const MOTIVO_NO_ENCONTRADO = 'Vehículo no encontrado.';

export interface VehiculoUbicacion {
  id: string;
  chasis: string;
  ubicacion: number | null;
}

export interface Omitido {
  id: string;
  chasis: string;
  motivo: string;
}

export interface ClasificacionUbicacion {
  /** Vehículos a mover, con su ubicación anterior (para la auditoría). */
  mover: VehiculoUbicacion[];
  omitidos: Omitido[];
}

/** Error de la solicitud de cambio, o `null` si es válida. */
export function validarCambioUbicacion(ids: string[], sucursalId: number): string | null {
  if (ids.length === 0) return 'Selecciona al menos un vehículo.';
  if (ids.length > MAX_CAMBIO_UBICACION) return `Puedes mover hasta ${MAX_CAMBIO_UBICACION} vehículos a la vez.`;
  if (!Number.isInteger(sucursalId) || sucursalId <= 0) return 'Elige la sucursal de destino.';
  return null;
}

/**
 * Separa los vehículos que se pueden mover de los que no, con el motivo.
 * `bloqueos` trae el motivo de cada vehículo no movible (reservado, entregado
 * o en traslado). Respeta el orden de `ids`.
 */
export function clasificarCambioUbicacion(
  ids: string[],
  vehiculos: VehiculoUbicacion[],
  bloqueos: Map<string, string>,
  sucursalId: number
): ClasificacionUbicacion {
  const porId = new Map(vehiculos.map((v) => [v.id, v]));
  const mover: VehiculoUbicacion[] = [];
  const omitidos: Omitido[] = [];
  for (const id of ids) {
    const v = porId.get(id);
    if (!v) {
      omitidos.push({ id, chasis: '', motivo: MOTIVO_NO_ENCONTRADO });
      continue;
    }
    const bloqueo = bloqueos.get(id);
    if (bloqueo) omitidos.push({ id, chasis: v.chasis, motivo: bloqueo });
    else if (v.ubicacion === sucursalId) omitidos.push({ id, chasis: v.chasis, motivo: MOTIVO_YA_EN_DESTINO });
    else mover.push(v);
  }
  return { mover, omitidos };
}

/**
 * Motivo de bloqueo por vehículo a partir de sus vínculos. Si tiene varios,
 * gana el entregado, luego el reservado y luego el traslado.
 */
export function bloqueosDesdeVinculos(
  solicitudes: Array<{ vehiculo_id: string; disponibilidad: string }>,
  traslados: Array<{ vehiculo_id: string }>
): Map<string, string> {
  const bloqueos = new Map<string, string>();
  for (const t of traslados) bloqueos.set(t.vehiculo_id, MOTIVO_EN_TRASLADO);
  for (const s of solicitudes) if (s.disponibilidad === 'reservado') bloqueos.set(s.vehiculo_id, MOTIVO_RESERVADO);
  for (const s of solicitudes) if (s.disponibilidad === 'vendido') bloqueos.set(s.vehiculo_id, MOTIVO_ENTREGADO);
  return bloqueos;
}

/** En la tabla solo se pueden marcar los vehículos libres que no van en camino. */
export function esSeleccionableParaMover(v: { estado_disponibilidad: string; en_transito_hacia?: string | null }): boolean {
  return v.estado_disponibilidad === 'liberado' && !v.en_transito_hacia;
}
