'use client';

import { useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, Clock, ListOrdered, Loader2, PackageCheck, X } from 'lucide-react';
import type { SolicitudLista } from '@/types/solicitud.types';
import type { TrasladoInterno } from '@/types/traslado.types';
import PanelAcciones from '@/components/PanelAcciones';
import { RecepcionModal } from '@/components/ModalesTraslado';
import { priorizarSolicitudAction } from '@/app/actions/solicitudes.actions';
import { recibirTrasladoAction } from '@/app/actions/traslados.actions';
import { recibirSolicitudConFotos } from '@/lib/recepcionCliente';
import { itemsRecepcion, recortar, LIMITE_PANEL_JEFE_LOCAL, type ItemRecepcion } from '@/lib/panel';
import type { DatosRecepcion } from '@/lib/recepcion';
import { formatFecha } from '@/lib/fechas';
import { etiquetaVehiculo } from '@/lib/vehiculo';
import { ETIQUETA_FECHA_LIMITE } from '@/lib/textos';

interface Props {
  pendientesAprobar: SolicitudLista[];
  recepcionesSolicitudes: SolicitudLista[];
  recepcionesTraslados: TrasladoInterno[];
  porPriorizar: SolicitudLista[];
}

function ruta(s: SolicitudLista): string {
  return `${s.sucursal_nombre ?? `Sucursal ${s.sucursal}`} → ${s.sucursal_destino_nombre ?? s.titulo_evento ?? 'Evento'}`;
}

function vehiculos(s: SolicitudLista): string {
  return s.vehiculos.map((v) => etiquetaVehiculo(v)).filter(Boolean).join(' · ') || 'Sin vehículos';
}

/**
 * R3 + R11: mirada global de lo que el Jefe de Local tiene pendiente, con las
 * primeras filas de cada acción y acceso directo a cada módulo.
 */
