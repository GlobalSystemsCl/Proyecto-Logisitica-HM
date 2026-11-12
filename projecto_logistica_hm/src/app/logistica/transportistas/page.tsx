import { redirect } from 'next/navigation';
import { AuthService } from '@/services/auth.service';
import { TransportistaService } from '@/services/transportista.service';
import PageHeader from '@/components/PageHeader';
import TransportistasClient from './TransportistasClient';

export const dynamic = 'force-dynamic';

/**
 * R10 (2026-11-11): gestión de las empresas de transporte (RUT y nombre) y sus
 * camiones (patente y transportista habitual). Logística y administrador.
 */
export default async function TransportistasPage() {
  const profile = await AuthService.getCurrentUserProfile();

  if (!profile) {
    redirect('/login');
  }

  if (!profile.activo) {
    redirect('/dashboard?error=unauthorized');
  }

  if (profile.rol !== 'logistica' && profile.rol !== 'administrador') {
    redirect('/dashboard');
  }

  const empresas = await TransportistaService.listarEmpresas();

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
        <TransportistasClient empresas={empresas} />
      </main>
    </div>
  );
}
