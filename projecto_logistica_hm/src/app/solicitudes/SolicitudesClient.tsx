'use client';

import { useEffect, useMemo, useState } from 'react';
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
  Car,
  ThumbsUp,
  ThumbsDown,
  Clock,
} from 'lucide-react';
import {
  createSolicitudAction,
  priorizarSolicitudAction,
  cancelarSolicitudAction,
  eliminarSolicitudAction,
  aprobarSolicitudAction,
  rechazarSolicitudAction,
  getEjecutivosPorSucursalAction,
  recibirSolicitudAction,
  finalizarSolicitudAction,
} from '@/app/actions/solicitudes.actions';
import {
  EstadoSolicitud,
  SolicitudLista,
  TipoSolicitud,
  VehiculoInventario,
} from '@/types/solicitud.types';
import { Sucursal } from '@/types/sucursal.types';
import { formatFecha } from '@/lib/fechas';
import { UsuarioNombreBoton } from '@/components/usuario-info-modal';
import SolicitudDetalleModal from '@/components/SolicitudDetalleModal';

const estadoConfig: Record<EstadoSolicitud, { label: string; color: string }> = {
  pendiente_aprobacion: { label: 'Pendiente AprobaciÃ³n', color: 'bg-amber-50 text-amber-700 border-amber-200' },
  aprobada: { label: 'Aprobada', color: 'bg-green-50 text-green-700 border-green-200' },
  pendiente: { label: 'Pendiente', color: 'bg-neutral-100 text-neutral-500 border-neutral-200' },
  priorizada: { label: 'Priorizada', color: 'bg-neutral-200 text-neutral-900 border-neutral-200' },
  asignada: { label: 'Asignada', color: 'bg-white text-neutral-900 border-neutral-400' },
  calendarizada: { label: 'Calendarizada', color: 'bg-white text-neutral-900 border-neutral-900 border-2' },
  en_transito: { label: 'En TrÃ¡nsito', color: 'bg-neutral-700 text-white border-neutral-700' },
  entregada: { label: 'Entregada', color: 'bg-neutral-900 text-white border-neutral-900' },
  finalizada: { label: 'Finalizada', color: 'bg-black text-white border-black ring-2 ring-neutral-300' },
  cancelada: { label: 'Cancelada', color: 'bg-red-50 text-red-700 border-red-200' },
  rechazada: { label: 'Rechazada', color: 'bg-red-50 text-red-700 border-red-200' },
};

const PRE_DESPACHO: EstadoSolicitud[] = [
  'pendiente_aprobacion',
  'aprobada',
  'pendiente',
  'priorizada',
];

interface FeedbackState {
  type: 'success' | 'error';
  message: string;
}

interface ViewerInfo {
  id: string;
  nombre: string;
  apellido: string;
  rol: 'administrador' | 'ejecutivo' | 'jefe_local' | 'logistica';
  sucursal_id: number | null;
}

interface SolicitudesClientProps {
  solicitudes: SolicitudLista[];
  sucursales: Sucursal[];
  vehiculos: VehiculoInventario[];
  viewer: ViewerInfo;
}

function getEncargadoId(sol: SolicitudLista): string | null {
  return sol.ejecutivo_id || sol.jefe_local_id || null;
}

