'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Mail,
  Phone,
  Building2,
  ShieldCheck,
  CalendarDays,
  UserRound,
  X,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { getUsuarioDetalleAction } from '@/app/actions/solicitudes.actions';
import { ROL_LABEL, UsuarioDetalle } from '@/types/auth.types';
import { formatFechaLarga } from '@/lib/fechas';

interface UsuarioInfoModalProps {
  usuarioId: string;
  nombreFallback: string | null | undefined;
  onClose: () => void;
}

/**
 * Popup con los datos de contacto de un usuario. Sigue el patrón de modales
 * del sistema (fondo oscuro + card redondeada centrada).
 */
export function UsuarioInfoModal({ usuarioId, nombreFallback, onClose }: UsuarioInfoModalProps) {
  const [data, setData] = useState<UsuarioDetalle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const detalle = await getUsuarioDetalleAction(usuarioId);
      if (cancelled) return;
      if (detalle) {
        setData(detalle);
      } else {
        setError(true);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [usuarioId]);

  const nombre = data ? `${data.nombre} ${data.apellido}`.trim() : nombreFallback || 'Usuario';

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in">
      <div
        className="bg-white border border-neutral-200 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 pt-6 pb-5 border-b border-neutral-200 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-neutral-200 flex items-center justify-center shrink-0">
              <UserRound className="w-6 h-6 text-neutral-500" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-neutral-900">Datos de contacto</h3>
              {data && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-neutral-900 text-white mt-1">
                  {ROL_LABEL[data.rol]}
                </span>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-neutral-400 hover:text-neutral-900 hover:bg-neutral-100 transition-colors cursor-pointer"
            title="Cerrar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          <div>
            <p className="text-base font-bold text-neutral-900">{nombre}</p>
            {data && <p className="text-xs text-neutral-500">{data.email}</p>}
          </div>

          {loading && (
            <div className="flex items-center gap-2 text-sm text-neutral-500 py-4">
              <Loader2 className="w-4 h-4 animate-spin" />
              Cargando datos del usuario...
            </div>
          )}

          {error && !data && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>No se pudieron cargar los datos de este usuario.</span>
            </div>
          )}

          {data && (
            <div className="grid grid-cols-1 gap-3">
              <div className="bg-neutral-50 border border-neutral-200 rounded-xl px-4 py-3 flex items-center gap-3">
                <span className="w-9 h-9 rounded-lg bg-white border border-neutral-200 flex items-center justify-center shrink-0">
                  <ShieldCheck className="w-4 h-4 text-neutral-600" />
                </span>
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider">Rol del sistema</p>
                  <p className="text-sm font-semibold text-neutral-900">{ROL_LABEL[data.rol]}</p>
                </div>
              </div>
              <div className="bg-neutral-50 border border-neutral-200 rounded-xl px-4 py-3 flex items-center gap-3">
                <span className="w-9 h-9 rounded-lg bg-white border border-neutral-200 flex items-center justify-center shrink-0">
                  <Building2 className="w-4 h-4 text-neutral-600" />
                </span>
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider">Sucursal</p>
                  <p className="text-sm font-semibold text-neutral-900">
                    {data.sucursal_nombre || (data.sucursal_id ? `#${data.sucursal_id}` : 'Sin asignar')}
                  </p>
                </div>
              </div>
              <div className="bg-neutral-50 border border-neutral-200 rounded-xl px-4 py-3 flex items-center gap-3">
                <span className="w-9 h-9 rounded-lg bg-white border border-neutral-200 flex items-center justify-center shrink-0">
                  <Phone className="w-4 h-4 text-neutral-600" />
                </span>
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider">Teléfono</p>
                  <p className="text-sm font-semibold text-neutral-900">{data.telefono || 'Sin registrar'}</p>
                </div>
              </div>
              <div className="bg-neutral-50 border border-neutral-200 rounded-xl px-4 py-3 flex items-center gap-3">
                <span className="w-9 h-9 rounded-lg bg-white border border-neutral-200 flex items-center justify-center shrink-0">
                  <Mail className="w-4 h-4 text-neutral-600" />
                </span>
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider">Correo electrónico</p>
                  <p className="text-sm font-semibold text-neutral-900 break-all">{data.email}</p>
                </div>
              </div>
              <div className="bg-neutral-50 border border-neutral-200 rounded-xl px-4 py-3 flex items-center gap-3">
                <span className="w-9 h-9 rounded-lg bg-white border border-neutral-200 flex items-center justify-center shrink-0">
                  <CalendarDays className="w-4 h-4 text-neutral-600" />
                </span>
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider">Miembro desde</p>
                  <p className="text-sm font-semibold text-neutral-900">{formatFechaLarga(data.created_at)}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

interface UsuarioNombreBotonProps {
  usuarioId: string | null;
  nombre: string | null | undefined;
  muted?: boolean;
}

/**
 * Renderiza el nombre de un usuario como botón cliqueable; al hacer clic abre
 * el popup con los datos de contacto del usuario.
 */
export function UsuarioNombreBoton({ usuarioId, nombre, muted }: UsuarioNombreBotonProps) {
  const [open, setOpen] = useState(false);

  if (!usuarioId) {
    return <span className={muted ? 'text-neutral-400' : 'text-neutral-700'}>{nombre || 'Sistema'}</span>;
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`inline-flex items-center gap-1 font-medium underline decoration-dotted underline-offset-4 hover:decoration-solid transition-colors cursor-pointer ${
          muted ? 'text-neutral-400 hover:text-neutral-900' : 'text-neutral-700 hover:text-neutral-900'
        }`}
        title="Ver datos del usuario"
      >
        <UserRound className="w-3.5 h-3.5 opacity-60" />
        {nombre || 'Usuario'}
      </button>
      {open && <UsuarioInfoModal usuarioId={usuarioId} nombreFallback={nombre} onClose={() => setOpen(false)} />}
    </>
  );
}