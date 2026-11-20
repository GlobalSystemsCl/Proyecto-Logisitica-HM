import type { Workbook, Worksheet } from 'exceljs';
import { formatFechaHora } from '@/lib/fechas';

/**
 * Libros Excel de los exportes. La PRIMERA hoja lleva un encabezado con el
 * logo de HMotores, el título (qué es el archivo), un subtítulo opcional
 * (período, filtros, sucursal) y la fecha de exportación; las demás hojas
 * parten directo con su tabla (2026-11-20: repetirlo en cada hoja se leía como
 * duplicado). La tabla lleva títulos en negrita, filtro y columnas con ancho
 * según el contenido.
 *
 * Se usa ExcelJS y no SheetJS porque la edición libre de SheetJS no escribe
 * imágenes ni estilos. SheetJS (`xlsx`) se sigue usando para LEER los Excel
 * que se importan.
 */

export interface HojaExcel {
  nombre: string;
  filas: Array<Record<string, string | number>>;
  /** Encabezados a usar si no hay filas (la hoja sale con la fila de títulos). */
  encabezados?: string[];
}

export interface EncabezadoExcel {
  /** Qué es el archivo: "Movimientos de traslados", "Vehículos en tránsito"… */
  titulo: string;
  /** Detalle: período, sucursal o filtros aplicados. */
  subtitulo?: string;
}

/** Logo que va en el encabezado (el mismo de los correos). */
export const RUTA_LOGO_EXCEL = '/correo/logo-hmotores.png';

/** Tamaño del logo en la hoja (proporción del original, 357 × 169). */
const LOGO = { ancho: 106, alto: 50 };
/** Filas del bloque de encabezado: logo (1-2), título, subtítulo, fecha y una en blanco. */
export const FILA_TITULOS_TABLA = 7;
const COLOR_TITULOS = 'FF1F2A30';

/** Ancho de columna: el del texto más largo, entre 10 y 50 caracteres. */
export function anchoColumna(encabezado: string, filas: HojaExcel['filas']): number {
  const largos = filas.map((f) => String(f[encabezado] ?? '').length);
  return Math.min(Math.max(encabezado.length, ...largos, 10), 50);
}

/** Excel limita el nombre de la hoja a 31 caracteres y prohíbe `\ / ? * [ ] :`. */
export function nombreHojaExcel(nombre: string): string {
  return nombre.replace(/[\\/?*[\]:]/g, '-').slice(0, 31) || 'Hoja';
}

/** Texto de la fecha de exportación ("Exportado el 18/11/2026 14:32"). */
export function textoFechaExportacion(fecha: Date): string {
  return `Exportado el ${formatFechaHora(fecha.toISOString())}`;
}

/** PNG en base64 (data URL), que es lo que ExcelJS acepta tanto en el navegador como en Node. */
export function pngComoDataUrl(bytes: ArrayBuffer): string {
  const arreglo = new Uint8Array(bytes);
  let binario = '';
  for (let i = 0; i < arreglo.length; i += 0x8000) {
    binario += String.fromCharCode(...arreglo.subarray(i, i + 0x8000));
  }
  return `data:image/png;base64,${btoa(binario)}`;
}

type ModuloExcelJS = typeof import('exceljs');

/** ExcelJS se carga solo al exportar (pesa ~1 MB). */
async function cargarExcelJS(): Promise<ModuloExcelJS> {
  const mod = (await import('exceljs')) as ModuloExcelJS & { default?: ModuloExcelJS };
  return mod.default ?? mod;
}

function escribirEncabezado(
  ws: Worksheet,
  titulo: string,
  subtitulo: string | undefined,
  fecha: Date,
  logoId: number | null,
): void {
  ws.getRow(1).height = 20;
  ws.getRow(2).height = 20;
  if (logoId != null) {
    ws.addImage(logoId, { tl: { col: 0, row: 0 }, ext: { width: LOGO.ancho, height: LOGO.alto }, editAs: 'oneCell' });
  }
  const celdaTitulo = ws.getCell('A3');
  celdaTitulo.value = titulo;
  celdaTitulo.font = { bold: true, size: 16, color: { argb: COLOR_TITULOS } };
  ws.getRow(3).height = 24;
  if (subtitulo) {
    const celda = ws.getCell('A4');
    celda.value = subtitulo;
    celda.font = { size: 11, color: { argb: 'FF525252' } };
  }
  const celdaFecha = ws.getCell('A5');
  celdaFecha.value = textoFechaExportacion(fecha);
  celdaFecha.font = { italic: true, size: 10, color: { argb: 'FF737373' } };
}

function escribirTabla(ws: Worksheet, hoja: HojaExcel, primeraFila: number): void {
  const encabezados = hoja.filas.length > 0 ? Object.keys(hoja.filas[0]) : hoja.encabezados ?? [];
  if (encabezados.length === 0) return;

  const filaTitulos = ws.getRow(primeraFila);
  filaTitulos.values = encabezados;
  filaTitulos.height = 20;
  filaTitulos.eachCell((celda) => {
    celda.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_TITULOS } };
    celda.alignment = { vertical: 'middle' };
  });

  hoja.filas.forEach((fila, i) => {
    ws.getRow(primeraFila + 1 + i).values = encabezados.map((h) => fila[h] ?? '');
  });

  encabezados.forEach((h, col) => {
    ws.getColumn(col + 1).width = anchoColumna(h, hoja.filas) + 2;
  });
  ws.autoFilter = {
    from: { row: primeraFila, column: 1 },
    to: { row: primeraFila + Math.max(hoja.filas.length, 1), column: encabezados.length },
  };
  ws.views = [{ state: 'frozen', ySplit: primeraFila }];
}

/**
 * Arma el libro. Sin `encabezado` (plantillas que se vuelven a importar) la
 * tabla parte en la fila 1, como espera el lector.
 */
export async function crearLibroExcel(
  hojas: HojaExcel[],
  encabezado: EncabezadoExcel | null,
  opciones: { logo?: string | null; fecha?: Date } = {},
): Promise<Workbook> {
  const ExcelJS = await cargarExcelJS();
  const libro = new ExcelJS.Workbook();
  libro.creator = 'HMotores Logística';
  const fecha = opciones.fecha ?? new Date();
  libro.created = fecha;
  const logoId = encabezado && opciones.logo ? libro.addImage({ base64: opciones.logo, extension: 'png' }) : null;

  hojas.forEach((hoja, i) => {
    const ws = libro.addWorksheet(nombreHojaExcel(hoja.nombre));
    if (encabezado && i === 0) {
      escribirEncabezado(ws, encabezado.titulo, encabezado.subtitulo, fecha, logoId);
      escribirTabla(ws, hoja, FILA_TITULOS_TABLA);
    } else {
      escribirTabla(ws, hoja, 1);
    }
  });
  return libro;
}

/** Logo para el encabezado; si no se puede leer, el Excel sale sin él. */
async function leerLogo(): Promise<string | null> {
  try {
    const res = await fetch(RUTA_LOGO_EXCEL);
    if (!res.ok) return null;
    return pngComoDataUrl(await res.arrayBuffer());
  } catch {
    return null;
  }
}

/** Descarga el libro en el navegador. */
export async function descargarExcel(
  nombreArchivo: string,
  encabezado: EncabezadoExcel | null,
  hojas: HojaExcel[],
): Promise<void> {
  const logo = encabezado ? await leerLogo() : null;
  const libro = await crearLibroExcel(hojas, encabezado, { logo });
  const buffer = await libro.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombreArchivo;
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
