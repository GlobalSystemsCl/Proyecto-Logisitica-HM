import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { correoSimulado, ERROR_CORREO_SIMULADO } from '@/lib/correoSimulado';
import { EmailService } from '@/services/email.service';

describe('correoSimulado', () => {
  it('should_return_true_when_variable_is_1', () => {
    expect(correoSimulado({ CORREO_SIMULADO: '1' })).toBe(true);
  });

  it('should_return_true_when_variable_is_true_with_spaces_and_uppercase', () => {
    expect(correoSimulado({ CORREO_SIMULADO: '  TRUE ' })).toBe(true);
  });

  it('should_return_false_when_variable_is_missing', () => {
    expect(correoSimulado({})).toBe(false);
  });

  it('should_return_true_when_deployed_from_stress_test_branch_without_variable', () => {
    expect(correoSimulado({ VERCEL_GIT_COMMIT_REF: 'stress-test' })).toBe(true);
  });

  it('should_return_false_when_deployed_from_main_branch', () => {
    expect(correoSimulado({ VERCEL_GIT_COMMIT_REF: 'main' })).toBe(false);
  });

  it('should_return_false_when_variable_is_empty_or_zero', () => {
    expect(correoSimulado({ CORREO_SIMULADO: '' })).toBe(false);
    expect(correoSimulado({ CORREO_SIMULADO: '0' })).toBe(false);
    expect(correoSimulado({ CORREO_SIMULADO: 'false' })).toBe(false);
  });
});

describe('EmailService.enviarCorreo con CORREO_SIMULADO', () => {
  const fetchMock = vi.fn();
  const params = { toEmail: 'a@test.com', toName: 'Ana', asunto: 'Asunto', html: '<p>x</p>' };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ messageId: 'm-1' }) });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('should_not_call_brevo_and_fail_when_simulated_mode_is_on', async () => {
    vi.stubEnv('CORREO_SIMULADO', '1');
    vi.stubEnv('BREVO_API_KEY', 'clave-real');

    const res = await EmailService.enviarCorreo(params);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(res).toEqual({ success: false, error: ERROR_CORREO_SIMULADO });
  });

  it('should_call_brevo_when_simulated_mode_is_off', async () => {
    vi.stubEnv('CORREO_SIMULADO', '');
    vi.stubEnv('BREVO_API_KEY', 'clave-real');

    const res = await EmailService.enviarCorreo(params);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(res).toEqual({ success: true, messageId: 'm-1' });
  });

  it('should_block_credentials_email_when_simulated_mode_is_on', async () => {
    vi.stubEnv('CORREO_SIMULADO', 'true');
    vi.stubEnv('BREVO_API_KEY', 'clave-real');
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://app.test');

    const res = await EmailService.sendUserCredentialsEmail({
      toEmail: 'b@test.com',
      recipientName: 'Beto',
      tempPassword: 'x',
      role: 'ejecutivo',
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(res.success).toBe(false);
  });
});
