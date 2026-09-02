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

  if (profile.rol !== 'jefe_local' && profile.rol !== 'administrador') {
    redirect('/solicitudes');
  }

  const solicitudes = await SolicitudesService.getSolicitudes();

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
          ...(profile.rol === 'jefe_local' || profile.rol === 'administrador'
            ? [{ href: '/solicitudes/prioridades', label: 'Prioridades', active: false }]
            : []),
          ...(profile.rol === 'jefe_local'
            ? [{ href: '/solicitudes/calendarizaciones', label: 'Calendarizaciones', active: false }]
            : []),
        ]}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <AprobacionesClient
          solicitudes={solicitudes}
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
