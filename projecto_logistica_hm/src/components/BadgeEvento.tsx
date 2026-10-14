import { PartyPopper } from 'lucide-react';

const TAMANOS = {
  sm: 'gap-1 px-2 py-0.5 text-[10px] rounded-md',
  md: 'gap-1.5 px-2.5 py-1 text-xs rounded-lg',
  lg: 'gap-2 px-3.5 py-1.5 text-sm rounded-xl',
} as const;

const ICONO = { sm: 'w-3 h-3', md: 'w-3.5 h-3.5', lg: 'w-4 h-4' } as const;

/**
 * Distintivo destacado para las solicitudes de tipo evento: se ve a primera
 * vista y las separa de los traslados entre sucursales.
 */
export default function BadgeEvento({ tamano = 'md' }: { tamano?: keyof typeof TAMANOS }) {
  return (
    <span
      className={`inline-flex items-center font-extrabold uppercase tracking-wider bg-fuchsia-600 text-white border border-fuchsia-700 shadow-sm ${TAMANOS[tamano]}`}
    >
      <PartyPopper className={ICONO[tamano]} />
      Evento
    </span>
  );
}
