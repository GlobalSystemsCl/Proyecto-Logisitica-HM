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
  ArrowRight,
  Shield,
  ChevronRight,
  LayoutGrid,
  CheckCircle2,
  ListOrdered,
  type LucideIcon,
} from 'lucide-react';
import { ROL_LABEL } from '@/types/auth.types';
import TopNavbar from '@/components/TopNavbar';

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
  const isEjecutivo = profile.rol === 'ejecutivo';
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
      <TopNavbar
        nombre={profile.nombre}
        apellido={profile.apellido}
        rol={profile.rol}
        sucursalNombre={profile.sucursal_nombre}
      />

      {/* Main Content */}
      <main className="flex-1 w-full px-4 sm:px-8 lg:px-12 py-8 space-y-8">
        {/* Welcome Banner */}
        <div className="relative overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm min-h-[220px] sm:min-h-[240px]">
          <Image
            src="/banner3.png"
            alt="Concesionario H.Motores"
            fill
            className="object-cover object-[center_80%]"
            priority
            sizes="100vw"
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

            {!isEjecutivo && (
              <ModuleCard
                href="/admin/vehiculos"
                icon={Car}
                title="Gestión de Vehículos"
                description="Incorporación manual de vehículos al inventario interno, control de disponibilidad y datos del vehículo."
                cta="Administrar vehículos"
              />
            )}

            {isEjecutivo && (
              <ModuleCard
                href="/solicitudes"
                icon={FileText}
                title="Solicitudes"
                description="Creación y seguimiento de solicitudes de traslado de vehículos."
                cta="Ver solicitudes"
              />
            )}

            {isEjecutivo && (
              <ModuleCard
                href="/solicitudes/aprobaciones"
                icon={CheckCircle2}
                title="Aprobaciones"
                description="Revisión y aprobación de solicitudes de traslado pendientes."
                cta="Revisar aprobaciones"
              />
            )}

            {isEjecutivo && (
              <ModuleCard
                href="/solicitudes/prioridades"
                icon={ListOrdered}
                title="Prioridades"
                description="Gestión y priorización de cola de solicitudes para traslados."
                cta="Gestionar prioridades"
              />
            )}

            {!isEjecutivo && (
              <ModuleCard
                href="/solicitudes"
                icon={FileText}
                title="Gestión de Solicitudes"
                description="Creación de traslados, cola de priorización por sucursal y reserva de vehículos."
                cta="Gestionar solicitudes"
              />
            )}

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
        <div className="w-full px-4 sm:px-8 lg:px-12 h-12 flex items-center justify-between text-xs text-neutral-500">
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
