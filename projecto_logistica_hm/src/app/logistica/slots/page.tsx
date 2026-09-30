import { AuthService } from '@/services/auth.service';
import { OrganizacionService } from '@/services/organizacion.service';
import { SucursalesService } from '@/services/sucursales.service';
import { redirect } from 'next/navigation';
import SlotsClient from './SlotsClient';
import PageHeader from '@/components/PageHeader';

export const dynamic = 'force-dynamic';

export default async function LogisticaSlotsPage() {
  const profile = await AuthService.getCurrentUserProfile();

  if (!profile) {
    redirect('/login');
  }

  if (!profile.activo) {
    redirect('/dashboard?error=unauthorized');
  }

  if (!(profile.rol === 'jefe_local' || profile.rol === 'administrador' || profile.rol === 'logistica')) {
    redirect('/dashboard');
  }

  const sucursalesAsignadas = await OrganizacionService.getUserAssignedBranches(profile.id);
  const slots = await SucursalesService.getSlotsPorSucursales(
    profile.rol === 'administrador' ? [] : sucursalesAsignadas.map((s) => s.id)
  );
  const todas = await SucursalesService.getSucursales();

  const datos = profile.rol === 'administrador'
    ? todas.map((s) => ({
        id: s.id,
        nombre: s.nombre,
        zona_nombre: s.zona?.nombre ?? null,
        slots: s.slots,
        slots_ocupados: s.slots_ocupados,
        slots_reservados: s.slots_reservados,
      }))
    : slots.map((s) => ({
        id: s.id,
        nombre: s.nombre,
        zona_nombre: null,
        slots: s.slots,
        slots_ocupados: s.slots_ocupados,
        slots_reservados: s.slots_reservados,
      }));

  return (
    <div className="min-h-screen bg-neutral-100 text-neutral-900 flex flex-col">
      <PageHeader
        nombre={profile.nombre}
        apellido={profile.apellido}
        rol={profile.rol}
        sucursalNombre={profile.sucursal_nombre}
        backHref="/dashboard"
      />

      <main className="flex-1 w-full px-4 sm:px-8 lg:px-12 py-8">
        <SlotsClient
          esAdmin={profile.rol === 'administrador'}
          sucursales={datos}
        />
      </main>
    </div>
  );
}