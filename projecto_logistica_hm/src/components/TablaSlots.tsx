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

/** Barra de uso y etiqueta de estado: la comparten la tabla y las tarjetas móviles. */
function BarraEstado({ fila, className = '' }: { fila: FilaSlots<SlotSucursal>; className?: string }) {
  const color = COLOR_ESTADO_SLOTS[fila.estado];
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className="flex-1 h-2 rounded-full bg-neutral-100 overflow-hidden">
        <div className={`h-full rounded-full ${color.barra}`} style={{ width: `${Math.min(fila.porcentajeUso, 100)}%` }} />
      </div>
      <span className={`px-2 py-0.5 rounded-md border text-[11px] font-semibold whitespace-nowrap ${color.chip}`}>
        {ETIQUETA_ESTADO_CAPACIDAD[fila.estado]}
      </span>
      {fila.estado === 'excedido' && <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0" />}
    </div>
  );
}

/**
 * Tabla de slots por sucursal. La comparten `/logistica/slots` y el panel del
 * Jefe de Local en el dashboard, para que ambas se vean igual.
 */
export default function TablaSlots({ filas, conZona = false, textoVacio = 'No hay sucursales para mostrar.' }: TablaSlotsProps) {
  const porcentajeExtra = Math.round(PORCENTAJE_SLOTS_EXTRA * 100);
  return (
    <>
    {/* Tarjetas (móvil y tablet): la tabla de 8 columnas no cabe */}
    {filas.length === 0 ? (
      <p className="lg:hidden px-5 py-10 text-center text-neutral-400 text-sm">{textoVacio}</p>
    ) : (
      <ul className="lg:hidden divide-y divide-neutral-100">
        {filas.map((s) => {
          const color = COLOR_ESTADO_SLOTS[s.estado];
          return (
            <li key={s.id} className="px-5 py-4 space-y-2.5">
              <div className="flex items-baseline justify-between gap-3">
                <p className="font-semibold text-neutral-900 min-w-0 break-words">{s.nombre ?? `#${s.id}`}</p>
                {conZona && <span className="shrink-0 text-xs text-neutral-500">{s.zona_nombre ?? 'Sin zona'}</span>}
              </div>
              <BarraEstado fila={s} />
              <dl className="grid grid-cols-3 gap-x-3 gap-y-2 text-xs">
                <div><dt className="text-neutral-400">Capacidad</dt><dd className="text-neutral-800">{s.real}</dd></div>
                <div><dt className="text-neutral-400">Extra ({porcentajeExtra}%)</dt><dd className="text-neutral-800">{s.extra}</dd></div>
                <div>
                  <dt className="text-neutral-400">Libres</dt>
                  <dd><span className={`font-bold ${color.texto}`}>{s.libres}</span> <span className="text-neutral-500">+ {s.extraLibres}</span></dd>
                </div>
                <div><dt className="text-neutral-400">Ocupados</dt><dd className="text-neutral-800">{s.slots_ocupados ?? 0}</dd></div>
                <div><dt className="text-neutral-400">Reservados</dt><dd className="text-neutral-800">{s.slots_reservados ?? 0}</dd></div>
              </dl>
            </li>
          );
        })}
      </ul>
    )}
    <div className="hidden lg:block overflow-x-auto">
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
                    <BarraEstado fila={s} className="min-w-[180px]" />
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
    </>
  );
}
