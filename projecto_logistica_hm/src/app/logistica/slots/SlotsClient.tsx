'use client';

import { useMemo, useState } from 'react';
import { LayoutGrid, AlertTriangle, TrendingUp, TrendingDown } from 'lucide-react';
import {
  ETIQUETA_ESTADO_CAPACIDAD,
  PORCENTAJE_SLOTS_EXTRA,
  capacidadExtra,
  estadoCapacidad,
  extraLibres,
  slotsLibres,
  usoSlots,
  type EstadoCapacidad,
} from '@/lib/slots';

interface SlotSucursal {
  id: number;
  nombre: string | null;
  zona_nombre?: string | null;
  slots: number | null;
  slots_ocupados: number | null;
  slots_reservados: number | null;
}

interface SlotsClientProps {
  esAdmin: boolean;
  sucursales: SlotSucursal[];
}

const COLOR_ESTADO: Record<EstadoCapacidad, { texto: string; barra: string; chip: string }> = {
  disponible: { texto: 'text-emerald-600', barra: 'bg-emerald-500', chip: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  usando_extra: { texto: 'text-amber-600', barra: 'bg-amber-500', chip: 'bg-amber-50 text-amber-800 border-amber-200' },
  excedido: { texto: 'text-red-600', barra: 'bg-red-500', chip: 'bg-red-50 text-red-700 border-red-200' },
  sin_capacidad: { texto: 'text-neutral-400', barra: 'bg-neutral-300', chip: 'bg-neutral-50 text-neutral-500 border-neutral-200' },
};

/**
 * Slots por sucursal. R5: además de la capacidad real se muestra un 20 % de
 * slots extra (acera, espacios no oficiales). Superarlos solo genera aviso.
 * Todos los cálculos vienen de `@/lib/slots`, igual que el indicador del
 * encabezado, para que no puedan discrepar.
 */
export default function SlotsClient({ esAdmin, sucursales }: SlotsClientProps) {
  const [filtro, setFiltro] = useState<'todas' | EstadoCapacidad>('todas');

  const filas = useMemo(
    () =>
      sucursales.map((s) => ({
        ...s,
        real: s.slots ?? 0,
        extra: capacidadExtra(s),
        uso: usoSlots(s),
        libres: slotsLibres(s),
        extraLibres: extraLibres(s),
        estado: estadoCapacidad(s),
      })),
    [sucursales]
  );

  const totalLibres = filas.reduce((acc, s) => acc + s.libres, 0);
  const totalExtraLibres = filas.reduce((acc, s) => acc + s.extraLibres, 0);
  const enAlerta = filas.filter((s) => s.estado === 'usando_extra' || s.estado === 'excedido').length;
  const visibles = filas.filter((s) => filtro === 'todas' || s.estado === filtro);
  const porcentajeExtra = Math.round(PORCENTAJE_SLOTS_EXTRA * 100);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 flex items-center gap-2">
            <LayoutGrid className="w-6 h-6" />
            Slots por Sucursal
          </h1>
          <p className="text-sm text-neutral-500 mt-1">
            {esAdmin
              ? 'Vista global de capacidad de todas las sucursales'
              : 'Capacidad de tus sucursales asignadas (principal + adicionales)'}
            . Cada sucursal suma un {porcentajeExtra}% de slots extra para estacionar fuera de los slots oficiales.
          </p>
        </div>
        <select
          value={filtro}
          onChange={(e) => setFiltro(e.target.value as typeof filtro)}
          className="bg-white border border-neutral-300 rounded-xl px-3 py-2 text-sm text-neutral-900 font-medium focus:outline-none focus:ring-2 focus:ring-neutral-900 cursor-pointer"
        >
          <option value="todas">Todas</option>
          <option value="disponible">Con slots reales libres</option>
          <option value="usando_extra">Usando slots extra</option>
          <option value="excedido">Capacidad excedida</option>
        </select>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-neutral-200 rounded-2xl p-5 flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-neutral-500 uppercase tracking-wider">Sucursales</p>
            <p className="text-3xl font-bold text-neutral-900 mt-1">{sucursales.length}</p>
          </div>
          <div className="w-11 h-11 rounded-xl border border-neutral-300 flex items-center justify-center text-neutral-900">
            <LayoutGrid className="w-5 h-5" />
          </div>
        </div>
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5 flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-emerald-700 uppercase tracking-wider">Libres (reales + extra)</p>
            <p className="text-3xl font-bold text-emerald-900 mt-1">
              {totalLibres}
              <span className="text-base font-semibold text-emerald-700"> + {totalExtraLibres} extra</span>
            </p>
          </div>
          <div className="w-11 h-11 rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-800">
            <TrendingUp className="w-5 h-5" />
          </div>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-2xl p-5 flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-red-700 uppercase tracking-wider">Usando extra / excedidas</p>
            <p className="text-3xl font-bold text-red-900 mt-1">{enAlerta}</p>
          </div>
          <div className="w-11 h-11 rounded-xl bg-red-100 flex items-center justify-center text-red-800">
            <TrendingDown className="w-5 h-5" />
          </div>
        </div>
      </div>

      <div className="bg-white border border-neutral-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-200 bg-neutral-50 text-left">
                <th className="px-5 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider">Sucursal</th>
                {esAdmin && <th className="px-5 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider">Zona</th>}
                <th className="px-5 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider">Capacidad real</th>
                <th className="px-5 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider">Extra ({porcentajeExtra}%)</th>
                <th className="px-5 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider">Ocupados</th>
                <th className="px-5 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider">Reservados</th>
                <th className="px-5 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider">Libres</th>
                <th className="px-5 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {visibles.length === 0 ? (
                <tr>
                  <td colSpan={esAdmin ? 8 : 7} className="px-5 py-10 text-center text-neutral-400 text-sm">
                    No hay sucursales para mostrar.
                  </td>
                </tr>
              ) : (
                visibles.map((s) => {
                  const total = s.real + s.extra;
                  const pct = total > 0 ? Math.round((s.uso / total) * 100) : 0;
                  const color = COLOR_ESTADO[s.estado];
                  return (
                    <tr key={s.id} className="hover:bg-neutral-50 transition-colors">
                      <td className="px-5 py-3 font-semibold text-neutral-900">{s.nombre ?? `#${s.id}`}</td>
                      {esAdmin && <td className="px-5 py-3 text-neutral-500">{s.zona_nombre ?? '—'}</td>}
                      <td className="px-5 py-3 text-neutral-700">{s.real}</td>
                      <td className="px-5 py-3 text-neutral-700">{s.extra}</td>
                      <td className="px-5 py-3 text-neutral-700">{s.slots_ocupados ?? 0}</td>
                      <td className="px-5 py-3 text-neutral-700">{s.slots_reservados ?? 0}</td>
                      <td className="px-5 py-3">
                        <span className={`font-bold ${color.texto}`}>{s.libres}</span>
                        <span className="text-xs text-neutral-500"> + {s.extraLibres} extra</span>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2 min-w-[180px]">
                          <div className="flex-1 h-2 rounded-full bg-neutral-100 overflow-hidden">
                            <div className={`h-full rounded-full ${color.barra}`} style={{ width: `${Math.min(pct, 100)}%` }} />
                          </div>
                          <span className={`px-2 py-0.5 rounded-md border text-[11px] font-semibold whitespace-nowrap ${color.chip}`}>
                            {ETIQUETA_ESTADO_CAPACIDAD[s.estado]}
                          </span>
                          {s.estado === 'excedido' && <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0" />}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
