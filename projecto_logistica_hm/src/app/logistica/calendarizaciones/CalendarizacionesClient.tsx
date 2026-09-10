'use client';

import { useState, useMemo, useCallback, DragEvent } from 'react';
import { Calendar, Clock, ChevronLeft, ChevronRight, Truck, GripVertical, RotateCcw, PackageSearch, PackageCheck, X, CalendarClock, Car } from 'lucide-react';
import { SolicitudLista, TipoSolicitud } from '@/types/solicitud.types';
import { calendarizarSolicitudAction, descalendarizarSolicitudAction, despacharSolicitudAction, cancelarDespachoSolicitudAction, recibirSolicitudAction } from '@/app/actions/solicitudes.actions';
import { formatFecha, formatFechaLarga, hoyISO } from '@/lib/fechas';

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

const tipoLabel: Record<TipoSolicitud, string> = {
  venta: 'Venta',
  evento: 'Evento',
};

export default function CalendarizacionesClient({ solicitudes, viewer }: Props) {
  const [mesActual, setMesActual] = useState(new Date().getMonth());
  const [añoActual, setAñoActual] = useState(new Date().getFullYear());
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [diaSeleccionado, setDiaSeleccionado] = useState<string | null>(null);
  const [, setRefreshKey] = useState(0);
  const [advertencia, setAdvertencia] = useState<{ id: string; fecha: string } | null>(null);
  const [filtroSucursal, setFiltroSucursal] = useState<number | ''>('');

  const puedeCalendarizar = viewer.rol === 'logistica';
  const puedeDespachar = viewer.rol === 'administrador' || viewer.rol === 'logistica';
  const esAdmin = viewer.rol === 'administrador';

  const puedeRecibir = (s: SolicitudLista) => {
    if (esAdmin) return true;
    if (viewer.rol !== 'jefe_local' || viewer.sucursal_id === null || viewer.sucursal_id === undefined) return false;
    return s.sucursal_destino !== null && s.sucursal_destino !== undefined
      ? viewer.sucursal_id === s.sucursal_destino
      : viewer.sucursal_id === s.sucursal;
  };

  const solicitudesFiltradas = useMemo(() => {
    if (viewer.rol === 'jefe_local' && viewer.sucursal_id) {
      return solicitudes.filter((s) => s.sucursal === viewer.sucursal_id || s.sucursal_destino === viewer.sucursal_id);
    }
    return solicitudes;
  }, [solicitudes, viewer]);

  const sucursalesDisponibles = useMemo(() => {
    const mapa = new Map<number, string>();
    solicitudesFiltradas.forEach((s) => {
      if (s.sucursal && s.sucursal_nombre) mapa.set(s.sucursal, s.sucursal_nombre);
    });
    return Array.from(mapa.entries())
      .map(([id, nombre]) => ({ id, nombre }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [solicitudesFiltradas]);

  const solicitudesVisibles = useMemo(() => {
    if (filtroSucursal === '') return solicitudesFiltradas;
    return solicitudesFiltradas.filter((s) => s.sucursal === filtroSucursal);
  }, [solicitudesFiltradas, filtroSucursal]);

  const solicitudesCalendarizables = useMemo(
    () => solicitudesVisibles.filter((s) => ESTADOS_CALENDARIZABLES.includes(s.estado)),
    [solicitudesVisibles]
  );

  const solicitudesActivas = useMemo(
    () => solicitudesVisibles.filter((s) => ['calendarizada', 'en_transito', 'entregada'].includes(s.estado)),
    [solicitudesVisibles]
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
    const remaining = Math.ceil(dias.length / 7) * 7 - dias.length;
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
    if (fecha < hoyISO()) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDropTarget(fecha);
  }, []);

  const handleDragLeave = useCallback(() => { setDropTarget(null); }, []);

  const ejecutarCalendarizar = async (id: string, fecha: string) => {
    setLoading(id);
    try {
      const result = await calendarizarSolicitudAction(id, fecha);
      if (!result.success) alert(result.error);
    } finally {
      setLoading(null);
      setRefreshKey((k) => k + 1);
    }
  };

  const confirmarAdvertencia = async () => {
    if (!advertencia) return;
    const { id, fecha } = advertencia;
    setAdvertencia(null);
    await ejecutarCalendarizar(id, fecha);
  };

  const cancelarAdvertencia = () => {
    setAdvertencia(null);
    setDraggedId(null);
  };

  const handleDrop = useCallback(async (e: DragEvent<HTMLDivElement>, fecha: string) => {
    e.preventDefault();
    setDropTarget(null);
    const id = e.dataTransfer.getData('text/plain');
    if (!id) return;
    if (fecha < hoyISO()) {
      alert('No puedes programar el traslado en una fecha anterior a hoy.');
      return;
    }
    const solicitud = solicitudesCalendarizables.find((s) => s.id === id);
    if (!solicitud) return;
    if (solicitud.fecha_limite && Date.parse(fecha) > Date.parse(solicitud.fecha_limite.slice(0, 10))) {
      setAdvertencia({ id, fecha });
      return;
    }
    await ejecutarCalendarizar(id, fecha);
  }, [solicitudesCalendarizables]);

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

  const handleCancelarDespacho = useCallback(async (id: string) => {
    setLoading(id);
    try {
      const result = await cancelarDespachoSolicitudAction(id);
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
        {sucursalesDisponibles.length > 1 && (
          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold text-neutral-500 uppercase tracking-wider shrink-0">Sucursal</label>
            <select
              value={filtroSucursal}
              onChange={(e) => setFiltroSucursal(e.target.value === '' ? '' : Number(e.target.value))}
              className="bg-white border border-neutral-300 rounded-xl px-3 py-2 text-sm text-neutral-900 font-medium focus:outline-none focus:ring-2 focus:ring-neutral-900 cursor-pointer"
            >
              <option value="">Todas las sucursales</option>
              {sucursalesDisponibles.map((s) => (
                <option key={s.id} value={s.id}>{s.nombre}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-neutral-200 rounded-2xl p-5 flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-neutral-500 uppercase tracking-wider">Calendarizadas</p>
            <p className="text-3xl font-bold text-neutral-900 mt-1">{solicitudesVisibles.filter((s) => s.estado === 'calendarizada').length}</p>
          </div>
          <div className="w-11 h-11 rounded-xl border border-neutral-300 flex items-center justify-center text-neutral-900">
            <Calendar className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-neutral-900 border border-neutral-900 rounded-2xl p-5 flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-neutral-400 uppercase tracking-wider">En Tránsito</p>
            <p className="text-3xl font-bold text-white mt-1">{solicitudesVisibles.filter((s) => s.estado === 'en_transito').length}</p>
          </div>
          <div className="w-11 h-11 rounded-xl bg-white/10 flex items-center justify-center text-white">
            <Truck className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white border border-neutral-200 rounded-2xl p-5 flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-neutral-500 uppercase tracking-wider">Entregadas</p>
            <p className="text-3xl font-bold text-neutral-900 mt-1">{solicitudesVisibles.filter((s) => s.estado === 'entregada').length}</p>
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
                  solicitudesCalendarizables.map((s, idx) => (
                    <div
                      key={s.id}
                      draggable={loading !== s.id}
                      onDragStart={(e) => handleDragStart(e, s.id)}
                      onDragEnd={handleDragEnd}
                      className={`p-3 rounded-xl border bg-white cursor-grab active:cursor-grabbing transition-colors ${
                        draggedId === s.id
                          ? 'border-neutral-900 ring-2 ring-neutral-900 shadow-lg opacity-60'
                          : 'border-neutral-200 hover:border-neutral-300'
                      } ${loading === s.id ? 'opacity-50 pointer-events-none' : ''}`}
                    >
                      <div className="flex items-start gap-3">
                        <span className="flex items-center justify-center w-8 h-8 shrink-0 rounded-lg bg-neutral-900 text-white text-sm font-bold">
                          {s.estado === 'priorizada' && s.posicion_prioridad !== null ? s.posicion_prioridad : idx + 1}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-neutral-900 truncate" title={`${s.sucursal_nombre} → ${s.sucursal_destino_nombre}`}>
                            {s.sucursal_nombre} → {s.sucursal_destino_nombre}
                          </p>
                          <div className="mt-1 flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-[10px] text-neutral-500">#{s.id.slice(0, 8)}</span>
                            <span className="px-1.5 py-0.5 rounded text-[10px] bg-neutral-100 text-neutral-600 border border-neutral-200">
                              {tipoLabel[s.tipo_solicitud]}
                            </span>
                            {s.estado === 'asignada' && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] bg-sky-100 text-sky-800">Asignada</span>
                            )}
                          </div>
                          {s.vehiculos.length > 0 ? (
                            <div className="mt-2 space-y-1.5">
                              {s.vehiculos.map((v) => (
                                <div key={v.solicitud_vehiculo_id} className="flex items-center gap-2 text-xs">
                                  <Car className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
                                  <span className="font-semibold text-neutral-900">{v.patente}</span>
                                  <span className="text-neutral-400">·</span>
                                  <span className="text-neutral-500 font-mono text-[11px]">{v.chasis}</span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="mt-1 text-xs text-neutral-400">Sin vehículos</p>
                          )}
                          {s.fecha_limite && (
                            <div className="mt-2 flex items-center gap-3 text-xs text-neutral-500">
                              <span className="inline-flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                Límite: {formatFecha(s.fecha_limite)}
                              </span>
                            </div>
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

        <div className={puedeCalendarizar ? 'lg:col-span-3 lg:sticky lg:top-24 lg:self-start' : 'lg:col-span-4'}>
          <div className="bg-white border border-neutral-200 rounded-2xl overflow-hidden shadow-sm">
            <div className="flex items-center justify-between p-4 border-b border-neutral-200">
              <button
                onClick={mesAnterior}
                aria-label="Mes anterior"
                className="p-2 rounded-xl border border-neutral-200 text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 transition-colors cursor-pointer"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <h2 className="text-lg font-bold text-neutral-900">{MESES[mesActual]} {añoActual}</h2>
              <button
                onClick={mesSiguiente}
                aria-label="Mes siguiente"
                className="p-2 rounded-xl border border-neutral-200 text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 transition-colors cursor-pointer"
              >
                <ChevronRight className="w-5 h-5" />
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
                const esPasado = fechaStr < hoyISO();
                const esDropTarget = puedeCalendarizar && !esPasado && dropTarget === fechaStr;
                const esSeleccionado = diaSeleccionado === fechaStr;
                const tieneTraslados = trasladosDelDia.length > 0;
                return (
                  <div
                    key={idx}
                    {...(!esPasado && puedeCalendarizar ? {
                      onDragOver: (e: DragEvent<HTMLDivElement>) => handleDragOver(e, fechaStr),
                      onDragLeave: handleDragLeave,
                      onDrop: (e: DragEvent<HTMLDivElement>) => handleDrop(e, fechaStr),
                    } : {})}
                    onClick={() => tieneTraslados && setDiaSeleccionado(fechaStr)}
                    className={`min-h-[72px] p-1.5 border-b border-r border-neutral-100 transition-colors ${
                      !d.esMesActual ? 'bg-neutral-50' : ''
                    } ${esPasado ? 'opacity-40 pointer-events-none' : ''} ${esDropTarget ? 'bg-blue-100 ring-2 ring-inset ring-blue-400' : ''} ${
                      esSeleccionado ? 'bg-blue-50 ring-2 ring-inset ring-blue-300' : ''
                    } ${tieneTraslados ? 'cursor-pointer hover:bg-neutral-50' : ''}`}
                  >
                    <div className={`text-xs font-medium mb-1 w-6 h-6 flex items-center justify-center rounded-full ${
                      esHoy ? 'bg-neutral-900 text-white' : d.esMesActual ? 'text-neutral-900' : 'text-neutral-400'
                    }`}>
                      {d.dia}
                    </div>
                    {tieneTraslados && (
                      <div className="flex flex-col items-center gap-0.5">
                        <span className="min-w-[22px] px-1.5 py-0.5 rounded-full bg-neutral-900 text-white text-[10px] font-bold leading-none text-center">
                          {trasladosDelDia.length}
                        </span>
                        <span className="max-w-full px-1 overflow-hidden text-[9px] text-neutral-500 uppercase tracking-wide truncate">
                          traslados agendados
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
                Traslados del {formatFechaLarga(diaSeleccionado + 'T12:00:00Z')}
              </h3>
              <p className="text-xs text-neutral-500 mt-0.5">
                {solicitudesDelDiaSeleccionado.length} traslado{solicitudesDelDiaSeleccionado.length !== 1 ? 's' : ''} programado{solicitudesDelDiaSeleccionado.length !== 1 ? 's' : ''}
              </p>
            </div>
            <button onClick={() => setDiaSeleccionado(null)} className="p-2 rounded-lg hover:bg-neutral-200 transition-colors cursor-pointer">
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
                        Tentativa: {s.fecha_tentativa_despacho ? formatFecha(s.fecha_tentativa_despacho) : 'Sin fecha'}
                      </span>
                      {s.fecha_despacho && (
                        <span className="flex items-center gap-1">
                          <PackageSearch className="w-3 h-3" />
                          Despacho: {formatFecha(s.fecha_despacho)}
                        </span>
                      )}
                      {s.fecha_entrega && (
                        <span className="flex items-center gap-1">
                          <PackageCheck className="w-3 h-3" />
                          Entrega: {formatFecha(s.fecha_entrega)}
                        </span>
                      )}
                    </div>
                    {s.vehiculos.length > 0 && (
                      <p className="text-xs text-neutral-400">Vehículos: {s.vehiculos.map((v) => v.patente).join(', ')}</p>
                    )}
                  </div>
                  <div className="ml-4 flex flex-col gap-2">
                    {puedeDespachar && (s.estado === 'calendarizada' || s.estado === 'en_transito') && (
                      <button
                        onClick={() => s.estado === 'en_transito' ? handleCancelarDespacho(s.id) : handleDespachar(s.id)}
                        disabled={loading === s.id}
                        title={s.estado === 'en_transito' ? 'Cancelar el despacho y volver a Calendarizada' : 'Marcar la solicitud como En Tránsito'}
                        className={`flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors disabled:opacity-50 cursor-pointer ${
                          s.estado === 'en_transito'
                            ? 'text-neutral-700 bg-neutral-100 border border-neutral-300 hover:bg-neutral-200'
                            : 'text-white bg-orange-500 hover:bg-orange-600'
                        }`}
                      >
                        {s.estado === 'en_transito' ? <RotateCcw className="w-3 h-3" /> : <PackageSearch className="w-3 h-3" />}
                        {s.estado === 'en_transito' ? 'Cancelar Despacho' : 'Despachar'}
                      </button>
                    )}
                    {puedeRecibir(s) && s.estado === 'en_transito' && (
                      <button
                        onClick={() => handleRecibir(s.id)}
                        disabled={loading === s.id}
                        className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-green-600 hover:bg-green-700 rounded-lg transition-colors disabled:opacity-50 cursor-pointer"
                      >
                        <PackageCheck className="w-3 h-3" />
                        Recibido
                      </button>
                    )}
                    {puedeCalendarizar && s.estado === 'calendarizada' && (
                      <button
                        onClick={() => handleDescalendarizar(s.id)}
                        disabled={loading === s.id}
                        className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 border border-red-200 rounded-lg transition-colors disabled:opacity-50 cursor-pointer"
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

      {/* Modal de advertencia: fecha fuera del límite */}
      {advertencia && (() => {
        const sol = solicitudesCalendarizables.find((s) => s.id === advertencia.id);
        return (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-xl">
              <div className="p-5 border-b border-neutral-200 bg-red-50">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center shrink-0">
                    <CalendarClock className="w-5 h-5 text-red-700" />
                  </div>
                  <div>
                    <h3 className="font-bold text-neutral-900">Fecha fuera del límite</h3>
                    <p className="text-xs text-neutral-500">Estás programando el traslado después de la fecha límite de entrega</p>
                  </div>
                </div>
              </div>
              <div className="p-5 space-y-3">
                {sol && (
                  <div className="text-sm">
                    <p className="text-neutral-900 font-semibold">{sol.sucursal_nombre} → {sol.sucursal_destino_nombre}</p>
                    <p className="text-neutral-500 text-xs mt-1">Vehículos: {sol.vehiculos.map((v) => v.patente).join(', ') || '—'}</p>
                  </div>
                )}
                <div className="flex gap-3 text-sm">
                  <div className="flex-1 bg-neutral-50 border border-neutral-200 rounded-xl p-3">
                    <p className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider">Fecha programada</p>
                    <p className="font-bold text-neutral-900 mt-0.5">{formatFechaLarga(advertencia.fecha + 'T12:00:00Z')}</p>
                  </div>
                  <div className="flex-1 bg-red-50 border border-red-200 rounded-xl p-3">
                    <p className="text-[10px] font-semibold text-red-500 uppercase tracking-wider">Fecha límite</p>
                    <p className="font-bold text-red-700 mt-0.5">{sol?.fecha_limite ? formatFechaLarga(sol.fecha_limite) : '—'}</p>
                  </div>
                </div>
                <p className="text-xs text-neutral-500">Si confirmas, la solicitud quedará calendarizada en esa fecha aunque supere la fecha límite.</p>
              </div>
              <div className="p-5 border-t border-neutral-200 flex flex-col sm:flex-row gap-2 sm:justify-end">
                <button
                  onClick={cancelarAdvertencia}
                  className="inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-white border border-neutral-300 hover:bg-neutral-50 text-sm font-semibold text-neutral-700 rounded-xl transition-colors cursor-pointer"
                >
                  No, volver a calendarizar
                </button>
                <button
                  onClick={confirmarAdvertencia}
                  className="inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-neutral-900 hover:bg-neutral-700 text-white text-sm font-semibold rounded-xl transition-colors cursor-pointer"
                >
                  Sí, calendarizar igual
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}