import { beforeEach, describe, expect, it, vi } from 'vitest';

const after = vi.fn();
vi.mock('next/server', () => ({ after: (fn: () => unknown) => after(fn) }));

const { enSegundoPlano } = await import('@/lib/segundoPlano');

describe('enSegundoPlano', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('should_schedule_task_with_after_when_inside_a_request', async () => {
    const tarea = vi.fn(async () => 'ok');

    enSegundoPlano(tarea);

    expect(after).toHaveBeenCalledTimes(1);
    expect(tarea).not.toHaveBeenCalled();
    await after.mock.calls[0][0]();
    expect(tarea).toHaveBeenCalledTimes(1);
  });

  it('should_run_task_immediately_when_after_is_not_available', async () => {
    after.mockImplementationOnce(() => {
      throw new Error('outside request scope');
    });
    const tarea = vi.fn(async () => 'ok');

    enSegundoPlano(tarea);
    await Promise.resolve();

    expect(tarea).toHaveBeenCalledTimes(1);
  });

  it('should_swallow_task_errors_and_log_them', async () => {
    const tarea = vi.fn(async () => {
      throw new Error('brevo caído');
    });

    enSegundoPlano(tarea);
    await expect(after.mock.calls[0][0]()).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalled();
  });
});
