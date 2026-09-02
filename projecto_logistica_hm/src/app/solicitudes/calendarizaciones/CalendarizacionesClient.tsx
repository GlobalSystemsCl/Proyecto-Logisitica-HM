'use client';

import { useState, useMemo } from 'react';
import { Calendar, MapPin, Clock, ChevronLeft, ChevronRight, Truck } from 'lucide-react';
import type { SolicitudLista } from '@/types/solicitud.types';

interface CalendarizacionesClientProps {
  solicitudes: SolicitudLista[];
  viewer: {
    id: string;
    nombre: string;
    apellido: string;
    rol: string;
    sucursal_id: number | null;
  };
}

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

const DIAS_SEMANA = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

export default function CalendarizacionesClient({
  solicitudes,
  viewer,
}: CalendarizacionesClientProps) {
  const [mesActual, setMesActual] = useState(new Date().getMonth());
  const [añoActual, setAñoActual] = useState(new Date().getFullYear());

  const solicitudesFiltradas = useMemo(() => {
    if (viewer.rol === 'jefe_local' && viewer.sucursal_id) {
      return solicitudes.filter((s) => s.sucursal === viewer.sucursal_id);
    }
    return solicitudes;
  }, [solicitudes, viewer]);

  const solicitudesCalendarizadas = useMemo(
    () => solicitudesFiltradas.filter((s) => s.estado === 'calendarizada'),
    [solicitudesFiltradas]
  );

  const solicitudesPorFecha = useMemo(() => {
    const mapa: Record<string, SolicitudLista[]> = {};
    solicitudesCalendarizadas.forEach((s) => {
      if (s.fecha_tentativa_despacho) {
        const fecha = s.fecha_tentativa_despacho.split('T')[0];
        if (!mapa[fecha]) mapa[fecha] = [];
        mapa[fecha].push(s);
      }
    });
    return mapa;
  }, [solicitudesCalendarizadas]);

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

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 flex items-center gap-2">
            <Calendar className="w-6 h-6" />
            Calendarizaciones
          </h1>
          <p className="text-sm text-neutral-500 mt-1">
            Vista de calendario de traslados programados
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm bg-white border border-neutral-200 rounded-xl px-4 py-2">
          <Truck className="w-4 h-4 text-neutral-500" />
          <span className="font-medium text-neutral-900">
            {solicitudesCalendarizadas.length} traslados programados
          </span>
        </div>
      </div>

      <div className="bg-white border border-neutral-200 rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-neutral-200">
          <button onClick={mesAnterior} className="p-2 rounded-lg hover:bg-neutral-100 transition-colors">
            <ChevronLeft className="w-5 h-5 text-neutral-600" />
          </button>
          <h2 className="text-lg font-bold text-neutral-900">
            {MESES[mesActual]} {añoActual}
          </h2>
          <button onClick={mesSiguiente} className="p-2 rounded-lg hover:bg-neutral-100 transition-colors">
            <ChevronRight className="w-5 h-5 text-neutral-600" />
          </button>
        </div>

        <div className="grid grid-cols-7 border-b border-neutral-200">
          {DIAS_SEMANA.map((dia) => (
            <div key={dia} className="p-2 text-center text-xs font-semibold text-neutral-500 uppercase">
              {dia}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7">
          {diasMes.map((d, idx) => {
            const fechaStr = formatearFecha(d.dia, d.mes, d.año);
            const solicitudesDelDia = solicitudesPorFecha[fechaStr] || [];
            const esHoy = d.dia === new Date().getDate() && d.mes === new Date().getMonth() && d.año === new Date().getFullYear();

            return (
              <div key={idx} className={`min-h-[80px] p-1 border-b border-r border-neutral-100 ${!d.esMesActual ? 'bg-neutral-50' : ''}`}>
                <div className={`text-xs font-medium mb-1 w-6 h-6 flex items-center justify-center rounded-full ${esHoy ? 'bg-neutral-900 text-white' : d.esMesActual ? 'text-neutral-900' : 'text-neutral-400'}`}>
                  {d.dia}
                </div>
                <div className="space-y-0.5">
                  {solicitudesDelDia.slice(0, 2).map((s) => (
                    <div key={s.id} className="text-[10px] bg-blue-100 text-blue-800 px-1 py-0.5 rounded truncate">
                      {s.sucursal_destino_nombre}
                    </div>
                  ))}
                  {solicitudesDelDia.length > 2 && (
                    <div className="text-[10px] text-neutral-500 px-1">
                      +{solicitudesDelDia.length - 2} más
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="bg-white border border-neutral-200 rounded-2xl overflow-hidden">
        <div className="p-4 border-b border-neutral-200">
          <h3 className="font-bold text-neutral-900">Traslados Programados</h3>
        </div>
        <div className="divide-y divide-neutral-100">
          {solicitudesCalendarizadas.length === 0 ? (
            <div className="p-8 text-center">
              <Calendar className="w-12 h-12 text-neutral-300 mx-auto mb-3" />
              <p className="text-neutral-500">No hay traslados calendarizados</p>
            </div>
          ) : (
            solicitudesCalendarizadas.map((s) => (
              <div key={s.id} className="p-4 hover:bg-neutral-50 transition-colors">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-neutral-900">
                        {s.sucursal_nombre} → {s.sucursal_destino_nombre}
                      </span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800">
                        Calendarizada
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-neutral-500">
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3 h-3" />
                        Origen: {s.sucursal_nombre}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {s.fecha_tentativa_despacho
                          ? new Date(s.fecha_tentativa_despacho).toLocaleDateString('es-CL')
                          : 'Sin fecha'}
                      </span>
                    </div>
                    {s.vehiculos.length > 0 && (
                      <p className="text-xs text-neutral-400">
                        Vehículos: {s.vehiculos.map((v) => v.patente).join(', ')}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}