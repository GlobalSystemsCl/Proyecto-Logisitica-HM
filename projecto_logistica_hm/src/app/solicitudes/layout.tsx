import { AuthService } from '@/services/auth.service';
import { SucursalesService } from '@/services/sucursales.service';
import { OrganizacionService } from '@/services/organizacion.service';
import { redirect } from 'next/navigation';
import SolicitudesHeader from '@/components/SolicitudesHeader';

export const dynamic = 'force-dynamic';

const ROLES_MODULO = ['administrador', 'jefe_local', 'ejecutivo', 'logistica'];

export default async function SolicitudesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
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

  const sucursalesAsignadas = await OrganizacionService.getUserAssignedBranches(profile.id);
  const slotsSucursales =
    profile.rol === 'jefe_local' || profile.rol === 'administrador'
      ? await SucursalesService.getSlotsPorSucursales(sucursalesAsignadas.map((s) => s.id))
      : null;

  return (
    <div className="min-h-screen bg-neutral-100 text-neutral-900 flex flex-col">
      <SolicitudesHeader
        nombre={profile.nombre}
        apellido={profile.apellido}
        rol={profile.rol}
        sucursalNombre={profile.sucursal_nombre}
        slots={
          slotsSucursales
            ? slotsSucursales.map((s) => ({
                nombre: s.nombre,
                slots: s.slots,
                slots_ocupados: s.slots_ocupados,
              }))
            : null
        }
      />
      <main className="flex-1 w-full px-4 sm:px-8 lg:px-12 py-8">{children}</main>
    </div>
  );
}