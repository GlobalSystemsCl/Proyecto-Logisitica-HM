'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { getSolicitudesTabs, tabSolicitudesDePath } from '@/lib/solicitudes-tabs';
import { UserRole } from '@/types/auth.types';

interface SolicitudesTabBarProps {
  rol: UserRole;
}

export default function SolicitudesTabBar({ rol }: SolicitudesTabBarProps) {
  const pathname = usePathname();
  const tabs = getSolicitudesTabs(rol, tabSolicitudesDePath(pathname));

  return (
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
  );
}