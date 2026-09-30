'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { LayoutGrid } from 'lucide-react';
import {
  resumenSlots,
  slotsLibres,
  textoSlots,
  type SlotSucursalResumen,
} from '@/lib/slots';

/** Milisegundos mínimos entre refrescos automáticos al recuperar el foco. */
export const INTERVALO_REFRESCO_MS = 15000;

interface SlotsResumenProps {
  sucursales: SlotSucursalResumen[];
}

const COLOR_CRITICIDAD = {
  ok: 'bg-emerald-500',
  atencion: 'bg-amber-500',
  critico: 'bg-red-500',
} as const;

/**
 * Indicador de slots libres de las sucursales del usuario, para el encabezado.
 *
 * Los slots los modifican triggers de la base de datos, así que un cambio hecho
 * por **otro usuario** no llega por Server Action: se refresca al volver a la
 * pestaña (`focus` / `visibilitychange`) con un throttle para no generar una
 * petición en cada interacción. El cálculo de "libres" viene de `@/lib/slots`
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

  const punto = COLOR_CRITICIDAD[resumen.criticidad];

  return (
    <div className="relative group/slots hidden sm:block">
      <Link
        href="/logistica/slots"
        title={`${resumen.libres} de ${resumen.total} slots libres`}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-neutral-200 bg-neutral-50 text-neutral-700 hover:bg-neutral-100 transition-colors"
      >
        <LayoutGrid className="w-4 h-4 shrink-0 text-neutral-500" />
        <span className="text-sm font-semibold tabular-nums">
          {resumen.libres} libre{resumen.libres === 1 ? '' : 's'}
        </span>
        <span className={`w-2 h-2 rounded-full shrink-0 ${punto}`} />
      </Link>

      <div className="invisible absolute right-0 top-full mt-1 z-40 w-64 rounded-xl border border-neutral-200 bg-white p-3 shadow-lg opacity-0 transition-opacity group-hover/slots:visible group-hover/slots:opacity-100 group-focus-within/slots:visible group-focus-within/slots:opacity-100">
        <p className="px-2 py-1 text-[11px] font-bold uppercase tracking-wider text-neutral-400">
          Slots por sucursal
        </p>
        <ul className="max-h-64 overflow-y-auto">
          {sucursales.map((sucursal, i) => (
            <li
              key={`${sucursal.nombre ?? 'sucursal'}-${i}`}
              className="flex items-center justify-between gap-3 px-2 py-1 text-sm text-neutral-700"
            >
              <span className="truncate" title={sucursal.nombre ?? undefined}>
                {sucursal.nombre ?? 'Sucursal sin nombre'}
              </span>
              <span
                className={`shrink-0 font-semibold tabular-nums ${
                  slotsLibres(sucursal) === 0 ? 'text-red-600' : ''
                }`}
              >
                {textoSlots(sucursal)}
              </span>
            </li>
          ))}
        </ul>
        {resumen.sucursalesCriticas.length > 0 && (
          <p className="mt-2 border-t border-neutral-100 px-2 pt-2 text-xs font-medium text-red-700">
            Sin disponibilidad: {resumen.sucursalesCriticas.join(', ')}
          </p>
        )}
      </div>
    </div>
  );
}