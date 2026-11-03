'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import ModalConsultaSolicitud, { type SolicitudConsultada } from '@/components/ModalConsultaSolicitud';
import { getSolicitudDetalleAction } from '@/app/actions/solicitudes.actions';
import { urlSinParametro } from '@/lib/enlaceNotificacion';

interface Props {
  /** Id que llega en `?solicitud=` (enlace de una notificación); null = no hace nada. */
  solicitudId: string | null;
}

/**
 * R2: abre en modo consulta la solicitud del enlace de una notificación, en
 * las pantallas que no tienen su propio detalle con acciones (prioridades,
 * recepciones) o cuando la solicitud ya no está en la lista de la pantalla.
 * Al cerrar quita `?solicitud=` de la URL para que recargar no lo reabra.
 */
export default function AbrirSolicitudDesdeUrl({ solicitudId }: Props) {
  const [abierta, setAbierta] = useState<SolicitudConsultada | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!solicitudId) return;
    let vigente = true;
    void getSolicitudDetalleAction(solicitudId).then((res) => {
      if (!vigente) return;
      if (res.success) setAbierta({ solicitud: res.solicitud, usuario: res.usuario });
      else setError(res.error);
    });
    return () => {
      vigente = false;
    };
  }, [solicitudId]);

  function cerrar() {
    setAbierta(null);
    setError(null);
    window.history.replaceState(null, '', urlSinParametro(window.location.href, 'solicitud'));
  }

  if (abierta) return <ModalConsultaSolicitud abierta={abierta} onClose={cerrar} />;
  if (!error) return null;
  return (
    <div role="alert" className="fixed top-4 left-1/2 -translate-x-1/2 z-50 max-w-md w-[calc(100%-2rem)] flex items-start gap-3 p-3.5 bg-white border border-red-200 rounded-xl shadow-lg text-sm text-red-700">
      <span className="flex-1">No se pudo abrir la solicitud del aviso: {error}</span>
      <button type="button" onClick={cerrar} aria-label="Cerrar" className="text-red-400 hover:text-red-700">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
