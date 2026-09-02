'use client';

import { useState, useMemo, useCallback, DragEvent } from 'react';
import { Calendar, Clock, ChevronLeft, ChevronRight, Truck, GripVertical, RotateCcw, PackageSearch, PackageCheck, X } from 'lucide-react';
import type { SolicitudLista } from '@/types/solicitud.types';
import { calendarizarSolicitudAction, descalendarizarSolicitudAction, despacharSolicitudAction, recibirSolicitudAction } from '@/app/actions/solicitudes.actions';

interface Props {
  solicitudes: SolicitudLista[];
  viewer: {
    id: string;
    nombre: string;
    apellido: string;
    rol: string;
    sucursal_id: number | null;
  };
}

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const DIAS_SEMANA = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const ESTADOS_CALENDARIZABLES = ['priorizada', 'asignada'];

export default function CalendarizacionesClient({ solicitudes, viewer }: Props) {
  const [mesActual, setMesActual] = useState(new Date().getMonth());
  const [añoActual, setAñoActual] = useState(new Date().getFullYear());
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [diaSeleccionado, setDiaSeleccionado] = useState<string | null>(null);
  const [, setRefreshKey] = useState(0);

  const puedeCalendarizar = viewer.rol === 'logistica';
  const puedeDespachar = viewer.rol === 'administrador' || viewer.rol === 'logistica';
  const puedeRecibir = viewer.rol === 'administrador' || viewer.rol === 'jefe_local';

  const solicitudesFiltradas = useMemo(() => {
    if (viewer.rol === 'jefe_local' && viewer.sucursal_id) {
      return solicitudes.filter((s) => s.sucursal === viewer.sucursal_id);
    }
    return solicitudes;
  }, [solicitudes, viewer]);

  const solicitudesCalendarizables = useMemo(
    () => solicitudesFiltradas.filter((s) => ESTADOS_CALENDARIZABLES.includes(s.estado)),
    [solicitudesFiltradas]
  );

  const solicitudesActivas = useMemo(
    () => solicitudesFiltradas.filter((s) => ['calendarizada', 'en_transito', 'entregada'].includes(s.estado)),
    [solicitudesFiltradas]
  );

  const solicitudesPorFecha = useMemo(() => {
    const mapa: Record<string, SolicitudLista[]> = {};
    solicitudesActivas.forEach((s) => {
      const fecha = s.fecha_tentativa_despacho?.split('T')[0] || s.fecha_despacho?.split('T')[0] || s.fecha_entrega?.split('T')[0];
      if (fecha) {
        if (!mapa[fecha]) mapa[fecha] = [];
        mapa[fecha].push(s);
      }
    });
    return mapa;
  }, [solicitudesActivas]);

  const solicitudesDelDiaSeleccionado = useMemo(() => {
    if (!diaSeleccionado) return [];
    return solicitudesPorFecha[diaSeleccionado] || [];
  }, [diaSeleccionado, solicitudesPorFecha]);

  const diasMes = useMemo(() => {
    const primerDia = new Date(añoActual, mesActual, 1);
    const ultimoDia = new Date(añoActual, mesActual + 1, 0);
    const dias: Array<{ dia: number; mes: number; año: number; esMesActual: boolean }> = [];
    const primerDiaSemana = primerDia.getDay();
    for (let i = primerDiaSemana - 1; i >= 0; i--) {
      const fecha = new Date(añoActual, mesActual, -i);
      dias.push({ dia: fecha.getDate(), mes: fecha.getMonth(), año: fecha.getFullYear(), esMesActual: false });
    }
    for (let i = 1; i <= ultimoDia.getDate(); i++) {
      dias.push({ dia: i, mes: mesActual, año: añoActual, esMesActual: true });
    }
    const remaining = 42 - dias.length;
    for (let i = 1; i <= remaining; i++) {
      const fecha = new Date(añoActual, mesActual + 1, i);
      dias.push({ dia: fecha.getDate(), mes: fecha.getMonth(), año: fecha.getFullYear(), esMesActual: false });
    }
    return dias;
  }, [mesActual, añoActual]);

  const mesAnterior = () => {
    if (mesActual === 0) { setMesActual(11); setAñoActual(añoActual - 1); }
    else { setMesActual(mesActual - 1); }
  };

  const mesSiguiente = () => {
    if (mesActual === 11) { setMesActual(0); setAñoActual(añoActual + 1); }
    else { setMesActual(mesActual + 1); }
  };

  const formatearFecha = (dia: number, mes: number, año: number) => {
    return `${año}-${String(mes + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
  };

  const handleDragStart = useCallback((e: DragEvent<HTMLDivElement>, id: string) => {
    setDraggedId(id);
    e.dataTransfer.setData('text/plain', id);
    e.dataTransfer.effectAllowed = 'move';
  }, []);

  const handleDragEnd = useCallback(() => {
    setDraggedId(null);
    setDropTarget(null);
  }, []);

  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>, fecha: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDropTarget(fecha);
  }, []);

  const handleDragLeave = useCallback(() => { setDropTarget(null); }, []);

  const handleDrop = useCallback(async (e: DragEvent<HTMLDivElement>, fecha: string) => {
    e.preventDefault();
    setDropTarget(null);
    const id = e.dataTransfer.getData('text/plain');
    if (!id) return;
    setLoading(id);
    try {
      const result = await calendarizarSolicitudAction(id, fecha);
      if (!result.success) alert(result.error);
    } finally {
      setLoading(null);
      setRefreshKey((k) => k + 1);
    }
  }, []);

  const handleDescalendarizar = useCallback(async (id: string) => {
    setLoading(id);
    try {
      const result = await descalendarizarSolicitudAction(id);
      if (!result.success) alert(result.error);
    } finally {
      setLoading(null);
      setRefreshKey((k) => k + 1);
    }
  }, []);

  const handleDespachar = useCallback(async (id: string) => {
    setLoading(id);
    try {
      const result = await despacharSolicitudAction(id);
      if (!result.success) alert(result.error);
    } finally {
      setLoading(null);
      setRefreshKey((k) => k + 1);
    }
  }, []);

  const handleRecibir = useCallback(async (id: string) => {
    setLoading(id);
    try {
      const result = await recibirSolicitudAction(id);
      if (!result.success) alert(result.error);
    } finally {
      setLoading(null);
      setRefreshKey((k) => k + 1);
    }
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 flex items-center gap-2">
            <Calendar className="w-6 h-6" />
            Gestión Logística
          </h1>
          <p className="text-sm text-neutral-500 mt-1">
            {puedeCalendarizar ? 'Arrastra las solicitudes al calendario para programar su traslado' : 'Haz click en un día para ver los traslados programados'}
          </p>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-neutral-200 rounded-2xl p-5 flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-neutral-500 uppercase tracking-wider">Calendarizadas</p>
            <p className="text-3xl font-bold text-neutral-900 mt-1">{solicitudesFiltradas.filter((s) => s.estado === 'calendarizada').length}</p>
          </div>
          <div className="w-11 h-11 rounded-xl border border-neutral-300 flex items-center justify-center text-neutral-900">
            <Calendar className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-neutral-900 border border-neutral-900 rounded-2xl p-5 flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-neutral-400 uppercase tracking-wider">En Tránsito</p>
            <p className="text-3xl font-bold text-white mt-1">{solicitudesFiltradas.filter((s) => s.estado === 'en_transito').length}</p>
          </div>
          <div className="w-11 h-11 rounded-xl bg-white/10 flex items-center justify-center text-white">
            <Truck className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white border border-neutral-200 rounded-2xl p-5 flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-neutral-500 uppercase tracking-wider">Entregadas</p>
            <p className="text-3xl font-bold text-neutral-900 mt-1">{solicitudesFiltradas.filter((s) => s.estado === 'entregada').length}</p>
          </div>
          <div className="w-11 h-11 rounded-xl border border-neutral-300 flex items-center justify-center text-neutral-900">
            <PackageCheck className="w-5 h-5" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {puedeCalendarizar && (
          <div className="lg:col-span-1">
            <div className="bg-white border border-neutral-200 rounded-2xl overflow-hidden sticky top-24">
              <div className="p-3 border-b border-neutral-200 bg-neutral-50">
                <h3 className="font-bold text-neutral-900 text-sm flex items-center gap-2">
                  <GripVertical className="w-4 h-4" />
                  Por Calendarizar ({solicitudesCalendarizables.length})
                </h3>
                <p className="text-[10px] text-neutral-500 mt-0.5">Arrastra al calendario para programar</p>
              </div>
              <div className="max-h-[500px] overflow-y-auto p-2 space-y-2">
                {solicitudesCalendarizables.length === 0 ? (
                  <div className="p-4 text-center">
                    <Calendar className="w-8 h-8 text-neutral-300 mx-auto mb-2" />
                    <p className="text-xs text-neutral-500">No hay solicitudes para calendarizar</p>
                  </div>
                ) : (
                  solicitudesCalendarizables.map((s) => (
                    <div
                      key={s.id}
                      draggable={loading !== s.id}
                      onDragStart={(e) => handleDragStart(e, s.id)}
                      onDragEnd={handleDragEnd}
                      className={`p-2 border rounded-lg cursor-grab active:cursor-grabbing transition-all select-none ${
                        draggedId === s.id ? 'border-blue-400 bg-blue-50 opacity-50 scale-95' : 'border-neutral-200 bg-white hover:border-neutral-400 hover:shadow-sm'
                      } ${loading === s.id ? 'opacity-50 pointer-events-none' : ''}`}
                    >
                      <div className="flex items-center gap-2">
                        <GripVertical className="w-3 h-3 text-neutral-400 shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold text-neutral-900 truncate">{s.sucursal_nombre} → {s.sucursal_destino_nombre}</p>
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-yellow-100 text-yellow-800">
                            {s.estado === 'priorizada' ? `Prioridad ${s.posicion_prioridad}` : s.estado}
                          </span>
                          {s.vehiculos.length > 0 && (
                            <p className="text-[10px] text-neutral-400 mt-0.5 truncate">{s.vehiculos.map((v) => v.patente).join(', ')}</p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        <div className={puedeCalendarizar ? 'lg:col-span-3' : 'lg:col-span-4'}>
          <div className="bg-white border border-neutral-200 rounded-2xl overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-neutral-200">
              <button onClick={mesAnterior} className="p-2 rounded-lg hover:bg-neutral-100 transition-colors">
                <ChevronLeft className="w-5 h-5 text-neutral-600" />
              </button>
              <h2 className="text-lg font-bold text-neutral-900">{MESES[mesActual]} {añoActual}</h2>
              <button onClick={mesSiguiente} className="p-2 rounded-lg hover:bg-neutral-100 transition-colors">
                <ChevronRight className="w-5 h-5 text-neutral-600" />
              </button>
            </div>
            <div className="grid grid-cols-7 border-b border-neutral-200">
              {DIAS_SEMANA.map((dia) => (
                <div key={dia} className="p-2 text-center text-xs font-semibold text-neutral-500 uppercase">{dia}</div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {diasMes.map((d, idx) => {
                const fechaStr = formatearFecha(d.dia, d.mes, d.año);
                const trasladosDelDia = solicitudesPorFecha[fechaStr] || [];
                const esHoy = d.dia === new Date().getDate() && d.mes === new Date().getMonth() && d.año === new Date().getFullYear();
                const esDropTarget = puedeCalendarizar && dropTarget === fechaStr;
                const esSeleccionado = diaSeleccionado === fechaStr;
                const tieneTraslados = trasladosDelDia.length > 0;
                return (
                  <div
                    key={idx}
                    {...(puedeCalendarizar ? {
                      onDragOver: (e: DragEvent<HTMLDivElement>) => handleDragOver(e, fechaStr),
                      onDragLeave: handleDragLeave,
                      onDrop: (e: DragEvent<HTMLDivElement>) => handleDrop(e, fechaStr),
                    } : {})}
                    onClick={() => tieneTraslados && setDiaSeleccionado(fechaStr)}
                    className={`min-h-[80px] p-1.5 border-b border-r border-neutral-100 transition-colors ${
                      !d.esMesActual ? 'bg-neutral-50' : ''
                    } ${esDropTarget ? 'bg-blue-100 ring-2 ring-inset ring-blue-400' : ''} ${
                      esSeleccionado ? 'bg-blue-50 ring-2 ring-inset ring-blue-300' : ''
                    } ${tieneTraslados ? 'cursor-pointer hover:bg-neutral-50' : ''}`}
                  >
                    <div className={`text-xs font-medium mb-1 w-6 h-6 flex items-center justify-center rounded-full ${
                      esHoy ? 'bg-neutral-900 text-white' : d.esMesActual ? 'text-neutral-900' : 'text-neutral-400'
                    }`}>
                      {d.dia}
                    </div>
                    {tieneTraslados && (
                      <div className="flex items-center justify-center">
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-800">
                          🚗 {trasladosDelDia.length}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {diaSeleccionado && (
        <div className="bg-white border border-neutral-200 rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between p-4 border-b border-neutral-200 bg-neutral-50">
            <div>
              <h3 className="font-bold text-neutral-900">
                Traslados del {new Date(diaSeleccionado + 'T12:00:00').toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' })}
              </h3>
              <p className="text-xs text-neutral-500 mt-0.5">
                {solicitudesDelDiaSeleccionado.length} traslado{solicitudesDelDiaSeleccionado.length !== 1 ? 's' : ''} programado{solicitudesDelDiaSeleccionado.length !== 1 ? 's' : ''}
              </p>
            </div>
            <button onClick={() => setDiaSeleccionado(null)} className="p-2 rounded-lg hover:bg-neutral-200 transition-colors">
              <X className="w-4 h-4 text-neutral-500" />
            </button>
          </div>
          <div className="divide-y divide-neutral-100 max-h-[400px] overflow-y-auto">
            {solicitudesDelDiaSeleccionado.map((s) => (
              <div key={s.id} className="p-4 hover:bg-neutral-50 transition-colors">
                <div className="flex items-start justify-between">
                  <div className="space-y-1 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-neutral-900">{s.sucursal_nombre} → {s.sucursal_destino_nombre}</span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        s.estado === 'calendarizada' ? 'bg-blue-100 text-blue-800' :
                        s.estado === 'en_transito' ? 'bg-orange-100 text-orange-800' : 'bg-green-100 text-green-800'
                      }`}>
                        {s.estado === 'calendarizada' ? 'Calendarizada' : s.estado === 'en_transito' ? 'En Tránsito' : 'Entregada'}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-neutral-500">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        Tentativa: {s.fecha_tentativa_despacho ? new Date(s.fecha_tentativa_despacho).toLocaleDateString('es-CL') : 'Sin fecha'}
                      </span>
                      {s.fecha_despacho && (
                        <span className="flex items-center gap-1">
                          <PackageSearch className="w-3 h-3" />
                          Despacho: {new Date(s.fecha_despacho).toLocaleDateString('es-CL')}
                        </span>
                      )}
                      {s.fecha_entrega && (
                        <span className="flex items-center gap-1">
                          <PackageCheck className="w-3 h-3" />
                          Entrega: {new Date(s.fecha_entrega).toLocaleDateString('es-CL')}
                        </span>
                      )}
                    </div>
                    {s.vehiculos.length > 0 && (
                      <p className="text-xs text-neutral-400">Vehículos: {s.vehiculos.map((v) => v.patente).join(', ')}</p>
                    )}
                  </div>
                  <div className="ml-4 flex flex-col gap-2">
                    {puedeDespachar && s.estado === 'calendarizada' && (
                      <button
                        onClick={() => handleDespachar(s.id)}
                        disabled={loading === s.id}
                        className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-orange-500 hover:bg-orange-600 rounded-lg transition-colors disabled:opacity-50"
                      >
                        <PackageSearch className="w-3 h-3" />
                        Despachar
                      </button>
                    )}
                    {puedeRecibir && s.estado === 'en_transito' && (
                      <button
                        onClick={() => handleRecibir(s.id)}
                        disabled={loading === s.id}
                        className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-green-600 hover:bg-green-700 rounded-lg transition-colors disabled:opacity-50"
                      >
                        <PackageCheck className="w-3 h-3" />
                        Recibido
                      </button>
                    )}
                    {puedeCalendarizar && s.estado === 'calendarizada' && (
                      <button
                        onClick={() => handleDescalendarizar(s.id)}
                        disabled={loading === s.id}
                        className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 border border-red-200 rounded-lg transition-colors disabled:opacity-50"
                      >
                        <RotateCcw className="w-3 h-3" />
                        Descalendarizar
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}