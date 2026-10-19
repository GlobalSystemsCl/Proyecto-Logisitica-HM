import Link from 'next/link';
import { ArrowRight, Grid2x2 } from 'lucide-react';
import { filaSlots } from '@/lib/slots';
import TablaSlots, { type SlotSucursal } from '@/components/TablaSlots';

interface Props {
  /** Slots de las sucursales asignadas al Jefe de Local (principal + adicionales). */
  sucursales: SlotSucursal[];
  /** Momento de la lectura, ya formateado, para que se sepa qué tan frescos son los datos. */
  actualizado: string;
}

/**
 * Espacios disponibles de las sucursales del Jefe de Local, en el dashboard.
 * Misma tabla que `/logistica/slots`, siempre visible: si no hay sucursales
 * asignadas lo dice en vez de desaparecer.
 */
export default function PanelSlotsJefeLocal({ sucursales, actualizado }: Props) {
  const filas = sucursales.map(filaSlots);
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
            <h2 className="font-bold text-neutral-900 text-sm">Espacios disponibles en tus sucursales</h2>
            <p className="text-xs text-neutral-500">Actualizado {actualizado}</p>
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
          <Link
            href="/logistica/slots"
            className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:underline"
          >
            Ver detalle <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </header>
      <TablaSlots
        filas={filas}
        textoVacio="No tienes sucursales asignadas. Solicita a un Administrador que te asigne una."
      />
    </section>
  );
}
