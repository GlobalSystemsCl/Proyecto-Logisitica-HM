import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DOMINIOS_POR_DEFECTO,
  esCorreoPermitido,
  getDominiosPermitidos,
  parsearDominios,
  textoDominios,
  validarDominioCorreo,
} from '@/lib/dominios';

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('parsearDominios', () => {
  it('should_return_default_domain_when_value_is_missing_or_blank', () => {
    expect(parsearDominios(undefined)).toEqual(DOMINIOS_POR_DEFECTO);
    expect(parsearDominios('  ')).toEqual(DOMINIOS_POR_DEFECTO);
  });

  it('should_return_null_when_value_is_asterisk', () => {
    expect(parsearDominios('*')).toBeNull();
  });

  it('should_normalize_and_deduplicate_when_value_has_several_domains', () => {
    expect(parsearDominios(' HMotores.cl, @otro.cl ,hmotores.cl,')).toEqual(['hmotores.cl', 'otro.cl']);
  });

  it('should_return_default_when_value_has_only_commas', () => {
    expect(parsearDominios(',,')).toEqual(DOMINIOS_POR_DEFECTO);
  });
});

describe('getDominiosPermitidos', () => {
  it('should_read_environment_variable', () => {
    vi.stubEnv('DOMINIOS_CORREO_PERMITIDOS', 'a.cl,b.cl');
    expect(getDominiosPermitidos()).toEqual(['a.cl', 'b.cl']);
  });
});

describe('esCorreoPermitido', () => {
  it('should_accept_email_of_allowed_domain_ignoring_case', () => {
    expect(esCorreoPermitido(' Juan.Perez@HMOTORES.cl ', ['hmotores.cl'])).toBe(true);
  });

  it('should_reject_other_domains_and_subdomains', () => {
    expect(esCorreoPermitido('juan@gmail.com', ['hmotores.cl'])).toBe(false);
    expect(esCorreoPermitido('juan@ventas.hmotores.cl', ['hmotores.cl'])).toBe(false);
    expect(esCorreoPermitido('sin-arroba', ['hmotores.cl'])).toBe(false);
  });

  it('should_accept_any_email_when_there_is_no_restriction', () => {
    expect(esCorreoPermitido('juan@gmail.com', null)).toBe(true);
  });
});

describe('textoDominios', () => {
  it('should_prefix_each_domain_with_at_sign', () => {
    expect(textoDominios(['hmotores.cl', 'otro.cl'])).toBe('@hmotores.cl, @otro.cl');
  });
});

describe('validarDominioCorreo', () => {
  it('should_return_null_when_domain_is_allowed', () => {
    expect(validarDominioCorreo('a@hmotores.cl', ['hmotores.cl'])).toBeNull();
  });

  it('should_return_message_listing_domains_when_domain_is_not_allowed', () => {
    expect(validarDominioCorreo('a@gmail.com', ['hmotores.cl'])).toBe(
      'Solo se pueden crear cuentas con correo corporativo (@hmotores.cl).'
    );
  });

  it('should_use_environment_when_domains_are_not_given', () => {
    vi.stubEnv('DOMINIOS_CORREO_PERMITIDOS', '*');
    expect(validarDominioCorreo('a@gmail.com')).toBeNull();
  });
});
