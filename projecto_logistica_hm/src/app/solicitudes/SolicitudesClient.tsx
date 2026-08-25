'use client';

import { useMemo, useState } from 'react';
import {
  FileText,
  Plus,
  Search,
  CheckCircle2,
  AlertCircle,
  X,
  Eye,
  ArrowUp,
  Ban,
  Trash2,
  Car,
} from 'lucide-react';
import {
  createSolicitudAction,
  priorizarSolicitudAction,
  cancelarSolicitudAction,
  eliminarSolicitudAction,
  agregarVehiculoAction,
  quitarVehiculoAction,
} from '@/app/actions/solicitudes.actions';
import {
  EstadoSolicitud,
  SolicitudLista,
  TipoSolicitud,
  VehiculoInventario,
} from '@/types/solicitud.types';
import { Sucursal } from '@/types/sucursal.types';

const estadoConfig: Record<EstadoSolicitud, { label: string; color: string }> = {
  pendiente: { label: 'Pendiente', color: 'bg-neutral-100 text-neutral-500 border-neutral-200' },
  priorizada: { label: 'Priorizada', color: 'bg-neutral-200 text-neutral-900 border-neutral-200' },
  asignada: { label: 'Asignada', color: 'bg-white text-neutral-900 border-neutral-400' },
  calendarizada: { label: 'Calendarizada', color: 'bg-white text-neutral-900 border-neutral-900 border-2' },
  en_transito: { label: 'En Tránsito', color: 'bg-neutral-700 text-white border-neutral-700' },
  entregada: { label: 'Entregada', color: 'bg-neutral-900 text-white border-neutral-900' },
  finalizada: { label: 'Finalizada', color: 'bg-black text-white border-black ring-2 ring-neutral-300' },
  cancelada: { label: 'Cancelada', color: 'bg-red-50 text-red-700 border-red-200' },
};

const PRE_DESPACHO: EstadoSolicitud[] = ['pendiente', 'priorizada'];

interface FeedbackState {
  type: 'success' | 'error';
  message: string;
}

interface ViewerInfo {
  id: string;
  rol: 'administrador' | 'ejecutivo' | 'jefe_local' | 'logistica';
  sucursal_id: number | null;
}

interface SolicitudesClientProps {
  solicitudes: SolicitudLista[];
  sucursales: Sucursal[];
  vehiculos: VehiculoInventario[];
  viewer: ViewerInfo;
}

function formatFecha(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-CL');
}

