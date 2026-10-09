/**
 * Auditoría de cambios en el inventario de vehículos (R2).
 *
 * Logística tiene control total de los vehículos (cargar, editar, mover de
 * sucursal, eliminar). Cada cambio debe quedar en la auditoría con quién lo
 * hizo y qué cambió. Este módulo calcula el "antes y después" de los campos
 * relevantes.
 *
 * Funciones puras: no tocan la BD ni React.
 */

export const CAMPOS_AUDITADOS_VEHICULO = [
  'chasis',
  'patente',
  'marca',
  'modelo',
  'anio',
  'color',
  'precio',
  'ubicacion',
] as const;

type CampoAuditado = (typeof CAMPOS_AUDITADOS_VEHICULO)[number];
type FilaVehiculo = { [K in CampoAuditado]?: unknown };

export interface CambiosVehiculo {
  anterior: Partial<Record<CampoAuditado, unknown>>;
  nuevo: Partial<Record<CampoAuditado, unknown>>;
}

function normalizar(valor: unknown): unknown {
  return valor === undefined || valor === '' ? null : valor;
}

/** Campos que cambiaron entre dos versiones del vehículo, o `null` si ninguno. */
export function diferenciasVehiculo(
  antes: FilaVehiculo | null | undefined,
  despues: FilaVehiculo | null | undefined
): CambiosVehiculo | null {
  if (!antes || !despues) return null;
  const anterior: CambiosVehiculo['anterior'] = {};
  const nuevo: CambiosVehiculo['nuevo'] = {};
  for (const campo of CAMPOS_AUDITADOS_VEHICULO) {
    const a = normalizar(antes[campo]);
    const d = normalizar(despues[campo]);
    if (a !== d) {
      anterior[campo] = a;
      nuevo[campo] = d;
    }
  }
  return Object.keys(nuevo).length > 0 ? { anterior, nuevo } : null;
}

/**
 * Acción de auditoría para una edición: el cambio de ubicación se destaca
 * porque indica dónde está físicamente el vehículo.
 */
export function accionCambioVehiculo(cambios: CambiosVehiculo): 'cambio_ubicacion' | 'edicion' {
  return 'ubicacion' in cambios.nuevo ? 'cambio_ubicacion' : 'edicion';
}

/** Datos que identifican al vehículo en el registro de creación o eliminación. */
export function resumenVehiculo(v: FilaVehiculo | null | undefined): Partial<Record<CampoAuditado, unknown>> {
  if (!v) return {};
  const resumen: Partial<Record<CampoAuditado, unknown>> = {};
  for (const campo of CAMPOS_AUDITADOS_VEHICULO) resumen[campo] = normalizar(v[campo]);
  return resumen;
}
