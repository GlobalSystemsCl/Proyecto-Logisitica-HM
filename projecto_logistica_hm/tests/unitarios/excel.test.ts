import { beforeEach, describe, expect, it, vi } from 'vitest';
import { utils } from 'xlsx';
import { crearLibroExcel } from '@/lib/excel';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('crearLibroExcel', () => {
  it('should_create_one_sheet_per_entry_with_bold_headers_and_widths', () => {
    const libro = crearLibroExcel([
      { nombre: 'Movimientos', filas: [{ Chasis: 'WBA3A5C50FF123456', Estado: 'En tránsito' }] },
      { nombre: 'Resumen', filas: [{ Transportista: 'Andes', Vehículos: 2 }] },
    ]);

    expect(libro.SheetNames).toEqual(['Movimientos', 'Resumen']);
    const hoja = libro.Sheets.Movimientos;
    expect(hoja.A1.v).toBe('Chasis');
    expect(hoja.A1.s).toEqual({ font: { bold: true } });
    expect(hoja.A2.v).toBe('WBA3A5C50FF123456');
    expect(hoja['!cols']).toEqual([{ wch: 17 }, { wch: 11 }]);
  });

  it('should_write_only_headers_when_sheet_has_no_rows', () => {
    const libro = crearLibroExcel([{ nombre: 'Vacía', filas: [], encabezados: ['Solicitud', 'Chasis'] }]);
    const filas = utils.sheet_to_json(libro.Sheets['Vacía'], { header: 1 });
    expect(filas).toEqual([['Solicitud', 'Chasis']]);
  });

  it('should_truncate_sheet_name_to_31_characters', () => {
    const libro = crearLibroExcel([{ nombre: 'x'.repeat(40), filas: [{ A: '1' }] }]);
    expect(libro.SheetNames[0]).toHaveLength(31);
  });
});
