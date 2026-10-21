'use client';

import { usePathname } from 'next/navigation';
import { HelpCircle } from 'lucide-react';
import { hrefAyuda } from '@/config/faq';

/**
 * Botón flotante de ayuda (fase H). Abre en una pestaña nueva las preguntas
 * frecuentes de la pantalla actual (`/faq?vista=…`) sin perder lo que el
 * usuario estaba haciendo. Lo monta `PageHeader` cuando hay sesión.
 */
export default function BotonAyuda() {
  const pathname = usePathname();
  if (pathname?.startsWith('/faq')) return null;

  return (
    <a
      href={hrefAyuda(pathname)}
      target="_blank"
      rel="noopener noreferrer"
      title="Preguntas frecuentes de esta pantalla (se abre en una pestaña nueva)"
      aria-label="Ayuda: preguntas frecuentes de esta pantalla"
      className="fixed bottom-5 right-5 z-40 inline-flex items-center gap-2 px-4 py-3 rounded-full bg-[#1a2b4b] text-white text-sm font-semibold shadow-lg hover:bg-[#24385f] transition-colors print:hidden"
    >
      <HelpCircle className="w-5 h-5" />
      <span className="hidden sm:inline">Ayuda</span>
    </a>
  );
}
