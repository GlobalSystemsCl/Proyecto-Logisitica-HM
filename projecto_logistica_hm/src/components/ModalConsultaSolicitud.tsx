'use client';

import { createPortal } from 'react-dom';
import type { SolicitudLista } from '@/types/solicitud.types';
import type { UserRole } from '@/types/auth.types';
import SolicitudDetalleModal from '@/components/SolicitudDetalleModal';

export interface SolicitudConsultada {
  solicitud: SolicitudLista;
  usuario: { id: string; rol: UserRole };
}

interface Props {
  abierta: SolicitudConsultada;
  onClose: () => void;
}

/**
 * Detalle de una solicitud en modo consulta, montado en `document.body`. Lo
 * usan `AbrirSolicitudDetalle` (clic en el número) y `AbrirSolicitudDesdeUrl`
 * (enlace de una notificación). Las acciones siguen en la vista de cada una.
 */
export default function ModalConsultaSolicitud({ abierta, onClose }: Props) {
  return createPortal(
    // El portal saca el modal de enlaces, tarjetas y otros modales en el DOM.
    // React igual propaga sus eventos a la fila o tarjeta que contiene el
    // botón (clics, arrastre y teclado): por eso se cortan aquí.
    <div onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
      <SolicitudDetalleModal
        solicitud={abierta.solicitud}
        vehiculosInventario={[]}
        onClose={onClose}
        onMensaje={(tipo, mensaje) => { if (tipo === 'error') alert(mensaje); }}
        onCancelar={() => {}}
        puedeCancelar={false}
        puedeGestionarVehiculos={false}
        currentUserId={abierta.usuario.id}
        currentUserRol={abierta.usuario.rol}
      />
    </div>,
    document.body
  );
}
