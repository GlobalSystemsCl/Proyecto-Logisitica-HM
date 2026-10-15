'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AlertTriangle, LayoutGrid } from 'lucide-react';
import {
  estadoCapacidad,
  resumenSlots,
  usoSlots,
  type EstadoCapacidad,
  type SlotSucursalResumen,
} from '@/lib/slots';

/** Milisegundos mínimos entre refrescos automáticos al recuperar el foco. */
export const INTERVALO_REFRESCO_MS = 15000;

interface SlotsResumenProps {
  sucursales: SlotSucursalResumen[];
}

const ETIQUETA_ESTADO: Record<EstadoCapacidad, string> = {
  disponible: 'con slots libres',
  usando_extra: 'usando slots extra',
  excedido: 'capacidad excedida',
  sin_capacidad: 'sin capacidad declarada',
};

/**
 * Indicador de slots en uso sobre la capacidad de las sucursales del usuario
 * (2/2 lleno, 14/2 excedido), para el encabezado.
 *
 * Los slots los modifican triggers de la base de datos, así que un cambio hecho
 * por **otro usuario** no llega por Server Action: se refresca al volver a la
 * pestaña (`focus` / `visibilitychange`) con un throttle para no generar una
 * petición en cada interacción. Los cálculos vienen de `@/lib/slots`
 * para que este indicador no pueda discrepar de `/logistica/slots`.
 */
export default function SlotsResumen({ sucursales }: SlotsResumenProps) {
  const router = useRouter();
  const ultimoRefresco = useRef<number>(0);

  useEffect(() => {
    function refrescar() {
      if (document.visibilityState === 'hidden') return;
      const ahora = Date.now();
      if (ahora - ultimoRefresco.current < INTERVALO_REFRESCO_MS) return;
      ultimoRefresco.current = ahora;
      router.refresh();
    }

    window.addEventListener('focus', refrescar);
    document.addEventListener('visibilitychange', refrescar);
    return () => {
      window.removeEventListener('focus', refrescar);
      document.removeEventListener('visibilitychange', refrescar);
    };
  }, [router]);

  const resumen = resumenSlots(sucursales);
  if (resumen.total === 0) return null;

  // Uso sobre capacidad, igual que /logistica/slots: 2/2 lleno, 14/2 excedido.
  const uso = resumen.ocupados;
  const excedido = uso > resumen.total;
  const lleno = !excedido && uso >= resumen.total;
  const estilo = excedido
    ? 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100'
    : lleno
      ? 'border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100'
      : 'border-neutral-200 bg-neutral-50 text-neutral-700 hover:bg-neutral-100';
  const titulo = excedido
    ? `Capacidad excedida: ${uso} en uso para ${resumen.total} slots (${uso - resumen.total} de más)`
    : `${uso} de ${resumen.total} slots en uso`;

  return (
    <div className="relative group/slots hidden sm:block">
      <Link
        href="/logistica/slots"
        title={titulo}
        aria-label={titulo}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-colors ${estilo}`}
      >
        {excedido ? (
          <AlertTriangle className="w-4 h-4 shrink-0" />
        ) : (
          <LayoutGrid className="w-4 h-4 shrink-0 opacity-70" />
        )}
        <span className="text-sm font-semibold tabular-nums">
          {uso}/{resumen.total}
        </span>
        <span className="text-xs font-medium opacity-70">slots</span>
      </Link>

      <div className="invisible absolute right-0 top-full mt-1 z-40 w-72 rounded-xl border border-neutral-200 bg-white p-3 shadow-lg opacity-0 transition-opacity group-hover/slots:visible group-hover/slots:opacity-100 group-focus-within/slots:visible group-focus-within/slots:opacity-100">
        {excedido && (
          <div className="mb-2 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-2.5 py-2 text-xs font-medium text-red-800">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              Espacio sobrepasado: hay {uso} vehículos en uso o reservados para {resumen.total} slots
              ({uso - resumen.total} de más).
            </span>
          </div>
        )}
        <p className="px-2 py-1 text-[11px] font-bold uppercase tracking-wider text-neutral-400">
          En uso / capacidad por sucursal
        </p>
        <ul className="max-h-64 overflow-y-auto">
          {sucursales.map((sucursal, i) => {
            const usoSucursal = usoSlots(sucursal);
            const capacidad = sucursal.slots ?? 0;
            const estado = estadoCapacidad(sucursal);
            const sobre = usoSucursal > capacidad;
            const color =
              estado === 'excedido' || sobre
                ? 'text-red-600'
                : estado === 'usando_extra'
                  ? 'text-amber-700'
                  : 'text-neutral-900';
            return (
              <li
                key={`${sucursal.nombre ?? 'sucursal'}-${i}`}
                title={
                  sobre
                    ? `${sucursal.nombre ?? 'Sucursal'}: ${usoSucursal - capacidad} sobre la capacidad (${ETIQUETA_ESTADO[estado]})`
                    : `${sucursal.nombre ?? 'Sucursal'}: ${ETIQUETA_ESTADO[estado]}`
                }
                className="flex items-center justify-between gap-3 px-2 py-1 text-sm text-neutral-700"
              >
                <span className="truncate">{sucursal.nombre ?? 'Sucursal sin nombre'}</span>
                <span className={`shrink-0 font-semibold tabular-nums ${color}`}>
                  {usoSucursal}/{capacidad}
                  {sobre && <span className="ml-1 text-[10px] font-bold uppercase">excedido</span>}
                </span>
              </li>
            );
          })}
        </ul>
        <p className="mt-2 border-t border-neutral-100 px-2 pt-2 text-[11px] text-neutral-500">
          En uso = ocupados + reservados. Cada sucursal admite un 20% extra fuera de los slots oficiales.
        </p>
      </div>
    </div>
  );
}