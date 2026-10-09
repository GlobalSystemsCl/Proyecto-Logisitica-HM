import { AuthService } from '@/services/auth.service';
import { VehiculoService } from '@/services/vehiculo.service';
import { SucursalesService } from '@/services/sucursales.service';
import { redirect } from 'next/navigation';
import VehiculosTableClient from './VehiculosTableClient';
import PageHeader from '@/components/PageHeader';

export const dynamic = 'force-dynamic';

export default async function AdminVehiculosPage() {
  const profile = await AuthService.getCurrentUserProfile();

  if (!profile) {
    redirect('/login');
  }

  if (!profile.activo) {
    redirect('/dashboard?error=unauthorized');
  }

  const allowedRoles = ['administrador', 'jefe_local', 'logistica', 'operaciones'];
  if (!allowedRoles.includes(profile.rol)) {
    redirect('/dashboard?error=unauthorized');
  }

  const [vehiculosBase, marcas, sucursales, enTransito] = await Promise.all([
    VehiculoService.getVehiculos(),
    VehiculoService.getMarcas(),
    SucursalesService.getSucursales(),
    VehiculoService.getDestinosEnTransito(),
  ]);
  // R2: marca los vehículos que van en camino y hacia dónde.
  const vehiculos = vehiculosBase.map((v) => ({ ...v, en_transito_hacia: enTransito[v.id] ?? null }));

  return (
    <div className="min-h-screen bg-neutral-100 text-neutral-900 flex flex-col">
      <PageHeader
        nombre={profile.nombre}
        apellido={profile.apellido}
        rol={profile.rol}
        sucursalNombre={profile.sucursal_nombre}
        backHref="/dashboard"
      />

      {/* Main Content */}
      <main className="flex-1 w-full px-4 sm:px-8 lg:px-12 py-8">
        <VehiculosTableClient
          vehiculos={vehiculos}
          marcas={marcas}
          sucursales={sucursales}
          userRole={profile.rol}
        />
      </main>
    </div>
  );
}
