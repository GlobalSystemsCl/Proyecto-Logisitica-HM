import { beforeEach, describe, expect, it, vi } from 'vitest';
import { codigoSolicitud } from '@/lib/codigoSolicitud';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('codigoSolicitud', () => {
  it('should_return_first_8_characters_uppercased_with_hash_when_id_is_uuid', () => {
    expect(codigoSolicitud('5eed0001-abcd-4ef0-9abc-000000000001')).toBe('#5EED0001');
  });

  it('should_return_whole_id_when_it_is_shorter_than_8_characters', () => {
    expect(codigoSolicitud('ab12')).toBe('#AB12');
  });
});
