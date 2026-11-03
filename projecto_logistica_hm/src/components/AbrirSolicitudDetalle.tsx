'use client';

import { useState, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import ModalConsultaSolicitud, { type SolicitudConsultada } from '@/components/ModalConsultaSolicitud';
import { getSolicitudDetalleAction } from '@/app/actions/solicitudes.actions';

interface Props {
  solicitudId: string;
  children: ReactNode;
  className?: string;
}

/**
 * Abre el detalle de una solicitud en modo consulta desde cualquier sección
 * (paneles, prioridades, recepciones, reportes, sucursales). Carga los datos
 * al hacer clic, con el mismo control de acceso que el resto del detalle.
 * Las acciones sobre la solicitud siguen en la vista de cada una.
 */
export default function AbrirSolicitudDetalle({ solicitudId, children, className }: Props) {
  const [abierta, setAbierta] = useState<SolicitudConsultada | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function abrir(e: React.MouseEvent) {
    // Las filas pueden ser enlaces o tarjetas arrastrables.
    e.preventDefault();
    e.stopPropagation();
    if (cargando) return;
    setCargando(true);
    setError(null);
    try {
      const res = await getSolicitudDetalleAction(solicitudId);
      if (res.success) setAbierta({ solicitud: res.solicitud, usuario: res.usuario });
      else setError(res.error);
    } finally {
      setCargando(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={abrir}
        onPointerDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        title="Ver detalle de la solicitud"
        aria-label="Ver detalle de la solicitud"
        // El relleno con margen negativo agranda la zona táctil sin mover el texto.
        className={`inline-flex items-center gap-1 py-2 -my-2 underline decoration-dotted underline-offset-2 hover:decoration-solid cursor-pointer ${className ?? ''}`}
      >
        {children}
        {cargando && <Loader2 className="w-3 h-3 animate-spin" />}
      </button>
      {error && !abierta && <span className="ml-1 text-[11px] text-red-600">{error}</span>}
      {abierta && <ModalConsultaSolicitud abierta={abierta} onClose={() => setAbierta(null)} />}
    </>
  );
}
