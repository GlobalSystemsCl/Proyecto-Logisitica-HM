import { utils, writeFile, type WorkBook } from 'xlsx';

/**
 * Libros Excel de los exportes (mismo formato que el historial: encabezados en
 * negrita y columnas con ancho según el contenido).
 */

export interface HojaExcel {
  nombre: string;
  filas: Array<Record<string, string | number>>;
  /** Encabezados a usar si no hay filas (la hoja sale con la fila de títulos). */
  encabezados?: string[];
}

/** Ancho de columna: el del texto más largo, entre 10 y 50 caracteres. */
function anchoColumna(encabezado: string, filas: HojaExcel['filas']): number {
  const largos = filas.map((f) => String(f[encabezado] ?? '').length);
  return Math.min(Math.max(encabezado.length, ...largos, 10), 50);
}

export function crearLibroExcel(hojas: HojaExcel[]): WorkBook {
  const libro = utils.book_new();
  for (const hoja of hojas) {
    const encabezados = hoja.filas.length > 0 ? Object.keys(hoja.filas[0]) : hoja.encabezados ?? [];
    const ws = hoja.filas.length > 0 ? utils.json_to_sheet(hoja.filas) : utils.aoa_to_sheet([encabezados]);
    encabezados.forEach((_, col) => {
      const celda = ws[utils.encode_cell({ r: 0, c: col })];
      if (celda) celda.s = { font: { bold: true } };
    });
    ws['!cols'] = encabezados.map((h) => ({ wch: anchoColumna(h, hoja.filas) }));
    // Excel limita el nombre de la hoja a 31 caracteres.
    utils.book_append_sheet(libro, ws, hoja.nombre.slice(0, 31));
  }
  return libro;
}

/** Descarga el libro en el navegador. */
export function descargarExcel(nombreArchivo: string, hojas: HojaExcel[]): void {
  writeFile(crearLibroExcel(hojas), nombreArchivo);
}
