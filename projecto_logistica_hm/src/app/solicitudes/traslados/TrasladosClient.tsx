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
  CheckSquare,
} from 'lucide-react';
import {
  cancelarTrasladoAction,
  crearTrasladosAction,
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
import { CancelarTransitoModal, RecepcionModal } from '@/components/ModalesTraslado';
import type { DatosRecepcion } from '@/lib/recepcion';
import SelectorCamion from '@/components/SelectorCamion';
import { MAX_TRASLADOS_POR_LOTE, mensajeResultadoLote } from '@/lib/trasladosLote';
import { codigoTraslado } from '@/lib/codigoSolicitud';
import type { AsignacionTransporte, EmpresaTransporte } from '@/types/transportista.types';
import { errorAsignacionTransporte, textoTransporte } from '@/lib/transporte';
import ModalGuiaDespacho from '@/components/ModalGuiaDespacho';

const PAGE_SIZE = 12;

const estadoConfig: Record<TrasladoInterno['estado'], { label: string; color: string }> = {
  pendiente: { label: 'Pendiente', color: 'bg-amber-50 text-amber-700 border-amber-200' },
  en_transito: { label: 'En tránsito', color: 'bg-neutral-700 text-white border-neutral-700' },
  recepcionado: { label: 'Recepcionado', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  cancelado: { label: 'Cancelado', color: 'bg-red-50 text-red-700 border-red-200' },
};

interface TrasladosClientProps {
  traslados: TrasladoInterno[];
  sucursales: Sucursal[];
  marcas: Marca[];
  vehiculosIniciales: VehiculosParaTrasladoResult;
  esOperador: boolean;
  viewerRol: string;
  viewerSucursales: number[];
  /** R10: empresas activas con sus camiones activos (solo para Logística y el administrador). */
  empresas?: EmpresaTransporte[];
  /** R2: traslado que se abre al entrar desde una notificación (`?traslado=`). */
  trasladoInicialId?: string | null;
}

export default function TrasladosClient({
  traslados,
  sucursales,
  marcas,
  vehiculosIniciales,
  esOperador,
  viewerRol,
  viewerSucursales,
  empresas = [],
  trasladoInicialId = null,
}: TrasladosClientProps) {
  const [feedback, setFeedback] = useState<{ tipo: 'success' | 'error'; mensaje: string } | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<'todos' | TrasladoInterno['estado']>('todos');
  const [recibirTarget, setRecibirTarget] = useState<TrasladoInterno | null>(null);
  const [cancelarTarget, setCancelarTarget] = useState<TrasladoInterno | null>(null);
  const [detalle, setDetalle] = useState<TrasladoInterno | null>(
    () => (trasladoInicialId ? traslados.find((t) => t.id === trasladoInicialId) ?? null : null)
  );

  // Formulario de creación
  const [formOpen, setFormOpen] = useState(false);
  const [origen, setOrigen] = useState<number | ''>('');
  const [destino, setDestino] = useState<number | ''>('');
  const [observacion, setObservacion] = useState('');
  const [transporte, setTransporte] = useState<AsignacionTransporte | null>(null);
  const [listaEmpresas, setListaEmpresas] = useState<EmpresaTransporte[]>(empresas);
  const [seleccionados, setSeleccionados] = useState<string[]>([]);
  /** R12: chasis o patente de cada vehículo elegido (para el resumen, aunque cambie de página). */
  const [etiquetas, setEtiquetas] = useState<Record<string, string>>({});

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
    // Una respuesta lenta de una búsqueda anterior no debe pisar la actual.
    let vigente = true;
    const timer = setTimeout(async () => {
      setCargandoVehiculos(true);
      try {
        const res = await getVehiculosParaTrasladoAction(busqueda, pagina, PAGE_SIZE, {
          sucursalId: sucursalFiltro === 'todas' ? null : sucursalFiltro,
          marca: marcaFiltro === 'todas' ? null : marcaFiltro,
        });
        if (vigente) setResultados(res);
      } finally {
        if (vigente) setCargandoVehiculos(false);
      }
    }, 250);
    return () => {
      vigente = false;
      clearTimeout(timer);
    };
  }, [busqueda, pagina, sucursalFiltro, marcaFiltro, esOperador]);

  const visibles = traslados.filter((t) => filtro === 'todos' || t.estado === filtro);

  // R12: se eligen uno o varios vehículos; se crea un traslado por vehículo.
  const toggleVehiculo = (id: string, etiqueta: string) => {
    if (cargandoVehiculos) return;
    setSeleccionados((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      return prev.length >= MAX_TRASLADOS_POR_LOTE ? prev : [...prev, id];
    });
    setEtiquetas((prev) => ({ ...prev, [id]: etiqueta }));
  };

  const seleccionablesPagina = resultados.vehiculos.filter((v) => !v.en_traslado_activo);
  const paginaSeleccionada = seleccionablesPagina.length > 0 && seleccionablesPagina.every((v) => seleccionados.includes(v.id));

  const alternarPagina = () => {
    if (cargandoVehiculos) return;
    if (paginaSeleccionada) {
      const ids = new Set(seleccionablesPagina.map((v) => v.id));
      setSeleccionados((prev) => prev.filter((x) => !ids.has(x)));
      return;
    }
    setSeleccionados((prev) => {
      const nuevos = seleccionablesPagina.map((v) => v.id).filter((id) => !prev.includes(id));
      return [...prev, ...nuevos].slice(0, MAX_TRASLADOS_POR_LOTE);
    });
    setEtiquetas((prev) => ({ ...prev, ...Object.fromEntries(seleccionablesPagina.map((v) => [v.id, v.patente || v.chasis])) }));
  };

  /** Al elegir el origen, la lista muestra los vehículos de esa sucursal (solo esos se pueden trasladar). */
  const cambiarOrigen = (valor: string) => {
    const nuevo = valor === '' ? '' : Number(valor);
    setOrigen(nuevo);
    setSeleccionados([]);
    if (nuevo !== '') {
      setSucursalFiltro(nuevo);
      setPagina(1);
    }
  };

  const errorTransporte = errorAsignacionTransporte(listaEmpresas, transporte);
  const puedeCrear = esOperador && origen !== '' && destino !== '' && seleccionados.length > 0 && !errorTransporte;

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
      setFeedback({ tipo: 'error', mensaje: errorTransporte ?? 'Selecciona origen, destino y al menos un vehículo a trasladar.' });
      return;
    }
    const input: CreateTrasladoInput = {
      origen_id: Number(origen),
      destino_id: Number(destino),
      observacion: observacion.trim() || null,
      transporte,
    };
    setLoading('crear');
    try {
      const result = await crearTrasladosAction(input, seleccionados);
      if (result.error) {
        setFeedback({ tipo: 'error', mensaje: result.error });
        return;
      }
      setFeedback({
        tipo: result.omitidos.length === 0 ? 'success' : result.creados.length > 0 ? 'success' : 'error',
        mensaje: mensajeResultadoLote(result.creados.length, result.omitidos, etiquetas),
      });
      if (result.omitidos.length === 0) {
        setFormOpen(false);
        setSeleccionados([]);
        setObservacion('');
        setTransporte(null);
      } else {
        // Quedan seleccionados solo los que no se pudieron crear, para corregir y reintentar.
        setSeleccionados(result.omitidos.map((o) => o.vehiculoId));
      }
    } finally {
      setLoading(null);
    }
  };

  /** R15: traslado a despachar (pide la guía del vehículo). */
  const [despacharTarget, setDespacharTarget] = useState<TrasladoInterno | null>(null);

  const handleDespachar = async (id: string, numeroGuia: string) => {
    setLoading(id);
    try {
      const result = await despacharTrasladoAction(id, numeroGuia);
      if (!result.success) {
        setFeedback({ tipo: 'error', mensaje: result.error ?? 'Error al despachar.' });
      } else {
        setDespacharTarget(null);
        setFeedback({ tipo: 'success', mensaje: result.message ?? 'Traslado despachado.' });
      }
    } finally {
      setLoading(null);
    }
  };

  const confirmarRecepcion = async (t: TrasladoInterno, datos: DatosRecepcion): Promise<string | null> => {
    const result = await recibirTrasladoAction(t.id, datos);
    if (!result.success) return result.error ?? 'Error al recepcionar.';
    setRecibirTarget(null);
    setFeedback({ tipo: 'success', mensaje: result.message ?? 'Traslado recepcionado.' });
    return null;
  };

  const confirmarCancelacion = async (
    t: TrasladoInterno,
    motivo: string,
    ubicacionId: number | null
  ): Promise<string | null> => {
    const result = await cancelarTrasladoAction(t.id, motivo, ubicacionId);
    if (!result.success) return result.error ?? 'No se pudo cancelar el traslado.';
    setCancelarTarget(null);
    setDetalle(null);
    setFeedback({ tipo: 'success', mensaje: result.message ?? 'Traslado cancelado.' });
    return null;
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
            <option value="cancelado">Cancelados</option>
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
                onChange={(e) => cambiarOrigen(e.target.value)}
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
            <div className="sm:col-span-2">
              <SelectorCamion
                empresas={listaEmpresas}
                valor={transporte}
                onCambiar={setTransporte}
                onEmpresasCambiadas={setListaEmpresas}
                obligatorio
              />
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
                Vehículos a trasladar{' '}
                {seleccionados.length > 0 ? `(${seleccionados.length} seleccionado${seleccionados.length === 1 ? '' : 's'})` : '(elige uno o varios)'}
              </p>
              <div className="flex items-center gap-3">
                {seleccionablesPagina.length > 0 && (
                  <button
                    type="button"
                    onClick={alternarPagina}
                    disabled={cargandoVehiculos}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-neutral-700 hover:underline cursor-pointer disabled:opacity-50"
                  >
                    <CheckSquare className="w-3.5 h-3.5" />
                    {paginaSeleccionada ? 'Quitar los de esta página' : 'Seleccionar los de esta página'}
                  </button>
                )}
                {seleccionados.length > 0 && (
                  <button type="button" onClick={() => setSeleccionados([])} className="text-xs font-semibold text-neutral-500 hover:underline cursor-pointer">
                    Quitar selección
                  </button>
                )}
              </div>
            </div>
            <p className="text-[11px] text-neutral-500 mb-2">
              Se crea un traslado por vehículo, con el mismo origen, destino y camión. Máximo {MAX_TRASLADOS_POR_LOTE} a la vez.
            </p>
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
                      type="button"
                      role="checkbox"
                      aria-checked={activo}
                      onClick={() => toggleVehiculo(v.id, v.patente || v.chasis)}
                      disabled={v.en_traslado_activo}
                      className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-left transition-colors ${
                        v.en_traslado_activo
                          ? 'border-neutral-200 bg-neutral-50 text-neutral-300 cursor-not-allowed'
                          : activo
                            ? 'border-neutral-900 bg-neutral-900 text-white cursor-pointer'
                            : 'border-neutral-200 bg-white hover:border-neutral-400 cursor-pointer'
                      }`}
                    >
                      <span
                        aria-hidden="true"
                        className={`w-4 h-4 shrink-0 rounded border flex items-center justify-center text-[10px] font-bold ${
                          activo ? 'bg-white text-neutral-900 border-white' : 'border-neutral-300'
                        }`}
                      >
                        {activo ? '✓' : ''}
                      </span>
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
              {seleccionados.length > 1 ? `Crear ${seleccionados.length} traslados` : 'Crear traslado'}
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
            // R8: solo Logística cancela un traslado en tránsito.
            const puedeCancelar = t.estado === 'en_transito' && viewerRol === 'logistica';
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
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs text-neutral-400">{codigoTraslado(t.id)}</span>
                      <span className={`px-2 py-0.5 rounded-md text-xs font-semibold border ${estado.color}`}>
                        {estado.label}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap sm:flex-nowrap items-center gap-x-2 gap-y-0.5 text-sm font-bold text-neutral-900">
                      <MapPin className="w-4 h-4 text-neutral-400 shrink-0" />
                      <span className="sm:truncate">{t.origen_nombre}</span>
                      <span className="text-neutral-400">→</span>
                      <span className="sm:truncate">{t.destino_nombre}</span>
                    </div>
                    <p className="mt-1 text-xs text-neutral-500">
                      Logística: {t.logistica_nombre ?? t.logistica_id} · Creado: {formatFecha(t.created_at)}
                      {t.transportista && <> · Transporte: {textoTransporte(t)}</>}
                    </p>
                    {t.observacion && (
                      <p className="mt-1 text-xs text-neutral-500 italic">“{t.observacion}”</p>
                    )}
                  </div>
                  <div className="flex flex-wrap sm:flex-col gap-2 sm:shrink-0">
                    {puedeDespachar && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setDespacharTarget(t);
                        }}
                        disabled={loading === t.id}
                        className="inline-flex items-center gap-1 px-3 py-2 sm:py-1.5 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-700 rounded-lg transition-colors disabled:opacity-50 cursor-pointer"
                      >
                        {loading === t.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <PackageSearch className="w-3 h-3" />}
                        Despachar
                      </button>
                    )}
                    {puedeRecibir && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setRecibirTarget(t);
                        }}
                        disabled={loading === t.id}
                        className="inline-flex items-center gap-1 px-3 py-2 sm:py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors disabled:opacity-50 cursor-pointer"
                      >
                        {loading === t.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <PackageCheck className="w-3 h-3" />}
                        Recepcionar
                      </button>
                    )}
                    {puedeCancelar && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setCancelarTarget(t);
                        }}
                        disabled={loading === t.id}
                        className="inline-flex items-center gap-1 px-3 py-2 sm:py-1.5 text-xs font-semibold text-red-600 border border-red-200 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50 cursor-pointer"
                      >
                        <X className="w-3 h-3" />
                        Cancelar
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
                      {t.recepcion_con_novedades && (
                        <span className="ml-2 px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 font-semibold">
                          Con novedades
                        </span>
                      )}
                    </p>
                  )}
                  {t.estado === 'cancelado' && t.motivo_cancelacion && (
                    <p className="text-xs text-red-700">
                      <span className="font-semibold">Cancelado:</span> {t.motivo_cancelacion}
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
                  <span className="font-mono text-xs text-neutral-400">{codigoTraslado(detalle.id)}</span>
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
                  Logística: {detalle.logistica_nombre ?? detalle.logistica_id} · Creado: {formatFecha(detalle.created_at)}
                </p>
                <p className="mt-1 text-xs text-neutral-500">
                  Transporte: {textoTransporte(detalle) || 'Sin registrar'}
                </p>
                {detalle.observacion && (
                  <p className="mt-1 text-xs text-neutral-500 italic">“{detalle.observacion}”</p>
                )}
                {detalle.estado === 'cancelado' && (
                  <p className="mt-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                    <span className="font-semibold">Cancelado {detalle.fecha_cancelacion ? `el ${formatFecha(detalle.fecha_cancelacion)}` : ''}:</span>{' '}
                    {detalle.motivo_cancelacion ?? 'Sin motivo registrado.'}
                  </p>
                )}
                {detalle.estado === 'recepcionado' && (detalle.recepcion_con_novedades || detalle.observacion_recepcion) && (
                  <p
                    className={`mt-2 text-xs rounded-lg px-3 py-2 border ${
                      detalle.recepcion_con_novedades
                        ? 'text-amber-800 bg-amber-50 border-amber-200'
                        : 'text-neutral-700 bg-neutral-50 border-neutral-200'
                    }`}
                  >
                    <span className="font-semibold">
                      Recepción {detalle.recepcion_con_novedades ? 'con novedades' : 'sin novedades'}:
                    </span>{' '}
                    {detalle.observacion_recepcion ?? '—'}
                  </p>
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
                        {v.numero_guia && <p className="text-xs text-neutral-700 font-semibold">Guía: {v.numero_guia}</p>}
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
      {despacharTarget && (
        <ModalGuiaDespacho
          titulo={`Despachar traslado ${codigoTraslado(despacharTarget.id)}`}
          vehiculos={despacharTarget.vehiculos.map((v) => ({
            id: v.traslado_vehiculo_id,
            etiqueta: `${v.chasis} · ${v.marca} ${v.modelo}`,
          }))}
          ocupado={loading === despacharTarget.id}
          onCancelar={() => setDespacharTarget(null)}
          onConfirmar={(guias) => {
            const guia = Object.values(guias)[0] ?? '';
            void handleDespachar(despacharTarget.id, guia);
          }}
        />
      )}

      {recibirTarget && (
        <RecepcionModal
          titulo="Recepcionar traslado"
          subtitulo={`${recibirTarget.origen_nombre ?? ''} → ${recibirTarget.destino_nombre ?? ''}`}
          onCerrar={() => setRecibirTarget(null)}
          onConfirmar={(datos) => confirmarRecepcion(recibirTarget, datos)}
        />
      )}

      {cancelarTarget && (
        <CancelarTransitoModal
          titulo="Cancelar traslado interno"
          subtitulo={`${cancelarTarget.origen_nombre ?? ''} → ${cancelarTarget.destino_nombre ?? ''}`}
          sucursales={sucursales.map((suc) => ({ id: suc.id, nombre: suc.nombre ?? null }))}
          ubicacionInicial={cancelarTarget.origen_id}
          onCerrar={() => setCancelarTarget(null)}
          onConfirmar={(motivo, ubicacion) => confirmarCancelacion(cancelarTarget, motivo, ubicacion)}
        />
      )}
    </div>
  );
}