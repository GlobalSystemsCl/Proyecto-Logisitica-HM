import { AuthService } from '@/services/auth.service';
import { SucursalesService } from '@/services/sucursales.service';
import { redirect } from 'next/navigation';
import TopNavbar from '@/components/TopNavbar';
import PerfilClient from './PerfilClient';

export const dynamic = 'force-dynamic';

export default async function PerfilPage() {
  const profile = await AuthService.getCurrentUserProfile();

  if (!profile) {
    redirect('/login');
  }

  if (!profile.activo) {
    redirect('/dashboard?error=unauthorized');
  }

  const sucursales = await SucursalesService.getSucursales();
  const sucursal = sucursales.find((s) => s.id === profile.sucursal_id) ?? null;

  return (
    <div className="min-h-screen bg-neutral-100 text-neutral-900 flex flex-col">
      {/* Top Navbar */}
      <TopNavbar
        nombre={profile.nombre}
        apellido={profile.apellido}
        rol={profile.rol}
        sucursalNombre={sucursal?.nombre ?? null}
        backHref="/dashboard"
      />

      {/* Main Content */}
      <main className="flex-1 max-w-3xl w-full mx-auto px-4 sm:px-8 lg:px-12 py-8">
        <PerfilClient
          profile={{
            id: profile.id,
            email: profile.email,
            nombre: profile.nombre,
            apellido: profile.apellido,
            rol: profile.rol,
            telefono: profile.telefono ?? null,
            sucursal_id: profile.sucursal_id ?? null,
            sucursal_nombre: sucursal?.nombre ?? null,
            activo: profile.activo,
            created_at: profile.created_at,
          }}
        />
      </main>
    </div>
  );
}