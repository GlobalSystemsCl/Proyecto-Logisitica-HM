import { redirect } from 'next/navigation';
import Image from 'next/image';
import { Shield, LayoutGrid } from 'lucide-react';
import { AuthService } from '@/services/auth.service';
import { OrganizacionService } from '@/services/organizacion.service';
import { SucursalesService } from '@/services/sucursales.service';
import { SolicitudesService } from '@/services/solicitudes.service';
import { ROL_LABEL } from '@/types/auth.types';
import type { SlotSucursalResumen } from '@/lib/slots';
import PageHeader from '@/components/PageHeader';
import DashboardCardGrid from '@/components/DashboardCardGrid';
import DashboardJefeLocal from '@/components/DashboardJefeLocal';
import { TrasladoService } from '@/services/traslado.service';

export const dynamic = 'force-dynamic';

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

  /**
   * El Ejecutivo no tiene hub: `/solicitudes` es su página principal y reúne
   * todo lo suyo (crear, editar, seguir y entregar). Redirigirlo evita un
   * dashboard con una sola card y una vuelta circular con la flecha "volver".
   */
  if (profile.rol === 'ejecutivo') {
    redirect('/solicitudes');
  }

  const { rol } = profile;
  const veSlots = rol === 'administrador' || rol === 'jefe_local';

  const timestamp = new Intl.DateTimeFormat('es-CL', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date());

  const sucursalesAsignadas = veSlots
    ? (await OrganizacionService.getUserAssignedBranches(profile.id)).map((s) => s.id)
    : [];

  const slots: SlotSucursalResumen[] = veSlots
    ? await SucursalesService.getSlotsPorSucursales(sucursalesAsignadas)
    : [];

  // R3 + R11: panel de pendientes del Jefe de Local (el administrador ve todas las sucursales).
  const vePanel = rol === 'jefe_local' || rol === 'administrador';
  const alcance = rol === 'administrador' ? null : sucursalesAsignadas;
  const [pendientesAprobar, recepcionesSolicitudes, recepcionesTraslados, porPriorizar] = vePanel
    ? await Promise.all([
        SolicitudesService.getSolicitudesPendientesAprobacion(alcance),
        SolicitudesService.getRecepcionesPendientes(alcance),
        TrasladoService.getTrasladosEnTransitoHacia(alcance),
        SolicitudesService.getSolicitudesPorPriorizar(alcance),
      ])
    : [[], [], [], []];

  return (
    <div className="min-h-screen bg-[#f4f6f9] text-neutral-900 flex flex-col">
      <PageHeader
        nombre={profile.nombre}
        apellido={profile.apellido}
        rol={profile.rol}
        sucursalNombre={profile.sucursal_nombre}
        slots={slots}
      />

      <main className="flex-1 w-full px-4 sm:px-8 lg:px-12 py-8 space-y-8">
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
              Desde acá entrás a todo lo que tenés disponible: {ROL_LABEL[rol]}.
            </p>
          </div>
        </div>

        {vePanel && (
          <DashboardJefeLocal
            pendientesAprobar={pendientesAprobar}
            recepcionesSolicitudes={recepcionesSolicitudes}
            recepcionesTraslados={recepcionesTraslados}
            porPriorizar={porPriorizar}
          />
        )}

        <div className="space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-[#1a2b4b] tracking-tight flex items-center gap-2">
                <LayoutGrid className="w-5 h-5 text-blue-600" />
                <span>Tus módulos</span>
              </h2>
              <p className="text-sm text-neutral-500 mt-0.5">
                Selecciona el módulo que deseas utilizar
              </p>
            </div>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium bg-blue-50 border border-blue-100 text-blue-700 self-start">
              <Shield className="w-3.5 h-3.5 text-blue-600" />
              <span>Tu rol: {ROL_LABEL[rol]}</span>
            </div>
          </div>

          <DashboardCardGrid rol={rol} />
        </div>
      </main>

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