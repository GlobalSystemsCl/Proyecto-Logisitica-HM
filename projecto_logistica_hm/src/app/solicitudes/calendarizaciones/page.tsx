import { AuthService } from '@/services/auth.service';
import { SolicitudesService } from '@/services/solicitudes.service';
import { redirect } from 'next/navigation';
import SolicitudesHeader from '@/components/SolicitudesHeader';
import CalendarizacionesClient from './CalendarizacionesClient';

export const dynamic = 'force-dynamic';

export default async function CalendarizacionesPage() {
  const profile = await AuthService.getCurrentUserProfile();

  if (!profile) {
    redirect('/login');
  }

  if (!profile.activo) {
    redirect('/dashboard?error=unauthorized');
  }

  if (profile.rol !== 'jefe_local' && profile.rol !== 'administrador' && profile.rol !== 'logistica') {
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
          ...(profile.rol === 'jefe_local' || profile.rol === 'administrador'
            ? [
                { href: '/solicitudes/aprobaciones', label: 'Aprobaciones', active: false },
                { href: '/solicitudes/prioridades', label: 'Prioridades', active: false },
              ]
            : []),
          { href: '/solicitudes/calendarizaciones', label: 'Calendarizaciones', active: true },
        ]}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <CalendarizacionesClient
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