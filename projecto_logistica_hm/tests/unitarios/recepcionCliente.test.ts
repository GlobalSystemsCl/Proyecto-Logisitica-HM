import { beforeEach, describe, expect, it, vi } from 'vitest';

const recibir = vi.fn();
const subir = vi.fn();

vi.mock('@/app/actions/solicitudes.actions', () => ({
  recibirSolicitudAction: (...args: unknown[]) => recibir(...args),
  subirDocumentosSolicitudAction: (...args: unknown[]) => subir(...args),
}));

const { recibirSolicitudConFotos } = await import('@/lib/recepcionCliente');

const foto = () => new File([new Uint8Array([0xff, 0xd8, 0xff])], 'foto.jpg', { type: 'image/jpeg' });

describe('recibirSolicitudConFotos', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should_receive_without_uploading_when_there_are_no_photos', async () => {
    recibir.mockResolvedValue({ success: true });

    const res = await recibirSolicitudConFotos('s-1', { conNovedades: false }, []);

    expect(res).toEqual({ error: null, aviso: null });
    expect(recibir).toHaveBeenCalledWith('s-1', { conNovedades: false });
    expect(subir).not.toHaveBeenCalled();
  });

  it('should_upload_photos_after_successful_reception', async () => {
    recibir.mockResolvedValue({ success: true });
    subir.mockResolvedValue({ success: true });

    const res = await recibirSolicitudConFotos('s-1', { conNovedades: true, observacion: 'Rayón' }, [foto(), foto()]);

    expect(res).toEqual({ error: null, aviso: null });
    const fd = subir.mock.calls[0][1] as FormData;
    expect(subir.mock.calls[0][0]).toBe('s-1');
    expect(fd.getAll('archivos')).toHaveLength(2);
  });

  it('should_not_upload_when_reception_fails', async () => {
    recibir.mockResolvedValue({ success: false, error: 'No tienes acceso a esta solicitud.' });

    const res = await recibirSolicitudConFotos('s-1', { conNovedades: false }, [foto()]);

    expect(res).toEqual({ error: 'No tienes acceso a esta solicitud.', aviso: null });
    expect(subir).not.toHaveBeenCalled();
  });

  it('should_warn_without_error_when_reception_succeeds_but_photos_fail', async () => {
    recibir.mockResolvedValue({ success: true });
    subir.mockResolvedValue({ success: false, error: 'El contenido del archivo "foto.jpg" no corresponde a su tipo.' });

    const res = await recibirSolicitudConFotos('s-1', { conNovedades: false }, [foto()]);

    expect(res.error).toBeNull();
    expect(res.aviso).toContain('La recepción quedó registrada');
    expect(res.aviso).toContain('no corresponde a su tipo');
  });

  it('should_use_default_message_when_reception_error_is_missing', async () => {
    recibir.mockResolvedValue({ success: false });
    const res = await recibirSolicitudConFotos('s-1', { conNovedades: false }, []);
    expect(res.error).toBe('No se pudo registrar la recepción.');
  });
});
