import { redirect } from 'next/navigation';
import { AuthService } from '@/services/auth.service';
import { SucursalesService } from '@/services/sucursales.service';
import { OrganizacionService } from '@/services/organizacion.service';
import PageHeader from '@/components/PageHeader';
import type { SlotSucursalResumen } from '@/lib/slots';

export const dynamic = 'force-dynamic';

const ROLES_MODULO = ['administrador', 'jefe_local', 'ejecutivo', 'logistica'];

export default async function SolicitudesLayout({ children }: { children: React.ReactNode }) {
  const profile = await AuthService.getCurrentUserProfile();

  if (!profile) {
    redirect('/login');
  }

  if (!profile.activo) {
    redirect('/dashboard?error=unauthorized');
  }

  if (!ROLES_MODULO.includes(profile.rol)) {
    redirect('/dashboard?error=unauthorized');
  }

  const veSlots = profile.rol === 'jefe_local' || profile.rol === 'administrador';
  const sucursalesAsignadas = veSlots
    ? (await OrganizacionService.getUserAssignedBranches(profile.id)).map((s) => s.id)
    : [];
  const slots: SlotSucursalResumen[] = veSlots
    ? await SucursalesService.getSlotsPorSucursales(sucursalesAsignadas)
    : [];

  /**
   * El Ejecutivo entra directo a `/solicitudes`, así que la flecha "volver" al
   * dashboard lo mandaría a la misma página: se omite y su navegación vive en
   * los enlaces de cuenta del encabezado.
   */
  const volverAlDashboard = profile.rol !== 'ejecutivo';

  return (
    <div className="min-h-screen bg-neutral-100 text-neutral-900 flex flex-col">
      <PageHeader
        nombre={profile.nombre}
        apellido={profile.apellido}
        rol={profile.rol}
        sucursalNombre={profile.sucursal_nombre}
        backHref={volverAlDashboard ? '/dashboard' : undefined}
        mostrarEnlacesCuenta={profile.rol === 'ejecutivo'}
        slots={slots}
      />
      <main className="flex-1 w-full px-4 sm:px-8 lg:px-12 py-8">{children}</main>
    </div>
  );
}