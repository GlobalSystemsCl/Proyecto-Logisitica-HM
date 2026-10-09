'use client';

import { useMemo, useState, DragEvent } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  Calendar,
  CalendarClock,
  Car,
  ChevronLeft,
  ChevronRight,
  Clock,
  Filter,
  GripVertical,
  PackageCheck,
  PackageSearch,
  RotateCcw,
  Search,
  Truck,
  X,
} from 'lucide-react';
import type { SolicitudLista, TipoSolicitud } from '@/types/solicitud.types';
import {
  calendarizarSolicitudAction,
  descalendarizarSolicitudAction,
  despacharSolicitudAction,
  cancelarDespachoSolicitudAction,
  recalendarizarSolicitudAction,
  cancelarEnTransitoAction,
} from '@/app/actions/solicitudes.actions';
import { CancelarTransitoModal, RecepcionModal, ReprogramarModal } from '@/components/ModalesTraslado';
import { recibirSolicitudConFotos } from '@/lib/recepcionCliente';
import { formatFecha, formatFechaLarga, hoyISO } from '@/lib/fechas';
import { ETIQUETA_FECHA_LIMITE } from '@/lib/textos';
import {
  FILTROS_CALENDARIO_INICIALES,
  agruparPorDia,
  cumpleFiltros,
  desplazar,
  estadoPlazo,
  filtrosAParams,
  hayFiltrosCalendario,
  indicadoresCalendario,
  tituloPeriodo,
  type FiltrosCalendario,
  type VistaCalendario,
} from '@/lib/calendario';

interface Opcion {
  id: number | string;
  nombre: string | null;
}

interface Props {
  vista: VistaCalendario;
  fecha: string;
  dias: string[];
  filtrosIniciales: FiltrosCalendario;
  /** Programadas, en tránsito o recibidas dentro del rango visible. */
  programadas: SolicitudLista[];
  /** Priorizadas o asignadas, aún sin fecha de despacho. */
  porProgramar: SolicitudLista[];
  reprogramaciones: Record<string, number>;
  sucursales: Opcion[];
  zonas: Opcion[];
  encargados: Array<{ id: string; nombre: string }>;
  viewer: { id: string; rol: string; sucursal_id: number | null };
  sucursales_asignadas?: Array<{ id: number; nombre: string | null }>;
}

const DIAS_SEMANA = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const ETIQUETA_VISTA: Record<VistaCalendario, string> = { mes: 'Mes', semana: 'Semana', dia: 'Día' };

const tipoLabel: Record<TipoSolicitud, string> = {
  venta: 'Sala de venta',
  evento: 'Evento',
};

const ESTADO_TARJETA: Record<string, { texto: string; clase: string }> = {
  calendarizada: { texto: 'Programada', clase: 'bg-blue-100 text-blue-800' },
  en_transito: { texto: 'En tránsito', clase: 'bg-orange-100 text-orange-800' },
  entregada: { texto: 'Recepcionada', clase: 'bg-green-100 text-green-800' },
};

const CHIP_PLAZO = {
  atrasada: { texto: 'Atrasada', clase: 'bg-red-50 text-red-700 border-red-200' },
  fuera_de_plazo: { texto: 'Después de la fecha límite', clase: 'bg-amber-50 text-amber-800 border-amber-200' },
  a_tiempo: null,
} as const;

function ruta(s: SolicitudLista): string {
  return `${s.sucursal_nombre ?? ''} → ${s.sucursal_destino_nombre ?? s.titulo_evento ?? ''}`;
}

