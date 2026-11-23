import { AuthService } from '@/services/auth.service';
import { VehiculoService } from '@/services/vehiculo.service';
import { SucursalesService } from '@/services/sucursales.service';
import { OrganizacionService } from '@/services/organizacion.service';
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

  const allowedRoles = ['administrador', 'jefe_local', 'logistica'];
  if (!allowedRoles.includes(profile.rol)) {
    redirect('/dashboard?error=unauthorized');
  }

  const [vehiculosBase, marcas, sucursales, enTransito, catalogoMarcas] = await Promise.all([
    VehiculoService.getVehiculos(),
    VehiculoService.getMarcas(),
    SucursalesService.getSucursales({ incluirInactivas: true }),
    VehiculoService.getDestinosEnTransito(),
    OrganizacionService.getMarcasCatalogo(),
  ]);
  // R2: marca los vehículos que van en camino y hacia dónde.
  const vehiculos = vehiculosBase.map((v) => ({ ...v, en_transito_hacia: enTransito[v.id] ?? null }));

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

      {/* Main Content */}
      <main className="flex-1 w-full px-4 sm:px-8 lg:px-12 pt-8 pb-24 sm:pb-8">
        <VehiculosTableClient
          vehiculos={vehiculos}
          marcas={marcas}
          catalogoMarcas={catalogoMarcas.map((m) => ({ id: m.id, codigo: m.codigo, nombre: m.nombre }))}
          sucursales={sucursales}
          userRole={profile.rol}
          userId={profile.id}
        />
      </main>
    </div>
  );
}
