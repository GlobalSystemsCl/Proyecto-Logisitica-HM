import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ASUNTO_RECUPERACION, VIGENCIA_ENLACE, enlaceRecuperacion, htmlCorreoRecuperacion } from '@/lib/recuperacionClave';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('enlaceRecuperacion', () => {
  it('should_point_to_callback_with_token_hash_type_and_next', () => {
    expect(enlaceRecuperacion('https://app.test', 'abc')).toBe(
      'https://app.test/auth/callback?token_hash=abc&type=recovery&next=%2Festablecer-clave'
    );
  });

  it('should_drop_trailing_slash_and_encode_token', () => {
    expect(enlaceRecuperacion('https://app.test/', 'a b&c')).toBe(
      'https://app.test/auth/callback?token_hash=a+b%26c&type=recovery&next=%2Festablecer-clave'
    );
  });
});

describe('htmlCorreoRecuperacion', () => {
  it('should_include_escaped_name_link_and_validity', () => {
    const html = htmlCorreoRecuperacion('<Ana>', 'https://app.test/auth/callback?token_hash=x&type=recovery');
    expect(html).toContain('Hola, &lt;Ana&gt;.');
    expect(html).toContain('href="https://app.test/auth/callback?token_hash=x&amp;type=recovery"');
    expect(html).toContain(`vence en ${VIGENCIA_ENLACE}`);
    expect(html).not.toContain('<Ana>');
  });

  it('should_use_the_recovery_subject_as_title', () => {
    expect(htmlCorreoRecuperacion('Ana', 'https://x')).toContain('<title>[H.Motores] Restablece tu contraseña</title>');
    expect(ASUNTO_RECUPERACION).toBe('[H.Motores] Restablece tu contraseña');
  });
});
