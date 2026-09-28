import { describe, expect, it } from 'vitest';
import { VehiculoService } from '@/services/vehiculo.service';

describe('VehiculoService.parsePrecio', () => {
  it('should_parse_price_when_value_uses_chilean_format', () => {
    expect(VehiculoService.parsePrecio('13.859.244,00')).toBe(13859244);
    expect(VehiculoService.parsePrecio('1.234,5')).toBe(1234.5);
  });

  it('should_parse_price_when_value_uses_us_format', () => {
    expect(VehiculoService.parsePrecio('13,859,244.00')).toBe(13859244);
    expect(VehiculoService.parsePrecio('1,234.5')).toBe(1234.5);
  });

  it('should_parse_plain_integer', () => {
    expect(VehiculoService.parsePrecio('5000')).toBe(5000);
  });

  it('should_parse_decimal_comma_without_thousand_separator', () => {
    expect(VehiculoService.parsePrecio('1234,56')).toBe(1234.56);
  });

  it('should_strip_currency_symbols_and_spaces', () => {
    expect(VehiculoService.parsePrecio('$ 13.859.244,00 CLP')).toBe(13859244);
  });

  it('should_return_null_when_value_is_empty_string', () => {
    expect(VehiculoService.parsePrecio('')).toBeNull();
    expect(VehiculoService.parsePrecio('   ')).toBeNull();
  });

  it('should_return_null_when_value_has_no_digits', () => {
    expect(VehiculoService.parsePrecio('sin precio')).toBeNull();
  });

  it('should_return_null_when_value_is_only_symbols', () => {
    expect(VehiculoService.parsePrecio('$')).toBeNull();
  });

  it('should_parse_negative_value', () => {
    expect(VehiculoService.parsePrecio('-1.500,25')).toBe(-1500.25);
  });
});
