import { AuthService } from '@/services/auth.service';
import { SolicitudesService } from '@/services/solicitudes.service';
import { redirect } from 'next/navigation';
import SolicitudesHeader from '@/components/SolicitudesHeader';
import AprobacionesClient from './AprobacionesClient';

export const dynamic = 'force-dynamic';

export default async function AprobacionesPage() {
  const profile = await AuthService.getCurrentUserProfile();

  if (!profile) {
    redirect('/login');
  }

  if (!profile.activo) {
    redirect('/dashboard?error=unauthorized');
  }

  if (profile.rol !== 'jefe_local' && profile.rol !== 'administrador' && profile.rol !== 'ejecutivo') {
    redirect('/solicitudes');
  }

  const [solicitudes, vehiculos] = await Promise.all([
    SolicitudesService.getSolicitudes(),
    SolicitudesService.getVehiculosInventario(),
  ]);

  return (
    <div className="min-h-screen bg-neutral-100 text-neutral-900 flex flex-col">
      <SolicitudesHeader
        title="Módulo de Solicitudes"
        nombre={profile.nombre}
        apellido={profile.apellido}
        rol={profile.rol}
        tabs={[
          { href: '/solicitudes', label: 'General', active: false },
          { href: '/solicitudes/aprobaciones', label: 'Aprobaciones', active: true },
          ...(profile.rol === 'jefe_local' || profile.rol === 'administrador' || profile.rol === 'ejecutivo'
            ? [{ href: '/solicitudes/prioridades', label: 'Prioridades', active: false }]
            : []),
        ]}
      />

      <main className="flex-1 w-full px-4 sm:px-8 lg:px-12 py-8">
        <AprobacionesClient
          solicitudes={solicitudes}
          vehiculos={vehiculos}
          viewer={{
            id: profile.id,
            nombre: profile.nombre,
            apellido: profile.apellido,
            rol: profile.rol,
            sucursal_id: profile.sucursal_id ?? null,
          }}
        />
      </main>
    </div>
  );
}
