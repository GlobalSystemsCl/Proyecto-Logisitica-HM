import { beforeEach, describe, expect, it, vi } from 'vitest';
import { codigoSolicitud, codigoTraslado, coincideCodigoSolicitud } from '@/lib/codigoSolicitud';

const ID = '5eed0001-abcd-4ef0-9abc-000000000001';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('codigoSolicitud', () => {
  it('should_return_branch_code_dash_number_when_request_has_number', () => {
    expect(codigoSolicitud({ id: ID, sucursal: 101, numero: 15 })).toBe('101-15');
  });

  it('should_use_first_number_when_it_is_the_first_request_of_the_branch', () => {
    expect(codigoSolicitud({ id: ID, sucursal: 145, numero: 1 })).toBe('145-1');
  });

  it('should_fall_back_to_short_uuid_when_number_is_missing', () => {
    expect(codigoSolicitud({ id: ID, sucursal: 101, numero: null })).toBe('#5EED0001');
    expect(codigoSolicitud({ id: ID, sucursal: 101 })).toBe('#5EED0001');
  });

  it('should_fall_back_to_short_uuid_when_branch_is_missing', () => {
    expect(codigoSolicitud({ id: ID, sucursal: null, numero: 3 })).toBe('#5EED0001');
  });

  it('should_return_whole_id_when_fallback_id_is_shorter_than_8_characters', () => {
    expect(codigoSolicitud({ id: 'ab12', sucursal: null, numero: null })).toBe('#AB12');
  });
});

describe('codigoTraslado', () => {
  it('should_return_first_8_characters_uppercased_with_hash_when_id_is_uuid', () => {
    expect(codigoTraslado('ffff0000-0000-0000-0000-000000000000')).toBe('#FFFF0000');
  });

  it('should_return_whole_id_when_it_is_shorter_than_8_characters', () => {
    expect(codigoTraslado('ab12')).toBe('#AB12');
  });
});

describe('coincideCodigoSolicitud', () => {
  const sol = { id: ID, sucursal: 101, numero: 15 };

  it('should_match_when_term_is_the_start_of_the_code', () => {
    expect(coincideCodigoSolicitud(sol, '101-15')).toBe(true);
    expect(coincideCodigoSolicitud(sol, '101-1')).toBe(true);
    expect(coincideCodigoSolicitud(sol, '101')).toBe(true);
  });

  it('should_ignore_hash_and_spaces_when_term_has_them', () => {
    expect(coincideCodigoSolicitud(sol, ' #101 - 15 ')).toBe(true);
  });

  it('should_not_match_when_term_is_another_code', () => {
    expect(coincideCodigoSolicitud(sol, '101-2')).toBe(false);
    expect(coincideCodigoSolicitud(sol, '102-15')).toBe(false);
  });

  it('should_match_when_term_is_part_of_the_uuid', () => {
    expect(coincideCodigoSolicitud(sol, '5EED0001')).toBe(true);
  });

  it('should_match_short_uuid_with_hash_when_request_has_no_number', () => {
    expect(coincideCodigoSolicitud({ id: ID, sucursal: null, numero: null }, '#5eed')).toBe(true);
  });

  it('should_match_everything_when_term_is_empty', () => {
    expect(coincideCodigoSolicitud(sol, '   ')).toBe(true);
  });
});