export default function DashboardJefeLocal({
  pendientesAprobar,
  recepcionesSolicitudes,
  recepcionesTraslados,
  porPriorizar,
}: Props) {
  const [recibir, setRecibir] = useState<ItemRecepcion | null>(null);
  const [priorizando, setPriorizando] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ tipo: 'success' | 'error'; mensaje: string } | null>(null);

  const aprobar = recortar(pendientesAprobar, LIMITE_PANEL_JEFE_LOCAL);
  const recepciones = recortar(itemsRecepcion(recepcionesSolicitudes, recepcionesTraslados), LIMITE_PANEL_JEFE_LOCAL);
  const priorizar = recortar(porPriorizar, LIMITE_PANEL_JEFE_LOCAL);

  async function priorizarAlFinal(id: string) {
    setPriorizando(id);
    try {
      const res = await priorizarSolicitudAction(id);
      setFeedback({
        tipo: res.success ? 'success' : 'error',
        mensaje: res.success ? res.message ?? 'Solicitud priorizada.' : res.error ?? 'No se pudo priorizar.',
      });
    } finally {
      setPriorizando(null);
    }
  }

  async function confirmarRecepcion(datos: DatosRecepcion, fotos: File[]): Promise<string | null> {
    if (!recibir) return null;
    if (recibir.tipo === 'solicitud') {
      const { error, aviso } = await recibirSolicitudConFotos(recibir.id, datos, fotos);
      if (error) return error;
      setFeedback({ tipo: aviso ? 'error' : 'success', mensaje: aviso ?? 'Recepción registrada.' });
    } else {
      const res = await recibirTrasladoAction(recibir.id, datos);
      if (!res.success) return res.error ?? 'No se pudo registrar la recepción.';
      setFeedback({ tipo: 'success', mensaje: res.message ?? 'Recepción registrada.' });
    }
    setRecibir(null);
    return null;
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-[#1a2b4b] tracking-tight">Tus pendientes</h2>
        <p className="text-sm text-neutral-500">Lo que requiere tu acción ahora, ordenado por urgencia.</p>
      </div>

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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <PanelAcciones
          titulo="Pendientes de aprobar"
          descripcion="Solicitudes de tus sucursales que esperan tu decisión"
          icono={<CheckCircle2 className="w-5 h-5 text-blue-600" />}
          total={aprobar.total}
          restantes={aprobar.restantes}
          verTodasHref="/solicitudes/aprobaciones"
          textoVacio="No hay solicitudes por aprobar."
          tono="azul"
        >
          {aprobar.items.map((s) => (
            <li key={s.id} className="px-5 py-3 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-neutral-900 truncate">{ruta(s)}</p>
                <p className="text-xs text-neutral-500 truncate">{vehiculos(s)}</p>
                <p className="text-[11px] text-neutral-400 flex items-center gap-1">
                  <Clock className="w-3 h-3" /> Creada {formatFecha(s.fecha_creacion)}
                  {s.ejecutivo_nombre ? ` · ${s.ejecutivo_nombre}` : ''}
                </p>
              </div>
              <Link
                href="/solicitudes/aprobaciones"
                className="px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shrink-0"
              >
                Revisar
              </Link>
            </li>
          ))}
        </PanelAcciones>

        <PanelAcciones
          titulo="Recepciones pendientes"
          descripcion="Vehículos en camino a tus sucursales"
          icono={<PackageCheck className="w-5 h-5 text-emerald-600" />}
          total={recepciones.total}
          restantes={recepciones.restantes}
          verTodasHref="/solicitudes/recepciones"
          textoVacio="No hay vehículos en camino."
          tono="verde"
        >
          {recepciones.items.map((r) => (
            <li key={r.clave} className="px-5 py-3 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-neutral-900 truncate">
                  {r.tipo === 'traslado' && (
                    <span className="mr-1.5 px-1.5 py-0.5 rounded bg-neutral-100 text-[10px] text-neutral-600">Traslado interno</span>
                  )}
                  {r.ruta}
                </p>
                <p className="text-xs text-neutral-500 truncate">{r.vehiculos}</p>
                {r.fechaReferencia && (
                  <p className="text-[11px] text-neutral-400">
                    {r.tipo === 'solicitud' ? ETIQUETA_FECHA_LIMITE : 'Despachado'}: {formatFecha(r.fechaReferencia)}
                  </p>
                )}
              </div>
              <button
                onClick={() => setRecibir(r)}
                className="px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shrink-0 cursor-pointer"
              >
                Recibir
              </button>
            </li>
          ))}
        </PanelAcciones>

        <PanelAcciones
          titulo="Priorizaciones pendientes"
          descripcion="Aprobadas que aún no entran a la cola de su sucursal"
          icono={<ListOrdered className="w-5 h-5 text-amber-600" />}
          total={priorizar.total}
          restantes={priorizar.restantes}
          verTodasHref="/solicitudes/prioridades"
          textoVacio="No hay solicitudes por priorizar."
          tono="ambar"
        >
          {priorizar.items.map((s) => (
            <li key={s.id} className="px-5 py-3 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-neutral-900 truncate">{ruta(s)}</p>
                <p className="text-xs text-neutral-500 truncate">{vehiculos(s)}</p>
                <p className="text-[11px] text-neutral-400">
                  {ETIQUETA_FECHA_LIMITE}: {formatFecha(s.fecha_limite) || '—'}
                </p>
              </div>
              <button
                onClick={() => priorizarAlFinal(s.id)}
                disabled={priorizando !== null}
                title="Agregar al final de la cola de su sucursal"
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-lg shrink-0 cursor-pointer disabled:opacity-50"
              >
                {priorizando === s.id && <Loader2 className="w-3 h-3 animate-spin" />}
                Priorizar
              </button>
            </li>
          ))}
        </PanelAcciones>
      </div>

      {recibir && (
        <RecepcionModal
          titulo={recibir.tipo === 'solicitud' ? 'Recibir solicitud' : 'Recibir traslado interno'}
          subtitulo={recibir.ruta}
          permitirFotos={recibir.tipo === 'solicitud'}
          onCerrar={() => setRecibir(null)}
          onConfirmar={confirmarRecepcion}
        />
      )}
    </div>
  );
}
