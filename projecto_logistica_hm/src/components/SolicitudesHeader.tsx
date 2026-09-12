import Link from 'next/link';
import TopNavbar from './TopNavbar';
import { UserRole } from '@/types/auth.types';

interface SolicitudesHeaderProps {
  title: string;
  nombre: string;
  apellido: string;
  rol: UserRole;
  sucursalNombre?: string | null;
  tabs: Array<{ href: string; label: string; active: boolean }>;
}

export default function SolicitudesHeader({
  nombre,
  apellido,
  rol,
  sucursalNombre,
  tabs,
}: SolicitudesHeaderProps) {
  return (
    <div className="sticky top-0 z-30">
      <TopNavbar
        nombre={nombre}
        apellido={apellido}
        rol={rol}
        sucursalNombre={sucursalNombre}
        backHref="/dashboard"
      />
      <div className="border-b border-neutral-200 bg-white">
        <div className="w-full px-4 sm:px-8 lg:px-12 pb-3">
          <div className="bg-neutral-900 rounded-lg p-1.5 flex gap-1 overflow-x-auto">
            {tabs.map((t) => (
              <Link
                key={t.href}
                href={t.href}
                className={`px-3 py-1.5 rounded-md text-sm font-medium whitespace-nowrap transition-colors ${
                  t.active
                    ? 'bg-white text-neutral-900'
                    : 'text-neutral-300 hover:bg-neutral-800 hover:text-white'
                }`}
              >
                {t.label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
