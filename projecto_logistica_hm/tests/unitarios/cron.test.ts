import { beforeEach, describe, expect, it, vi } from 'vitest';
import { autorizadoCron } from '@/lib/cron';

const SECRETO = 'un-secreto-largo-de-prueba';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('autorizadoCron', () => {
  it('should_accept_the_bearer_header_with_the_configured_secret', () => {
    expect(autorizadoCron(`Bearer ${SECRETO}`, SECRETO)).toBe(true);
  });

  it('should_reject_missing_or_wrong_headers', () => {
    expect(autorizadoCron(null, SECRETO)).toBe(false);
    expect(autorizadoCron(SECRETO, SECRETO)).toBe(false);
    expect(autorizadoCron('Bearer otro', SECRETO)).toBe(false);
  });

  it('should_stay_closed_without_a_secret_or_with_a_short_one', () => {
    expect(autorizadoCron('Bearer ', undefined)).toBe(false);
    expect(autorizadoCron('Bearer corto', 'corto')).toBe(false);
  });
});
