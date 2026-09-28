'use client';

import { useState } from 'react';
import {
  Truck,
  MapPin,
  PackageSearch,
  PackageCheck,
  Plus,
  X,
  Car,
  Loader2,
} from 'lucide-react';
import {
  crearTrasladoAction,
  despacharTrasladoAction,
  recibirTrasladoAction,
} from '@/app/actions/traslados.actions';
import {
  TrasladoInterno,
  VehiculoParaTraslado,
  CreateTrasladoInput,
} from '@/types/traslado.types';
import { Sucursal } from '@/types/sucursal.types';
import { formatFecha } from '@/lib/fechas';

const estadoConfig: Record<TrasladoInterno['estado'], { label: string; color: string }> = {
  pendiente: { label: 'Pendiente', color: 'bg-amber-50 text-amber-700 border-amber-200' },
  en_transito: { label: 'En tránsito', color: 'bg-neutral-700 text-white border-neutral-700' },
  recepcionado: { label: 'Recepcionado', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
};

interface TrasladosClientProps {
  traslados: TrasladoInterno[];
  sucursales: Sucursal[];
  vehiculos: VehiculoParaTraslado[];
  esOperador: boolean;
  viewerId: string;
}

export default function TrasladosClient({
  traslados,
  sucursales,
  vehiculos,
  esOperador,
}: TrasladosClientProps) {
  const [feedback, setFeedback] = useState<{ tipo: 'success' | 'error'; mensaje: string } | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<'todos' | 'pendiente' | 'en_transito' | 'recepcionado'>('todos');

  // Formulario de creación
  const [formOpen, setFormOpen] = useState(false);
  const [origen, setOrigen] = useState<number | ''>('');
  const [destino, setDestino] = useState<number | ''>('');
  const [observacion, setObservacion] = useState('');
  const [seleccionados, setSeleccionados] = useState<string[]>([]);

  const visibles = traslados.filter((t) => filtro === 'todos' || t.estado === filtro);

  const toggleVehiculo = (id: string) => {
    setSeleccionados((prev) =>
      prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id]
    );
  };

  const puedeCrear = esOperador && origen !== '' && destino !== '' && seleccionados.length > 0;

  const handleCrear = async () => {
    if (!puedeCrear) {
      setFeedback({ tipo: 'error', mensaje: 'Selecciona origen, destino y al menos un vehículo vendido.' });
      return;
    }
    const input: CreateTrasladoInput = {
      origen_id: Number(origen),
      destino_id: Number(destino),
      observacion: observacion.trim() || null,
    };
    setLoading('crear');
    try {
      const result = await crearTrasladoAction(input, seleccionados);
      if (!result.success) {
        setFeedback({ tipo: 'error', mensaje: result.error ?? 'No se pudo crear el traslado.' });
        return;
      }
      setFeedback({ tipo: 'success', mensaje: result.message ?? 'Traslado creado.' });
      setFormOpen(false);
      setSeleccionados([]);
      setObservacion('');
    } finally {
      setLoading(null);
    }
  };

  const handleDespachar = async (id: string) => {
    setLoading(id);
    try {
      const result = await despacharTrasladoAction(id);
      if (!result.success) {
        setFeedback({ tipo: 'error', mensaje: result.error ?? 'Error al despachar.' });
      } else {
        setFeedback({ tipo: 'success', mensaje: result.message ?? 'Traslado despachado.' });
      }
    } finally {
      setLoading(null);
    }
  };

  const handleRecibir = async (id: string) => {
    setLoading(id);
    try {
      const result = await recibirTrasladoAction(id);
      if (!result.success) {
        setFeedback({ tipo: 'error', mensaje: result.error ?? 'Error al recepcionar.' });
      } else {
        setFeedback({ tipo: 'success', mensaje: result.message ?? 'Traslado recepcionado.' });
      }
    } finally {
      setLoading(null);
    }
  };

  const vehiculosDisponibles = vehiculos.filter((v) => !v.en_traslado_activo);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 flex items-center gap-2">
            <Truck className="w-6 h-6" />
            Traslados Internos
          </h1>
          <p className="text-sm text-neutral-500 mt-1">
            {esOperador
              ? 'Mueve vehículos ya vendidos entre sucursales. El JL destino solo puede recepcionar.'
              : 'Traslados que llegan a tus sucursales.'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={filtro}
            onChange={(e) => setFiltro(e.target.value as typeof filtro)}
            className="bg-white border border-neutral-300 rounded-xl px-3 py-2 text-sm text-neutral-900 font-medium focus:outline-none focus:ring-2 focus:ring-neutral-900 cursor-pointer"
          >
            <option value="todos">Todos</option>
            <option value="pendiente">Pendientes</option>
            <option value="en_transito">En tránsito</option>
            <option value="recepcionado">Recepcionados</option>
          </select>
          {esOperador && (
            <button
              onClick={() => setFormOpen((v) => !v)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-neutral-900 hover:bg-neutral-700 text-white text-sm font-semibold rounded-xl transition-colors cursor-pointer"
            >
              {formOpen ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
              {formOpen ? 'Cerrar' : 'Nuevo traslado'}
            </button>
          )}
        </div>
      </div>

      {feedback && (
        <div
          className={`px-4 py-3 rounded-xl border text-sm ${
            feedback.tipo === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
              : 'bg-red-50 border-red-200 text-red-700'
          }`}
        >
          {feedback.mensaje}
        </div>
      )}

      {formOpen && esOperador && (
        <div className="bg-white border border-neutral-200 rounded-2xl p-5 shadow-sm">
          <h3 className="font-bold text-neutral-900 text-sm mb-4">Crear traslado interno</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-neutral-600 uppercase tracking-wider">Origen *</label>
              <select
                value={origen}
                onChange={(e) => setOrigen(e.target.value === '' ? '' : Number(e.target.value))}
                className="w-full bg-white border border-neutral-300 rounded-xl px-3 py-2 text-sm text-neutral-900 font-medium focus:outline-none focus:ring-2 focus:ring-neutral-900 cursor-pointer"
              >
                <option value="">Selecciona origen</option>
                {sucursales.map((s) => (
                  <option key={s.id} value={s.id}>{s.nombre}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-neutral-600 uppercase tracking-wider">Destino *</label>
              <select
                value={destino}
                onChange={(e) => setDestino(e.target.value === '' ? '' : Number(e.target.value))}
                className="w-full bg-white border border-neutral-300 rounded-xl px-3 py-2 text-sm text-neutral-900 font-medium focus:outline-none focus:ring-2 focus:ring-neutral-900 cursor-pointer"
              >
                <option value="">Selecciona destino</option>
                {sucursales
                  .filter((s) => origen === '' || s.id !== origen)
                  .map((s) => (
                    <option key={s.id} value={s.id}>{s.nombre}</option>
                  ))}
              </select>
            </div>
            <div className="sm:col-span-2 space-y-1.5">
              <label className="text-xs font-semibold text-neutral-600 uppercase tracking-wider">Observación</label>
              <textarea
                value={observacion}
                onChange={(e) => setObservacion(e.target.value)}
                rows={2}
                className="w-full bg-white border border-neutral-300 rounded-xl px-3 py-2 text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-900 resize-none"
                placeholder="Motivo o comentario del traslado (opcional)"
              />
            </div>
          </div>

          <div className="mt-4">
            <p className="text-xs font-semibold text-neutral-600 uppercase tracking-wider mb-2">
              Vehículos vendidos ({seleccionados.length} seleccionado(s))
            </p>
            {vehiculosDisponibles.length === 0 ? (
              <p className="text-sm text-neutral-400 border border-dashed border-neutral-300 rounded-xl px-4 py-6 text-center">
                No hay vehículos vendidos disponibles para trasladar.
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-64 overflow-y-auto">
                {vehiculosDisponibles.map((v) => {
                  const activo = seleccionados.includes(v.id);
                  return (
                    <button
                      key={v.id}
                      onClick={() => toggleVehiculo(v.id)}
                      className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-left transition-colors cursor-pointer ${
                        activo
                          ? 'border-neutral-900 bg-neutral-900 text-white'
                          : 'border-neutral-200 bg-white hover:border-neutral-400'
                      }`}
                    >
                      <Car className="w-4 h-4 shrink-0 opacity-70" />
                      <span className="min-w-0">
                        <span className="block text-sm font-bold truncate">{v.patente || v.chasis}</span>
                        <span className={`block text-[11px] truncate ${activo ? 'text-neutral-300' : 'text-neutral-500'}`}>
                          {v.marca} {v.modelo} {v.anio} · {v.ubicacion_nombre ?? 'Sin ubicación'}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="mt-4 flex justify-end">
            <button
              onClick={handleCrear}
              disabled={!puedeCrear || loading === 'crear'}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-neutral-900 hover:bg-neutral-700 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {loading === 'crear' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Crear traslado
            </button>
          </div>
        </div>
      )}

      {visibles.length === 0 ? (
        <div className="bg-white border border-neutral-200 rounded-2xl p-10 text-center shadow-sm">
          <Truck className="w-10 h-10 text-neutral-300 mx-auto mb-3" />
          <p className="text-neutral-500 text-sm">No hay traslados {filtro !== 'todos' ? `en estado "${estadoConfig[filtro].label}"` : 'registrados'}.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {visibles.map((t) => {
            const estado = estadoConfig[t.estado];
            const puedeDespachar = esOperador && t.estado === 'pendiente';
            const puedeRecibir = t.estado === 'en_transito';
            return (
              <div key={t.id} className="bg-white border border-neutral-200 rounded-2xl p-5 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs text-neutral-400">#{t.id.slice(0, 8)}</span>
                      <span className={`px-2 py-0.5 rounded-md text-xs font-semibold border ${estado.color}`}>
                        {estado.label}
                      </span>
                    </div>
                    <div className="mt-2 flex items-center gap-2 text-sm font-bold text-neutral-900">
                      <MapPin className="w-4 h-4 text-neutral-400 shrink-0" />
                      <span className="truncate">{t.origen_nombre}</span>
                      <span className="text-neutral-400">→</span>
                      <span className="truncate">{t.destino_nombre}</span>
                    </div>
                    <p className="mt-1 text-xs text-neutral-500">
                      Encargado: {t.logistica_nombre ?? t.logistica_id} · Creado: {formatFecha(t.created_at)}
                    </p>
                    {t.observacion && (
                      <p className="mt-1 text-xs text-neutral-500 italic">“{t.observacion}”</p>
                    )}
                  </div>
                  <div className="flex flex-col gap-2 shrink-0">
                    {puedeDespachar && (
                      <button
                        onClick={() => handleDespachar(t.id)}
                        disabled={loading === t.id}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-700 rounded-lg transition-colors disabled:opacity-50 cursor-pointer"
                      >
                        {loading === t.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <PackageSearch className="w-3 h-3" />}
                        Despachar
                      </button>
                    )}
                    {puedeRecibir && (
                      <button
                        onClick={() => handleRecibir(t.id)}
                        disabled={loading === t.id}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors disabled:opacity-50 cursor-pointer"
                      >
                        {loading === t.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <PackageCheck className="w-3 h-3" />}
                        Recepcionar
                      </button>
                    )}
                  </div>
                </div>

                <div className="mt-4 border-t border-neutral-100 pt-3 space-y-1.5">
                  <p className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">Vehículos</p>
                  {t.vehiculos.map((v) => (
                    <div key={v.traslado_vehiculo_id} className="flex items-center gap-2 text-sm">
                      <Car className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
                      <span className="font-semibold text-neutral-900">{v.patente || '—'}</span>
                      <span className="text-neutral-400">·</span>
                      <span className="text-neutral-500 font-mono text-xs">{v.chasis}</span>
                    </div>
                  ))}
                  {t.fecha_despacho && (
                    <p className="text-xs text-neutral-500 pt-1">
                      <span className="font-semibold">Despacho:</span> {formatFecha(t.fecha_despacho)}
                    </p>
                  )}
                  {t.fecha_recepcion && (
                    <p className="text-xs text-neutral-500">
                      <span className="font-semibold">Recepción:</span> {formatFecha(t.fecha_recepcion)}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}