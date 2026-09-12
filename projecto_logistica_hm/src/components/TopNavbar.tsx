import Link from 'next/link';
import Image from 'next/image';
import { ArrowLeft, LogOut, MapPin } from 'lucide-react';
import { logoutAction } from '@/app/actions/auth.actions';
import { ROL_LABEL, UserRole } from '@/types/auth.types';

interface TopNavbarProps {
  nombre: string;
  apellido: string;
  rol: UserRole;
  sucursalNombre?: string | null;
  backHref?: string;
}

export default function TopNavbar({ nombre, apellido, rol, sucursalNombre, backHref }: TopNavbarProps) {
  const initials = `${nombre.charAt(0)}${apellido.charAt(0)}`.toUpperCase();

  return (
    <header className="border-b border-neutral-200 bg-white sticky top-0 z-30">
      <div className="w-full px-4 sm:px-8 lg:px-12 h-16 flex items-center justify-between gap-3 sm:gap-4">
        <div className="flex items-center gap-3 min-w-0">
          {backHref && (
            <Link
              href={backHref}
              className="p-2 rounded-xl text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100 transition-colors shrink-0"
              title="Volver"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
          )}
          <Link href="/" className="flex items-center gap-2.5 shrink-0" title="H.Motores">
            <Image
              src="/images.png"
              alt="Escudo H.Motores"
              width={40}
              height={40}
              priority
              className="h-9 w-auto mix-blend-multiply"
            />
            <span className="hidden lg:block text-lg font-bold tracking-tight text-neutral-900">
              H.Motores
            </span>
          </Link>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-neutral-50 border border-neutral-200 text-neutral-600">
            <MapPin className="w-3.5 h-3.5 shrink-0" />
            <span className="text-xs font-medium">{sucursalNombre || 'Sin sucursal'}</span>
          </div>
          <Link
            href="/perfil"
            className="flex items-center gap-2.5 pl-1 pr-2 py-1 rounded-xl hover:bg-neutral-50 transition-colors group"
            title="Ver mi perfil"
          >
            <div className="w-9 h-9 rounded-full bg-[#1a2b4b] text-white text-xs font-bold flex items-center justify-center shrink-0">
              {initials}
            </div>
            <div className="hidden sm:block text-left">
              <p className="text-sm font-semibold text-neutral-900 leading-tight">
                {nombre} {apellido}
              </p>
              <p className="text-xs text-neutral-500 leading-tight">
                {ROL_LABEL[rol]}
              </p>
            </div>
          </Link>

          <form action={logoutAction} className="hidden md:block">
            <button
              type="submit"
              className="p-2 rounded-full text-neutral-400 hover:text-red-500 hover:bg-neutral-100 transition-colors"
              title="Cerrar Sesión"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
