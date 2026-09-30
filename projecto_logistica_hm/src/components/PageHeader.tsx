import Link from 'next/link';
import Image from 'next/image';
import { ArrowLeft, LogOut, MapPin } from 'lucide-react';
import { logoutAction } from '@/app/actions/auth.actions';
import { ROL_LABEL, UserRole } from '@/types/auth.types';
import SlotsResumen from '@/components/SlotsResumen';
import type { SlotSucursalResumen } from '@/lib/slots';

interface PageHeaderProps {
  nombre?: string | null;
  apellido?: string | null;
  rol?: UserRole | null;
  sucursalNombre?: string | null;
  /** Ruta de retorno. Por defecto el logo ya lleva a `/dashboard`. */
  backHref?: string;
  titulo?: string;
  descripcion?: string;
  /** Slots de las sucursales del usuario (solo jefe_local / administrador). */
  slots?: SlotSucursalResumen[] | null;
  /**
   * Enlaces de cuenta a la vista (Mi perfil, FAQ). Para el rol `ejecutivo` su
   * página principal es `/solicitudes`, así que el encabezado es su única
   * navegación y los muestra de forma explícita.
   */
  mostrarEnlacesCuenta?: boolean;
}

/**
 * Encabezado de página del sistema. Reemplaza al antiguo `TopNavbar`: no es
 * pegajoso y no navega por módulos — la navegación vive en el dashboard, que
 * muestra las cards de acceso directo según el rol.
 *
 * Funciona también sin sesión (login, registro, recuperación): en ese caso
 * muestra solo la marca, sin datos de usuario, sin slots y sin cerrar sesión.
 */
export default function PageHeader({
  nombre,
  apellido,
  rol,
  sucursalNombre,
  backHref,
  titulo,
  descripcion,
  slots,
  mostrarEnlacesCuenta = false,
}: PageHeaderProps) {
  const autenticado = Boolean(nombre && apellido && rol);
  const iniciales = autenticado
    ? `${nombre!.charAt(0)}${apellido!.charAt(0)}`.toUpperCase()
    : '';
  const verSlots = (rol === 'jefe_local' || rol === 'administrador') && slots && slots.length > 0;

  return (
    <header className="border-b border-neutral-200 bg-white">
      <div className="w-full px-4 sm:px-6 lg:px-10 py-3 sm:py-4">
        <div className="flex items-center justify-between gap-3 sm:gap-4">
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
                width={44}
                height={44}
                priority
                className="h-10 w-auto mix-blend-multiply"
              />
              <span className="hidden md:block text-xl font-bold tracking-tight text-neutral-900">
                H.Motores
              </span>
            </Link>
          </div>

          {autenticado && (
            <div className="flex items-center gap-2 sm:gap-3">
              {verSlots && <SlotsResumen sucursales={slots!} />}

              {sucursalNombre && (
                <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-neutral-50 border border-neutral-200 text-neutral-600">
                  <MapPin className="w-3.5 h-3.5 shrink-0" />
                  <span className="text-xs font-medium">{sucursalNombre}</span>
                </div>
              )}

              <Link
                href="/perfil"
                className="flex items-center gap-2.5 pl-1 pr-2 py-1 rounded-xl hover:bg-neutral-50 transition-colors group"
                title="Ver mi perfil"
              >
                <div className="w-10 h-10 rounded-full bg-[#1a2b4b] text-white text-sm font-bold flex items-center justify-center shrink-0">
                  {iniciales}
                </div>
                <div className="hidden sm:block text-left">
                  <p className="text-sm font-semibold text-neutral-900 leading-tight">
                    {nombre} {apellido}
                  </p>
                  <p className="text-xs text-neutral-500 leading-tight">{ROL_LABEL[rol!]}</p>
                </div>
              </Link>

              {mostrarEnlacesCuenta && (
                <nav
                  aria-label="Enlaces de cuenta"
                  className="hidden md:flex items-center gap-1 pl-2 ml-1 border-l border-neutral-200"
                >
                  <Link
                    href="/perfil"
                    className="px-2.5 py-1.5 rounded-lg text-sm font-semibold text-neutral-700 hover:bg-neutral-100 transition-colors"
                  >
                    Mi perfil
                  </Link>
                  <Link
                    href="/faq"
                    className="px-2.5 py-1.5 rounded-lg text-sm font-semibold text-neutral-700 hover:bg-neutral-100 transition-colors"
                  >
                    FAQ
                  </Link>
                </nav>
              )}

              <form action={logoutAction} className="hidden sm:block">
                <button
                  type="submit"
                  className="p-2 rounded-full text-neutral-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                  title="Cerrar Sesión"
                >
                  <LogOut className="w-5 h-5" />
                </button>
              </form>
            </div>
          )}
        </div>

        {(titulo || descripcion) && (
          <div className="mt-3 sm:mt-4">
            {titulo && (
              <h1 className="text-xl sm:text-2xl font-extrabold text-[#1a2b4b] tracking-tight">
                {titulo}
              </h1>
            )}
            {descripcion && <p className="text-sm sm:text-base text-neutral-500 mt-0.5">{descripcion}</p>}
          </div>
        )}
      </div>
    </header>
  );
}
