'use client';

import { useState } from 'react';
import { CheckCircle2, Inbox, MapPin, PackageCheck, Truck, X } from 'lucide-react';
import type { SolicitudLista } from '@/types/solicitud.types';
import type { TrasladoInterno } from '@/types/traslado.types';
import { recibirTrasladoAction } from '@/app/actions/traslados.actions';
import { RecepcionModal } from '@/components/ModalesTraslado';
import { recibirSolicitudConFotos } from '@/lib/recepcionCliente';
import type { DatosRecepcion } from '@/lib/recepcion';
import { formatFecha } from '@/lib/fechas';
import { etiquetaVehiculo } from '@/lib/vehiculo';
import { ETIQUETA_FECHA_LIMITE } from '@/lib/textos';
import { CHIP_ATRASO, getEstadoAtraso } from '../SolicitudesClient';

interface Props {
  solicitudes: SolicitudLista[];
  traslados: TrasladoInterno[];
}

type Objetivo = { tipo: 'solicitud'; item: SolicitudLista } | { tipo: 'traslado'; item: TrasladoInterno };

export default function RecepcionesClient({ solicitudes, traslados }: Props) {
  const [objetivo, setObjetivo] = useState<Objetivo | null>(null);
  const [feedback, setFeedback] = useState<{ tipo: 'success' | 'error'; mensaje: string } | null>(null);

  async function confirmar(datos: DatosRecepcion, fotos: File[]): Promise<string | null> {
    if (!objetivo) return null;
    if (objetivo.tipo === 'solicitud') {
      const { error, aviso } = await recibirSolicitudConFotos(objetivo.item.id, datos, fotos);
      if (error) return error;
      setFeedback({ tipo: aviso ? 'error' : 'success', mensaje: aviso ?? 'Recepción registrada.' });
    } else {
      const result = await recibirTrasladoAction(objetivo.item.id, datos);
      if (!result.success) return result.error ?? 'No se pudo registrar la recepción.';
      setFeedback({ tipo: 'success', mensaje: result.message ?? 'Recepción registrada.' });
    }
    setObjetivo(null);
    return null;
  }

  const total = solicitudes.length + traslados.length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <PackageCheck className="w-6 h-6" /> Recepciones pendientes
        </h1>
        <p className="text-sm text-neutral-500">
          Vehículos en camino a tus sucursales. Al recibirlos, indica si llegaron con novedades.
        </p>
      </div>

      {feedback && (
        <div
          className={`flex items-center gap-3 p-4 rounded-xl border text-sm ${
            feedback.tipo === 'success' ? 'bg-green-50 text-green-800 border-green-200' : 'bg-amber-50 text-amber-800 border-amber-200'
          }`}
        >
          <CheckCircle2 className="w-5 h-5 shrink-0" />
          <span className="flex-1">{feedback.mensaje}</span>
          <button onClick={() => setFeedback(null)} className="cursor-pointer" aria-label="Cerrar">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {total === 0 ? (
        <div className="p-10 text-center border border-dashed rounded-2xl border-neutral-200 bg-white text-neutral-400">
          <Inbox className="w-8 h-8 mx-auto mb-2 text-neutral-300" />
          No hay vehículos en camino a tus sucursales.
        </div>
      ) : (
        <>
          <section className="bg-white rounded-2xl border border-neutral-200 overflow-hidden">
            <h2 className="px-5 py-3 border-b border-neutral-200 font-semibold text-neutral-900 text-sm">
              Solicitudes en tránsito ({solicitudes.length})
            </h2>
            {solicitudes.length === 0 ? (
              <p className="px-5 py-6 text-sm text-neutral-400">Ninguna.</p>
            ) : (
              <ul className="divide-y divide-neutral-100">
                {solicitudes.map((s) => {
                  const chip = CHIP_ATRASO[getEstadoAtraso(s)];
                  return (
                    <li key={s.id} className="px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-3">
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-xs text-neutral-500">#{s.id.slice(0, 8)}</span>
                          {chip && (
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border ${chip.clase}`}>{chip.texto}</span>
                          )}
                        </div>
                        <p className="text-sm font-semibold text-neutral-900 flex items-center gap-1.5">
                          <MapPin className="w-4 h-4 text-neutral-400" />
                          {s.sucursal_nombre} → {s.sucursal_destino_nombre ?? s.titulo_evento ?? '—'}
                        </p>
                        <p className="text-xs text-neutral-500 truncate">
                          {s.vehiculos.map((v) => etiquetaVehiculo(v)).filter(Boolean).join(' · ') || 'Sin vehículos'}
                        </p>
                        <p className="text-xs text-neutral-500">
                          Despacho: {formatFecha(s.fecha_despacho)} · {ETIQUETA_FECHA_LIMITE}: {formatFecha(s.fecha_limite)}
                        </p>
                      </div>
                      <button
                        onClick={() => setObjetivo({ tipo: 'solicitud', item: s })}
                        className="inline-flex items-center gap-1.5 px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold rounded-xl cursor-pointer self-start sm:self-center"
                      >
                        <PackageCheck className="w-4 h-4" /> Recibir
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="bg-white rounded-2xl border border-neutral-200 overflow-hidden">
            <h2 className="px-5 py-3 border-b border-neutral-200 font-semibold text-neutral-900 text-sm">
              Traslados internos en tránsito ({traslados.length})
            </h2>
            {traslados.length === 0 ? (
              <p className="px-5 py-6 text-sm text-neutral-400">Ninguno.</p>
            ) : (
              <ul className="divide-y divide-neutral-100">
                {traslados.map((t) => (
                  <li key={t.id} className="px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-3">
                    <div className="flex-1 min-w-0 space-y-1">
                      <span className="font-mono text-xs text-neutral-500">#{t.id.slice(0, 8)}</span>
                      <p className="text-sm font-semibold text-neutral-900 flex items-center gap-1.5">
                        <Truck className="w-4 h-4 text-neutral-400" />
                        {t.origen_nombre} → {t.destino_nombre}
                      </p>
                      <p className="text-xs text-neutral-500 truncate">
                        {t.vehiculos.map((v) => `${v.patente ?? v.chasis} · ${v.marca} ${v.modelo}`).join(' · ') || 'Sin vehículo'}
                      </p>
                      <p className="text-xs text-neutral-500">
                        Despacho: {formatFecha(t.fecha_despacho)} · Encargado: {t.logistica_nombre ?? '—'}
                      </p>
                    </div>
                    <button
                      onClick={() => setObjetivo({ tipo: 'traslado', item: t })}
                      className="inline-flex items-center gap-1.5 px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold rounded-xl cursor-pointer self-start sm:self-center"
                    >
                      <PackageCheck className="w-4 h-4" /> Recibir
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      {objetivo && (
        <RecepcionModal
          titulo={objetivo.tipo === 'solicitud' ? 'Recibir solicitud' : 'Recibir traslado interno'}
          subtitulo={
            objetivo.tipo === 'solicitud'
              ? `${objetivo.item.sucursal_nombre ?? ''} → ${objetivo.item.sucursal_destino_nombre ?? objetivo.item.titulo_evento ?? ''}`
              : `${objetivo.item.origen_nombre ?? ''} → ${objetivo.item.destino_nombre ?? ''}`
          }
          permitirFotos={objetivo.tipo === 'solicitud'}
          onCerrar={() => setObjetivo(null)}
          onConfirmar={confirmar}
        />
      )}
    </div>
  );
}
