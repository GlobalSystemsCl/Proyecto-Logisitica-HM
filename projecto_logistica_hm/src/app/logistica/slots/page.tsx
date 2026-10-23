import { AuthService } from '@/services/auth.service';
import { OrganizacionService } from '@/services/organizacion.service';
import { SucursalesService } from '@/services/sucursales.service';
import { redirect } from 'next/navigation';
import SlotsClient from './SlotsClient';
import { slotsConZona } from '@/lib/slots';
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

  // Administrador y Logística ven todas las sucursales; el Jefe de Local, las suyas.
  const vistaGlobal = profile.rol === 'administrador' || profile.rol === 'logistica';
  const datos = vistaGlobal
    ? (await SucursalesService.getSucursales()).map(slotsConZona)
    : (await SucursalesService.getSlotsPorSucursales(
        (await OrganizacionService.getUserAssignedBranches(profile.id)).map((s) => s.id)
      )).map((s) => ({ ...s, zona_nombre: null }));

  return (
    <div className="min-h-screen bg-neutral-100 text-neutral-900 flex flex-col">
      <PageHeader
        usuarioId={profile.id}
        nombre={profile.nombre}
        apellido={profile.apellido}
        rol={profile.rol}
        sucursalNombre={profile.sucursal_nombre}
        backHref="/dashboard"
      />

      <main className="flex-1 w-full px-4 sm:px-8 lg:px-12 pt-8 pb-24 sm:pb-8">
        <SlotsClient
          vistaGlobal={vistaGlobal}
          sucursales={datos}
        />
      </main>
    </div>
  );
}