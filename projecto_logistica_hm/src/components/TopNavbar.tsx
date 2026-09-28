import Link from 'next/link';
import Image from 'next/image';
import { ArrowLeft, LogOut, MapPin, LayoutGrid } from 'lucide-react';
import { logoutAction } from '@/app/actions/auth.actions';
import { ROL_LABEL, UserRole } from '@/types/auth.types';

export interface SlotResumen {
  nombre: string | null;
  slots: number | null;
  slots_ocupados: number | null;
}

interface TopNavbarProps {
  nombre: string;
  apellido: string;
  rol: UserRole;
  sucursalNombre?: string | null;
  backHref?: string;
  /** Slots por sucursal para el badge (solo JL / admin) */
  slots?: SlotResumen[] | null;
}

export default function TopNavbar({ nombre, apellido, rol, sucursalNombre, backHref, slots }: TopNavbarProps) {
  const initials = `${nombre.charAt(0)}${apellido.charAt(0)}`.toUpperCase();
  const verSlots = (rol === 'jefe_local' || rol === 'administrador') && slots && slots.length > 0;
  const totalDisponibles =
    verSlots
      ? slots!.reduce((acc, s) => acc + Math.max((s.slots ?? 0) - (s.slots_ocupados ?? 0), 0), 0)
      : 0;

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
          {verSlots && (
            <Link
              href="/logistica/slots"
              title="Slots disponibles de tus sucursales"
              className="group relative hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-neutral-200 bg-neutral-50 text-neutral-700 hover:bg-neutral-100 transition-colors"
            >
              <LayoutGrid className="w-3.5 h-3.5 shrink-0 text-neutral-500" />
              <span className="text-xs font-semibold">{totalDisponibles} libre(s)</span>
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              {/* Dropdown con detalle por sucursal */}
              <span className="absolute right-0 top-full mt-1 hidden group-hover:block bg-white border border-neutral-200 rounded-xl shadow-lg p-2 min-w-[220px] z-40">
                <span className="block px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                  Slots por sucursal
                </span>
                {slots!.map((s) => {
                  const total = s.slots ?? 0;
                  const usados = s.slots_ocupados ?? 0;
                  return (
                    <span key={s.nombre ?? 'slot'} className="flex items-center justify-between gap-4 px-2 py-1 text-xs text-neutral-700">
                      <span className="truncate">{s.nombre}</span>
                      <span className="font-semibold shrink-0">
                        {Math.max(total - usados, 0)}/{total}
                      </span>
                    </span>
                  );
                })}
              </span>
            </Link>
          )}
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
