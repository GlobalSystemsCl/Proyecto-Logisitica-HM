'use client';

import { useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Loader2 } from 'lucide-react';
import type { SolicitudLista } from '@/types/solicitud.types';
import type { UserRole } from '@/types/auth.types';
import SolicitudDetalleModal from '@/components/SolicitudDetalleModal';
import { getSolicitudDetalleAction } from '@/app/actions/solicitudes.actions';

interface Props {
  solicitudId: string;
  children: ReactNode;
  className?: string;
}

interface Abierta {
  solicitud: SolicitudLista;
  usuario: { id: string; rol: UserRole };
}

/**
 * Abre el detalle de una solicitud en modo consulta desde cualquier sección
 * (paneles, prioridades, recepciones, reportes, sucursales). Carga los datos
 * al hacer clic, con el mismo control de acceso que el resto del detalle.
 * Las acciones sobre la solicitud siguen en la vista de cada una.
 */
export default function AbrirSolicitudDetalle({ solicitudId, children, className }: Props) {
  const [abierta, setAbierta] = useState<Abierta | null>(null);
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
        className={`inline-flex items-center gap-1 underline decoration-dotted underline-offset-2 hover:decoration-solid cursor-pointer ${className ?? ''}`}
      >
        {children}
        {cargando && <Loader2 className="w-3 h-3 animate-spin" />}
      </button>
      {error && !abierta && <span className="ml-1 text-[11px] text-red-600">{error}</span>}
      {abierta && createPortal(
        // El portal saca el modal de enlaces, tarjetas y otros modales en el DOM.
        // React igual propaga sus eventos a la fila o tarjeta que contiene el
        // botón (clics, arrastre y teclado): por eso se cortan aquí.
        <div onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
          <SolicitudDetalleModal
            solicitud={abierta.solicitud}
            vehiculosInventario={[]}
            onClose={() => setAbierta(null)}
            onMensaje={(tipo, mensaje) => { if (tipo === 'error') alert(mensaje); }}
            onCancelar={() => {}}
            puedeCancelar={false}
            puedeGestionarVehiculos={false}
            currentUserId={abierta.usuario.id}
            currentUserRol={abierta.usuario.rol}
          />
        </div>,
        document.body
      )}
    </>
  );
}
