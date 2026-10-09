import { AuthService } from '@/services/auth.service';
import { SolicitudesService } from '@/services/solicitudes.service';
import { OrganizacionService } from '@/services/organizacion.service';
import { SucursalesService } from '@/services/sucursales.service';
import { redirect } from 'next/navigation';
import CalendarizacionesClient from './CalendarizacionesClient';
import PageHeader from '@/components/PageHeader';

export const dynamic = 'force-dynamic';

export default async function LogisticaCalendarizacionesPage() {
  const profile = await AuthService.getCurrentUserProfile();

  if (!profile) {
    redirect('/login');
  }

  if (!profile.activo) {
    redirect('/dashboard?error=unauthorized');
  }

  if (profile.rol !== 'jefe_local' && profile.rol !== 'administrador' && profile.rol !== 'logistica') {
    redirect('/dashboard');
  }

  const sucursalesAsignadas = await OrganizacionService.getUserAssignedBranches(profile.id);
  const [solicitudes, slotsSucursales, todasLasSucursales] = await Promise.all([
    SolicitudesService.getSolicitudesFiltradas(profile.id, profile.rol),
    SucursalesService.getSlotsPorSucursales(sucursalesAsignadas.map((s) => s.id)),
    SucursalesService.getSucursales(),
  ]);

  return (
    <div className="min-h-screen bg-neutral-100 text-neutral-900 flex flex-col">
      <PageHeader
        nombre={profile.nombre}
        apellido={profile.apellido}
        rol={profile.rol}
        sucursalNombre={profile.sucursal_nombre}
        backHref="/dashboard"
        slots={
          profile.rol === 'jefe_local' || profile.rol === 'administrador'
            ? slotsSucursales
            : null
        }
      />

      {/* Main Content */}
      <main className="flex-1 w-full px-4 sm:px-8 lg:px-12 py-8">
        <CalendarizacionesClient
          solicitudes={solicitudes}
          viewer={{
            id: profile.id,
            nombre: profile.nombre,
            apellido: profile.apellido,
            rol: profile.rol,
            sucursal_id: profile.sucursal_id ?? null,
          }}
          sucursales_asignadas={sucursalesAsignadas}
          sucursales={todasLasSucursales.map((s) => ({ id: s.id, nombre: s.nombre ?? null }))}
        />
      </main>
    </div>
  );
}