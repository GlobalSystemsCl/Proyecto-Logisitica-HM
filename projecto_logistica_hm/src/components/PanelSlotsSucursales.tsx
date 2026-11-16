import Link from 'next/link';
import { ArrowRight, Grid2x2 } from 'lucide-react';
import { filaSlots, ordenarPorOcupacion } from '@/lib/slots';
import { recortar } from '@/lib/panel';
import TablaSlots, { type SlotSucursal } from '@/components/TablaSlots';

interface Props {
  sucursales: SlotSucursal[];
  titulo: string;
  /** Muestra la columna de zona (vista de todas las sucursales). */
  conZona?: boolean;
  textoVacio: string;
  /** Momento de la lectura, ya formateado, para que se sepa qué tan frescos son los datos. */
  actualizado: string;
  /**
   * Muestra solo las N sucursales con más slots ocupados y un "Ver todas" al
   * pie (dashboard de Logística). Sin límite, muestra todas en su orden.
   */
  limite?: number;
}

/**
 * Espacios disponibles por sucursal, en el dashboard: las asignadas para el
 * Jefe de Local y, para Logística, un resumen de las más ocupadas. Misma tabla
 * que `/logistica/slots`, siempre visible: si no hay sucursales lo dice en vez
 * de desaparecer. Los totales del encabezado cuentan todas las sucursales.
 */
export default function PanelSlotsSucursales({ sucursales, titulo, conZona = false, textoVacio, actualizado, limite }: Props) {
  const filas = sucursales.map(filaSlots);
  const recorte = limite === undefined ? null : recortar(ordenarPorOcupacion(filas), limite);
  const visibles = recorte ? recorte.items : filas;
  const libres = filas.reduce((acc, s) => acc + s.libres, 0);
  const extraLibres = filas.reduce((acc, s) => acc + s.extraLibres, 0);
  const enAlerta = filas.filter((s) => s.estado === 'usando_extra' || s.estado === 'excedido').length;

  return (
    <section className="bg-white rounded-2xl border border-neutral-200 border-t-4 border-t-emerald-500 shadow-sm overflow-hidden">
      <header className="flex flex-col sm:flex-row sm:items-center gap-3 px-5 pt-4 pb-3 border-b border-neutral-100">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-neutral-50 border border-neutral-200 flex items-center justify-center shrink-0">
            <Grid2x2 className="w-5 h-5 text-emerald-600" />
          </div>
          <div className="min-w-0">
            <h2 className="font-bold text-neutral-900 text-sm">{titulo}</h2>
            <p className="text-xs text-neutral-500">
              {recorte && recorte.total > 0
                ? `Las ${recorte.items.length} con más slots ocupados de ${recorte.total} · `
                : ''}
              Actualizado {actualizado}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="px-2.5 py-1 rounded-full text-xs font-bold tabular-nums bg-emerald-50 text-emerald-700">
            {libres} libres + {extraLibres} extra
          </span>
          {enAlerta > 0 && (
            <span className="px-2.5 py-1 rounded-full text-xs font-bold tabular-nums bg-red-50 text-red-700">
              {enAlerta} {enAlerta === 1 ? 'sucursal' : 'sucursales'} en alerta
            </span>
          )}
          {!recorte && (
            <Link
              href="/logistica/slots"
              className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:underline"
            >
              Ver detalle <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          )}
        </div>
      </header>
      <TablaSlots filas={visibles} conZona={conZona} textoVacio={textoVacio} />
      {recorte && (
        <footer className="px-5 py-3 border-t border-neutral-100">
          <Link
            href="/logistica/slots"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-neutral-900 hover:underline"
          >
            Ver todas{recorte.restantes > 0 ? ` (${recorte.restantes} más)` : ''} <ArrowRight className="w-4 h-4" />
          </Link>
        </footer>
      )}
    </section>
  );
}
