import Link from 'next/link';
import { ArrowRight, Inbox } from 'lucide-react';

/**
 * Contenedor de una acción pendiente del dashboard (R11, R12): título, total,
 * las primeras filas y un acceso "Ver todas" al módulo completo.
 */
interface PanelAccionesProps {
  titulo: string;
  descripcion: string;
  icono: React.ReactNode;
  total: number;
  restantes: number;
  verTodasHref: string;
  textoVacio: string;
  /** Color del acento (borde superior y contador). */
  tono?: 'azul' | 'verde' | 'ambar' | 'rojo' | 'neutro';
  children: React.ReactNode;
}

const TONOS = {
  azul: { borde: 'border-t-blue-500', contador: 'bg-blue-50 text-blue-700' },
  verde: { borde: 'border-t-emerald-500', contador: 'bg-emerald-50 text-emerald-700' },
  ambar: { borde: 'border-t-amber-500', contador: 'bg-amber-50 text-amber-800' },
  rojo: { borde: 'border-t-red-500', contador: 'bg-red-50 text-red-700' },
  neutro: { borde: 'border-t-neutral-400', contador: 'bg-neutral-100 text-neutral-700' },
} as const;

export default function PanelAcciones({
  titulo,
  descripcion,
  icono,
  total,
  restantes,
  verTodasHref,
  textoVacio,
  tono = 'azul',
  children,
}: PanelAccionesProps) {
  const t = TONOS[tono];
  return (
    <section className={`bg-white rounded-2xl border border-neutral-200 border-t-4 ${t.borde} shadow-sm flex flex-col`}>
      <header className="flex items-start gap-3 px-5 pt-4 pb-3 border-b border-neutral-100">
        <div className="w-9 h-9 rounded-xl bg-neutral-50 border border-neutral-200 flex items-center justify-center shrink-0">
          {icono}
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="font-bold text-neutral-900 text-sm">{titulo}</h2>
          <p className="text-xs text-neutral-500">{descripcion}</p>
        </div>
        <span className={`px-2.5 py-1 rounded-full text-xs font-bold tabular-nums ${t.contador}`}>{total}</span>
      </header>

      {total === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center px-5 py-8 text-center text-sm text-neutral-400">
          <Inbox className="w-6 h-6 mb-1 text-neutral-300" />
          {textoVacio}
        </div>
      ) : (
        <ul className="flex-1 divide-y divide-neutral-100">{children}</ul>
      )}

      <footer className="px-5 py-3 border-t border-neutral-100">
        <Link
          href={verTodasHref}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-neutral-900 hover:underline"
        >
          Ver todas{restantes > 0 ? ` (${restantes} más)` : ''} <ArrowRight className="w-4 h-4" />
        </Link>
      </footer>
    </section>
  );
}
