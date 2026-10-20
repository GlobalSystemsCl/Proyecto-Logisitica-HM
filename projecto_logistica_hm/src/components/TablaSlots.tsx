import { AlertTriangle } from 'lucide-react';
import { ETIQUETA_ESTADO_CAPACIDAD, PORCENTAJE_SLOTS_EXTRA, type EstadoCapacidad, type FilaSlots } from '@/lib/slots';

export interface SlotSucursal {
  id: number;
  nombre: string | null;
  zona_nombre?: string | null;
  slots: number | null;
  slots_ocupados: number | null;
  slots_reservados: number | null;
}

export const COLOR_ESTADO_SLOTS: Record<EstadoCapacidad, { texto: string; barra: string; chip: string }> = {
  disponible: { texto: 'text-emerald-600', barra: 'bg-emerald-500', chip: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  usando_extra: { texto: 'text-amber-600', barra: 'bg-amber-500', chip: 'bg-amber-50 text-amber-800 border-amber-200' },
  excedido: { texto: 'text-red-600', barra: 'bg-red-500', chip: 'bg-red-50 text-red-700 border-red-200' },
  sin_capacidad: { texto: 'text-neutral-400', barra: 'bg-neutral-300', chip: 'bg-neutral-50 text-neutral-500 border-neutral-200' },
};

interface TablaSlotsProps {
  filas: FilaSlots<SlotSucursal>[];
  /** Muestra la columna de zona (vista global del administrador). */
  conZona?: boolean;
  textoVacio?: string;
}

/**
 * Tabla de slots por sucursal. La comparten `/logistica/slots` y el panel del
 * Jefe de Local en el dashboard, para que ambas se vean igual.
 */
export default function TablaSlots({ filas, conZona = false, textoVacio = 'No hay sucursales para mostrar.' }: TablaSlotsProps) {
  const porcentajeExtra = Math.round(PORCENTAJE_SLOTS_EXTRA * 100);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-neutral-200 bg-neutral-50 text-left">
            <th className="px-5 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider">Sucursal</th>
            {conZona && <th className="px-5 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider">Zona</th>}
            <th className="px-5 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider">Capacidad real</th>
            <th className="px-5 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider">Extra ({porcentajeExtra}%)</th>
            <th className="px-5 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider">Ocupados</th>
            <th className="px-5 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider">Reservados</th>
            <th className="px-5 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider">Libres</th>
            <th className="px-5 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider">Estado</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-100">
          {filas.length === 0 ? (
            <tr>
              <td colSpan={conZona ? 8 : 7} className="px-5 py-10 text-center text-neutral-400 text-sm">
                {textoVacio}
              </td>
            </tr>
          ) : (
            filas.map((s) => {
              const color = COLOR_ESTADO_SLOTS[s.estado];
              return (
                <tr key={s.id} className="hover:bg-neutral-50 transition-colors">
                  <td className="px-5 py-3 font-semibold text-neutral-900">{s.nombre ?? `#${s.id}`}</td>
                  {conZona && <td className="px-5 py-3 text-neutral-500">{s.zona_nombre ?? '—'}</td>}
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
                        <div className={`h-full rounded-full ${color.barra}`} style={{ width: `${Math.min(s.porcentajeUso, 100)}%` }} />
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
  );
}
