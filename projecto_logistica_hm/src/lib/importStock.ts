/**
 * Lectura del Excel de stock y de compras (`modelo_excel/`) para "Importar
 * Stock". Funciones puras: el servicio resuelve sucursales y marcas en la BD.
 *
 * Columnas del formato actual (por encabezado, sin importar mayúsculas,
 * tildes ni espacios sobrantes):
 *   Tipo de vehículo | Marca | Marca completa | Modelo | IDV | Chasis | Color | Ubicación | Patente
 *
 * Se siguen aceptando las columnas del formato anterior: C.comp (sucursal),
 * Fec.adj. (año) y P.V.D. (precio).
 */

export interface ColumnasStock {
  tipo: number;
  marca: number;
  marcaCompleta: number;
  modelo: number;
  idv: number;
  chasis: number;
  color: number;
  ubicacion: number;
  patente: number;
  fechaAdjudicacion: number;
  precio: number;
}

/** `"Tipo de vehículo "` → `"tipo de vehiculo"`. */
export function normalizarEncabezado(encabezado: string): string {
  return (encabezado || '')
    .replace(/"/g, '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

const ALIAS: Record<keyof ColumnasStock, string[]> = {
  tipo: ['tipo de vehiculo', 'tipo vehiculo', 'tipo'],
  marca: ['marca'],
  marcaCompleta: ['marca completa'],
  modelo: ['modelo'],
  idv: ['idv'],
  chasis: ['chasis', 'n° chasis', 'nro chasis', 'vin'],
  color: ['color'],
  ubicacion: ['ubicacion', 'c.comp', 'ccomp', 'conces', 'sucursal', 'codigo'],
  patente: ['patente'],
  fechaAdjudicacion: ['fec.adj.', 'fec adj', 'f.adj.', 'fec.adj', 'fecha adj'],
  precio: ['p.v.d.', 'pvd', 'precio'],
};

/** Índice de cada columna conocida en la fila de encabezados (-1 si no está). */
export function columnasStock(encabezados: string[]): ColumnasStock {
  const normalizados = encabezados.map(normalizarEncabezado);
  const indice = (alias: string[]) => normalizados.findIndex((h) => alias.includes(h));
  return Object.fromEntries(
    (Object.keys(ALIAS) as Array<keyof ColumnasStock>).map((clave) => [clave, indice(ALIAS[clave])]),
  ) as unknown as ColumnasStock;
}

/** El archivo sirve si trae al menos Marca, Modelo y Chasis. */
export function tieneColumnasMinimas(c: ColumnasStock): boolean {
  return c.marca >= 0 && c.modelo >= 0 && c.chasis >= 0;
}

/** Valor recortado de una celda; vacío si la columna no existe. */
export function celda(fila: string[], indice: number): string {
  return indice >= 0 ? (fila[indice] ?? '').trim() : '';
}

/** El chasis (VIN) tiene 17 caracteres alfanuméricos. */
export function esChasisValido(chasis: string): boolean {
  return /^[A-Z0-9]{17}$/i.test(chasis);
}

/**
 * Código y nombre de la marca. El formato actual los trae en columnas
 * separadas ("HY" y "HYUNDAI"); el anterior, en una sola celda ("BAI,BAIC").
 */
export function separarMarca(marca: string, marcaCompleta: string): { codigo: string; nombre: string } {
  let codigo = marca.trim();
  let nombre = marcaCompleta.trim();
  if (!nombre && codigo.includes(',')) {
    const [c, ...resto] = codigo.split(',');
    codigo = c.trim();
    nombre = resto.join(',').trim();
  }
  return { codigo: codigo.toUpperCase(), nombre };
}
