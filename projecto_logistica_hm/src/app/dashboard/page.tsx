import { AuthService } from '@/services/auth.service';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import {
  Users,
  Car,
  FileText,
  Building2,
  Truck,
  History,
  LogOut,
  ArrowRight,
  Shield,
  ChevronDown,
  ChevronRight,
  LayoutGrid,
  type LucideIcon,
} from 'lucide-react';
import { logoutAction } from '@/app/actions/auth.actions';
import { ROL_LABEL } from '@/types/auth.types';

export const dynamic = 'force-dynamic';

type ModuleCardProps = {
  href: string;
  icon: LucideIcon;
  title: string;
  description: string;
  cta: string;
  adminBadge?: boolean;
};

function ModuleCard({
  href,
  icon: Icon,
  title,
  description,
  cta,
  adminBadge,
}: ModuleCardProps) {
  return (
    <Link
      href={href}
      className="group relative bg-white border border-neutral-200 hover:border-neutral-400 rounded-2xl p-6 transition-all duration-200 hover:shadow-md flex flex-col justify-between min-h-[220px]"
    >
      <div className="space-y-4">
        <div className="flex items-start justify-between">
          <div className="w-11 h-11 rounded-xl bg-neutral-100 border border-neutral-200 flex items-center justify-center text-neutral-600 group-hover:bg-neutral-900 group-hover:text-white group-hover:border-neutral-900 transition-colors">
            <Icon className="w-5 h-5" />
          </div>
          <div className="flex items-center gap-2">
            {adminBadge && (
              <span className="text-[10px] font-semibold px-2.5 py-0.5 rounded-full bg-neutral-100 text-neutral-600 border border-neutral-200">
                Admin
              </span>
            )}
            <ChevronRight className="w-4 h-4 text-neutral-300 group-hover:text-neutral-500 transition-colors" />
          </div>
        </div>
        <div>
          <h3 className="font-bold text-[#1a2b4b] group-hover:text-neutral-700 transition-colors">
            {title}
          </h3>
          <p className="text-xs text-neutral-500 mt-1.5 leading-relaxed">{description}</p>
        </div>
      </div>
      <div className="mt-5 flex items-center gap-1 text-xs font-semibold text-neutral-600 group-hover:text-neutral-900">
        <span>{cta}</span>
        <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
      </div>
    </Link>
  );
}

export default async function DashboardPage() {
  const profile = await AuthService.getCurrentUserProfile();

  if (!profile) {
    redirect('/login');
  }

  if (!profile.activo) {
    redirect('/login?error=account_deactivated');
  }

  if (profile.requiere_cambio_clave) {
    redirect('/establecer-clave');
  }

  const isAdmin = profile.rol === 'administrador';
  const initials = `${profile.nombre.charAt(0)}${profile.apellido.charAt(0)}`.toUpperCase();
  const timestamp = new Intl.DateTimeFormat('es-CL', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date());

  return (
    <div className="min-h-screen bg-[#f4f6f9] text-neutral-900 flex flex-col">
      {/* Top Navbar */}
      <header className="border-b border-neutral-200 bg-white sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-end gap-3 sm:gap-4">
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
                {profile.nombre} {profile.apellido}
              </p>
              <p className="text-xs text-neutral-500 leading-tight">
                {ROL_LABEL[profile.rol]}
              </p>
            </div>
            <ChevronDown className="w-4 h-4 text-neutral-400 hidden sm:block group-hover:text-neutral-600 transition-colors" />
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
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Welcome Banner */}
        <div className="relative overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm min-h-[220px] sm:min-h-[240px]">
          <Image
            src="/banner-hero.png"
            alt="Concesionario H.Motores"
            fill
            className="object-cover object-center sm:object-right"
            priority
            sizes="(max-width: 768px) 100vw, 1280px"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-white via-white/95 to-white/30 sm:via-white/90 sm:to-transparent" />
          <div className="relative z-10 p-6 sm:p-8 max-w-xl space-y-3">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium bg-blue-50 border border-blue-100 text-blue-700">
              <Shield className="w-3.5 h-3.5 text-blue-600" />
              <span>Sistema de Gestión y Traslado de Vehículos</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-[#1a2b4b] tracking-tight">
              Bienvenido, {profile.nombre} {profile.apellido}
            </h1>
            <p className="text-sm text-neutral-500 max-w-lg leading-relaxed">
              Plataforma interna para la gestión, control operativo y trazabilidad del traslado de
              vehículos entre sucursales de H.Motores.
            </p>
          </div>
        </div>

        {/* System Modules Grid */}
        <div className="space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-[#1a2b4b] tracking-tight flex items-center gap-2">
                <LayoutGrid className="w-5 h-5 text-blue-600" />
                <span>Módulos del Sistema</span>
              </h2>
              <p className="text-sm text-neutral-500 mt-0.5">
                Selecciona el módulo que deseas utilizar
              </p>
            </div>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium bg-blue-50 border border-blue-100 text-blue-700 self-start">
              <Shield className="w-3.5 h-3.5 text-blue-600" />
              <span>Tu rol: {ROL_LABEL[profile.rol]}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {isAdmin && (
              <ModuleCard
                href="/admin/usuarios"
                icon={Users}
                title="Gestión de Usuarios"
                description="Creación de cuentas, envío de invitaciones por correo y control de activación/desactivación."
                cta="Administrar colaboradores"
                adminBadge
              />
            )}

            <ModuleCard
              href="/admin/vehiculos"
              icon={Car}
              title="Gestión de Vehículos"
              description="Incorporación manual de vehículos al inventario interno, control de disponibilidad y datos del vehículo."
              cta="Administrar vehículos"
            />

            <ModuleCard
              href="/solicitudes"
              icon={FileText}
              title="Gestión de Solicitudes"
              description="Creación de traslados, cola de priorización por sucursal y reserva de vehículos."
              cta="Gestionar solicitudes"
            />

            {isAdmin && (
              <ModuleCard
                href="/admin/sucursales"
                icon={Building2}
                title="Gestión de Sucursales"
                description="Alta y edición de sucursales, capacidad de estacionamiento y solicitudes asociadas por punto."
                cta="Administrar sucursales"
                adminBadge
              />
            )}

            {(profile.rol === 'logistica' ||
              profile.rol === 'jefe_local' ||
              profile.rol === 'administrador') && (
              <ModuleCard
                href="/logistica/calendarizaciones"
                icon={Truck}
                title="Gestión Logística"
                description="Calendarización de traslados, fecha tentativa, despacho y confirmación de entrega en destino."
                cta="Gestionar traslados"
              />
            )}

            {isAdmin && (
              <ModuleCard
                href="/admin/historial"
                icon={History}
                title="Historial y Trazabilidad"
                description="Registro inmutable de acciones, responsables y fechas para auditoría operativa continua."
                cta="Ver historial completo"
                adminBadge
              />
            )}
          </div>
        </div>
      </main>

      {/* Footer Status Bar */}
      <footer className="border-t border-neutral-200 bg-white mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-12 flex items-center justify-between text-xs text-neutral-500">
          <div className="flex items-center gap-2">
            <Shield className="w-3.5 h-3.5 text-neutral-400" />
            <span className="font-medium text-neutral-600">H.Motores | Plataforma interna</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
            <span>Sistema operativo</span>
            <span className="text-neutral-400 hidden sm:inline">·</span>
            <span className="hidden sm:inline tabular-nums">{timestamp}</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
