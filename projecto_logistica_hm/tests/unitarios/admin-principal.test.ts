import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { esAdminPrincipal, getAdminPrincipalEmail } from '@/lib/auth/admin-principal';

const ORIGINAL = process.env.ADMIN_PRINCIPAL_EMAIL;

describe('getAdminPrincipalEmail', () => {
  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.ADMIN_PRINCIPAL_EMAIL;
    else process.env.ADMIN_PRINCIPAL_EMAIL = ORIGINAL;
  });

  it('should_return_normalized_email_when_env_is_set', () => {
    process.env.ADMIN_PRINCIPAL_EMAIL = '  Admin@Empresa.CL ';
    expect(getAdminPrincipalEmail()).toBe('admin@empresa.cl');
  });

  it('should_return_null_when_env_is_missing_or_blank', () => {
    delete process.env.ADMIN_PRINCIPAL_EMAIL;
    expect(getAdminPrincipalEmail()).toBeNull();
    process.env.ADMIN_PRINCIPAL_EMAIL = '   ';
    expect(getAdminPrincipalEmail()).toBeNull();
  });
});

describe('esAdminPrincipal', () => {
  beforeEach(() => {
    process.env.ADMIN_PRINCIPAL_EMAIL = 'admin@empresa.cl';
  });

  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.ADMIN_PRINCIPAL_EMAIL;
    else process.env.ADMIN_PRINCIPAL_EMAIL = ORIGINAL;
  });

  it('should_return_true_when_email_matches_ignoring_case', () => {
    expect(esAdminPrincipal('ADMIN@empresa.cl')).toBe(true);
  });

  it('should_return_false_when_email_differs', () => {
    expect(esAdminPrincipal('otro@empresa.cl')).toBe(false);
  });

  it('should_return_false_when_email_is_empty', () => {
    expect(esAdminPrincipal(null)).toBe(false);
    expect(esAdminPrincipal('')).toBe(false);
  });

  it('should_return_false_when_env_is_not_configured', () => {
    delete process.env.ADMIN_PRINCIPAL_EMAIL;
    expect(esAdminPrincipal('admin@empresa.cl')).toBe(false);
  });
});
