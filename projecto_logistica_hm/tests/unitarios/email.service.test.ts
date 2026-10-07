import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EmailService } from '@/services/email.service';

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
