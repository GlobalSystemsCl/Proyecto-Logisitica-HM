'use client';

import { useState } from 'react';
import { Clock, Flag, Loader2, PackageCheck, Truck, X, XCircle } from 'lucide-react';
import type { SolicitudLista } from '@/types/solicitud.types';
import PanelAcciones from '@/components/PanelAcciones';
import { finalizarSolicitudAction } from '@/app/actions/solicitudes.actions';
import { gruposPanelEjecutivo, recortar, LIMITE_PANEL_EJECUTIVO } from '@/lib/panel';
import { formatFecha } from '@/lib/fechas';
import { etiquetaVehiculo } from '@/lib/vehiculo';
import { ETIQUETA_FECHA_LIMITE } from '@/lib/textos';

interface Props {
  solicitudes: SolicitudLista[];
  /** Abre el formulario de nueva solicitud (para las rechazadas). */
  onCrearNueva?: () => void;
}

const ESTADO_EN_CURSO: Record<string, string> = {
  aprobada: 'Aprobada',
  priorizada: 'Priorizada',
  asignada: 'Asignada a logística',
  calendarizada: 'Programada',
  despachada: 'Despachada',
  en_transito: 'En tránsito',
};

function ruta(s: SolicitudLista): string {
  return `${s.sucursal_nombre ?? `Sucursal ${s.sucursal}`} → ${s.sucursal_destino_nombre ?? s.titulo_evento ?? 'Evento'}`;
}

function vehiculos(s: SolicitudLista): string {
  return s.vehiculos.map((v) => etiquetaVehiculo(v)).filter(Boolean).join(' · ') || 'Sin vehículos';
}

/**
 * R12: panel del Ejecutivo con un contenedor por cada acción, para acceder más
 * rápido a lo que le corresponde. "Ver todas" abre la tabla filtrada.
 */
export default function PanelEjecutivo({ solicitudes, onCrearNueva }: Props) {
  const [entregando, setEntregando] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ tipo: 'success' | 'error'; mensaje: string } | null>(null);
  const grupos = gruposPanelEjecutivo(solicitudes);

  const pendientes = recortar(grupos.pendientes, LIMITE_PANEL_EJECUTIVO);
  const enCurso = recortar(grupos.en_curso, LIMITE_PANEL_EJECUTIVO);
  const porEntregar = recortar(grupos.por_entregar, LIMITE_PANEL_EJECUTIVO);
  const rechazadas = recortar(grupos.rechazadas, LIMITE_PANEL_EJECUTIVO);

  async function entregar(s: SolicitudLista) {
    if (!window.confirm(`¿Confirmas la entrega al cliente de la solicitud #${s.id.slice(0, 8)}?`)) return;
    setEntregando(s.id);
    try {
      const res = await finalizarSolicitudAction(s.id);
      setFeedback({
        tipo: res.success ? 'success' : 'error',
        mensaje: res.success ? res.message ?? 'Entrega registrada.' : res.error ?? 'No se pudo registrar la entrega.',
      });
    } finally {
      setEntregando(null);
    }
  }

  return (
    <div className="space-y-4">
      {feedback && (
        <div
          className={`flex items-center gap-3 p-3 rounded-xl border text-sm ${
            feedback.tipo === 'success' ? 'bg-green-50 text-green-800 border-green-200' : 'bg-red-50 text-red-800 border-red-200'
          }`}
        >
          <span className="flex-1">{feedback.mensaje}</span>
          <button onClick={() => setFeedback(null)} className="cursor-pointer" aria-label="Cerrar">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <PanelAcciones
          titulo="Pendientes de aprobación"
          descripcion="Esperando al Jefe de Local"
          icono={<Clock className="w-5 h-5 text-neutral-600" />}
          total={pendientes.total}
          restantes={pendientes.restantes}
          verTodasHref="/solicitudes?grupo=pendientes#lista"
          textoVacio="Nada pendiente."
          tono="neutro"
        >
          {pendientes.items.map((s) => (
            <li key={s.id} className="px-5 py-3">
              <p className="text-sm font-semibold text-neutral-900 truncate">{ruta(s)}</p>
              <p className="text-xs text-neutral-500 truncate">{vehiculos(s)}</p>
              <p className="text-[11px] text-neutral-400">Creada {formatFecha(s.fecha_creacion)}</p>
            </li>
          ))}
        </PanelAcciones>

        <PanelAcciones
          titulo="En curso"
          descripcion="Aprobadas, programadas o en camino"
          icono={<Truck className="w-5 h-5 text-blue-600" />}
          total={enCurso.total}
          restantes={enCurso.restantes}
          verTodasHref="/solicitudes?grupo=en_curso#lista"
          textoVacio="No hay traslados en curso."
          tono="azul"
        >
          {enCurso.items.map((s) => (
            <li key={s.id} className="px-5 py-3">
              <p className="text-sm font-semibold text-neutral-900 truncate">{ruta(s)}</p>
              <p className="text-xs text-neutral-500 truncate">
                <span className="font-semibold text-blue-700">{ESTADO_EN_CURSO[s.estado] ?? s.estado}</span> · {vehiculos(s)}
              </p>
              <p className="text-[11px] text-neutral-400">
                {s.fecha_tentativa_despacho
                  ? `Despacho programado: ${formatFecha(s.fecha_tentativa_despacho)}`
                  : `${ETIQUETA_FECHA_LIMITE}: ${formatFecha(s.fecha_limite) || '—'}`}
              </p>
            </li>
          ))}
        </PanelAcciones>

        <PanelAcciones
          titulo="Por entregar al cliente"
          descripcion="Ya recibidas en la sucursal"
          icono={<PackageCheck className="w-5 h-5 text-emerald-600" />}
          total={porEntregar.total}
          restantes={porEntregar.restantes}
          verTodasHref="/solicitudes?grupo=por_entregar#lista"
          textoVacio="Nada por entregar."
          tono="verde"
        >
          {porEntregar.items.map((s) => (
            <li key={s.id} className="px-5 py-3 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-neutral-900 truncate">{ruta(s)}</p>
                <p className="text-xs text-neutral-500 truncate">{vehiculos(s)}</p>
                <p className="text-[11px] text-neutral-400">Recibida {formatFecha(s.fecha_recepcion ?? s.fecha_entrega)}</p>
              </div>
              <button
                onClick={() => entregar(s)}
                disabled={entregando !== null}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shrink-0 cursor-pointer disabled:opacity-50"
              >
                {entregando === s.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Flag className="w-3 h-3" />}
                Entregar
              </button>
            </li>
          ))}
        </PanelAcciones>

        <PanelAcciones
          titulo="Rechazadas"
          descripcion="Sin apelación: crea una nueva si la necesitas"
          icono={<XCircle className="w-5 h-5 text-red-600" />}
          total={rechazadas.total}
          restantes={rechazadas.restantes}
          verTodasHref="/solicitudes?grupo=rechazadas#lista"
          textoVacio="No tienes solicitudes rechazadas."
          tono="rojo"
        >
          {rechazadas.items.map((s) => (
            <li key={s.id} className="px-5 py-3">
              <p className="text-sm font-semibold text-neutral-900 truncate">{ruta(s)}</p>
              <p className="text-xs text-neutral-500 truncate">{vehiculos(s)}</p>
            </li>
          ))}
          {onCrearNueva && rechazadas.total > 0 && (
            <li className="px-5 py-3">
              <button
                onClick={onCrearNueva}
                className="text-xs font-semibold text-red-700 hover:underline cursor-pointer"
              >
                + Crear nueva solicitud
              </button>
            </li>
          )}
        </PanelAcciones>
      </div>
    </div>
  );
}
