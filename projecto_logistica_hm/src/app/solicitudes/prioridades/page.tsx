import { AuthService } from '@/services/auth.service';
import { SolicitudesService } from '@/services/solicitudes.service';
import { OrganizacionService } from '@/services/organizacion.service';
import { SucursalesService } from '@/services/sucursales.service';
import { redirect } from 'next/navigation';
import PrioridadesClient from './PrioridadesClient';

export const dynamic = 'force-dynamic';

export default async function PrioridadesPage() {
  const profile = await AuthService.getCurrentUserProfile();

  if (!profile) {
    redirect('/login');
  }

  if (profile.rol !== 'jefe_local' && profile.rol !== 'administrador') {
    redirect('/solicitudes');
  }

  // Solo las solicitudes del alcance del usuario (antes se enviaban todas las
  // del sistema al navegador y se filtraban allí).
  const [solicitudes, sucursalesAsignadas] = await Promise.all([
    SolicitudesService.getSolicitudesFiltradas(profile.id, profile.rol),
    profile.rol === 'administrador'
      ? SucursalesService.getSucursales().then((lista) =>
          lista.map((s) => ({ id: s.id, nombre: s.nombre ?? null }))
        )
      : OrganizacionService.getUserAssignedBranches(profile.id),
  ]);

  return (
    <PrioridadesClient
      solicitudes={solicitudes}
      sucursalesAsignadas={sucursalesAsignadas}
    />
  );
}