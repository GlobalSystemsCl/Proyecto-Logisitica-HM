import Link from 'next/link';
import Image from 'next/image';
import { ArrowLeft, LogOut } from 'lucide-react';
import { logoutAction } from '@/app/actions/auth.actions';

interface SolicitudesHeaderProps {
  title: string;
  nombre: string;
  apellido: string;
  rol: string;
  tabs: Array<{ href: string; label: string; active: boolean }>;
}

export default function SolicitudesHeader({
  title,
  nombre,
  apellido,
  rol,
  tabs,
}: SolicitudesHeaderProps) {
  return (
    <header className="border-b border-neutral-200 bg-white backdrop-blur-md sticky top-0 z-30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            href="/dashboard"
            className="p-2 rounded-xl text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100 transition-colors"
            title="Volver al Panel Principal"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="flex items-center gap-2.5">
            <Image
              src="/images.png"
              alt="Escudo H.Motores"
              width={36}
              height={36}
              className="h-9 w-auto mix-blend-multiply"
            />
            <div>
              <span className="font-bold text-neutral-900 tracking-tight">H.Motores</span>
              <span className="text-xs text-neutral-500 block -mt-1 font-mono">{title}</span>
            </div>
          </div>
        </div>

        <div className="hidden sm:block text-right">
          <p className="text-xs font-semibold text-neutral-900">
            {nombre} {apellido}
          </p>
          <p className="text-[10px] text-neutral-500 uppercase font-mono tracking-wider">{rol}</p>
        </div>
        <form action={logoutAction}>
          <button
            type="submit"
            className="p-2 rounded-xl text-neutral-500 hover:text-red-600 hover:bg-neutral-100 transition-colors cursor-pointer"
            title="Cerrar Sesión"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </form>
      </div>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-3 border-t border-neutral-100">
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
    </header>
  );
}
