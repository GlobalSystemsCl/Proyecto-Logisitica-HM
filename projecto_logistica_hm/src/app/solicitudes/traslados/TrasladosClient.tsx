'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Truck,
  MapPin,
  PackageSearch,
  PackageCheck,
  Plus,
  X,
  Car,
  Search,
  ChevronLeft,
  ChevronRight,
  Loader2,
} from 'lucide-react';
import {
  crearTrasladoAction,
  despacharTrasladoAction,
  recibirTrasladoAction,
  getVehiculosParaTrasladoAction,
} from '@/app/actions/traslados.actions';
import {
  TrasladoInterno,
  VehiculosParaTrasladoResult,
  CreateTrasladoInput,
} from '@/types/traslado.types';
import { Sucursal } from '@/types/sucursal.types';
import { Marca } from '@/types/vehiculo.types';
import { formatFecha } from '@/lib/fechas';

const PAGE_SIZE = 12;

const estadoConfig: Record<TrasladoInterno['estado'], { label: string; color: string }> = {
  pendiente: { label: 'Pendiente', color: 'bg-amber-50 text-amber-700 border-amber-200' },
  en_transito: { label: 'En tránsito', color: 'bg-neutral-700 text-white border-neutral-700' },
  recepcionado: { label: 'Recepcionado', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
};

interface TrasladosClientProps {
  traslados: TrasladoInterno[];
  sucursales: Sucursal[];
  marcas: Marca[];
  vehiculosIniciales: VehiculosParaTrasladoResult;
  esOperador: boolean;
  viewerRol: string;
  viewerSucursales: number[];
}

export default function TrasladosClient({
  traslados,
  sucursales,
  marcas,
  vehiculosIniciales,
  esOperador,
  viewerRol,
  viewerSucursales,
}: TrasladosClientProps) {
  const [feedback, setFeedback] = useState<{ tipo: 'success' | 'error'; mensaje: string } | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<'todos' | 'pendiente' | 'en_transito' | 'recepcionado'>('todos');
  const [detalle, setDetalle] = useState<TrasladoInterno | null>(null);

  // Formulario de creación
  const [formOpen, setFormOpen] = useState(false);
  const [origen, setOrigen] = useState<number | ''>('');
  const [destino, setDestino] = useState<number | ''>('');
  const [observacion, setObservacion] = useState('');
  const [seleccionados, setSeleccionados] = useState<string[]>([]);

  // Búsqueda y paginación de vehículos
  const [busqueda, setBusqueda] = useState('');
  const [sucursalFiltro, setSucursalFiltro] = useState<number | 'todas'>('todas');
  const [marcaFiltro, setMarcaFiltro] = useState<string>('todas');
  const [pagina, setPagina] = useState(1);
  const [resultados, setResultados] = useState<VehiculosParaTrasladoResult>(vehiculosIniciales);
  const [cargandoVehiculos, setCargandoVehiculos] = useState(false);
  const primerRender = useRef(true);

  useEffect(() => {
    if (!esOperador) return;
    if (primerRender.current) {
      primerRender.current = false;
      return;
    }
    const timer = setTimeout(async () => {
      setCargandoVehiculos(true);
      try {
        const res = await getVehiculosParaTrasladoAction(busqueda, pagina, PAGE_SIZE, {
          sucursalId: sucursalFiltro === 'todas' ? null : sucursalFiltro,
          marca: marcaFiltro === 'todas' ? null : marcaFiltro,
        });
        setResultados(res);
      } finally {
        setCargandoVehiculos(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [busqueda, pagina, sucursalFiltro, marcaFiltro, esOperador]);

  const visibles = traslados.filter((t) => filtro === 'todos' || t.estado === filtro);

  const toggleVehiculo = (id: string) => {
    if (cargandoVehiculos) return;
    setSeleccionados((prev) =>
      prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id]
    );
  };

  const puedeCrear = esOperador && origen !== '' && destino !== '' && seleccionados.length > 0;

  const handleBusqueda = (valor: string) => {
    setBusqueda(valor);
    setPagina(1);
  };

  const handleSucursalFiltro = (valor: string) => {
    setSucursalFiltro(valor === 'todas' ? 'todas' : Number(valor));
    setPagina(1);
  };

  const handleMarcaFiltro = (valor: string) => {
    setMarcaFiltro(valor);
    setPagina(1);
  };

  const totalPages = esOperador ? resultados.totalPages : 0;
  const paginaActual = esOperador ? resultados.page : 1;

  const handleCrear = async () => {
    if (!puedeCrear) {
      setFeedback({ tipo: 'error', mensaje: 'Selecciona origen, destino y al menos un vehículo.' });
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
              ? 'Mueve vehículos entre sucursales. El JL destino solo puede recepcionar.'
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
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
              <p className="text-xs font-semibold text-neutral-600 uppercase tracking-wider">
                Vehículos ({seleccionados.length} seleccionado(s))
              </p>
            </div>
            <div className="flex flex-col lg:flex-row gap-2 mb-3">
              <div className="relative grow">
                <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  value={busqueda}
                  onChange={(e) => handleBusqueda(e.target.value)}
                  placeholder="Buscar por patente o chasis"
                  className="w-full bg-white border border-neutral-300 rounded-xl pl-9 pr-3 py-2 text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-900"
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">
                  Sucursal:
                </label>
                <select
                  value={sucursalFiltro === 'todas' ? 'todas' : Number(sucursalFiltro)}
                  onChange={(e) => handleSucursalFiltro(e.target.value)}
                  className="bg-white border border-neutral-300 rounded-xl px-3 py-2 text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-900 cursor-pointer"
                >
                  <option value="todas">Todas</option>
                  {sucursales.map((s) => (
                    <option key={s.id} value={s.id}>{s.nombre}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">
                  Marca:
                </label>
                <select
                  value={marcaFiltro}
                  onChange={(e) => handleMarcaFiltro(e.target.value)}
                  className="bg-white border border-neutral-300 rounded-xl px-3 py-2 text-sm text-neutral-900 font-medium focus:outline-none focus:ring-2 focus:ring-neutral-900 cursor-pointer"
                >
                  <option value="todas">Todas</option>
                  {marcas.map((m) => (
                    <option key={m.id} value={m.nombre} title={m.nombre}>{m.codigo}</option>
                  ))}
                </select>
              </div>
            </div>

            {cargandoVehiculos ? (
              <div className="flex items-center justify-center border border-dashed border-neutral-300 rounded-xl px-4 py-8">
                <Loader2 className="w-5 h-5 animate-spin text-neutral-400" />
              </div>
            ) : resultados.vehiculos.length === 0 ? (
              <p className="text-sm text-neutral-400 border border-dashed border-neutral-300 rounded-xl px-4 py-6 text-center">
                {busqueda.trim()
                  ? 'No se encontraron vehículos con esa patente o chasis.'
                  : 'No hay vehículos para trasladar.'}
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-64 overflow-y-auto">
                {resultados.vehiculos.map((v) => {
                  const activo = seleccionados.includes(v.id);
                  return (
                    <button
                      key={v.id}
                      onClick={() => toggleVehiculo(v.id)}
                      disabled={v.en_traslado_activo}
                      className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-left transition-colors ${
                        v.en_traslado_activo
                          ? 'border-neutral-200 bg-neutral-50 text-neutral-300 cursor-not-allowed'
                          : activo
                            ? 'border-neutral-900 bg-neutral-900 text-white cursor-pointer'
                            : 'border-neutral-200 bg-white hover:border-neutral-400 cursor-pointer'
                      }`}
                    >
                      <Car className="w-4 h-4 shrink-0 opacity-70" />
                      <span className="min-w-0">
                        <span className="block text-sm font-bold truncate">{v.patente || v.chasis}</span>
                        <span className={`block text-[11px] truncate ${activo ? 'text-neutral-300' : 'text-neutral-500'}`}>
                          {v.marca} {v.modelo} {v.anio} · {v.ubicacion_nombre ?? 'Sin ubicación'}
                        </span>
                        {v.en_traslado_activo && (
                          <span className="block text-[11px] font-semibold text-amber-600">Ya en traslado</span>
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            {totalPages > 1 && (
              <div className="mt-3 flex items-center justify-between text-xs text-neutral-500">
                <span>
                  {resultados.total} vehículo(s) · Página {paginaActual} de {totalPages}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPagina((p) => Math.max(1, p - 1))}
                    disabled={paginaActual <= 1 || cargandoVehiculos}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-neutral-300 bg-white hover:bg-neutral-50 disabled:opacity-40 cursor-pointer"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" /> Anterior
                  </button>
                  <button
                    onClick={() => setPagina((p) => Math.min(totalPages, p + 1))}
                    disabled={paginaActual >= totalPages || cargandoVehiculos}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-neutral-300 bg-white hover:bg-neutral-50 disabled:opacity-40 cursor-pointer"
                  >
                    Siguiente <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
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
            const puedeRecibir =
              t.estado === 'en_transito' &&
              (viewerRol === 'administrador' ||
                (viewerRol === 'jefe_local' && viewerSucursales.includes(t.destino_id)));
            return (
              <div
                key={t.id}
                onClick={() => setDetalle(t)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setDetalle(t);
                  }
                }}
                className="bg-white border border-neutral-200 rounded-2xl p-5 shadow-sm hover:border-neutral-400 hover:shadow cursor-pointer transition-all"
              >
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
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDespachar(t.id);
                        }}
                        disabled={loading === t.id}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-700 rounded-lg transition-colors disabled:opacity-50 cursor-pointer"
                      >
                        {loading === t.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <PackageSearch className="w-3 h-3" />}
                        Despachar
                      </button>
                    )}
                    {puedeRecibir && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRecibir(t.id);
                        }}
                        disabled={loading === t.id}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors disabled:opacity-50 cursor-pointer"
                      >
                        {loading === t.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <PackageCheck className="w-3 h-3" />}
                        Recepcionar
                      </button>
                    )}
                  </div>
                </div>

                <div className="mt-4 border-t border-neutral-100 pt-3">
                  {t.fecha_despacho && (
                    <p className="text-xs text-neutral-500">
                      <span className="font-semibold">Despacho:</span> {formatFecha(t.fecha_despacho)}
                    </p>
                  )}
                  {t.fecha_recepcion && (
                    <p className="text-xs text-neutral-500">
                      <span className="font-semibold">Recepción:</span> {formatFecha(t.fecha_recepcion)}
                    </p>
                  )}
                  <p className="mt-2 flex items-center justify-between text-xs font-semibold text-neutral-600">
                    <span>{t.vehiculos.length} vehículo(s)</span>
                    <span className="inline-flex items-center gap-1 text-neutral-400">
                      Ver detalle <ChevronRight className="w-3.5 h-3.5" />
                    </span>
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {detalle && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
          onClick={() => setDetalle(null)}
        >
          <div
            className="bg-white rounded-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-xs text-neutral-400">#{detalle.id.slice(0, 8)}</span>
                  <span className={`px-2 py-0.5 rounded-md text-xs font-semibold border ${estadoConfig[detalle.estado].color}`}>
                    {estadoConfig[detalle.estado].label}
                  </span>
                </div>
                <div className="mt-2 flex items-center gap-2 text-sm font-bold text-neutral-900">
                  <MapPin className="w-4 h-4 text-neutral-400 shrink-0" />
                  <span className="truncate">{detalle.origen_nombre ?? detalle.origen_id}</span>
                  <span className="text-neutral-400">→</span>
                  <span className="truncate">{detalle.destino_nombre ?? detalle.destino_id}</span>
                </div>
                <p className="mt-1 text-xs text-neutral-500">
                  Encargado: {detalle.logistica_nombre ?? detalle.logistica_id} · Creado: {formatFecha(detalle.created_at)}
                </p>
                {detalle.observacion && (
                  <p className="mt-1 text-xs text-neutral-500 italic">“{detalle.observacion}”</p>
                )}
              </div>
              <button
                onClick={() => setDetalle(null)}
                className="p-2 rounded-lg text-neutral-500 hover:bg-neutral-100 shrink-0 cursor-pointer"
                aria-label="Cerrar detalle"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mt-4 border-t border-neutral-100 pt-3">
              <p className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider mb-2">
                Vehículos ({detalle.vehiculos.length})
              </p>
              {detalle.vehiculos.length === 0 ? (
                <p className="text-sm text-neutral-400">Sin vehículos registrados.</p>
              ) : (
                <div className="grid grid-cols-1 gap-2">
                  {detalle.vehiculos.map((v) => (
                    <div key={v.traslado_vehiculo_id} className="flex items-center gap-3 rounded-xl border border-neutral-200 px-3 py-2.5">
                      <Car className="w-4 h-4 text-neutral-400 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-neutral-900 truncate">
                          {v.patente || '—'}
                          <span className="text-neutral-400 font-normal"> · {v.chasis}</span>
                        </p>
                        <p className="text-xs text-neutral-500 truncate">
                          {v.marca} {v.modelo} {v.anio}
                          {v.color ? ` · ${v.color}` : ''}
                          {v.ubicacion != null
                            ? ` · Ubicación: ${sucursales.find((s) => s.id === v.ubicacion)?.nombre ?? v.ubicacion}`
                            : ''}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}