export default function SolicitudesClient({
  solicitudes,
  sucursales,
  vehiculos,
  viewer,
}: SolicitudesClientProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [filtroEstado, setFiltroEstado] = useState<string>('todos');
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [detailTarget, setDetailTarget] = useState<SolicitudLista | null>(null);
  const [cancelTarget, setCancelTarget] = useState<SolicitudLista | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SolicitudLista | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [sucursalSel, setSucursalSel] = useState('');
  const [tipoSel, setTipoSel] = useState<TipoSolicitud>('venta');
  const [fechaLimite, setFechaLimite] = useState('');
  const [selectedVehiculos, setSelectedVehiculos] = useState<Set<string>>(new Set());

  const [motivo, setMotivo] = useState('');
  const [nuevoVehiculoId, setNuevoVehiculoId] = useState('');

  const esAdmin = viewer.rol === 'administrador';
  const esEjecutivo = viewer.rol === 'ejecutivo';
  const esJefeLocal = viewer.rol === 'jefe_local';
  const puedeCrear = esEjecutivo || esAdmin;

  const visibles = useMemo(() => {
    if (esAdmin || viewer.rol === 'logistica') return solicitudes;
    if (esEjecutivo) return solicitudes.filter((s) => s.ejecutivo_id === viewer.id);
    if (esJefeLocal) {
      if (viewer.sucursal_id === null) return [];
      return solicitudes.filter((s) => s.sucursal === viewer.sucursal_id);
    }
    return [];
  }, [solicitudes, viewer, esAdmin, esEjecutivo, esJefeLocal]);

  const filtradas = useMemo(() => {
    let lista = visibles;
    if (filtroEstado !== 'todos') {
      lista = lista.filter((s) => s.estado === filtroEstado);
    }
    const term = searchTerm.trim().toLowerCase();
    if (term) {
      lista = lista.filter(
        (s) =>
          (s.sucursal_nombre || '').toLowerCase().includes(term) ||
          s.id.toLowerCase().includes(term) ||
          (s.ejecutivo_nombre || '').toLowerCase().includes(term) ||
          s.vehiculos.some((v) => v.patente.toLowerCase().includes(term))
      );
    }
    return lista;
  }, [visibles, filtroEstado, searchTerm]);

  const pendientes = visibles.filter((s) => s.estado === 'pendiente').length;
  const priorizadas = visibles.filter((s) => s.estado === 'priorizada').length;

  function puedeGestionar(sol: SolicitudLista): boolean {
    if (esAdmin) return true;
    if (esEjecutivo) return sol.ejecutivo_id === viewer.id;
    if (esJefeLocal) return viewer.sucursal_id !== null && sol.sucursal === viewer.sucursal_id;
    return false;
  }

  function puedePriorizar(sol: SolicitudLista): boolean {
    if (sol.estado !== 'pendiente') return false;
    return esAdmin || (esJefeLocal && viewer.sucursal_id !== null && sol.sucursal === viewer.sucursal_id);
  }

  function puedeEliminar(sol: SolicitudLista): boolean {
    return PRE_DESPACHO.includes(sol.estado) && puedeGestionar(sol);
  }

  const vehiculosDisponiblesParaAgregar = vehiculos.filter((v) => !v.reservado_en_activa);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const result = await createSolicitudAction({
        sucursal: sucursalSel,
        tipo_solicitud: tipoSel,
        fecha_limite: fechaLimite,
        vehiculo_ids: Array.from(selectedVehiculos),
      });
      if (!result.success) {
        setFeedback({ type: 'error', message: result.error || 'Error al crear la solicitud.' });
      } else {
        setFeedback({ type: 'success', message: result.message || 'Solicitud creada.' });
        setIsCreateOpen(false);
        setSucursalSel('');
        setTipoSel('venta');
        setFechaLimite('');
        setSelectedVehiculos(new Set());
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handlePriorizar(sol: SolicitudLista) {
    setIsSubmitting(true);
    try {
      const result = await priorizarSolicitudAction(sol.id);
      setFeedback(
        result.success
          ? { type: 'success', message: result.message || 'Solicitud priorizada.' }
          : { type: 'error', message: result.error || 'Error al priorizar.' }
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleConfirmarCancelacion() {
    if (!cancelTarget) return;
    setIsSubmitting(true);
    try {
      const result = await cancelarSolicitudAction(cancelTarget.id, motivo);
      if (!result.success) {
        setFeedback({ type: 'error', message: result.error || 'Error al cancelar.' });
      } else {
        setFeedback({ type: 'success', message: result.message || 'Solicitud cancelada.' });
        setCancelTarget(null);
        setMotivo('');
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleConfirmarEliminacion() {
    if (!deleteTarget) return;
    setIsSubmitting(true);
    setDeleteError(null);
    try {
      const result = await eliminarSolicitudAction(deleteTarget.id);
      if (!result.success) {
        setDeleteError(result.error || 'No se pudo eliminar.');
      } else {
        setFeedback({ type: 'success', message: result.message || 'Solicitud eliminada.' });
        setDeleteTarget(null);
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleAgregarVehiculo() {
    if (!detailTarget || !nuevoVehiculoId) return;
    setIsSubmitting(true);
    try {
      const result = await agregarVehiculoAction(detailTarget.id, nuevoVehiculoId);
      if (!result.success) {
        setFeedback({ type: 'error', message: result.error || 'Error al reservar vehículo.' });
      } else {
        setFeedback({ type: 'success', message: result.message || 'Vehículo reservado.' });
        setNuevoVehiculoId('');
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleQuitarVehiculo(svId: string) {
    setIsSubmitting(true);
    try {
      const result = await quitarVehiculoAction(svId);
      setFeedback(
        result.success
          ? { type: 'success', message: result.message || 'Reserva retirada.' }
          : { type: 'error', message: result.error || 'Error al retirar reserva.' }
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-neutral-900 flex items-center gap-2">
            <FileText className="w-7 h-7 text-neutral-900" />
            <span>Gestión de Solicitudes</span>
          </h1>
          <p className="text-sm text-neutral-500 mt-1">
            Flujo de traslado de vehículos entre sucursales de H.Motores
          </p>
        </div>

        {puedeCrear && (
          <button
            onClick={() => setIsCreateOpen(true)}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-neutral-900 hover:bg-neutral-700 text-white text-sm font-semibold rounded-xl transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Nueva Solicitud</span>
          </button>
        )}
      </div>

      {esJefeLocal && viewer.sucursal_id === null && (
        <div className="p-4 bg-white border border-neutral-200 rounded-2xl text-sm text-neutral-700 flex items-start gap-2.5">
          <AlertCircle className="w-5 h-5 text-neutral-900 shrink-0 mt-0.5" />
          <span>
            Tu cuenta no tiene sucursal asignada todavía. Solicita a un Administrador que te asigne una desde
            Gestión de Usuarios para ver y priorizar las solicitudes de tu local.
          </span>
        </div>
      )}

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-neutral-200 rounded-2xl p-5 flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-neutral-500 uppercase tracking-wider">Total Visibles</p>
            <p className="text-3xl font-bold text-neutral-900 mt-1">{visibles.length}</p>
          </div>
          <div className="w-11 h-11 rounded-xl border border-neutral-300 flex items-center justify-center text-neutral-900">
            <FileText className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-neutral-900 border border-neutral-900 rounded-2xl p-5 flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-neutral-400 uppercase tracking-wider">Pendientes</p>
            <p className="text-3xl font-bold text-white mt-1">{pendientes}</p>
          </div>
          <div className="w-11 h-11 rounded-xl bg-white/10 flex items-center justify-center text-white">
            <Ban className="w-5 h-5 rotate-180" />
          </div>
        </div>

        <div className="bg-white border border-neutral-200 rounded-2xl p-5 flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-neutral-500 uppercase tracking-wider">Priorizadas</p>
            <p className="text-3xl font-bold text-neutral-400 mt-1">{priorizadas}</p>
          </div>
          <div className="w-11 h-11 rounded-xl bg-neutral-100 flex items-center justify-center text-neutral-400">
            <ArrowUp className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Feedback Banner */}
      {feedback && (
        <div
          className={`p-5 rounded-2xl border transition-all ${
            feedback.type === 'success'
              ? 'bg-neutral-900 border-neutral-900 text-white'
              : 'bg-red-50 border-red-200 text-red-700'
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              {feedback.type === 'success' ? (
                <CheckCircle2 className="w-6 h-6 text-white shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-6 h-6 text-red-600 shrink-0 mt-0.5" />
              )}
              <p className="font-bold text-base">{feedback.message}</p>
            </div>
            <button
              onClick={() => setFeedback(null)}
              className={`p-1 rounded-lg cursor-pointer ${
                feedback.type === 'success'
                  ? 'text-neutral-300 hover:text-white hover:bg-white/10'
                  : 'text-red-400 hover:text-red-700 hover:bg-red-100'
              }`}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white border border-neutral-200 rounded-2xl p-4 flex flex-col sm:flex-row gap-4 justify-between items-center">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
          <input
            type="text"
            placeholder="Buscar por sucursal, ID, ejecutivo o patente..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-3 py-2 bg-white border border-neutral-300 rounded-xl text-sm text-neutral-900 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900"
          />
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <label className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">Estado:</label>
          <select
            value={filtroEstado}
            onChange={(e) => setFiltroEstado(e.target.value)}
            className="bg-white border border-neutral-300 rounded-xl px-3 py-2 text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-900"
          >
            <option value="todos">Todos</option>
            {(Object.keys(estadoConfig) as EstadoSolicitud[]).map((est) => (
              <option key={est} value={est}>
                {estadoConfig[est].label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-neutral-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-neutral-200 bg-neutral-50 text-xs uppercase font-semibold text-neutral-500 tracking-wider">
                <th className="py-3.5 px-4">Solicitud</th>
                <th className="py-3.5 px-4">Origen</th>
                <th className="py-3.5 px-4">Estado</th>
                <th className="py-3.5 px-4">Ejecutivo</th>
                <th className="py-3.5 px-4">Vehículos</th>
                <th className="py-3.5 px-4">Creación</th>
                <th className="py-3.5 px-4">Límite</th>
                <th className="py-3.5 px-4 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200 text-sm">
              {filtradas.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-neutral-400">
                    No hay solicitudes que coincidan con los filtros.
                  </td>
                </tr>
              ) : (
                filtradas.map((sol) => {
                  const estado = estadoConfig[sol.estado];
                  return (
                    <tr key={sol.id} className="hover:bg-neutral-50 transition-colors">
                      <td className="py-3.5 px-4">
                        <p className="font-mono text-xs font-bold text-neutral-900 uppercase">
                          #{sol.id.slice(0, 8)}
                        </p>
                        <span className="inline-flex mt-0.5 px-2 py-0.5 rounded-lg text-[10px] font-semibold bg-white text-neutral-600 border border-neutral-300">
                          {sol.tipo_solicitud === 'evento' ? 'Evento' : 'Venta'}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 font-medium text-neutral-900">
                        {sol.sucursal_nombre || `#${sol.sucursal}`}
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span
                            className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold border ${estado.color}`}
                          >
                            {estado.label}
                          </span>
                          {sol.posicion_prioridad !== null && sol.posicion_prioridad !== undefined && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-bold bg-neutral-900 text-white">
                              #{sol.posicion_prioridad} en cola
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="py-3.5 px-4 text-xs text-neutral-600">{sol.ejecutivo_nombre || '—'}</td>

                      <td className="py-3.5 px-4">
                        <button
                          onClick={() => setDetailTarget(sol)}
                          title="Ver solicitud"
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-white text-neutral-700 border border-neutral-300 hover:border-neutral-900 hover:text-neutral-900 transition-colors cursor-pointer"
                        >
                          <Car className="w-3.5 h-3.5" />
                          {sol.vehiculos.length}
                        </button>
                      </td>

                      <td className="py-3.5 px-4 text-xs text-neutral-500">{formatFecha(sol.fecha_creacion)}</td>
                      <td className="py-3.5 px-4 text-xs text-neutral-500">{formatFecha(sol.fecha_limite)}</td>

                      <td className="py-3.5 px-4 text-right space-x-1 whitespace-nowrap">
                        <button
                          onClick={() => setDetailTarget(sol)}
                          title="Ver detalle"
                          className="p-1.5 rounded-lg text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100 transition-colors cursor-pointer"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        {puedePriorizar(sol) && (
                          <button
                            onClick={() => handlePriorizar(sol)}
                            disabled={isSubmitting}
                            title="Priorizar (siguiente posición en la cola)"
                            className="p-1.5 rounded-lg text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100 transition-colors disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
                          >
                            <ArrowUp className="w-4 h-4" />
                          </button>
                        )}
                        {PRE_DESPACHO.includes(sol.estado) && puedeGestionar(sol) && (
                          <>
                            <button
                              onClick={() => {
                                setMotivo('');
                                setCancelTarget(sol);
                              }}
                              title="Cancelar con motivo"
                              className="p-1.5 rounded-lg text-neutral-500 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                            >
                              <Ban className="w-4 h-4" />
                            </button>
                            {puedeEliminar(sol) && (
                              <button
                                onClick={() => {
                                  setDeleteError(null);
                                  setDeleteTarget(sol);
                                }}
                                title="Eliminar definitivamente"
                                className="p-1.5 rounded-lg text-neutral-500 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Nueva Solicitud */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white border border-neutral-200 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-6 border-b border-neutral-200 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-neutral-900 flex items-center justify-center text-white">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-neutral-900">Nueva Solicitud de Traslado</h2>
                  <p className="text-xs text-neutral-500">Queda en estado Pendiente para revisión del Jefe de Local</p>
                </div>
              </div>
              <button
                onClick={() => setIsCreateOpen(false)}
                className="text-neutral-400 hover:text-neutral-900 p-1 rounded-lg hover:bg-neutral-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreate} className="p-6 space-y-4 overflow-y-auto">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-neutral-600 uppercase tracking-wider">
                  Sucursal de Origen *
                </label>
                <select
                  required
                  value={sucursalSel}
                  onChange={(e) => setSucursalSel(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-neutral-300 rounded-xl text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-900"
                >
                  <option value="">Selecciona una sucursal...</option>
                  {sucursales.map((suc) => (
                    <option key={suc.id} value={String(suc.id)}>
                      {suc.nombre}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-neutral-600 uppercase tracking-wider">Tipo *</label>
                  <select
                    value={tipoSel}
                    onChange={(e) => setTipoSel(e.target.value as TipoSolicitud)}
                    className="w-full px-3 py-2 bg-white border border-neutral-300 rounded-xl text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-900"
                  >
                    <option value="venta">Venta</option>
                    <option value="evento">Evento</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-neutral-600 uppercase tracking-wider">
                    Fecha Límite
                  </label>
                  <input
                    type="date"
                    value={fechaLimite}
                    onChange={(e) => setFechaLimite(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-neutral-300 rounded-xl text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-900"
                  />
                </div>
              </div>

              {esAdmin && (
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-neutral-600 uppercase tracking-wider">
                    Reservar Vehículos (opcional)
                  </label>
                  <div className="max-h-40 overflow-y-auto border border-neutral-300 rounded-xl divide-y divide-neutral-200">
                    {vehiculos.length === 0 ? (
                      <p className="p-3 text-xs text-neutral-400 italic">
                        No hay vehículos en el inventario todavía.
                      </p>
                    ) : (
                      vehiculos.map((v) => (
                        <label
                          key={v.id}
                          className={`flex items-center gap-2.5 px-3 py-2 text-sm ${
                            v.reservado_en_activa ? 'opacity-45 cursor-not-allowed' : 'cursor-pointer hover:bg-neutral-50'
                          }`}
                        >
                          <input
                            type="checkbox"
                            disabled={v.reservado_en_activa}
                            checked={selectedVehiculos.has(v.id)}
                            onChange={(e) => {
                              const next = new Set(selectedVehiculos);
                              if (e.target.checked) next.add(v.id);
                              else next.delete(v.id);
                              setSelectedVehiculos(next);
                            }}
                            className="accent-neutral-900"
                          />
                          <span className="font-mono font-bold text-neutral-900 text-xs">{v.patente}</span>
                          <span className="text-xs text-neutral-500 truncate">
                            {v.marca} {v.modelo} · {v.anio}
                          </span>
                          {v.reservado_en_activa && (
                            <span className="ml-auto text-[10px] font-semibold text-neutral-400 uppercase shrink-0">
                              Ocupado
                            </span>
                          )}
                        </label>
                      ))
                    )}
                  </div>
                </div>
              )}

              <div className="p-3 bg-neutral-50 border border-neutral-200 rounded-xl flex items-start gap-2.5 text-xs text-neutral-600">
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-neutral-900" />
                <span>
                  La solicitud nace como <strong>Pendiente</strong>. El Jefe de Local de la sucursal elegida podrá
                  priorizarla en la cola; luego Logística continuará el flujo.
                </span>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-neutral-200">
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  className="px-4 py-2 text-sm font-semibold text-neutral-600 hover:text-neutral-900 rounded-xl hover:bg-neutral-100 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 text-sm font-semibold text-white bg-neutral-900 hover:bg-neutral-700 active:bg-black rounded-xl disabled:opacity-50 cursor-pointer"
                >
                  {isSubmitting ? 'Creando...' : 'Crear Solicitud'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Detalle de Solicitud */}
      {detailTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white border border-neutral-200 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between p-6 border-b border-neutral-200 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-neutral-900 flex items-center justify-center text-white">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-neutral-900 font-mono uppercase">
                    #{detailTarget.id.slice(0, 8)}
                  </h2>
                  <p className="text-xs text-neutral-500">
                    Origen: {detailTarget.sucursal_nombre || `#${detailTarget.sucursal}`} ·{' '}
                    {detailTarget.tipo_solicitud === 'evento' ? 'Evento' : 'Venta'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setDetailTarget(null)}
                className="text-neutral-400 hover:text-neutral-900 p-1 rounded-lg hover:bg-neutral-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="overflow-y-auto p-6 space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold border ${
                    estadoConfig[detailTarget.estado].color
                  }`}
                >
                  {estadoConfig[detailTarget.estado].label}
                </span>
                {detailTarget.posicion_prioridad !== null &&
                  detailTarget.posicion_prioridad !== undefined && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-bold bg-neutral-900 text-white">
                      #{detailTarget.posicion_prioridad} en cola de prioridad
                    </span>
                  )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div>
                  <p className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider">Creación</p>
                  <p className="text-neutral-900 font-medium">{formatFecha(detailTarget.fecha_creacion)}</p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider">
                    Despacho Tentativo
                  </p>
                  <p className="text-neutral-900 font-medium">
                    {formatFecha(detailTarget.fecha_tentativa_despacho)}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider">Fecha Límite</p>
                  <p className="text-neutral-900 font-medium">{formatFecha(detailTarget.fecha_limite)}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs border-t border-neutral-100 pt-4">
                <div>
                  <p className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider">Ejecutivo</p>
                  <p className="text-neutral-900 font-medium">{detailTarget.ejecutivo_nombre || '—'}</p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider">Jefe de Local</p>
                  <p className="text-neutral-900 font-medium">
                    {detailTarget.jefe_local_nombre || (
                      <span className="text-neutral-400 italic">Sin asignar</span>
                    )}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider">Logística</p>
                  <p className="text-neutral-900 font-medium">
                    {detailTarget.logistica_nombre || (
                      <span className="text-neutral-400 italic">Sin asignar</span>
                    )}
                  </p>
                </div>
              </div>

              {detailTarget.estado === 'cancelada' && detailTarget.motivo_cancelacion && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700">
                  <strong>Motivo de cancelación:</strong> {detailTarget.motivo_cancelacion}
                </div>
              )}

              <div className="space-y-2 border-t border-neutral-100 pt-4">
                <p className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider">
                  Vehículos asociados ({detailTarget.vehiculos.length})
                </p>

                {detailTarget.vehiculos.length === 0 ? (
                  <p className="text-xs text-neutral-400 italic">Sin vehículos reservados.</p>
                ) : (
                  <div className="space-y-2">
                    {detailTarget.vehiculos.map((v) => (
                      <div
                        key={v.solicitud_vehiculo_id}
                        className="flex items-center justify-between gap-3 bg-neutral-50 border border-neutral-200 rounded-xl px-3 py-2"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-9 h-9 rounded-lg bg-neutral-900 flex items-center justify-center shrink-0">
                            <Car className="w-4 h-4 text-white" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-neutral-900 font-mono">{v.patente}</p>
                            <p className="text-[11px] text-neutral-500 truncate">
                              {v.marca} {v.modelo} · {v.anio}
                              {v.color ? ` · ${v.color}` : ''}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {v.disponibilidad === 'reservado' ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-bold bg-neutral-900 text-white">
                              Reservado
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-semibold bg-white text-neutral-500 border border-neutral-300">
                              Liberado
                            </span>
                          )}
                          {esAdmin && PRE_DESPACHO.includes(detailTarget.estado) && (
                            <button
                              onClick={() => handleQuitarVehiculo(v.solicitud_vehiculo_id)}
                              disabled={isSubmitting}
                              title="Quitar reserva"
                              className="p-1 rounded-lg text-neutral-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer disabled:opacity-40"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {esAdmin && PRE_DESPACHO.includes(detailTarget.estado) && (
                  <div className="flex items-center gap-2 pt-1">
                    <select
                      value={nuevoVehiculoId}
                      onChange={(e) => setNuevoVehiculoId(e.target.value)}
                      className="flex-1 px-3 py-2 bg-white border border-neutral-300 rounded-xl text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-900"
                    >
                      <option value="">Agregar vehículo al traslado...</option>
                      {vehiculosDisponiblesParaAgregar
                        .filter(
                          (v) =>
                            !detailTarget.vehiculos.some(
                              (adj) =>
                                adj.patente === v.patente &&
                                adj.marca === v.marca &&
                                adj.modelo === v.modelo &&
                                adj.anio === v.anio
                            )
                        )
                        .map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.patente} — {v.marca} {v.modelo} ({v.anio})
                          </option>
                        ))}
                    </select>
                    <button
                      type="button"
                      onClick={handleAgregarVehiculo}
                      disabled={!nuevoVehiculoId || isSubmitting}
                      className="inline-flex items-center gap-1.5 px-4 py-2 bg-neutral-900 hover:bg-neutral-700 text-white text-sm font-semibold rounded-xl disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
                    >
                      <Plus className="w-4 h-4" />
                      Reservar
                    </button>
                  </div>
                )}
              </div>

              <div className="border-t border-neutral-100 pt-4 flex flex-wrap gap-2">
                {puedePriorizar(detailTarget) && (
                  <button
                    onClick={() => handlePriorizar(detailTarget)}
                    disabled={isSubmitting}
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-neutral-900 hover:bg-neutral-700 text-white text-sm font-semibold rounded-xl disabled:opacity-50 cursor-pointer"
                  >
                    <ArrowUp className="w-4 h-4" />
                    Priorizar ahora
                  </button>
                )}
                {PRE_DESPACHO.includes(detailTarget.estado) && puedeGestionar(detailTarget) && (
                  <button
                    onClick={() => {
                      setMotivo('');
                      setDetailTarget(null);
                      setCancelTarget(detailTarget);
                    }}
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-white border border-neutral-300 hover:border-red-600 hover:text-red-600 text-sm font-semibold text-neutral-700 rounded-xl cursor-pointer transition-colors"
                  >
                    <Ban className="w-4 h-4" />
                    Cancelar solicitud
                  </button>
                )}
                {puedeEliminar(detailTarget) && (
                  <button
                    onClick={() => {
                      setDeleteError(null);
                      setDetailTarget(null);
                      setDeleteTarget(detailTarget);
                    }}
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-white border border-neutral-300 hover:border-red-600 hover:text-red-600 text-sm font-semibold text-neutral-700 rounded-xl cursor-pointer transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                    Eliminar
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Cancelar con Motivo */}
      {cancelTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white border border-neutral-200 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="p-6 space-y-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-neutral-900 flex items-center justify-center text-white shrink-0">
                  <Ban className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-neutral-900">Cancelar Solicitud</h2>
                  <p className="text-sm text-neutral-500 font-mono uppercase">
                    #{cancelTarget.id.slice(0, 8)} · {cancelTarget.sucursal_nombre}
                  </p>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-neutral-600 uppercase tracking-wider">
                  Motivo de Cancelación *
                </label>
                <textarea
                  required
                  rows={3}
                  minLength={5}
                  placeholder="Explica brevemente el motivo (mínimo 5 caracteres)..."
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-neutral-300 rounded-xl text-sm text-neutral-900 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900 resize-none"
                />
              </div>

              <div className="p-3 bg-neutral-50 border border-neutral-200 rounded-xl text-xs text-neutral-600">
                Los vehículos reservados serán liberados automáticamente por el sistema.
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setCancelTarget(null)}
                  disabled={isSubmitting}
                  className="px-4 py-2 text-sm font-semibold text-neutral-600 hover:text-neutral-900 rounded-xl hover:bg-neutral-100 cursor-pointer disabled:opacity-50"
                >
                  Volver
                </button>
                <button
                  type="button"
                  onClick={handleConfirmarCancelacion}
                  disabled={isSubmitting || motivo.trim().length < 5}
                  className="px-5 py-2 text-sm font-semibold text-white bg-neutral-900 hover:bg-neutral-700 rounded-xl disabled:opacity-50 cursor-pointer"
                >
                  {isSubmitting ? 'Cancelando...' : 'Confirmar Cancelación'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Eliminar Definitivamente */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white border border-neutral-200 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="p-6 space-y-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-red-50 border border-red-200 flex items-center justify-center text-red-600 shrink-0">
                  <AlertCircle className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-neutral-900">Eliminar Solicitud</h2>
                  <p className="text-sm text-neutral-500">
                    ¿Confirmas eliminar definitivamente{' '}
                    <strong className="text-neutral-900 font-mono uppercase">
                      #{deleteTarget.id.slice(0, 8)}
                    </strong>
                    ? Esta acción no se puede deshacer.
                  </p>
                </div>
              </div>

              {deleteTarget.vehiculos.length > 0 && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>Se liberarán también las {deleteTarget.vehiculos.length} reserva(s) de vehículos asociadas.</span>
                </div>
              )}

              {deleteError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{deleteError}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setDeleteTarget(null)}
                  disabled={isSubmitting}
                  className="px-4 py-2 text-sm font-semibold text-neutral-600 hover:text-neutral-900 rounded-xl hover:bg-neutral-100 cursor-pointer disabled:opacity-50"
                >
                  Volver
                </button>
                <button
                  type="button"
                  onClick={handleConfirmarEliminacion}
                  disabled={isSubmitting}
                  className="px-5 py-2 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 rounded-xl disabled:opacity-50 cursor-pointer"
                >
                  {isSubmitting ? 'Eliminando...' : 'Eliminar Definitivamente'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