function getEncargadoNombre(sol: SolicitudLista): string | null {
  if (sol.ejecutivo_id) return sol.ejecutivo_nombre;
  if (sol.jefe_local_id) return sol.jefe_local_nombre;
  return null;
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
  const [rejectTarget, setRejectTarget] = useState<SolicitudLista | null>(null);
  const [rejectMotivo, setRejectMotivo] = useState('');
  const [approveTarget, setApproveTarget] = useState<SolicitudLista | null>(null);
  const [aprobacionFecha, setAprobacionFecha] = useState('');

  const [sucursalSel, setSucursalSel] = useState('');
  const [prevSucursalViewer, setPrevSucursalViewer] = useState<number | null>(viewer.sucursal_id);
  if (prevSucursalViewer !== viewer.sucursal_id) {
    setPrevSucursalViewer(viewer.sucursal_id);
    if ((viewer.rol === 'jefe_local' || viewer.rol === 'ejecutivo') && viewer.sucursal_id) {
      setSucursalSel(String(viewer.sucursal_id));
    }
  }
  const [sucursalDestinoSel, setSucursalDestinoSel] = useState('');
  const [tipoSel, setTipoSel] = useState<TipoSolicitud>('venta');
  const [fechaLimite, setFechaLimite] = useState('');
  const [selectedVehiculos, setSelectedVehiculos] = useState<Set<string>>(new Set());
  const [direccionEvento, setDireccionEvento] = useState('');
  const [tituloEvento, setTituloEvento] = useState('');
  const [ejecutivoSel, setEjecutivoSel] = useState('');
  const [ejecutivosDisponibles, setEjecutivosDisponibles] = useState<Array<{ id: string; nombre: string; apellido: string }>>([]);
  const [prevSucursalSel, setPrevSucursalSel] = useState(sucursalSel);
  if (prevSucursalSel !== sucursalSel) {
    setPrevSucursalSel(sucursalSel);
    setEjecutivoSel('');
    setEjecutivosDisponibles([]);
  }

  const [vehiculoSearch, setVehiculoSearch] = useState('');
  const [vehiculoMarca, setVehiculoMarca] = useState('');
  const [vehiculoError, setVehiculoError] = useState(false);
  const [obsCreacion, setObsCreacion] = useState('');

  const [motivo, setMotivo] = useState('');

  const esAdmin = viewer.rol === 'administrador';
  const esEjecutivo = viewer.rol === 'ejecutivo';
  const esJefeLocal = viewer.rol === 'jefe_local';
  const esLogistica = viewer.rol === 'logistica';
  const puedeCrear = esEjecutivo || esJefeLocal || esAdmin;

  const sucursalesParaDestino = useMemo(() => {
    return sucursales;
  }, [sucursales]);

  const marcasVehiculos = useMemo(() => {
    const marcas = new Set<string>();
    vehiculos.forEach((v) => { if (v.marca) marcas.add(v.marca); });
    return Array.from(marcas).sort((a, b) => a.localeCompare(b));
  }, [vehiculos]);

  const vehiculosFiltrados = useMemo(() => {
    const term = vehiculoSearch.trim().toLowerCase();
    return vehiculos.filter((v) => {
      if (vehiculoMarca && v.marca !== vehiculoMarca) return false;
      if (term) {
        const patente = v.patente.toLowerCase().includes(term);
        const chasis = (v.chasis || '').toLowerCase().includes(term);
        if (!patente && !chasis) return false;
      }
      return true;
    });
  }, [vehiculos, vehiculoSearch, vehiculoMarca]);

  const visibles = useMemo(() => {
    if (esAdmin || esLogistica) return solicitudes;
    if (esEjecutivo) return solicitudes.filter((s) => s.ejecutivo_id === viewer.id);
    if (esJefeLocal) {
      if (viewer.sucursal_id === null) return [];
      return solicitudes.filter((s) => s.sucursal === viewer.sucursal_id);
    }
    return [];
  }, [solicitudes, viewer, esAdmin, esEjecutivo, esJefeLocal, esLogistica]);

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
          (getEncargadoNombre(s) || '').toLowerCase().includes(term) ||
          (s.sucursal_destino_nombre || '').toLowerCase().includes(term) ||
          s.vehiculos.some((v) => v.patente.toLowerCase().includes(term))
      );
    }
    return lista;
  }, [visibles, filtroEstado, searchTerm]);

  const pendientesAprobacion = visibles.filter((s) => s.estado === 'pendiente_aprobacion').length;
  const priorizadas = visibles.filter((s) => s.estado === 'priorizada').length;

  function puedeGestionar(sol: SolicitudLista): boolean {
    if (esAdmin) return true;
    if (esEjecutivo) return sol.ejecutivo_id === viewer.id;
    if (esJefeLocal) return viewer.sucursal_id !== null && sol.sucursal === viewer.sucursal_id;
    if (esLogistica) return true;
    return false;
  }

  function puedePriorizar(sol: SolicitudLista): boolean {
    if (sol.estado !== 'pendiente' && sol.estado !== 'aprobada') return false;
    return esAdmin || (esJefeLocal && viewer.sucursal_id !== null && sol.sucursal === viewer.sucursal_id);
  }

  function puedeEliminar(sol: SolicitudLista): boolean {
    return PRE_DESPACHO.includes(sol.estado) && puedeGestionar(sol);
  }

  function puedeAprobar(sol: SolicitudLista): boolean {
    if (sol.estado !== 'pendiente_aprobacion') return false;
    if (esAdmin) return true;
    if (esJefeLocal) return viewer.sucursal_id !== null && sol.sucursal === viewer.sucursal_id;
    return false;
  }

  function puedeRecibir(sol: SolicitudLista): boolean {
    if (sol.estado !== 'en_transito') return false;
    if (esAdmin) return true;
    if (esJefeLocal) return viewer.sucursal_id !== null && sol.sucursal === viewer.sucursal_id;
    return false;
  }

  function puedeFinalizar(sol: SolicitudLista): boolean {
    if (sol.estado !== 'entregada') return false;
    if (esAdmin) return true;
    if (esJefeLocal) return viewer.sucursal_id !== null && sol.sucursal === viewer.sucursal_id;
    return false;
  }

  useEffect(() => {
    if (!feedback) return;
    const t = setTimeout(() => setFeedback(null), 5000);
    return () => clearTimeout(t);
  }, [feedback]);

  useEffect(() => {
    if (!esJefeLocal || !sucursalSel) return;
    let cancelled = false;
    async function load() {
      const data = await getEjecutivosPorSucursalAction(Number(sucursalSel));
      if (!cancelled) setEjecutivosDisponibles(data);
    }
    load();
    return () => { cancelled = true; };
  }, [esJefeLocal, sucursalSel]);

  function resetCreateForm() {
    setSucursalSel((esJefeLocal || esEjecutivo) && viewer.sucursal_id ? String(viewer.sucursal_id) : '');
    setSucursalDestinoSel('');
    setTipoSel('venta');
    setFechaLimite('');
    setSelectedVehiculos(new Set());
    setVehiculoSearch('');
    setVehiculoMarca('');
    setVehiculoError(false);
    setObsCreacion('');
    setDireccionEvento('');
    setTituloEvento('');
    setEjecutivoSel('');
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (selectedVehiculos.size === 0) {
      setVehiculoError(true);
      setFeedback({ type: 'error', message: 'Debes seleccionar al menos un vehÃ­culo: una solicitud no puede existir sin vehÃ­culos.' });
      return;
    }
    setVehiculoError(false);
    setIsSubmitting(true);
    try {
      const result = await createSolicitudAction({
        sucursal: sucursalSel,
        tipo_solicitud: tipoSel,
        fecha_limite: fechaLimite,
        vehiculo_ids: Array.from(selectedVehiculos),
        sucursal_destino: tipoSel === 'venta' ? sucursalDestinoSel : undefined,
        direccion_evento: tipoSel === 'evento' ? direccionEvento : undefined,
        titulo_evento: tipoSel === 'evento' ? tituloEvento : undefined,
        ejecutivo_id: esJefeLocal && ejecutivoSel ? ejecutivoSel : undefined,
        observacion: obsCreacion.trim() || undefined,
      });
      if (!result.success) {
        setFeedback({ type: 'error', message: result.error || 'Error al crear.' });
      } else {
        setFeedback({ type: 'success', message: result.message || 'Solicitud creada.' });
        setIsCreateOpen(false);
        resetCreateForm();
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
          ? { type: 'success', message: result.message || 'Priorizada.' }
          : { type: 'error', message: result.error || 'Error.' }
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  function abrirAprobacion(sol: SolicitudLista) {
    setAprobacionFecha('');
    setApproveTarget(sol);
  }

  async function handleConfirmarAprobacion() {
    if (!approveTarget) return;
    const fecha = aprobacionFecha.trim();
    if (!fecha) {
      setFeedback({ type: 'error', message: 'Debes indicar la fecha de entrega para aprobar la solicitud.' });
      return;
    }
    setIsSubmitting(true);
    try {
      const result = await aprobarSolicitudAction(approveTarget.id, fecha);
      if (!result.success) {
        setFeedback({ type: 'error', message: result.error || 'Error al aprobar.' });
      } else {
        setFeedback({ type: 'success', message: result.message || 'Aprobada.' });
        setApproveTarget(null);
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleConfirmarRechazo() {
    if (!rejectTarget) return;
    setIsSubmitting(true);
    try {
      const result = await rechazarSolicitudAction(rejectTarget.id, rejectMotivo);
      if (!result.success) {
        setFeedback({ type: 'error', message: result.error || 'Error al rechazar.' });
      } else {
        setFeedback({ type: 'success', message: result.message || 'Rechazada.' });
        setRejectTarget(null);
        setRejectMotivo('');
      }
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
        setFeedback({ type: 'error', message: result.error || 'Error.' });
      } else {
        setFeedback({ type: 'success', message: result.message || 'Cancelada.' });
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
        setFeedback({ type: 'success', message: result.message || 'Eliminada.' });
        setDeleteTarget(null);
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleRecibir(sol: SolicitudLista) {
    setIsSubmitting(true);
    try {
      const result = await recibirSolicitudAction(sol.id);
      if (!result.success) {
        setFeedback({ type: 'error', message: result.error || 'Error al marcar como recibida.' });
      } else {
        setFeedback({ type: 'success', message: result.message || 'Solicitud marcada como recibida.' });
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleFinalizar(sol: SolicitudLista) {
    setIsSubmitting(true);
    try {
      const result = await finalizarSolicitudAction(sol.id);
      if (!result.success) {
        setFeedback({ type: 'error', message: result.error || 'Error al finalizar.' });
      } else {
        setFeedback({ type: 'success', message: result.message || 'Solicitud finalizada.' });
      }
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
            <span>GestiÃ³n de Solicitudes</span>
          </h1>
          <p className="text-sm text-neutral-500 mt-1">
            Flujo de traslado de vehÃ­culos entre sucursales de H.Motores
          </p>
        </div>

        {puedeCrear && (
          <button
            onClick={() => { resetCreateForm(); setIsCreateOpen(true); }}
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
            Tu cuenta no tiene sucursal asignada. Solicita a un Administrador que te asigne una.
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
            <p className="text-xs font-medium text-neutral-400 uppercase tracking-wider">Pendientes AprobaciÃ³n</p>
            <p className="text-3xl font-bold text-white mt-1">{pendientesAprobacion}</p>
          </div>
          <div className="w-11 h-11 rounded-xl bg-white/10 flex items-center justify-center text-white">
            <Clock className="w-5 h-5" />
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
            placeholder="Buscar por sucursal, ID, ejecutivo, patente..."
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
                <th className="py-3.5 px-4">Destino</th>
                <th className="py-3.5 px-4">Estado</th>
                <th className="py-3.5 px-4">Encargado</th>
                <th className="py-3.5 px-4">VehÃ­culos</th>
                <th className="py-3.5 px-4">CreaciÃ³n</th>
                <th className="py-3.5 px-4">Entrega</th>
                <th className="py-3.5 px-4 text-right">Ver</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200 text-sm">
              {filtradas.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-neutral-400">
                    No hay solicitudes que coincidan con los filtros.
                  </td>
                </tr>
              ) : (
                filtradas.map((sol) => {
                  const estado = estadoConfig[sol.estado];
                  const destino = sol.tipo_solicitud === 'venta'
                    ? (sol.sucursal_destino_nombre || `#${sol.sucursal_destino}`)
                    : (sol.direccion_evento || 'â€”');
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

                      <td className="py-3.5 px-4 text-xs text-neutral-600 max-w-[160px] truncate" title={destino}>
                        {destino}
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold border ${estado.color}`}>
                            {estado.label}
                          </span>
                          {sol.posicion_prioridad !== null && sol.posicion_prioridad !== undefined && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-bold bg-neutral-900 text-white">
                              #{sol.posicion_prioridad}
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="py-3.5 px-4 text-xs text-neutral-600">
                        {getEncargadoNombre(sol) ? (
                          <UsuarioNombreBoton usuarioId={getEncargadoId(sol)} nombre={getEncargadoNombre(sol)} muted />
                        ) : (
                          'â€”'
                        )}
                      </td>

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

                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <button
                          onClick={() => setDetailTarget(sol)}
                          title="Ver detalle"
                          className="p-1.5 rounded-lg text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100 transition-colors cursor-pointer"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
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
                  <p className="text-xs text-neutral-500">
                    {esJefeLocal
                      ? 'Se crearÃ¡ como Aprobada directamente'
                      : 'Queda Pendiente de AprobaciÃ³n por el Jefe de Local'}
                  </p>
                </div>
              </div>
              <button onClick={() => setIsCreateOpen(false)} className="text-neutral-400 hover:text-neutral-900 p-1 rounded-lg hover:bg-neutral-100">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreate} className="p-6 space-y-4 overflow-y-auto">
              {/* Sucursal Origen */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-neutral-600 uppercase tracking-wider">Sucursal de Origen *</label>
                {esEjecutivo ? (
                  <input
                    type="text"
                    disabled
                    value={sucursales.find((s) => s.id === viewer.sucursal_id)?.nombre || `Sucursal #${viewer.sucursal_id}`}
                    className="w-full px-3 py-2 bg-neutral-100 border border-neutral-300 rounded-xl text-sm text-neutral-500 cursor-not-allowed"
                  />
                ) : (
                  <select
                    required
                    value={sucursalSel}
                    onChange={(e) => { setSucursalSel(e.target.value); setSucursalDestinoSel(''); setEjecutivoSel(''); }}
                    className="w-full px-3 py-2 bg-white border border-neutral-300 rounded-xl text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-900"
                  >
                    <option value="">Selecciona una sucursal...</option>
                    {sucursales.map((suc) => (
                      <option key={suc.id} value={String(suc.id)}>{suc.nombre}</option>
                    ))}
                  </select>
                )}
              </div>

              {/* Tipo y Fecha */}
              <div className={esEjecutivo ? 'space-y-1.5' : 'grid grid-cols-2 gap-4'}>
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
                {!esEjecutivo && (
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-neutral-600 uppercase tracking-wider">Fecha de Entrega *</label>
                    <input
                      type="date"
                      required
                      value={fechaLimite}
                      onChange={(e) => setFechaLimite(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-neutral-300 rounded-xl text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-900"
                    />
                  </div>
                )}
              </div>

              {/* Sucursal Destino (solo venta) */}
              {tipoSel === 'venta' && (
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-neutral-600 uppercase tracking-wider">Sucursal Destino *</label>
                  <select
                    required
                    value={sucursalDestinoSel}
                    onChange={(e) => setSucursalDestinoSel(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-neutral-300 rounded-xl text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-900"
                  >
                    <option value="">Selecciona destino...</option>
                    {sucursalesParaDestino.map((suc) => (
                      <option key={suc.id} value={String(suc.id)}>{suc.nombre}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Evento fields */}
              {tipoSel === 'evento' && (
                <>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-neutral-600 uppercase tracking-wider">TÃ­tulo del Evento *</label>
                    <input
                      type="text"
                      required
                      minLength={3}
                      placeholder="Nombre del evento..."
                      value={tituloEvento}
                      onChange={(e) => setTituloEvento(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-neutral-300 rounded-xl text-sm text-neutral-900 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-neutral-600 uppercase tracking-wider">DirecciÃ³n del Evento *</label>
                    <input
                      type="text"
                      required
                      minLength={3}
                      placeholder="DirecciÃ³n..."
                      value={direccionEvento}
                      onChange={(e) => setDireccionEvento(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-neutral-300 rounded-xl text-sm text-neutral-900 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900"
                    />
                  </div>
                </>
              )}

              {/* Asignar ejecutivo (solo jefe_local) */}
              {esJefeLocal && sucursalSel && (
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-neutral-600 uppercase tracking-wider">
                    Asignar a Ejecutivo (opcional)
                  </label>
                  <select
                    value={ejecutivoSel}
                    onChange={(e) => setEjecutivoSel(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-neutral-300 rounded-xl text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-900"
                  >
                    <option value="">Sin ejecutivo â€” Yo me encargo</option>
                    {ejecutivosDisponibles.map((ej) => (
                      <option key={ej.id} value={ej.id}>{ej.nombre} {ej.apellido}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* VehÃ­culos */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-neutral-600 uppercase tracking-wider">Reservar VehÃ­culos *</label>
                  <span className={`text-[10px] font-semibold uppercase tracking-wider ${selectedVehiculos.size > 0 ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-500'} px-2 py-0.5 rounded-lg`}>
                    {selectedVehiculos.size} seleccionado{selectedVehiculos.size === 1 ? '' : 's'}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-neutral-400" />
                    <input
                      type="text"
                      placeholder="Buscar por patente o chasis..."
                      value={vehiculoSearch}
                      onChange={(e) => setVehiculoSearch(e.target.value)}
                      className="w-full pl-8 pr-3 py-1.5 bg-white border border-neutral-300 rounded-xl text-xs text-neutral-900 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900"
                    />
                  </div>
                  <select
                    value={vehiculoMarca}
                    onChange={(e) => setVehiculoMarca(e.target.value)}
                    className="px-2.5 py-1.5 bg-white border border-neutral-300 rounded-xl text-xs text-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-900"
                  >
                    <option value="">Todas las marcas</option>
                    {marcasVehiculos.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>

                <div className={`max-h-44 overflow-y-auto border rounded-xl divide-y divide-neutral-200 ${vehiculoError && selectedVehiculos.size === 0 ? 'border-red-300 bg-red-50/30' : 'border-neutral-300'}`}>
                  {vehiculos.length === 0 ? (
                    <p className="p-3 text-xs text-neutral-400 italic">
                      No hay vehÃ­culos en el inventario. Solicita a un administrador que incorpore vehÃ­culos.
                    </p>
                  ) : vehiculosFiltrados.length === 0 ? (
                    <p className="p-3 text-xs text-neutral-400 italic">
                      No hay vehÃ­culos que coincidan con la bÃºsqueda.
                    </p>
                  ) : (
                    vehiculosFiltrados.map((v) => (
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
                        <span className="text-xs text-neutral-500 truncate">{v.chasis} Â· {v.marca} {v.modelo} Â· {v.anio}</span>
                        {v.reservado_en_activa && (
                          <span className="ml-auto text-[10px] font-semibold text-neutral-400 uppercase shrink-0">Ocupado</span>
                        )}
                      </label>
                    ))
                  )}
                </div>

                {vehiculoError && selectedVehiculos.size === 0 && (
                  <p className="text-xs text-red-600 font-medium flex items-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5" /> Selecciona al menos un vehÃ­culo para poder crear la solicitud.
                  </p>
                )}
              </div>

              {/* ObservaciÃ³n al crear */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-neutral-600 uppercase tracking-wider">ObservaciÃ³n (opcional)</label>
                <textarea
                  rows={2}
                  placeholder="Comentarios o notas sobre la solicitud..."
                  value={obsCreacion}
                  onChange={(e) => setObsCreacion(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-neutral-300 rounded-xl text-sm text-neutral-900 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900 resize-none"
                />
              </div>

              <div className={`p-3 border rounded-xl flex items-start gap-2.5 text-xs ${esJefeLocal ? 'bg-green-50 border-green-200 text-green-700' : 'bg-neutral-50 border-neutral-200 text-neutral-600'}`}>
                {esJefeLocal ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-green-600" />
                    <span>La solicitud se crearÃ¡ como <strong>Aprobada</strong> directamente porque la creas tÃº como Jefe de Local.</span>
                  </>
                ) : (
                  <>
                    <Clock className="w-4 h-4 shrink-0 mt-0.5 text-neutral-900" />
                    <span>La solicitud quedarÃ¡ como <strong>Pendiente de AprobaciÃ³n</strong>. El Jefe de Local la aprobarÃ¡ y definirÃ¡ la fecha de entrega.</span>
                  </>
                )}
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-neutral-200">
                <button type="button" onClick={() => setIsCreateOpen(false)} className="px-4 py-2 text-sm font-semibold text-neutral-600 hover:text-neutral-900 rounded-xl hover:bg-neutral-100 cursor-pointer">
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
        <SolicitudDetalleModal
          solicitud={detailTarget}
          vehiculosInventario={vehiculos}
          onClose={() => setDetailTarget(null)}
          onMensaje={(tipo, mensaje) => setFeedback({ type: tipo, message: mensaje })}
          onAprobar={(sol) => abrirAprobacion(sol)}
          onRechazar={(sol) => {
            setRejectMotivo('');
            setDetailTarget(null);
            setRejectTarget(sol);
          }}
          onPriorizar={(sol) => handlePriorizar(sol)}
          onCancelar={(sol) => {
            setMotivo('');
            setDetailTarget(null);
            setCancelTarget(sol);
          }}
          onEliminar={(sol) => {
            setDeleteError(null);
            setDetailTarget(null);
            setDeleteTarget(sol);
          }}
          onRecibir={(sol) => handleRecibir(sol)}
          onFinalizar={(sol) => handleFinalizar(sol)}
          puedeAprobar={puedeAprobar(detailTarget)}
          puedeRechazar={puedeAprobar(detailTarget)}
          puedePriorizar={puedePriorizar(detailTarget)}
          puedeCancelar={PRE_DESPACHO.includes(detailTarget.estado) && puedeGestionar(detailTarget)}
          puedeEliminar={puedeEliminar(detailTarget)}
          puedeRecibir={puedeRecibir(detailTarget)}
          puedeFinalizar={puedeFinalizar(detailTarget)}
          puedeGestionarVehiculos={PRE_DESPACHO.includes(detailTarget.estado) && puedeGestionar(detailTarget)}
        />
      )}

      {/* Modal: Rechazar */}
      {rejectTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white border border-neutral-200 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="p-6 space-y-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-red-50 border border-red-200 flex items-center justify-center text-red-600 shrink-0">
                  <ThumbsDown className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-neutral-900">Rechazar Solicitud</h2>
                  <p className="text-sm text-neutral-500 font-mono uppercase">
                    #{rejectTarget.id.slice(0, 8)} Â· {rejectTarget.sucursal_nombre}
                  </p>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-neutral-600 uppercase tracking-wider">Motivo de Rechazo *</label>
                <textarea
                  required
                  rows={3}
                  minLength={5}
                  placeholder="Explica el motivo del rechazo (mÃ­nimo 5 caracteres)..."
                  value={rejectMotivo}
                  onChange={(e) => setRejectMotivo(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-neutral-300 rounded-xl text-sm text-neutral-900 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900 resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setRejectTarget(null)}
                  disabled={isSubmitting}
                  className="px-4 py-2 text-sm font-semibold text-neutral-600 hover:text-neutral-900 rounded-xl hover:bg-neutral-100 cursor-pointer disabled:opacity-50"
                >
                  Volver
                </button>
                <button
                  type="button"
                  onClick={handleConfirmarRechazo}
                  disabled={isSubmitting || rejectMotivo.trim().length < 5}
                  className="px-5 py-2 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 rounded-xl disabled:opacity-50 cursor-pointer"
                >
                  {isSubmitting ? 'Rechazando...' : 'Confirmar Rechazo'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Aprobar con Fecha de Entrega */}
      {approveTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white border border-neutral-200 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="p-6 space-y-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-green-50 border border-green-200 flex items-center justify-center text-green-600 shrink-0">
                  <ThumbsUp className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-neutral-900">Aprobar Solicitud</h2>
                  <p className="text-sm text-neutral-500 font-mono uppercase">
                    #{approveTarget.id.slice(0, 8)} Â· {approveTarget.sucursal_nombre}
                  </p>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-neutral-600 uppercase tracking-wider">Fecha de Entrega *</label>
                <input
                  type="date"
                  required
                  value={aprobacionFecha}
                  onChange={(e) => setAprobacionFecha(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-neutral-300 rounded-xl text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-900"
                />
                <p className="text-xs text-neutral-500 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" />
                  Selecciona la fecha en que se entregarÃ¡ el o los vehÃ­culos.
                </p>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setApproveTarget(null)}
                  disabled={isSubmitting}
                  className="px-4 py-2 text-sm font-semibold text-neutral-600 hover:text-neutral-900 rounded-xl hover:bg-neutral-100 cursor-pointer disabled:opacity-50"
                >
                  Volver
                </button>
                <button
                  type="button"
                  onClick={handleConfirmarAprobacion}
                  disabled={isSubmitting || !aprobacionFecha.trim()}
                  className="px-5 py-2 text-sm font-semibold text-white bg-green-600 hover:bg-green-700 rounded-xl disabled:opacity-50 cursor-pointer"
                >
                  {isSubmitting ? 'Aprobando...' : 'Confirmar AprobaciÃ³n'}
                </button>
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
                    #{cancelTarget.id.slice(0, 8)} Â· {cancelTarget.sucursal_nombre}
                  </p>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-neutral-600 uppercase tracking-wider">Motivo de CancelaciÃ³n *</label>
                <textarea
                  required
                  rows={3}
                  minLength={5}
                  placeholder="Explica brevemente el motivo (mÃ­nimo 5 caracteres)..."
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-neutral-300 rounded-xl text-sm text-neutral-900 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900 resize-none"
                />
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
                  {isSubmitting ? 'Cancelando...' : 'Confirmar CancelaciÃ³n'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Eliminar */}
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
                    Â¿Confirmas eliminar definitivamente{' '}
                    <strong className="text-neutral-900 font-mono uppercase">#{deleteTarget.id.slice(0, 8)}</strong>?
                  </p>
                </div>
              </div>

              {deleteTarget.vehiculos.length > 0 && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>Se liberarÃ¡n las {deleteTarget.vehiculos.length} reserva(s) de vehÃ­culos asociadas.</span>
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
