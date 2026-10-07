import { describe, expect, it } from 'vitest';
import { CONTENT_SECURITY_POLICY, SECURITY_HEADERS } from '@/config/security-headers';

const valor = (key: string) => SECURITY_HEADERS.find((h) => h.key === key)?.value;

describe('SECURITY_HEADERS', () => {
  it('should_deny_framing_and_mime_sniffing', () => {
    expect(valor('X-Frame-Options')).toBe('DENY');
    expect(valor('X-Content-Type-Options')).toBe('nosniff');
  });

  it('should_define_hsts_referrer_and_permissions_policies', () => {
    expect(valor('Strict-Transport-Security')).toMatch(/max-age=\d+/);
    expect(valor('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
    expect(valor('Permissions-Policy')).toContain('camera=()');
  });

  it('should_publish_csp_in_report_only_mode', () => {
    expect(valor('Content-Security-Policy-Report-Only')).toBe(CONTENT_SECURITY_POLICY);
    expect(valor('Content-Security-Policy')).toBeUndefined();
  });

  it('should_not_have_duplicate_keys', () => {
    const keys = SECURITY_HEADERS.map((h) => h.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('CONTENT_SECURITY_POLICY', () => {
  it('should_forbid_framing_and_plugins', () => {
    expect(CONTENT_SECURITY_POLICY).toContain("frame-ancestors 'none'");
    expect(CONTENT_SECURITY_POLICY).toContain("object-src 'none'");
  });

  it('should_allow_connections_to_supabase_url', () => {
    expect(CONTENT_SECURITY_POLICY).toContain(`connect-src 'self' ${process.env.NEXT_PUBLIC_SUPABASE_URL}`);
  });
});