export default function CalendarizacionesClient({
  vista,
  fecha,
  dias,
  filtrosIniciales,
  programadas,
  porProgramar,
  reprogramaciones,
  sucursales,
  zonas,
  encargados,
  viewer,
  sucursales_asignadas = [],
}: Props) {
  const router = useRouter();
  const hoy = hoyISO();

  const [filtros, setFiltrosState] = useState<FiltrosCalendario>(filtrosIniciales);
  const [mostrarFiltros, setMostrarFiltros] = useState(hayFiltrosCalendario(filtrosIniciales));
  const [diaSeleccionado, setDiaSeleccionado] = useState<string | null>(vista === 'dia' ? fecha : null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [advertencia, setAdvertencia] = useState<{ id: string; fecha: string } | null>(null);
  const [recibirTarget, setRecibirTarget] = useState<SolicitudLista | null>(null);
  const [reprogramar, setReprogramar] = useState<{ sol: SolicitudLista; fecha: string | null } | null>(null);
  const [cancelarTarget, setCancelarTarget] = useState<SolicitudLista | null>(null);

  const puedeCalendarizar = viewer.rol === 'logistica';
  const puedeDespachar = viewer.rol === 'administrador' || viewer.rol === 'logistica';
  const esAdmin = viewer.rol === 'administrador';
  const ctx = useMemo(() => ({ hoy, reprogramaciones }), [hoy, reprogramaciones]);

  const puedeRecibir = (s: SolicitudLista) => {
    if (esAdmin) return true;
    if (viewer.rol !== 'jefe_local') return false;
    const asignadas = sucursales_asignadas.length > 0
      ? sucursales_asignadas.map((suc) => suc.id)
      : viewer.sucursal_id !== null ? [viewer.sucursal_id] : [];
    return asignadas.includes(s.sucursal_destino ?? s.sucursal);
  };

  // --- URL: vista y fecha recargan datos del servidor; los filtros solo se reflejan ---
  function urlCon(cambios: { vista?: VistaCalendario; fecha?: string; filtros?: FiltrosCalendario }): string {
    const p = new URLSearchParams({
      vista: cambios.vista ?? vista,
      fecha: cambios.fecha ?? fecha,
      ...filtrosAParams(cambios.filtros ?? filtros),
    });
    return `?${p.toString()}`;
  }

  function irA(cambios: { vista?: VistaCalendario; fecha?: string }) {
    router.push(urlCon(cambios), { scroll: false });
  }

  function setFiltros(nuevos: FiltrosCalendario) {
    setFiltrosState(nuevos);
    window.history.replaceState(null, '', urlCon({ filtros: nuevos }));
  }

  // --- Datos filtrados ---
  const visibles = useMemo(() => programadas.filter((s) => cumpleFiltros(s, filtros, ctx)), [programadas, filtros, ctx]);
  const pendientes = useMemo(() => {
    // Las pendientes no tienen estado de calendario ni fecha: se ignoran esos filtros.
    const sinEstado = { ...filtros, estado: '' as const, soloReprogramadas: false };
    return porProgramar.filter((s) => cumpleFiltros(s, sinEstado, ctx));
  }, [porProgramar, filtros, ctx]);
  const porDia = useMemo(() => agruparPorDia(visibles), [visibles]);
  const indicadores = useMemo(() => indicadoresCalendario(visibles, pendientes, ctx), [visibles, pendientes, ctx]);

  const mesDeReferencia = fecha.slice(0, 7);
  const delDiaSeleccionado = diaSeleccionado ? porDia[diaSeleccionado] ?? [] : [];

  // --- Arrastrar y soltar ---
  function handleDragStart(e: DragEvent<HTMLDivElement>, id: string) {
    setDraggedId(id);
    e.dataTransfer.setData('text/plain', id);
    e.dataTransfer.effectAllowed = 'move';
  }

  function handleDragOver(e: DragEvent<HTMLDivElement>, dia: string) {
    if (dia < hoy) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDropTarget(dia);
  }

  async function ejecutarCalendarizar(id: string, dia: string) {
    setLoading(id);
    try {
      const result = await calendarizarSolicitudAction(id, dia);
      if (!result.success) alert(result.error);
    } finally {
      setLoading(null);
    }
  }

  async function handleDrop(e: DragEvent<HTMLDivElement>, dia: string) {
    e.preventDefault();
    setDropTarget(null);
    setDraggedId(null);
    const id = e.dataTransfer.getData('text/plain');
    if (!id || dia < hoy) return;

    const pendiente = pendientes.find((s) => s.id === id);
    if (pendiente) {
      if (pendiente.fecha_limite && dia > pendiente.fecha_limite.slice(0, 10)) {
        setAdvertencia({ id, fecha: dia });
        return;
      }
      await ejecutarCalendarizar(id, dia);
      return;
    }
    // Arrastrar una ya programada a otro día = reprogramarla (con motivo y aviso urgente).
    const programada = visibles.find((s) => s.id === id && s.estado === 'calendarizada');
    if (programada && programada.fecha_tentativa_despacho?.slice(0, 10) !== dia) {
      setReprogramar({ sol: programada, fecha: dia });
    }
  }

  async function accion(id: string, fn: () => Promise<{ success: boolean; error?: string }>) {
    setLoading(id);
    try {
      const result = await fn();
      if (!result.success) alert(result.error);
    } finally {
      setLoading(null);
    }
  }

  // --- Tarjetas ---
  function chips(s: SolicitudLista) {
    const plazo = CHIP_PLAZO[estadoPlazo(s, hoy)];
    const veces = reprogramaciones[s.id] ?? 0;
    return (
      <>
        {plazo && <span className={`px-1.5 py-0.5 rounded border text-[10px] font-semibold ${plazo.clase}`}>{plazo.texto}</span>}
        {veces > 0 && (
          <span className="px-1.5 py-0.5 rounded border text-[10px] font-semibold bg-purple-50 text-purple-700 border-purple-200">
            Reprogramada {veces > 1 ? `${veces} veces` : '1 vez'}
          </span>
        )}
      </>
    );
  }

  function acciones(s: SolicitudLista) {
    const btn = 'flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors disabled:opacity-50 cursor-pointer';
    const ocupado = loading === s.id;
    return (
      <div className="flex flex-wrap gap-2">
        {puedeDespachar && s.estado === 'calendarizada' && (
          <button onClick={() => accion(s.id, () => despacharSolicitudAction(s.id))} disabled={ocupado} className={`${btn} text-white bg-sky-600 hover:bg-sky-700`}>
            <PackageSearch className="w-3 h-3" /> Despachar
          </button>
        )}
        {puedeCalendarizar && s.estado === 'calendarizada' && (
          <button onClick={() => setReprogramar({ sol: s, fecha: null })} disabled={ocupado} className={`${btn} text-blue-700 border border-blue-200 hover:bg-blue-50`}>
            <CalendarClock className="w-3 h-3" /> Reprogramar
          </button>
        )}
        {puedeCalendarizar && s.estado === 'calendarizada' && (
          <button onClick={() => accion(s.id, () => descalendarizarSolicitudAction(s.id))} disabled={ocupado} className={`${btn} text-red-600 border border-red-200 hover:bg-red-50`}>
            <RotateCcw className="w-3 h-3" /> Descalendarizar
          </button>
        )}
        {puedeDespachar && s.estado === 'en_transito' && (
          <button
            onClick={() => accion(s.id, () => cancelarDespachoSolicitudAction(s.id))}
            disabled={ocupado}
            title="Volver a Programada (el vehículo no salió)"
            className={`${btn} text-neutral-700 bg-neutral-100 border border-neutral-300 hover:bg-neutral-200`}
          >
            <RotateCcw className="w-3 h-3" /> Deshacer despacho
          </button>
        )}
        {puedeCalendarizar && s.estado === 'en_transito' && (
          <button onClick={() => setCancelarTarget(s)} disabled={ocupado} className={`${btn} text-red-600 border border-red-200 hover:bg-red-50`}>
            <X className="w-3 h-3" /> Cancelar traslado
          </button>
        )}
        {puedeRecibir(s) && s.estado === 'en_transito' && (
          <button onClick={() => setRecibirTarget(s)} disabled={ocupado} className={`${btn} text-white bg-green-600 hover:bg-green-700`}>
            <PackageCheck className="w-3 h-3" /> Recibido
          </button>
        )}
      </div>
    );
  }

  function tarjetaCompleta(s: SolicitudLista) {
    const estado = ESTADO_TARJETA[s.estado];
    return (
      <div key={s.id} className="p-4 space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold text-neutral-900">{ruta(s)}</span>
          {estado && <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${estado.clase}`}>{estado.texto}</span>}
          <span className="px-1.5 py-0.5 rounded text-[10px] bg-neutral-100 text-neutral-600 border border-neutral-200">{tipoLabel[s.tipo_solicitud]}</span>
          {chips(s)}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-neutral-500">
          <span className="font-mono">#{s.id.slice(0, 8)}</span>
          <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> Despacho programado: {formatFecha(s.fecha_tentativa_despacho) || '—'}</span>
          <span>{ETIQUETA_FECHA_LIMITE}: {formatFecha(s.fecha_limite) || '—'}</span>
          {s.fecha_despacho && <span>Despachado: {formatFecha(s.fecha_despacho)}</span>}
          {s.fecha_recepcion && <span>Recibido: {formatFecha(s.fecha_recepcion)}</span>}
          {s.logistica_nombre && <span>Encargado: {s.logistica_nombre}</span>}
        </div>
        {s.vehiculos.length > 0 && (
          <p className="text-xs text-neutral-500 flex items-center gap-1">
            <Car className="w-3 h-3" /> {s.vehiculos.map((v) => v.patente || v.chasis).join(', ')}
          </p>
        )}
        {acciones(s)}
      </div>
    );
  }

  function tarjetaCompacta(s: SolicitudLista) {
    const estado = ESTADO_TARJETA[s.estado];
    const arrastrable = puedeCalendarizar && s.estado === 'calendarizada';
    return (
      <div
        key={s.id}
        draggable={arrastrable && loading !== s.id}
        onDragStart={(e) => arrastrable && handleDragStart(e, s.id)}
        onDragEnd={() => { setDraggedId(null); setDropTarget(null); }}
        onClick={(e) => { e.stopPropagation(); setDiaSeleccionado(s.fecha_tentativa_despacho?.slice(0, 10) ?? null); }}
        title={arrastrable ? 'Arrastra a otro día para reprogramar' : undefined}
        className={`p-2 rounded-lg border bg-white text-left space-y-1 ${arrastrable ? 'cursor-grab' : 'cursor-pointer'} ${draggedId === s.id ? 'opacity-50' : ''} border-neutral-200 hover:border-neutral-400`}
      >
        <p className="text-[11px] font-semibold text-neutral-900 truncate">{ruta(s)}</p>
        <div className="flex flex-wrap gap-1">
          {estado && <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${estado.clase}`}>{estado.texto}</span>}
          {chips(s)}
        </div>
        <p className="text-[10px] text-neutral-500 truncate">{s.vehiculos.map((v) => v.patente || v.chasis).join(', ') || 'Sin vehículos'}</p>
      </div>
    );
  }

  function celdaDropProps(dia: string) {
    if (!puedeCalendarizar || dia < hoy) return {};
    return {
      onDragOver: (e: DragEvent<HTMLDivElement>) => handleDragOver(e, dia),
      onDragLeave: () => setDropTarget(null),
      onDrop: (e: DragEvent<HTMLDivElement>) => handleDrop(e, dia),
    };
  }

  // --- Indicadores clicables ---
  const tarjetasIndicadores: Array<{ clave: string; titulo: string; valor: number; clase: string; aplicar?: () => void; activo?: boolean }> = [
    { clave: 'prog', titulo: 'Programados', valor: indicadores.programados, clase: 'bg-white border-neutral-200 text-neutral-900', aplicar: () => setFiltros({ ...filtros, estado: filtros.estado === 'calendarizada' ? '' : 'calendarizada' }), activo: filtros.estado === 'calendarizada' },
    { clave: 'trans', titulo: 'En tránsito', valor: indicadores.enTransito, clase: 'bg-neutral-900 border-neutral-900 text-white', aplicar: () => setFiltros({ ...filtros, estado: filtros.estado === 'en_transito' ? '' : 'en_transito' }), activo: filtros.estado === 'en_transito' },
    { clave: 'rec', titulo: 'Recepcionados', valor: indicadores.recepcionados, clase: 'bg-white border-neutral-200 text-neutral-900', aplicar: () => setFiltros({ ...filtros, estado: filtros.estado === 'entregada' ? '' : 'entregada' }), activo: filtros.estado === 'entregada' },
    { clave: 'atr', titulo: 'Atrasados', valor: indicadores.atrasados, clase: 'bg-red-50 border-red-200 text-red-900', aplicar: () => setFiltros({ ...filtros, plazo: filtros.plazo === 'atrasada' ? '' : 'atrasada' }), activo: filtros.plazo === 'atrasada' },
    { clave: 'fuera', titulo: 'Después de la fecha límite', valor: indicadores.fueraDePlazo, clase: 'bg-amber-50 border-amber-200 text-amber-900', aplicar: () => setFiltros({ ...filtros, plazo: filtros.plazo === 'fuera_de_plazo' ? '' : 'fuera_de_plazo' }), activo: filtros.plazo === 'fuera_de_plazo' },
    { clave: 'repro', titulo: 'Reprogramados', valor: indicadores.reprogramados, clase: 'bg-purple-50 border-purple-200 text-purple-900', aplicar: () => setFiltros({ ...filtros, soloReprogramadas: !filtros.soloReprogramadas }), activo: filtros.soloReprogramadas },
    { clave: 'sin', titulo: 'Sin programar', valor: indicadores.sinProgramar, clase: 'bg-white border-neutral-200 text-neutral-900' },
  ];

  const selectCls = 'bg-white border border-neutral-300 rounded-xl px-3 py-2 text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-900';

  return (
    <div className="space-y-6">
      {/* Encabezado */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 flex items-center gap-2">
            <Calendar className="w-6 h-6" /> Gestión Logística
          </h1>
          <p className="text-sm text-neutral-500 mt-1">
            {puedeCalendarizar
              ? 'Arrastra las solicitudes al calendario para programarlas. En la vista semanal puedes arrastrar una ya programada para reprogramarla.'
              : 'Haz clic en un día para ver sus traslados.'}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="inline-flex rounded-xl border border-neutral-300 bg-white p-0.5" role="group" aria-label="Vista">
            {(['mes', 'semana', 'dia'] as VistaCalendario[]).map((v) => (
              <button
                key={v}
                onClick={() => irA({ vista: v })}
                aria-pressed={vista === v}
                className={`px-3 py-1.5 text-sm font-semibold rounded-lg cursor-pointer ${vista === v ? 'bg-neutral-900 text-white' : 'text-neutral-600 hover:bg-neutral-100'}`}
              >
                {ETIQUETA_VISTA[v]}
              </button>
            ))}
          </div>
          <button
            onClick={() => setMostrarFiltros((m) => !m)}
            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border text-sm font-semibold cursor-pointer ${hayFiltrosCalendario(filtros) ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-300 bg-white text-neutral-700'}`}
          >
            <Filter className="w-4 h-4" /> Filtros{hayFiltrosCalendario(filtros) ? ` (${Object.keys(filtrosAParams(filtros)).length})` : ''}
          </button>
        </div>
      </div>

      {/* Filtros */}
      {mostrarFiltros && (
        <div className="bg-white border border-neutral-200 rounded-2xl p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="relative sm:col-span-2">
            <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={filtros.busqueda}
              onChange={(e) => setFiltros({ ...filtros, busqueda: e.target.value.slice(0, 40) })}
              placeholder="Buscar por patente, chasis o N° de solicitud"
              className={`${selectCls} w-full pl-9`}
            />
          </div>
          <select value={filtros.origen} onChange={(e) => setFiltros({ ...filtros, origen: e.target.value })} className={selectCls} aria-label="Sucursal de origen">
            <option value="">Origen: todas</option>
            {sucursales.map((s) => <option key={s.id} value={String(s.id)}>{s.nombre ?? `Sucursal ${s.id}`}</option>)}
          </select>
          <select value={filtros.destino} onChange={(e) => setFiltros({ ...filtros, destino: e.target.value })} className={selectCls} aria-label="Sucursal de destino">
            <option value="">Destino: todos</option>
            {sucursales.map((s) => <option key={s.id} value={String(s.id)}>{s.nombre ?? `Sucursal ${s.id}`}</option>)}
          </select>
          <select value={filtros.zona} onChange={(e) => setFiltros({ ...filtros, zona: e.target.value })} className={selectCls} aria-label="Zona">
            <option value="">Zona: todas</option>
            {zonas.map((z) => <option key={z.id} value={String(z.id)}>{z.nombre ?? `Zona ${z.id}`}</option>)}
          </select>
          <select value={filtros.estado} onChange={(e) => setFiltros({ ...filtros, estado: e.target.value as FiltrosCalendario['estado'] })} className={selectCls} aria-label="Estado">
            <option value="">Estado: todos</option>
            <option value="calendarizada">Programadas</option>
            <option value="en_transito">En tránsito</option>
            <option value="entregada">Recepcionadas</option>
          </select>
          <select value={filtros.tipo} onChange={(e) => setFiltros({ ...filtros, tipo: e.target.value as FiltrosCalendario['tipo'] })} className={selectCls} aria-label="Tipo">
            <option value="">Tipo: todos</option>
            <option value="venta">Sala de venta</option>
            <option value="evento">Evento</option>
          </select>
          <select value={filtros.encargado} onChange={(e) => setFiltros({ ...filtros, encargado: e.target.value })} className={selectCls} aria-label="Encargado de logística">
            <option value="">Encargado: todos</option>
            {encargados.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
          </select>
          <select value={filtros.plazo} onChange={(e) => setFiltros({ ...filtros, plazo: e.target.value as FiltrosCalendario['plazo'] })} className={selectCls} aria-label="Plazo">
            <option value="">Plazo: todos</option>
            <option value="atrasada">Atrasadas</option>
            <option value="fuera_de_plazo">Programadas después de la fecha límite</option>
          </select>
          <label className="flex items-center gap-2 text-sm text-neutral-700 cursor-pointer">
            <input type="checkbox" checked={filtros.soloReprogramadas} onChange={(e) => setFiltros({ ...filtros, soloReprogramadas: e.target.checked })} />
            Solo reprogramadas
          </label>
          {hayFiltrosCalendario(filtros) && (
            <button onClick={() => setFiltros(FILTROS_CALENDARIO_INICIALES)} className="text-sm font-semibold text-neutral-700 hover:underline text-left cursor-pointer">
              Limpiar filtros
            </button>
          )}
        </div>
      )}

      {/* Indicadores del período */}
      <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-7 gap-3">
        {tarjetasIndicadores.map((t) => (
          <button
            key={t.clave}
            type="button"
            onClick={t.aplicar}
            disabled={!t.aplicar}
            aria-pressed={t.activo}
            className={`text-left rounded-2xl border p-4 ${t.clase} ${t.aplicar ? 'cursor-pointer hover:opacity-90' : 'cursor-default'} ${t.activo ? 'ring-2 ring-offset-1 ring-neutral-900' : ''}`}
          >
            <p className="text-[11px] font-medium uppercase tracking-wider opacity-70">{t.titulo}</p>
            <p className="text-2xl font-bold mt-1 tabular-nums">{t.valor}</p>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Por programar */}
        {puedeCalendarizar && (
          <div className="lg:col-span-1">
            <div className="bg-white border border-neutral-200 rounded-2xl overflow-hidden lg:sticky lg:top-24">
              <div className="p-3 border-b border-neutral-200 bg-neutral-50">
                <h3 className="font-bold text-neutral-900 text-sm flex items-center gap-2">
                  <GripVertical className="w-4 h-4" /> Por programar ({pendientes.length})
                </h3>
                <p className="text-[10px] text-neutral-500 mt-0.5">Arrastra al calendario para programar</p>
              </div>
              <div className="max-h-[560px] overflow-y-auto p-2 space-y-2">
                {pendientes.length === 0 ? (
                  <p className="p-4 text-center text-xs text-neutral-500">No hay solicitudes por programar</p>
                ) : (
                  pendientes.map((s) => (
                    <div
                      key={s.id}
                      draggable={loading !== s.id}
                      onDragStart={(e) => handleDragStart(e, s.id)}
                      onDragEnd={() => { setDraggedId(null); setDropTarget(null); }}
                      className={`p-3 rounded-xl border bg-white cursor-grab active:cursor-grabbing ${draggedId === s.id ? 'border-neutral-900 ring-2 ring-neutral-900 opacity-60' : 'border-neutral-200 hover:border-neutral-300'} ${loading === s.id ? 'opacity-50 pointer-events-none' : ''}`}
                    >
                      <p className="text-xs font-semibold text-neutral-900 truncate" title={ruta(s)}>{ruta(s)}</p>
                      <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                        <span className="font-mono text-[10px] text-neutral-500">#{s.id.slice(0, 8)}</span>
                        <span className="px-1.5 py-0.5 rounded text-[10px] bg-neutral-100 text-neutral-600 border border-neutral-200">{tipoLabel[s.tipo_solicitud]}</span>
                        {s.estado === 'priorizada' && s.posicion_prioridad !== null && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] bg-neutral-900 text-white">Prioridad #{s.posicion_prioridad}</span>
                        )}
                        {s.estado === 'asignada' && <span className="px-1.5 py-0.5 rounded text-[10px] bg-sky-100 text-sky-800">Asignada</span>}
                        {chips(s)}
                      </div>
                      <p className="mt-1 text-[11px] text-neutral-500 truncate">{s.vehiculos.map((v) => v.patente || v.chasis).join(', ') || 'Sin vehículos'}</p>
                      {s.fecha_limite && (
                        <p className="mt-1 text-[11px] text-neutral-500 flex items-center gap-1">
                          <Clock className="w-3 h-3" /> {ETIQUETA_FECHA_LIMITE}: {formatFecha(s.fecha_limite)}
                        </p>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* Calendario */}
        <div className={puedeCalendarizar ? 'lg:col-span-3' : 'lg:col-span-4'}>
          <div className="bg-white border border-neutral-200 rounded-2xl overflow-hidden shadow-sm">
            <div className="flex items-center justify-between gap-2 p-4 border-b border-neutral-200">
              <div className="flex items-center gap-2">
                <button onClick={() => irA({ fecha: desplazar(vista, fecha, -1) })} aria-label="Anterior" className="p-2 rounded-xl border border-neutral-200 text-neutral-600 hover:bg-neutral-100 cursor-pointer">
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <button onClick={() => irA({ fecha: hoy })} className="px-3 py-2 rounded-xl border border-neutral-200 text-sm font-semibold text-neutral-700 hover:bg-neutral-100 cursor-pointer">
                  Hoy
                </button>
                <button onClick={() => irA({ fecha: desplazar(vista, fecha, 1) })} aria-label="Siguiente" className="p-2 rounded-xl border border-neutral-200 text-neutral-600 hover:bg-neutral-100 cursor-pointer">
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
              <h2 className="text-base sm:text-lg font-bold text-neutral-900 text-right">{tituloPeriodo(vista, fecha)}</h2>
            </div>

            {/* Vista mensual */}
            {vista === 'mes' && (
              <>
                <div className="grid grid-cols-7 border-b border-neutral-200">
                  {DIAS_SEMANA.map((d) => <div key={d} className="p-2 text-center text-xs font-semibold text-neutral-500 uppercase">{d}</div>)}
                </div>
                <div className="grid grid-cols-7">
                  {dias.map((dia) => {
                    const lista = porDia[dia] ?? [];
                    const delMes = dia.slice(0, 7) === mesDeReferencia;
                    const atrasados = lista.filter((s) => estadoPlazo(s, hoy) === 'atrasada').length;
                    return (
                      <div
                        key={dia}
                        {...celdaDropProps(dia)}
                        onClick={() => lista.length > 0 && setDiaSeleccionado(dia)}
                        className={`min-h-[84px] p-1.5 border-b border-r border-neutral-100 ${!delMes ? 'bg-neutral-50' : ''} ${dia < hoy ? 'bg-neutral-50/60' : ''} ${dropTarget === dia ? 'bg-blue-100 ring-2 ring-inset ring-blue-400' : ''} ${diaSeleccionado === dia ? 'bg-blue-50 ring-2 ring-inset ring-blue-300' : ''} ${lista.length > 0 ? 'cursor-pointer hover:bg-neutral-50' : ''}`}
                      >
                        <div className={`text-xs font-medium mb-1 w-6 h-6 flex items-center justify-center rounded-full ${dia === hoy ? 'bg-neutral-900 text-white' : delMes ? 'text-neutral-900' : 'text-neutral-400'}`}>
                          {Number(dia.slice(8, 10))}
                        </div>
                        {lista.length > 0 && (
                          <div className="space-y-0.5 text-[10px]">
                            <p className="font-bold text-neutral-900">{lista.length} traslado{lista.length > 1 ? 's' : ''}</p>
                            {atrasados > 0 && <p className="font-semibold text-red-600">{atrasados} atrasado{atrasados > 1 ? 's' : ''}</p>}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {/* Vista semanal: una columna por día */}
            {vista === 'semana' && (
              <div className="grid grid-cols-1 md:grid-cols-7 divide-y md:divide-y-0 md:divide-x divide-neutral-100">
                {dias.map((dia, i) => {
                  const lista = porDia[dia] ?? [];
                  return (
                    <div
                      key={dia}
                      {...celdaDropProps(dia)}
                      className={`min-h-[260px] p-2 space-y-2 ${dia < hoy ? 'bg-neutral-50/60' : ''} ${dropTarget === dia ? 'bg-blue-100 ring-2 ring-inset ring-blue-400' : ''}`}
                    >
                      <button
                        onClick={() => setDiaSeleccionado(dia)}
                        className={`w-full flex items-center justify-between text-xs font-semibold rounded-lg px-2 py-1 cursor-pointer ${dia === hoy ? 'bg-neutral-900 text-white' : 'text-neutral-600 hover:bg-neutral-100'}`}
                      >
                        <span>{DIAS_SEMANA[i]} {Number(dia.slice(8, 10))}</span>
                        <span>{lista.length}</span>
                      </button>
                      {lista.map((s) => tarjetaCompacta(s))}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Vista diaria */}
            {vista === 'dia' && (
              <div {...celdaDropProps(fecha)} className={dropTarget === fecha ? 'bg-blue-50' : ''}>
                {(porDia[fecha] ?? []).length === 0 ? (
                  <p className="p-10 text-center text-sm text-neutral-400">
                    No hay traslados programados este día{puedeCalendarizar ? '. Arrastra una solicitud aquí para programarla.' : '.'}
                  </p>
                ) : (
                  <div className="divide-y divide-neutral-100">
                    {(porDia[fecha] ?? []).map((s) => tarjetaCompleta(s))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Detalle del día (vistas mes y semana) */}
      {vista !== 'dia' && diaSeleccionado && (
        <div className="bg-white border border-neutral-200 rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between p-4 border-b border-neutral-200 bg-neutral-50">
            <div>
              <h3 className="font-bold text-neutral-900">Traslados del {formatFechaLarga(diaSeleccionado + 'T12:00:00Z')}</h3>
              <p className="text-xs text-neutral-500 mt-0.5">{delDiaSeleccionado.length} traslado{delDiaSeleccionado.length !== 1 ? 's' : ''}</p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => irA({ vista: 'dia', fecha: diaSeleccionado })} className="px-3 py-1.5 rounded-lg border border-neutral-300 text-xs font-semibold text-neutral-700 hover:bg-neutral-100 cursor-pointer">
                Ver día
              </button>
              <button onClick={() => setDiaSeleccionado(null)} className="p-2 rounded-lg hover:bg-neutral-200 cursor-pointer" aria-label="Cerrar">
                <X className="w-4 h-4 text-neutral-500" />
              </button>
            </div>
          </div>
          <div className="divide-y divide-neutral-100 max-h-[460px] overflow-y-auto">
            {delDiaSeleccionado.length === 0 ? (
              <p className="p-6 text-sm text-neutral-400">Sin traslados con los filtros actuales.</p>
            ) : (
              delDiaSeleccionado.map((s) => tarjetaCompleta(s))
            )}
          </div>
        </div>
      )}

      {/* Modales */}
      {recibirTarget && (
        <RecepcionModal
          titulo="Registrar recepción"
          subtitulo={ruta(recibirTarget)}
          permitirFotos
          onCerrar={() => setRecibirTarget(null)}
          onConfirmar={async (datos, fotos) => {
            const { error, aviso } = await recibirSolicitudConFotos(recibirTarget.id, datos, fotos);
            if (error) return error;
            setRecibirTarget(null);
            if (aviso) alert(aviso);
            return null;
          }}
        />
      )}

      {reprogramar && (
        <ReprogramarModal
          subtitulo={ruta(reprogramar.sol)}
          fechaActual={reprogramar.sol.fecha_tentativa_despacho}
          fechaPropuesta={reprogramar.fecha}
          onCerrar={() => setReprogramar(null)}
          onConfirmar={async (nuevaFecha, motivo) => {
            const result = await recalendarizarSolicitudAction(reprogramar.sol.id, nuevaFecha, motivo);
            if (!result.success) return result.error ?? 'No se pudo reprogramar.';
            setReprogramar(null);
            return null;
          }}
        />
      )}

      {cancelarTarget && (
        <CancelarTransitoModal
          titulo="Cancelar traslado en tránsito"
          subtitulo={ruta(cancelarTarget)}
          sucursales={sucursales.map((s) => ({ id: Number(s.id), nombre: s.nombre }))}
          ubicacionInicial={cancelarTarget.sucursal}
          onCerrar={() => setCancelarTarget(null)}
          onConfirmar={async (motivo, ubicacion) => {
            const result = await cancelarEnTransitoAction(cancelarTarget.id, motivo, ubicacion);
            if (!result.success) return result.error ?? 'No se pudo cancelar el traslado.';
            setCancelarTarget(null);
            return null;
          }}
        />
      )}

      {advertencia && (() => {
        const sol = pendientes.find((s) => s.id === advertencia.id);
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setAdvertencia(null)}>
            <div className="bg-white rounded-2xl w-full max-w-md shadow-xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
              <div className="p-5 border-b border-neutral-200 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-5 h-5 text-red-700" />
                </div>
                <div>
                  <h3 className="font-bold text-neutral-900">Fecha posterior a la propuesta</h3>
                  <p className="text-xs text-neutral-500">Estás programando el traslado después de la fecha límite de entrega propuesta</p>
                </div>
              </div>
              <div className="p-5 space-y-3 text-sm">
                {sol && <p className="font-semibold text-neutral-900">{ruta(sol)}</p>}
                <div className="flex gap-3">
                  <div className="flex-1 bg-neutral-50 border border-neutral-200 rounded-xl p-3">
                    <p className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider">Fecha programada</p>
                    <p className="font-bold text-neutral-900 mt-0.5">{formatFechaLarga(advertencia.fecha + 'T12:00:00Z')}</p>
                  </div>
                  <div className="flex-1 bg-red-50 border border-red-200 rounded-xl p-3">
                    <p className="text-[10px] font-semibold text-red-500 uppercase tracking-wider">{ETIQUETA_FECHA_LIMITE}</p>
                    <p className="font-bold text-red-700 mt-0.5">{sol?.fecha_limite ? formatFechaLarga(sol.fecha_limite) : '—'}</p>
                  </div>
                </div>
                <p className="text-xs text-neutral-500">Si confirmas, la solicitud quedará programada en esa fecha aunque supere la fecha límite de entrega propuesta.</p>
              </div>
              <div className="p-4 border-t border-neutral-200 flex justify-end gap-2">
                <button onClick={() => setAdvertencia(null)} className="px-4 py-2 text-sm font-semibold text-neutral-600 rounded-xl hover:bg-neutral-100 cursor-pointer">Volver</button>
                <button
                  onClick={async () => { const a = advertencia; setAdvertencia(null); await ejecutarCalendarizar(a.id, a.fecha); }}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 rounded-xl cursor-pointer"
                >
                  <Truck className="w-4 h-4" /> Programar igual
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
