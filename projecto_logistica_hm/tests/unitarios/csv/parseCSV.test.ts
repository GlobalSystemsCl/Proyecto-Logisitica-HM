import { describe, expect, it } from 'vitest';
import { VehiculoService } from '@/services/vehiculo.service';

describe('VehiculoService.parseCSV', () => {
  it('should_parse_rows_when_content_is_comma_separated', () => {
    expect(VehiculoService.parseCSV('chasis,patente,marca\nABC123,ABCD-12,Toyota')).toEqual([
      ['chasis', 'patente', 'marca'],
      ['ABC123', 'ABCD-12', 'Toyota'],
    ]);
  });

  it('should_parse_rows_when_content_is_tab_separated', () => {
    expect(VehiculoService.parseCSV('chasis\tpatente\nABC123\tABCD-12')).toEqual([
      ['chasis', 'patente'],
      ['ABC123', 'ABCD-12'],
    ]);
  });

  it('should_use_comma_as_delimiter_when_tabs_and_commas_are_equal', () => {
    expect(VehiculoService.parseCSV('a,b\n1,2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('should_keep_delimiter_inside_quoted_cell', () => {
    expect(VehiculoService.parseCSV('nombre,apellido\n"Pérez, ""Juan""","García"')).toEqual([
      ['nombre', 'apellido'],
      ['Pérez, "Juan"', 'García'],
    ]);
  });

  it('should_unescape_double_quotes_inside_quoted_cell', () => {
    expect(VehiculoService.parseCSV('col\n"di ""comillas"""')).toEqual([
      ['col'],
      ['di "comillas"'],
    ]);
  });

  it('should_filter_out_rows_where_every_cell_is_empty', () => {
    expect(VehiculoService.parseCSV('a,b\n\n1,2\n   \n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('should_ignore_carriage_returns_from_crlf_line_endings', () => {
    expect(VehiculoService.parseCSV('a,b\r\n1,2\r\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('should_preserve_empty_cells_between_delimiters', () => {
    expect(VehiculoService.parseCSV('a,b,c\n1,,3')).toEqual([
      ['a', 'b', 'c'],
      ['1', '', '3'],
    ]);
  });

  it('should_return_empty_array_when_text_is_empty', () => {
    expect(VehiculoService.parseCSV('')).toEqual([]);
  });

  it('should_return_empty_array_when_text_only_has_whitespace', () => {
    expect(VehiculoService.parseCSV('   \n  \n')).toEqual([]);
  });

  it('should_return_empty_array_when_text_has_no_delimiters_and_is_empty_content', () => {
    expect(VehiculoService.parseCSV('\n\n')).toEqual([]);
  });
});
