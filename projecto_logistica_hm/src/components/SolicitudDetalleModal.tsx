'use client';

import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  ChevronDown,
  Car,
  MapPin,
  ArrowUp,
  User,
  Loader2,
  Building2,
  Phone,
  Mail,
  Plus,
  X,
  FileText,
  ThumbsUp,
  ThumbsDown,
  Ban,
  Trash2,
  PackageCheck,
  CheckCircle2,
} from 'lucide-react';
import {
  agregarVehiculoAction,
  quitarVehiculoAction,
  agregarObservacionAction,
  getObservacionesAction,
  getAuditoriaAction,
  getUsuarioDetalleAction,
} from '@/app/actions/solicitudes.actions';
import {
  EstadoSolicitud,
  SolicitudLista,
  VehiculoInventario,
  ObservacionEntry,
  AuditoriaEntry,
} from '@/types/solicitud.types';
import { VehiculoAsociado } from '@/types/sucursal.types';
import { ROL_LABEL, UsuarioDetalle } from '@/types/auth.types';
import { formatFecha } from '@/lib/fechas';
import { UsuarioNombreBoton } from '@/components/usuario-info-modal';

const estadoConfig: Record<EstadoSolicitud, { label: string; color: string }> = {
  pendiente_aprobacion: { label: 'Pendiente Aprobación', color: 'bg-amber-50 text-amber-700 border-amber-200' },
  aprobada: { label: 'Aprobada', color: 'bg-green-50 text-green-700 border-green-200' },
  pendiente: { label: 'Pendiente', color: 'bg-neutral-100 text-neutral-500 border-neutral-200' },
  priorizada: { label: 'Priorizada', color: 'bg-neutral-200 text-neutral-900 border-neutral-200' },
  asignada: { label: 'Asignada', color: 'bg-white text-neutral-900 border-neutral-400' },
  calendarizada: { label: 'Calendarizada', color: 'bg-white text-neutral-900 border-neutral-900 border-2' },
  en_transito: { label: 'En Tránsito', color: 'bg-neutral-700 text-white border-neutral-700' },
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

function getEncargadoId(sol: SolicitudLista): string | null {
  return sol.ejecutivo_id || sol.jefe_local_id || null;
}

function getEncargadoNombre(sol: SolicitudLista): string | null {
  if (sol.ejecutivo_id) return sol.ejecutivo_nombre;
  if (sol.jefe_local_id) return sol.jefe_local_nombre;
  return null;
}

function getResponsableId(sol: SolicitudLista): string | null {
  if (sol.logistica_id) return sol.logistica_id;
  if (sol.jefe_local_id) return sol.jefe_local_id;
  if (sol.ejecutivo_id) return sol.ejecutivo_id;
  return null;
}

function getResponsableNombre(sol: SolicitudLista): string | null {
  return sol.logistica_nombre || sol.jefe_local_nombre || sol.ejecutivo_nombre || null;
}

function getResponsableRol(sol: SolicitudLista): string | null {
  if (sol.logistica_id) return 'Logística';
  if (sol.jefe_local_id) return 'Jefe de Local';
  if (sol.ejecutivo_id) return 'Ejecutivo';
  return null;
}

function getTimelineInfo(accion: string): { label: string; dotClass: string; textClass: string } {
  const map: Record<string, { label: string; dotClass: string; textClass: string }> = {
    crear: { label: 'Pendiente', dotClass: 'border-2 border-amber-400 bg-white', textClass: 'text-amber-600' },
    solicitud_creada: { label: 'Pendiente', dotClass: 'border-2 border-amber-400 bg-white', textClass: 'text-amber-600' },
    aprobar: { label: 'Aprobada', dotClass: 'bg-green-500', textClass: 'text-green-600' },
    priorizar: { label: 'Priorizada', dotClass: 'border-2 border-blue-500 bg-white', textClass: 'text-blue-600' },
    asignar: { label: 'Asignada', dotClass: 'bg-blue-500', textClass: 'text-blue-600' },
    asignar_logistica: { label: 'Asignada', dotClass: 'bg-blue-500', textClass: 'text-blue-600' },
    calendarizar: { label: 'Calendarizada', dotClass: 'bg-emerald-500', textClass: 'text-emerald-600' },
    despachar: { label: 'En Tránsito', dotClass: 'bg-neutral-700', textClass: 'text-neutral-700' },
    recibir: { label: 'Entregada', dotClass: 'bg-neutral-800', textClass: 'text-neutral-800' },
    finalizar: { label: 'Finalizada', dotClass: 'bg-black', textClass: 'text-neutral-900' },
    cancelar: { label: 'Cancelada', dotClass: 'bg-red-500', textClass: 'text-red-600' },
    rechazar: { label: 'Rechazada', dotClass: 'bg-red-500', textClass: 'text-red-600' },
    agregar_vehiculo: { label: 'Vehículo agregado', dotClass: 'bg-neutral-400', textClass: 'text-neutral-600' },
    quitar_vehiculo: { label: 'Vehículo retirado', dotClass: 'bg-neutral-400', textClass: 'text-neutral-600' },
    observacion: { label: 'Observación', dotClass: 'bg-neutral-400', textClass: 'text-neutral-600' },
  };
  return map[accion] || { label: accion, dotClass: 'bg-neutral-400', textClass: 'text-neutral-600' };
}

function getTimelineDescription(a: AuditoriaEntry): string | null {
  const val = a.valor_nuevo as Record<string, unknown> | null;
  switch (a.accion) {
    case 'crear':
    case 'solicitud_creada':
      return 'Solicitud creada y enviada para revisión';
    case 'aprobar':
      return 'Solicitud aprobada para traslado';
    case 'priorizar': {
      const pos = val?.posicion_prioridad;
      return pos != null ? `Prioridad asignada: ${pos}` : 'Solicitud priorizada';
    }
    case 'asignar':
    case 'asignar_logistica':
      return 'Asignada al área de Logística';
    case 'calendarizar': {
      const fecha = val?.fecha_tentativa_despacho;
      return fecha ? `Fecha tentativa de traslado: ${formatFecha(String(fecha))}` : 'Solicitud calendarizada';
    }
    case 'despachar':
      return 'Vehículo(s) en tránsito';
    case 'recibir':
      return 'Recibido en destino';
    case 'finalizar':
      return 'Solicitud finalizada exitosamente';
    case 'cancelar': {
      const motivo = val?.motivo_cancelacion;
      return motivo ? `Motivo: ${String(motivo)}` : 'Solicitud cancelada';
    }
    case 'rechazar':
      return 'Solicitud rechazada';
    default:
      return null;
  }
}

function getUserRoleFromSolicitud(userId: string, sol: SolicitudLista): string {
  if (sol.logistica_id === userId) return 'Logística';
  if (sol.jefe_local_id === userId) return 'Jefe de Local';
  if (sol.ejecutivo_id === userId) return 'Ejecutivo';
  return '';
}

interface SolicitudDetalleModalProps {
  solicitud: SolicitudLista;
  vehiculosInventario: VehiculoInventario[];
  onClose: () => void;
  onMensaje: (tipo: 'success' | 'error', mensaje: string) => void;
  onAprobar: (sol: SolicitudLista) => void;
  onRechazar: (sol: SolicitudLista) => void;
  onPriorizar: (sol: SolicitudLista) => void;
  onCancelar: (sol: SolicitudLista) => void;
  onEliminar: (sol: SolicitudLista) => void;
  onRecibir: (sol: SolicitudLista) => void;
  onFinalizar: (sol: SolicitudLista) => void;
  puedeAprobar: boolean;
  puedeRechazar: boolean;
  puedePriorizar: boolean;
  puedeCancelar: boolean;
  puedeEliminar: boolean;
  puedeRecibir: boolean;
  puedeFinalizar: boolean;
  puedeGestionarVehiculos: boolean;
}

export default function SolicitudDetalleModal({
  solicitud,
  vehiculosInventario,
  onClose,
  onMensaje,
  onAprobar,
  onRechazar,
  onPriorizar,
  onCancelar,
  onEliminar,
  onRecibir,
  onFinalizar,
  puedeAprobar,
  puedeRechazar,
  puedePriorizar,
  puedeCancelar,
  puedeEliminar,
  puedeRecibir,
  puedeFinalizar,
  puedeGestionarVehiculos,
}: SolicitudDetalleModalProps) {
  const [detailTab, setDetailTab] = useState<'info' | 'historial' | 'obs' | 'docs'>('info');
  const [showAcciones, setShowAcciones] = useState(false);
  const [observaciones, setObservaciones] = useState<ObservacionEntry[]>([]);
  const [auditoria, setAuditoria] = useState<AuditoriaEntry[]>([]);
  const [responsableDetalle, setResponsableDetalle] = useState<UsuarioDetalle | null>(null);
  const [obsText, setObsText] = useState('');
  const [nuevoVehiculoId, setNuevoVehiculoId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [vehiculosLocal, setVehiculosLocal] = useState<VehiculoAsociado[]>(solicitud.vehiculos);

  const [prevSolicitudId, setPrevSolicitudId] = useState(solicitud.id);
  if (prevSolicitudId !== solicitud.id) {
    setPrevSolicitudId(solicitud.id);
    setVehiculosLocal(solicitud.vehiculos);
    setDetailTab('info');
    setShowAcciones(false);
    setObsText('');
    setNuevoVehiculoId('');
  }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const responsableId = getResponsableId(solicitud);
      const [obs, audit, detalleResp] = await Promise.all([
        getObservacionesAction(solicitud.id),
        getAuditoriaAction(solicitud.id),
        responsableId ? getUsuarioDetalleAction(responsableId) : Promise.resolve(null),
      ]);
      if (!cancelled) {
        setObservaciones(obs);
        setAuditoria(audit);
        setResponsableDetalle(detalleResp);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [solicitud]);

  const vehiculosDisponiblesParaAgregar = vehiculosInventario
    .filter((v) => !v.reservado_en_activa)
    .filter((v) => !vehiculosLocal.some((adj) => adj.patente === v.patente));

  async function handleAgregarVehiculo() {
    if (!nuevoVehiculoId || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const inventario = vehiculosInventario.find((v) => v.id === nuevoVehiculoId);
      const result = await agregarVehiculoAction(solicitud.id, nuevoVehiculoId);
      if (!result.success) {
        onMensaje('error', result.error || 'Error.');
      } else {
        onMensaje('success', result.message || 'Reservado.');
        if (inventario) {
          const nuevo: VehiculoAsociado = {
            solicitud_vehiculo_id: `temp-${inventario.id}`,
            disponibilidad: 'reservado',
            patente: inventario.patente,
            chasis: inventario.chasis,
            marca: inventario.marca,
            modelo: inventario.modelo,
            anio: inventario.anio,
            color: inventario.color,
          };
          setVehiculosLocal((prev) => [...prev, nuevo]);
        }
        setNuevoVehiculoId('');
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleQuitarVehiculo(svId: string) {
    if (isSubmitting) return;
    if (svId.startsWith('temp-')) {
      setVehiculosLocal((prev) => prev.filter((v) => v.solicitud_vehiculo_id !== svId));
      return;
    }
    setIsSubmitting(true);
    try {
      const result = await quitarVehiculoAction(svId);
      if (!result.success) {
        onMensaje('error', result.error || 'Error.');
      } else {
        onMensaje('success', result.message || 'Reserva retirada.');
        setVehiculosLocal((prev) => prev.filter((v) => v.solicitud_vehiculo_id !== svId));
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleAgregarObservacion() {
    if (!obsText.trim() || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const result = await agregarObservacionAction(solicitud.id, obsText);
      if (!result.success) {
        onMensaje('error', result.error || 'Error.');
      } else {
        setObsText('');
        const updated = await getObservacionesAction(solicitud.id);
        setObservaciones(updated);
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  const destino =
    solicitud.tipo_solicitud === 'venta'
      ? solicitud.sucursal_destino_nombre || `#${solicitud.sucursal_destino}`
      : solicitud.titulo_evento || '—';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in">
      <div className="bg-white border border-neutral-200 rounded-2xl w-full max-w-5xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col" onClick={(e) => e.stopPropagation()}>

        {/* Top Header */}
        <div className="px-8 pt-6 pb-5 border-b border-neutral-200 shrink-0">
          <div className="flex items-center justify-between mb-5">
            <button
              onClick={onClose}
              className="flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-900 transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Volver</span>
            </button>
            <p className="text-sm font-bold tracking-widest text-neutral-900 uppercase">
              Detalle de Solicitud
            </p>
            {/* Actions dropdown */}
            <div className="relative">
              <button
                onClick={() => setShowAcciones(!showAcciones)}
                className="inline-flex items-center gap-2 px-4 py-2 border border-neutral-300 rounded-xl text-sm font-medium text-neutral-700 hover:border-neutral-400 hover:bg-neutral-50 transition-colors cursor-pointer"
              >
                Acciones
                <ChevronDown className={`w-4 h-4 transition-transform ${showAcciones ? 'rotate-180' : ''}`} />
              </button>
              {showAcciones && (
                <>
                  <div className="fixed inset-0 z-[1]" onClick={() => setShowAcciones(false)} />
                  <div className="absolute right-0 mt-2 w-52 bg-white border border-neutral-200 rounded-xl shadow-xl z-[2] py-1 overflow-hidden">
                    {puedeAprobar && (
                      <button
                        onClick={() => { setShowAcciones(false); onAprobar(solicitud); }}
                        disabled={isSubmitting}
                        className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-green-700 hover:bg-green-50 transition-colors cursor-pointer disabled:opacity-40"
                      >
                        <ThumbsUp className="w-4 h-4" /> Aprobar
                      </button>
                    )}
                    {puedeRechazar && (
                      <button
                        onClick={() => { setShowAcciones(false); onRechazar(solicitud); }}
                        className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                      >
                        <ThumbsDown className="w-4 h-4" /> Rechazar
                      </button>
                    )}
                    {puedePriorizar && (
                      <button
                        onClick={() => { setShowAcciones(false); onPriorizar(solicitud); }}
                        disabled={isSubmitting}
                        className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-neutral-700 hover:bg-neutral-50 transition-colors cursor-pointer disabled:opacity-40"
                      >
                        <ArrowUp className="w-4 h-4" /> Priorizar
                      </button>
                    )}
                    {puedeCancelar && (
                      <>
                        <button
                          onClick={() => { setShowAcciones(false); onCancelar(solicitud); }}
                          className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-neutral-700 hover:bg-neutral-50 transition-colors cursor-pointer"
                        >
                          <Ban className="w-4 h-4" /> Cancelar
                        </button>
                        {puedeEliminar && (
                          <button
                            onClick={() => { setShowAcciones(false); onEliminar(solicitud); }}
                            className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" /> Eliminar
                          </button>
                        )}
                      </>
                    )}
                    {puedeRecibir && (
                      <button
                        onClick={() => { setShowAcciones(false); onRecibir(solicitud); }}
                        disabled={isSubmitting}
                        className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-neutral-700 hover:bg-neutral-50 transition-colors cursor-pointer disabled:opacity-40"
                      >
                        <PackageCheck className="w-4 h-4" /> Recibir
                      </button>
                    )}
                    {puedeFinalizar && (
                      <button
                        onClick={() => { setShowAcciones(false); onFinalizar(solicitud); }}
                        disabled={isSubmitting}
                        className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-green-700 hover:bg-green-50 transition-colors cursor-pointer disabled:opacity-40"
                      >
                        <CheckCircle2 className="w-4 h-4" /> Finalizar
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Title + badge */}
          <div className="flex items-center gap-4 mb-1">
            <h1 className="text-2xl sm:text-3xl font-bold text-neutral-900">
              Solicitud #{solicitud.id.slice(0, 8).toUpperCase()}
            </h1>
            <span className={`inline-flex items-center px-3.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider ${estadoConfig[solicitud.estado].color}`}>
              {estadoConfig[solicitud.estado].label}
            </span>
          </div>
          <p className="text-sm text-neutral-500">
            {solicitud.tipo_solicitud === 'evento' ? 'Evento' : 'Traslado entre locales'} · Creada el {formatFecha(solicitud.fecha_creacion)}
            {solicitud.ejecutivo_nombre && (
              <>
                {' por '}
                <UsuarioNombreBoton usuarioId={solicitud.ejecutivo_id} nombre={solicitud.ejecutivo_nombre} muted />
              </>
            )}
          </p>
        </div>

        {/* Info Cards Strip */}
        <div className="px-8 py-5 border-b border-neutral-200 shrink-0 overflow-x-auto">
          <div className="flex gap-6 min-w-max">
            {/* Vehicle */}
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-full bg-amber-50 border border-amber-200 flex items-center justify-center shrink-0">
                <Car className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <p className="text-[11px] text-neutral-400 font-medium">Vehículo</p>
                <p className="text-sm font-bold text-neutral-900">
                  {vehiculosLocal.length > 0 ? vehiculosLocal[0].patente : '—'}
                </p>
                <p className="text-[11px] text-neutral-500">
                  {vehiculosLocal.length > 0
                    ? `${vehiculosLocal[0].marca} ${vehiculosLocal[0].modelo} ${vehiculosLocal[0].anio}`
                    : 'Sin vehículo'}
                </p>
              </div>
            </div>
            <div className="w-px bg-neutral-200 self-stretch" />
            {/* Origin */}
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-full bg-amber-50 border border-amber-200 flex items-center justify-center shrink-0">
                <MapPin className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <p className="text-[11px] text-neutral-400 font-medium">Origen</p>
                <p className="text-sm font-bold text-neutral-900">
                  {solicitud.sucursal_nombre || `#${solicitud.sucursal}`}
                </p>
              </div>
            </div>
            <div className="w-px bg-neutral-200 self-stretch" />
            {/* Destination */}
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-full bg-amber-50 border border-amber-200 flex items-center justify-center shrink-0">
                <MapPin className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <p className="text-[11px] text-neutral-400 font-medium">Destino</p>
                <p className="text-sm font-bold text-neutral-900">
                  {destino}
                </p>
                {solicitud.tipo_solicitud === 'evento' && solicitud.direccion_evento && (
                  <p className="text-[11px] text-neutral-500">{solicitud.direccion_evento}</p>
                )}
              </div>
            </div>
            <div className="w-px bg-neutral-200 self-stretch" />
            {/* Priority */}
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-full bg-amber-50 border border-amber-200 flex items-center justify-center shrink-0">
                <ArrowUp className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <p className="text-[11px] text-neutral-400 font-medium">Prioridad</p>
                <p className="text-sm font-bold text-neutral-900">
                  {solicitud.posicion_prioridad ?? '—'}
                </p>
                <p className="text-[11px] text-neutral-500">
                  {solicitud.posicion_prioridad != null
                    ? (solicitud.posicion_prioridad <= 2 ? 'Alta' : solicitud.posicion_prioridad <= 5 ? 'Media' : 'Baja')
                    : 'Sin asignar'}
                </p>
              </div>
            </div>
            <div className="w-px bg-neutral-200 self-stretch" />
            {/* Responsible */}
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-full bg-neutral-200 flex items-center justify-center shrink-0">
                <User className="w-5 h-5 text-neutral-600" />
              </div>
              <div>
                <p className="text-xs text-neutral-400 font-medium">Responsable actual</p>
                <p className="text-sm font-bold text-neutral-900">
                  {solicitud.logistica_nombre || solicitud.jefe_local_nombre || solicitud.ejecutivo_nombre ? (
                    <UsuarioNombreBoton usuarioId={getResponsableId(solicitud)} nombre={getResponsableNombre(solicitud)} />
                  ) : (
                    '—'
                  )}
                </p>
                <p className="text-[11px] text-neutral-500">
                  {solicitud.logistica_nombre ? 'Logística' : solicitud.jefe_local_nombre ? 'Jefe de Local' : solicitud.ejecutivo_nombre ? 'Ejecutivo' : ''}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="px-8 border-b border-neutral-200 shrink-0">
          <div className="flex gap-8">
            {(['info', 'historial', 'obs', 'docs'] as const).map((tab) => {
              const labels = { info: 'Información', historial: 'Historial', obs: 'Observaciones', docs: 'Documentos' };
              return (
                <button
                  key={tab}
                  onClick={() => setDetailTab(tab)}
                  className={`py-3.5 text-sm font-medium border-b-2 transition-colors cursor-pointer ${
                    detailTab === tab
                      ? 'border-neutral-900 text-neutral-900'
                      : 'border-transparent text-neutral-400 hover:text-neutral-600'
                  }`}
                >
                  {labels[tab]}
                </button>
              );
            })}
          </div>
        </div>

        {/* Tab Content */}
        <div className="overflow-y-auto flex-1 p-8">
          {/* === INFO TAB === */}
          {detailTab === 'info' && (
            <div className="space-y-6">
              {solicitud.tipo_solicitud === 'evento' && (
                <div className="p-4 bg-neutral-50 border border-neutral-200 rounded-xl space-y-2">
                  <div className="text-sm"><strong className="text-neutral-500 uppercase text-xs">Título:</strong> <span className="text-neutral-900 ml-1">{solicitud.titulo_evento || '—'}</span></div>
                  <div className="text-sm"><strong className="text-neutral-500 uppercase text-xs">Dirección:</strong> <span className="text-neutral-900 ml-1">{solicitud.direccion_evento || '—'}</span></div>
                </div>
              )}

              {solicitud.estado === 'cancelada' && solicitud.motivo_cancelacion && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
                  <strong>Motivo de cancelación:</strong> {solicitud.motivo_cancelacion}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-4">
                  <p className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider mb-1">Creación</p>
                  <p className="text-sm text-neutral-900 font-medium">{formatFecha(solicitud.fecha_creacion)}</p>
                </div>
                <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-4">
                  <p className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider mb-1">Despacho Tentativo</p>
                  <p className="text-sm text-neutral-900 font-medium">{formatFecha(solicitud.fecha_tentativa_despacho)}</p>
                </div>
                <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-4">
                  <p className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider mb-1">Fecha de Entrega</p>
                  <p className="text-sm text-neutral-900 font-medium">{formatFecha(solicitud.fecha_limite)}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-4">
                  <p className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider mb-1">Encargado</p>
                  <p className="text-sm text-neutral-900 font-medium">
                    {getEncargadoNombre(solicitud) ? (
                      <UsuarioNombreBoton usuarioId={getEncargadoId(solicitud)} nombre={getEncargadoNombre(solicitud)} />
                    ) : (
                      <span className="text-neutral-400 italic">Sin asignar</span>
                    )}
                  </p>
                </div>
                <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-4">
                  <p className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider mb-1">Jefe de Local</p>
                  <p className="text-sm text-neutral-900 font-medium">
                    {solicitud.jefe_local_nombre ? (
                      <UsuarioNombreBoton usuarioId={solicitud.jefe_local_id} nombre={solicitud.jefe_local_nombre} />
                    ) : (
                      <span className="text-neutral-400 italic">Sin asignar</span>
                    )}
                  </p>
                </div>
                <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-4">
                  <p className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider mb-1">Logística</p>
                  <p className="text-sm text-neutral-900 font-medium">
                    {solicitud.logistica_nombre ? (
                      <UsuarioNombreBoton usuarioId={solicitud.logistica_id} nombre={solicitud.logistica_nombre} />
                    ) : (
                      <span className="text-neutral-400 italic">Sin asignar</span>
                    )}
                  </p>
                </div>
              </div>

              {/* Vehicles */}
              <div className="space-y-3">
                <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">
                  Vehículos asociados ({vehiculosLocal.length})
                </p>
                {vehiculosLocal.length === 0 ? (
                  <p className="text-sm text-neutral-400 italic">Sin vehículos reservados.</p>
                ) : (
                  <div className="space-y-2">
                    {vehiculosLocal.map((v) => (
                      <div key={v.solicitud_vehiculo_id} className="flex items-center justify-between gap-3 bg-neutral-50 border border-neutral-200 rounded-xl px-4 py-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-9 h-9 rounded-lg bg-neutral-900 flex items-center justify-center shrink-0">
                            <Car className="w-4 h-4 text-white" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-neutral-900 font-mono">{v.patente}</p>
                            <p className="text-[11px] text-neutral-500 truncate">
                              {v.chasis} · {v.marca} {v.modelo} · {v.anio}{v.color ? ` · ${v.color}` : ''}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {v.disponibilidad === 'reservado' ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-bold bg-neutral-900 text-white">Reservado</span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-semibold bg-white text-neutral-500 border border-neutral-300">Liberado</span>
                          )}
                          {PRE_DESPACHO.includes(solicitud.estado) && puedeGestionarVehiculos && (
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
                {PRE_DESPACHO.includes(solicitud.estado) && puedeGestionarVehiculos && (
                  <div className="flex items-center gap-2 pt-1">
                    <select
                      value={nuevoVehiculoId}
                      onChange={(e) => setNuevoVehiculoId(e.target.value)}
                      className="flex-1 px-3 py-2 bg-white border border-neutral-300 rounded-xl text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-900"
                    >
                      <option value="">Agregar vehículo...</option>
                      {vehiculosDisponiblesParaAgregar.map((v) => (
                        <option key={v.id} value={v.id}>{v.patente} — {v.marca} {v.modelo} ({v.anio})</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={handleAgregarVehiculo}
                      disabled={!nuevoVehiculoId || isSubmitting}
                      className="inline-flex items-center gap-1.5 px-4 py-2 bg-neutral-900 hover:bg-neutral-700 text-white text-sm font-semibold rounded-xl disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
                    >
                      <Plus className="w-4 h-4" /> Reservar
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* === HISTORIAL TAB === */}
          {detailTab === 'historial' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Timeline */}
              <div className="lg:col-span-2">
                {auditoria.length === 0 ? (
                  <p className="text-sm text-neutral-400 italic">Sin registros de auditoría.</p>
                ) : (
                  <div className="relative">
                    {[...auditoria].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).map((a, i, arr) => {
                      const tl = getTimelineInfo(a.accion);
                      const desc = getTimelineDescription(a);
                      const isLast = i === arr.length - 1;
                      return (
                        <div key={a.id} className="flex gap-5 relative">
                          <div className="flex flex-col items-center shrink-0 w-5">
                            <div className={`w-4 h-4 rounded-full shrink-0 z-10 ${tl.dotClass}`} />
                            {!isLast && <div className="w-0.5 flex-1 bg-neutral-200 my-1" />}
                          </div>
                          <div className="pb-8 flex-1 min-w-0">
                            <div className="flex items-baseline gap-3 mb-0.5 flex-wrap">
                              <p className="text-xs text-neutral-400 font-medium whitespace-nowrap">{formatFecha(a.created_at)}</p>
                              <span className="text-xs text-neutral-300 hidden sm:inline">—</span>
                              <span className={`text-sm font-bold ${tl.textClass}`}>{tl.label}</span>
                            </div>
                            <p className="text-sm text-neutral-700">
                              <UsuarioNombreBoton
                                usuarioId={a.usuario_id}
                                nombre={a.usuario_nombre}
                                muted={false}
                              />
                              {getUserRoleFromSolicitud(a.usuario_id, solicitud) && (
                                <span className="text-neutral-400"> ({getUserRoleFromSolicitud(a.usuario_id, solicitud)})</span>
                              )}
                            </p>
                            {desc && <p className="text-sm text-neutral-500 mt-0.5">{desc}</p>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Side Panel */}
              <div className="space-y-5">
                {/* Info adicional card */}
                <div className="border border-neutral-200 rounded-xl p-5 space-y-4">
                  <h3 className="text-sm font-bold text-neutral-900">Información adicional</h3>
                  <div className="space-y-3">
                    <div>
                      <p className="text-[11px] text-neutral-400 font-medium">Tipo de traslado</p>
                      <p className="text-sm font-bold text-neutral-900">
                        {solicitud.tipo_solicitud === 'evento' ? 'Evento' : 'Traslado entre locales'}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] text-neutral-400 font-medium">Fecha tentativa</p>
                      <p className="text-sm font-bold text-neutral-900">
                        {formatFecha(solicitud.fecha_tentativa_despacho) || '—'}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] text-neutral-400 font-medium">Fecha de entrega</p>
                      <p className="text-sm font-bold text-neutral-900">
                        {formatFecha(solicitud.fecha_limite) || '—'}
                      </p>
                    </div>
                    {observaciones.length > 0 && (
                      <div>
                        <p className="text-[11px] text-neutral-400 font-medium">Observación</p>
                        <p className="text-sm font-bold text-neutral-900">
                          {observaciones[observaciones.length - 1].observacion}
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Contacto responsable card */}
                <div className="border border-neutral-200 rounded-xl p-5 space-y-4">
                  <h3 className="text-sm font-bold text-neutral-900 flex items-center gap-2">
                    <User className="w-4 h-4 text-neutral-500" />
                    Contacto responsable
                  </h3>

                  {!responsableDetalle && getResponsableId(solicitud) && (
                    <p className="text-xs text-neutral-400 flex items-center gap-1.5">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Cargando contacto...
                    </p>
                  )}

                  {responsableDetalle || getResponsableNombre(solicitud) ? (
                    <div className="space-y-3">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-full bg-neutral-200 flex items-center justify-center shrink-0">
                          <User className="w-6 h-6 text-neutral-500" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-neutral-900 break-words">
                            <UsuarioNombreBoton
                              usuarioId={getResponsableId(solicitud)}
                              nombre={responsableDetalle
                                ? `${responsableDetalle.nombre} ${responsableDetalle.apellido}`.trim()
                                : getResponsableNombre(solicitud)}
                            />
                          </p>
                          <p className="text-xs text-neutral-500">
                            {responsableDetalle
                              ? ROL_LABEL[responsableDetalle.rol]
                              : getResponsableRol(solicitud) || ''}
                          </p>
                        </div>
                      </div>
                      <div className="space-y-2 text-xs border-t border-neutral-100 pt-3">
                        <p className="flex items-center gap-2 text-neutral-600">
                          <Building2 className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
                          <span className="truncate">
                            {responsableDetalle?.sucursal_nombre || (responsableDetalle?.sucursal_id ? `#${responsableDetalle.sucursal_id}` : '—')}
                          </span>
                        </p>
                        <p className="flex items-center gap-2 text-neutral-600">
                          <Phone className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
                          <span className="truncate">{responsableDetalle?.telefono || '—'}</span>
                        </p>
                        <p className="flex items-center gap-2 text-neutral-600">
                          <Mail className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
                          <span className="truncate">{responsableDetalle?.email || '—'}</span>
                        </p>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-neutral-400 italic">Sin responsable asignado.</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* === OBSERVACIONES TAB === */}
          {detailTab === 'obs' && (
            <div className="space-y-4">
              {observaciones.length > 0 ? (
                <div className="space-y-3">
                  {observaciones.map((obs) => (
                    <div key={obs.id} className="bg-neutral-50 border border-neutral-200 rounded-xl px-4 py-3">
                      <p className="text-sm text-neutral-900">{obs.observacion}</p>
                      <p className="text-xs text-neutral-400 mt-1.5">
                        <UsuarioNombreBoton
                          usuarioId={obs.usuario_id}
                          nombre={obs.usuario_nombre}
                          muted
                        />
                        {' · '}
                        {formatFecha(obs.created_at)}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-neutral-400 italic py-4">Sin observaciones registradas.</p>
              )}
              <div className="flex items-center gap-2 pt-2">
                <input
                  type="text"
                  placeholder="Agregar observación..."
                  value={obsText}
                  onChange={(e) => setObsText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleAgregarObservacion(); }}
                  className="flex-1 px-4 py-2.5 bg-white border border-neutral-300 rounded-xl text-sm text-neutral-900 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900"
                />
                <button
                  type="button"
                  onClick={handleAgregarObservacion}
                  disabled={!obsText.trim() || isSubmitting}
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-neutral-900 hover:bg-neutral-700 text-white text-sm font-semibold rounded-xl disabled:opacity-40 cursor-pointer"
                >
                  <Plus className="w-4 h-4" /> Agregar
                </button>
              </div>
            </div>
          )}

          {/* === DOCUMENTOS TAB === */}
          {detailTab === 'docs' && (
            <div className="py-12 text-center">
              <div className="w-16 h-16 rounded-full bg-neutral-100 flex items-center justify-center mx-auto mb-4">
                <FileText className="w-8 h-8 text-neutral-300" />
              </div>
              <p className="text-sm text-neutral-500 font-medium">Sin documentos adjuntos</p>
              <p className="text-xs text-neutral-400 mt-1">Los documentos relacionados a esta solicitud aparecerán aquí.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}