/**
 * Sucursales desactivadas (2026-11-23). Una sucursal con datos (usuarios,
 * solicitudes, vehículos o traslados) no se elimina: se desactiva. Los
 * usuarios dejan de verla; el administrador la ve marcada y puede
 * reactivarla. Sin datos, se elimina de verdad.
 */

/** Sin la columna (migración no aplicada) o con `activa` nula, cuenta como activa. */
export function esSucursalActiva(s: { activa?: boolean | null }): boolean {
  return s.activa !== false;
}

/** Solo las activas, en el mismo orden. */
export function soloSucursalesActivas<T extends { activa?: boolean | null }>(sucursales: T[]): T[] {
  return sucursales.filter(esSucursalActiva);
}

export interface TextoBajaSucursal {
  accion: 'desactivar' | 'eliminar';
  titulo: string;
  mensaje: string;
  boton: string;
}

/**
 * Qué pasará al "eliminar" la sucursal según sus datos (`bloqueos`: textos
 * como "3 vehículo(s) ubicados en ella"), para avisarlo antes de confirmar.
 */
export function textoBajaSucursal(nombre: string, bloqueos: string[]): TextoBajaSucursal {
  if (bloqueos.length === 0) {
    return {
      accion: 'eliminar',
      titulo: 'Eliminar sucursal',
      mensaje: `${nombre} no tiene datos asociados: se eliminará definitivamente. Esta acción no se puede deshacer.`,
      boton: 'Eliminar definitivamente',
    };
  }
  return {
    accion: 'desactivar',
    titulo: 'Desactivar sucursal',
    mensaje:
      `${nombre} tiene ${bloqueos.join(', ')}, así que será desactivada y no eliminada: ` +
      'los usuarios dejarán de verla y tú la seguirás viendo como desactivada. Puedes reactivarla cuando quieras.',
    boton: 'Desactivar sucursal',
  };
}
