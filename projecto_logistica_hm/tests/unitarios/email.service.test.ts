import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ASUNTO_CLAVE_RESTABLECIDA, ASUNTO_CREDENCIALES, EmailService, layoutCredenciales } from '@/services/email.service';

const fetchMock = vi.fn();

function cuerpoEnviado(): { htmlContent: string; to: Array<{ email: string; name: string }> } {
  const [, init] = fetchMock.mock.calls[0] as [string, { body: string }];
  return JSON.parse(init.body);
}

describe('EmailService.sendUserCredentialsEmail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ messageId: 'm-1' }) });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('should_escape_html_when_recipient_name_contains_tags', async () => {
    const res = await EmailService.sendUserCredentialsEmail({
      toEmail: 'juan@test.com',
      recipientName: '<script>alert(1)</script> <a href="https://phish">Click</a>',
      tempPassword: 'Abc<def>123',
      role: 'ejecutivo',
    });

    expect(res).toEqual({ success: true, messageId: 'm-1' });
    const { htmlContent } = cuerpoEnviado();
    expect(htmlContent).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(htmlContent).toContain('&lt;a href=&quot;https://phish&quot;&gt;');
    expect(htmlContent).not.toContain('<script>');
    expect(htmlContent).not.toContain('href="https://phish"');
    expect(htmlContent).toContain('Abc&lt;def&gt;123');
  });

  it('should_link_to_login_of_configured_app_url', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://app.test');

    await EmailService.sendUserCredentialsEmail({
      toEmail: 'a@test.com',
      recipientName: 'Ana',
      tempPassword: 'x',
      role: 'logistica',
    });

    expect(cuerpoEnviado().htmlContent).toContain('href="https://app.test/login"');
  });

  it('should_fail_without_calling_brevo_when_api_key_is_missing', async () => {
    vi.stubEnv('BREVO_API_KEY', '');

    const res = await EmailService.sendUserCredentialsEmail({
      toEmail: 'a@test.com',
      recipientName: 'Ana',
      tempPassword: 'x',
      role: 'ejecutivo',
    });

    expect(res.success).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('should_return_error_when_brevo_responds_with_error', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 401, json: async () => ({}) });

    const res = await EmailService.sendUserCredentialsEmail({
      toEmail: 'a@test.com',
      recipientName: 'Ana',
      tempPassword: 'x',
      role: 'ejecutivo',
    });

    expect(res.success).toBe(false);
    expect(res.error).toBe('Error HTTP 401 al enviar correo con Brevo.');
  });

  it('should_return_generic_error_when_fetch_throws', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED 10.0.0.1'));

    const res = await EmailService.sendUserCredentialsEmail({
      toEmail: 'a@test.com',
      recipientName: 'Ana',
      tempPassword: 'x',
      role: 'ejecutivo',
    });

    expect(res).toEqual({ success: false, error: 'Error al conectar con la API de Brevo' });
  });
});

describe('EmailService.enviarCorreo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ messageId: 'm-9' }) });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('should_send_subject_recipient_and_html_as_given', async () => {
    const res = await EmailService.enviarCorreo({
      toEmail: 'jl@test.cl',
      toName: 'Juan',
      asunto: '[H.Motores] Prueba',
      html: '<p>hola</p>',
    });

    expect(res).toEqual({ success: true, messageId: 'm-9' });
    const body = cuerpoEnviado() as unknown as { subject: string; htmlContent: string; to: unknown };
    expect(body.subject).toBe('[H.Motores] Prueba');
    expect(body.htmlContent).toBe('<p>hola</p>');
    expect(body.to).toEqual([{ email: 'jl@test.cl', name: 'Juan' }]);
  });

  it('should_not_throw_when_fetch_fails', async () => {
    fetchMock.mockRejectedValue(new Error('red'));
    const res = await EmailService.enviarCorreo({ toEmail: 'a@b.cl', toName: 'A', asunto: 'x', html: 'y' });
    expect(res).toEqual({ success: false, error: 'Error al conectar con la API de Brevo' });
  });
});


describe('EmailService.enviarCorreo (texto plano)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ messageId: 'm-2' }) });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should_send_plain_text_version_when_given', async () => {
    await EmailService.enviarCorreo({ toEmail: 'a@b.cl', toName: 'A', asunto: 'x', html: '<p>y</p>', texto: 'y' });
    expect((cuerpoEnviado() as unknown as { textContent: string }).textContent).toBe('y');
  });

  it('should_omit_plain_text_when_not_given', async () => {
    await EmailService.enviarCorreo({ toEmail: 'a@b.cl', toName: 'A', asunto: 'x', html: '<p>y</p>' });
    expect(cuerpoEnviado()).not.toHaveProperty('textContent');
  });
});

describe('EmailService.sendUserCredentialsEmail (plantilla)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ messageId: 'm-3' }) });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('should_send_logo_subject_and_plain_text', async () => {
    await EmailService.sendUserCredentialsEmail({ toEmail: 'a@test.com', recipientName: 'Ana', tempPassword: 'Xy1', role: 'jefe_local' });
    const body = cuerpoEnviado() as unknown as { subject: string; htmlContent: string; textContent: string };
    expect(body.subject).toBe(ASUNTO_CREDENCIALES);
    expect(body.htmlContent).toContain('/correo/logo-hmotores.png');
    expect(body.textContent).toContain('- Contraseña provisoria: Xy1');
    expect(body.textContent).toContain('- Rol: Jefe de Local');
  });

  it('should_use_reset_texts_when_password_was_reset', async () => {
    await EmailService.sendUserCredentialsEmail({
      toEmail: 'a@test.com',
      recipientName: 'Ana',
      tempPassword: 'Xy1',
      role: 'ejecutivo',
      motivo: 'restablecida',
    });
    const body = cuerpoEnviado() as unknown as { subject: string; htmlContent: string };
    expect(body.subject).toBe(ASUNTO_CLAVE_RESTABLECIDA);
    expect(body.htmlContent).toContain('La anterior ya no funciona.');
  });
});

describe('layoutCredenciales', () => {
  it('should_link_to_login_and_mark_password_as_monospace', () => {
    const l = layoutCredenciales({ toEmail: 'a@x.cl', recipientName: 'Ana', tempPassword: 'p', role: 'logistica' }, 'https://app.test/');
    expect(l.boton?.url).toBe('https://app.test/login');
    expect(l.detalles).toContainEqual(['Rol', 'Logística']);
    expect(l.detallesMonoespaciados).toContain('Contraseña provisoria');
    expect(l.titulo).toBe('Tu cuenta está lista');
  });

  it('should_use_given_login_url_and_keep_unknown_roles', () => {
    const l = layoutCredenciales(
      { toEmail: 'a@x.cl', recipientName: 'Ana', tempPassword: 'p', role: 'otro', loginUrl: 'https://otra/login' },
      'https://app.test'
    );
    expect(l.boton?.url).toBe('https://otra/login');
    expect(l.detalles).toContainEqual(['Rol', 'otro']);
  });
});
