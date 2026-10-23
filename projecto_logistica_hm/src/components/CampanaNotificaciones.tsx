'use client';

import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, CheckCheck } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { tiempoRelativo } from '@/lib/notificaciones-app';
import {
  getBandejaNotificacionesAction,
  marcarNotificacionLeidaAction,
  marcarTodasNotificacionesLeidasAction,
} from '@/app/actions/bandeja.actions';
import type { BandejaNotificaciones, NotificacionApp } from '@/services/notificacion.service';

interface Props {
  usuarioId: string;
}

/**
 * Campana de notificaciones del encabezado.
 *
 * Carga la bandeja con una Server Action y se suscribe con Supabase Realtime a
 * los INSERT de `notificacion` del propio usuario (la RLS de la tabla solo
 * entrega las suyas). Ante cada aviso vuelve a pedir la bandeja: el contenido
 * siempre sale del servidor, el canal solo avisa que hay algo nuevo.
 */
export default function CampanaNotificaciones({ usuarioId }: Props) {
  const router = useRouter();
  const [bandeja, setBandeja] = useState<BandejaNotificaciones>({ items: [], noLeidas: 0 });
  const [abierta, setAbierta] = useState(false);
  const [, startTransition] = useTransition();
  const contenedorRef = useRef<HTMLDivElement>(null);

  const recargar = useCallback(async () => {
    setBandeja(await getBandejaNotificacionesAction());
  }, []);

  // Carga inicial y suscripción en tiempo real.
  useEffect(() => {
    let activo = true;
    void getBandejaNotificacionesAction().then((b) => {
      if (activo) setBandeja(b);
    });

    const supabase = createClient();
    const canal = supabase.channel(`notificaciones:${usuarioId}`);
    void supabase.realtime.setAuth().then(() => {
      canal
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'notificacion', filter: `usuario_id=eq.${usuarioId}` },
          () => {
            void getBandejaNotificacionesAction().then((b) => {
              if (activo) setBandeja(b);
            });
          }
        )
        .subscribe();
    });

    return () => {
      activo = false;
      void supabase.removeChannel(canal);
    };
  }, [usuarioId]);

  // Cerrar al hacer clic fuera o con Escape.
  useEffect(() => {
    if (!abierta) return;
    const alClic = (e: MouseEvent) => {
      if (contenedorRef.current && !contenedorRef.current.contains(e.target as Node)) setAbierta(false);
    };
    const alTecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAbierta(false);
    };
    document.addEventListener('mousedown', alClic);
    document.addEventListener('keydown', alTecla);
    return () => {
      document.removeEventListener('mousedown', alClic);
      document.removeEventListener('keydown', alTecla);
    };
  }, [abierta]);

  const alternar = () => {
    const abrir = !abierta;
    setAbierta(abrir);
    if (abrir) void recargar();
  };

  const abrirNotificacion = (n: NotificacionApp) => {
    setAbierta(false);
    if (!n.leida) {
      setBandeja((b) => ({
        items: b.items.map((i) => (i.id === n.id ? { ...i, leida: true } : i)),
        noLeidas: Math.max(b.noLeidas - 1, 0),
      }));
      startTransition(async () => {
        await marcarNotificacionLeidaAction(n.id);
      });
    }
    if (n.ruta) router.push(n.ruta);
  };

  const marcarTodas = () => {
    setBandeja((b) => ({ items: b.items.map((i) => ({ ...i, leida: true })), noLeidas: 0 }));
    startTransition(async () => {
      await marcarTodasNotificacionesLeidasAction();
      await recargar();
    });
  };

  const etiquetaContador = bandeja.noLeidas > 99 ? '99+' : String(bandeja.noLeidas);

  return (
    <div ref={contenedorRef} className="relative">
      <button
        type="button"
        onClick={alternar}
        aria-label={bandeja.noLeidas > 0 ? `Notificaciones: ${bandeja.noLeidas} sin leer` : 'Notificaciones'}
        aria-expanded={abierta}
        aria-haspopup="true"
        title="Notificaciones"
        className="relative p-2 rounded-full text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100 transition-colors cursor-pointer"
      >
        <Bell className="w-5 h-5" />
        {bandeja.noLeidas > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[10px] font-bold leading-[18px] text-center">
            {etiquetaContador}
          </span>
        )}
      </button>

      {abierta && (
        <div
          role="dialog"
          aria-label="Notificaciones"
          className="fixed inset-x-4 top-16 sm:absolute sm:inset-x-auto sm:top-auto sm:right-0 sm:mt-2 sm:w-[22rem] bg-white border border-neutral-200 rounded-2xl shadow-xl z-50 overflow-hidden"
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200">
            <p className="text-sm font-semibold text-neutral-900">Notificaciones</p>
            {bandeja.noLeidas > 0 && (
              <button
                type="button"
                onClick={marcarTodas}
                className="flex items-center gap-1 text-xs font-semibold text-neutral-600 hover:text-neutral-900 cursor-pointer"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                Marcar todas como leídas
              </button>
            )}
          </div>

          {bandeja.items.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-neutral-500">No tienes notificaciones.</p>
          ) : (
            <ul className="max-h-[26rem] overflow-y-auto divide-y divide-neutral-100">
              {bandeja.items.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => abrirNotificacion(n)}
                    className={`w-full text-left px-4 py-3 flex gap-3 hover:bg-neutral-50 transition-colors cursor-pointer ${
                      n.leida ? '' : 'bg-blue-50/50'
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${n.leida ? 'bg-transparent' : 'bg-blue-600'}`}
                    />
                    <span className="min-w-0">
                      <span className={`block text-sm ${n.leida ? 'text-neutral-700' : 'font-semibold text-neutral-900'}`}>
                        {n.titulo}
                      </span>
                      <span className="block text-xs text-neutral-600 mt-0.5 break-words">{n.mensaje}</span>
                      <span className="block text-[11px] text-neutral-400 mt-1">{tiempoRelativo(n.created_at)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
