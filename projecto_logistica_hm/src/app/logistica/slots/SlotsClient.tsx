'use client';

import { useMemo, useState } from 'react';
import { LayoutGrid, TrendingUp, TrendingDown } from 'lucide-react';
import { PORCENTAJE_SLOTS_EXTRA, filaSlots, type EstadoCapacidad } from '@/lib/slots';
import TablaSlots, { type SlotSucursal } from '@/components/TablaSlots';

interface SlotsClientProps {
  /** Todas las sucursales (administrador y logística) en vez de solo las asignadas. */
  vistaGlobal: boolean;
  sucursales: SlotSucursal[];
}

/**
 * Slots por sucursal. R5: además de la capacidad real se muestra un 20 % de
 * slots extra (acera, espacios no oficiales). Superarlos solo genera aviso.
 * Todos los cálculos vienen de `@/lib/slots`, igual que el indicador del
 * encabezado, para que no puedan discrepar.
 */
export default function SlotsClient({ vistaGlobal, sucursales }: SlotsClientProps) {
  const [filtro, setFiltro] = useState<'todas' | EstadoCapacidad>('todas');

  const filas = useMemo(() => sucursales.map(filaSlots), [sucursales]);

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
            {vistaGlobal
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
        <TablaSlots filas={visibles} conZona={vistaGlobal} />
      </div>
    </div>
  );
}
