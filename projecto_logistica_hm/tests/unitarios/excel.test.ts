import { beforeAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ExcelJS pesa ~1 MB: su primera carga puede pasar los 5 s del timeout con la suite en paralelo.
beforeAll(async () => {
  await import('exceljs');
}, 30_000);
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  anchoColumna,
  crearLibroExcel,
  FILA_TITULOS_TABLA,
  nombreHojaExcel,
  pngComoDataUrl,
  textoFechaExportacion,
} from '@/lib/excel';

const FECHA = new Date('2026-11-18T17:32:00.000Z'); // 14:32 en Chile (UTC-3)
const LOGO = pngComoDataUrl(new Uint8Array(readFileSync(resolve('public/correo/logo-hmotores.png'))).buffer);

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('crearLibroExcel', () => {
  it('should_write_logo_title_subtitle_and_export_date_when_encabezado_given', async () => {
    const libro = await crearLibroExcel(
      [{ nombre: 'En tránsito', filas: [{ Chasis: 'WBA3A5C50FF123456', Días: 3 }] }],
      { titulo: 'Vehículos en tránsito', subtitulo: 'Solicitudes y traslados internos' },
      { logo: LOGO, fecha: FECHA },
    );

    const ws = libro.getWorksheet('En tránsito')!;
    expect(ws.getImages()).toHaveLength(1);
    expect(ws.getCell('A3').value).toBe('Vehículos en tránsito');
    expect(ws.getCell('A3').font?.bold).toBe(true);
    expect(ws.getCell('A4').value).toBe('Solicitudes y traslados internos');
    expect(ws.getCell('A5').value).toBe('Exportado el 18/11/2026 14:32');
  });

  it('should_place_table_below_header_with_bold_titles_widths_and_filter', async () => {
    const libro = await crearLibroExcel(
      [{ nombre: 'Movimientos', filas: [{ Chasis: 'WBA3A5C50FF123456', Estado: 'En tránsito', Vehículos: 2 }] }],
      { titulo: 'Movimientos de traslados' },
      { fecha: FECHA },
    );

    const ws = libro.getWorksheet('Movimientos')!;
    const titulos = ws.getRow(FILA_TITULOS_TABLA);
    expect(titulos.getCell(1).value).toBe('Chasis');
    expect(titulos.getCell(1).font?.bold).toBe(true);
    const datos = ws.getRow(FILA_TITULOS_TABLA + 1);
    expect(datos.getCell(1).value).toBe('WBA3A5C50FF123456');
    expect(datos.getCell(3).value).toBe(2);
    expect(ws.getColumn(1).width).toBe(19);
    expect(ws.getColumn(2).width).toBe(13);
    expect(ws.autoFilter).toEqual({ from: { row: 7, column: 1 }, to: { row: 8, column: 3 } });
    expect(ws.getCell('A4').value).toBeNull();
  });

  it('should_put_header_only_on_first_sheet_when_workbook_has_several_sheets', async () => {
    const libro = await crearLibroExcel(
      [
        { nombre: 'Movimientos', filas: [{ A: 1 }] },
        { nombre: 'Por empresa', filas: [{ B: 2 }] },
      ],
      { titulo: 'Movimientos de traslados', subtitulo: 'Período' },
      { logo: LOGO, fecha: FECHA },
    );

    expect(libro.worksheets.map((w) => w.name)).toEqual(['Movimientos', 'Por empresa']);
    const primera = libro.getWorksheet('Movimientos')!;
    expect(primera.getCell('A3').value).toBe('Movimientos de traslados');
    expect(primera.getImages()).toHaveLength(1);
    const segunda = libro.getWorksheet('Por empresa')!;
    expect(segunda.getImages()).toHaveLength(0);
    expect(segunda.getCell('A1').value).toBe('B');
    expect(segunda.getCell('A2').value).toBe(2);
    expect(segunda.autoFilter).toEqual({ from: { row: 1, column: 1 }, to: { row: 2, column: 1 } });
  });

  it('should_write_only_headers_when_sheet_has_no_rows', async () => {
    const libro = await crearLibroExcel(
      [{ nombre: 'Vacía', filas: [], encabezados: ['Solicitud', 'Chasis'] }],
      { titulo: 'Calendarización' },
      { fecha: FECHA },
    );
    const ws = libro.getWorksheet('Vacía')!;
    expect(ws.getRow(FILA_TITULOS_TABLA).values).toEqual([undefined, 'Solicitud', 'Chasis']);
    expect(ws.rowCount).toBe(FILA_TITULOS_TABLA);
  });

  it('should_start_table_at_row_1_without_logo_when_no_encabezado', async () => {
    const libro = await crearLibroExcel([{ nombre: 'Usuarios', filas: [{ Nombre: 'Ana' }] }], null, { logo: LOGO });
    const ws = libro.getWorksheet('Usuarios')!;
    expect(ws.getCell('A1').value).toBe('Nombre');
    expect(ws.getCell('A2').value).toBe('Ana');
    expect(ws.getImages()).toHaveLength(0);
  });

  it('should_skip_logo_when_logo_is_missing', async () => {
    const libro = await crearLibroExcel([{ nombre: 'Hoja', filas: [{ A: 1 }] }], { titulo: 'X' }, { logo: null, fecha: FECHA });
    expect(libro.getWorksheet('Hoja')!.getImages()).toHaveLength(0);
  });

  it('should_produce_a_valid_xlsx_buffer', async () => {
    const libro = await crearLibroExcel([{ nombre: 'Hoja', filas: [{ A: 1 }] }], { titulo: 'X' }, { logo: LOGO, fecha: FECHA });
    const buffer = await libro.xlsx.writeBuffer();
    // Los .xlsx son ZIP: empiezan con "PK".
    expect(Buffer.from(buffer as ArrayBuffer).subarray(0, 2).toString()).toBe('PK');
  });

  it('should_use_current_date_when_fecha_not_given', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(FECHA);
    const libro = await crearLibroExcel([{ nombre: 'Hoja', filas: [{ A: 1 }] }], { titulo: 'X' });
    expect(libro.getWorksheet('Hoja')!.getCell('A5').value).toBe('Exportado el 18/11/2026 14:32');
  });
});

