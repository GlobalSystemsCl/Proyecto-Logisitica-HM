import { describe, expect, it } from 'vitest';
import { VehiculoService } from '@/services/vehiculo.service';

const POR_DEFECTO = 2020;

describe('VehiculoService.extraerAnio', () => {
  it('should_return_year_when_value_is_excel_serial_date', () => {
    expect(VehiculoService.extraerAnio('43997', POR_DEFECTO)).toBe(2020);
    expect(VehiculoService.extraerAnio('45292', POR_DEFECTO)).toBe(2024);
  });

  it('should_return_year_when_value_is_excel_serial_with_decimals', () => {
    expect(VehiculoService.extraerAnio('43997.5', POR_DEFECTO)).toBe(2020);
  });

  it('should_return_year_when_value_is_iso_format', () => {
    expect(VehiculoService.extraerAnio('2021-03-10', POR_DEFECTO)).toBe(2021);
  });

  it('should_return_year_when_value_is_dd_mm_yyyy_format', () => {
    expect(VehiculoService.extraerAnio('10/03/2021', POR_DEFECTO)).toBe(2021);
    expect(VehiculoService.extraerAnio('10.03.2021', POR_DEFECTO)).toBe(2021);
  });

  it('should_return_year_when_value_is_iso_datetime', () => {
    expect(VehiculoService.extraerAnio('2019-11-05T00:00:00Z', POR_DEFECTO)).toBe(2019);
  });

  it('should_return_default_when_value_is_empty', () => {
    expect(VehiculoService.extraerAnio('', POR_DEFECTO)).toBe(POR_DEFECTO);
    expect(VehiculoService.extraerAnio('   ', POR_DEFECTO)).toBe(POR_DEFECTO);
  });

  it('should_return_default_when_year_is_below_supported_range', () => {
    expect(VehiculoService.extraerAnio('1985-03-10', POR_DEFECTO)).toBe(POR_DEFECTO);
  });

  it('should_return_default_when_year_is_above_supported_range', () => {
    expect(VehiculoService.extraerAnio('2120-03-10', POR_DEFECTO)).toBe(POR_DEFECTO);
  });

  it('should_return_default_when_excel_serial_resolves_to_unsupported_year', () => {
    expect(VehiculoService.extraerAnio('20210', POR_DEFECTO)).toBe(POR_DEFECTO);
  });

  it('should_return_default_when_value_has_no_recognizable_date', () => {
    expect(VehiculoService.extraerAnio('no-es-fecha', POR_DEFECTO)).toBe(POR_DEFECTO);
  });

  it('should_return_default_when_value_is_a_bare_four_digit_number', () => {
    expect(VehiculoService.extraerAnio('2021', POR_DEFECTO)).toBe(POR_DEFECTO);
  });
});
