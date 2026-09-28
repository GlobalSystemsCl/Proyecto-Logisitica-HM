'use client';

import { useMemo, useState } from 'react';
import { LayoutGrid, AlertTriangle, TrendingUp, TrendingDown } from 'lucide-react';

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

export default function SlotsClient({ esAdmin, sucursales }: SlotsClientProps) {
  const [filtro, setFiltro] = useState<'todas' | 'con_capacidad' | 'criticas'>('todas');

  const conDisponibles = useMemo(
    () => sucursales.map((s) => {
      const total = s.slots ?? 0;
      const usados = s.slots_ocupados ?? 0;
      return { ...s, disponibles: Math.max(total - usados, 0), capacidad: total };
    }),
    [sucursales]
  );

  const totalDisponibles = conDisponibles.reduce((acc, s) => acc + s.disponibles, 0);
  const criticas = conDisponibles.filter((s) => s.capacidad > 0 && s.disponibles <= Math.max(Math.ceil(s.capacidad * 0.2), 1));
  const llenas = conDisponibles.filter((s) => s.capacidad === 0 || s.disponibles === 0).length;

  const visibles = conDisponibles.filter((s) => {
    if (filtro === 'con_capacidad') return s.disponibles > 0;
    if (filtro === 'criticas') return s.capacidad > 0 && s.disponibles <= Math.max(Math.ceil(s.capacidad * 0.2), 1);
    return true;
  });

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
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={filtro}
            onChange={(e) => setFiltro(e.target.value as typeof filtro)}
            className="bg-white border border-neutral-300 rounded-xl px-3 py-2 text-sm text-neutral-900 font-medium focus:outline-none focus:ring-2 focus:ring-neutral-900 cursor-pointer"
          >
            <option value="todas">Todas</option>
            <option value="con_capacidad">Con espacio disponible</option>
            <option value="criticas">Críticas (≤20%)</option>
          </select>
        </div>
      </div>

      {/* Metric Cards */}
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
            <p className="text-xs font-medium text-emerald-700 uppercase tracking-wider">Total disponibles</p>
            <p className="text-3xl font-bold text-emerald-900 mt-1">{totalDisponibles}</p>
          </div>
          <div className="w-11 h-11 rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-800">
            <TrendingUp className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-red-50 border border-red-200 rounded-2xl p-5 flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-red-700 uppercase tracking-wider">Críticas / llenas</p>
            <p className="text-3xl font-bold text-red-900 mt-1">{criticas.length + llenas}</p>
          </div>
          <div className="w-11 h-11 rounded-xl bg-red-100 flex items-center justify-center text-red-800">
            <TrendingDown className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Listado */}
      <div className="bg-white border border-neutral-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-200 bg-neutral-50 text-left">
                <th className="px-5 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider">Sucursal</th>
                {esAdmin && (
                  <th className="px-5 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider">Zona</th>
                )}
                <th className="px-5 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider">Capacidad</th>
                <th className="px-5 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider">Ocupados</th>
                <th className="px-5 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider">Reservados</th>
                <th className="px-5 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider">Disponibles</th>
                <th className="px-5 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {visibles.length === 0 ? (
                <tr>
                  <td colSpan={esAdmin ? 7 : 6} className="px-5 py-10 text-center text-neutral-400 text-sm">
                    No hay sucursales para mostrar.
                  </td>
                </tr>
              ) : (
                visibles.map((s) => {
                  const pct = s.capacidad > 0 ? Math.round((s.slots_ocupados ?? 0) / s.capacidad * 100) : 0;
                  const critica = s.capacidad > 0 && s.disponibles <= Math.max(Math.ceil(s.capacidad * 0.2), 1);
                  const llena = s.disponibles === 0;
                  return (
                    <tr key={s.id} className="hover:bg-neutral-50 transition-colors">
                      <td className="px-5 py-3 font-semibold text-neutral-900">{s.nombre ?? `#${s.id}`}</td>
                      {esAdmin && <td className="px-5 py-3 text-neutral-500">{s.zona_nombre ?? '—'}</td>}
                      <td className="px-5 py-3 text-neutral-700">{s.capacidad}</td>
                      <td className="px-5 py-3 text-neutral-700">{s.slots_ocupados ?? 0}</td>
                      <td className="px-5 py-3 text-neutral-700">{s.slots_reservados ?? 0}</td>
                      <td className="px-5 py-3">
                        <span className={`font-bold ${llena ? 'text-red-600' : critica ? 'text-amber-600' : 'text-emerald-600'}`}>
                          {s.disponibles}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2 min-w-[120px]">
                          <div className="flex-1 h-2 rounded-full bg-neutral-100 overflow-hidden">
                            <div
                              className={`h-full rounded-full ${llena ? 'bg-red-500' : critica ? 'bg-amber-500' : 'bg-emerald-500'}`}
                              style={{ width: `${Math.min(pct, 100)}%` }}
                            />
                          </div>
                          {critica && <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
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