describe('nombreHojaExcel', () => {
  it('should_truncate_sheet_name_to_31_characters', () => {
    expect(nombreHojaExcel('x'.repeat(40))).toHaveLength(31);
  });

  it('should_replace_characters_excel_forbids', () => {
    expect(nombreHojaExcel('Ida/Vuelta: [1]')).toBe('Ida-Vuelta- -1-');
  });

  it('should_return_default_when_name_is_empty', () => {
    expect(nombreHojaExcel('')).toBe('Hoja');
  });
});

describe('anchoColumna', () => {
  it('should_use_longest_text_between_10_and_50', () => {
    expect(anchoColumna('A', [{ A: 'corto' }])).toBe(10);
    expect(anchoColumna('Chasis', [{ Chasis: 'WBA3A5C50FF123456' }])).toBe(17);
    expect(anchoColumna('D', [{ D: 'x'.repeat(80) }])).toBe(50);
  });

  it('should_use_header_length_when_there_are_no_rows', () => {
    expect(anchoColumna('Pendientes con más de 24 h', [])).toBe(26);
  });
});

describe('textoFechaExportacion', () => {
  it('should_format_date_and_time_in_chile', () => {
    expect(textoFechaExportacion(FECHA)).toBe('Exportado el 18/11/2026 14:32');
  });
});

describe('pngComoDataUrl', () => {
  it('should_encode_bytes_as_png_data_url', () => {
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer;
    expect(pngComoDataUrl(bytes)).toBe('data:image/png;base64,iVBORw==');
  });

  it('should_return_empty_payload_when_no_bytes', () => {
    expect(pngComoDataUrl(new ArrayBuffer(0))).toBe('data:image/png;base64,');
  });
});
