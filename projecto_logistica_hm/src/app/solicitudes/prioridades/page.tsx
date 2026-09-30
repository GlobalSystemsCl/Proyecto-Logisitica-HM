import { AuthService } from '@/services/auth.service';
import { SolicitudesService } from '@/services/solicitudes.service';
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

  const solicitudes = await SolicitudesService.getSolicitudes();

  return (
    <PrioridadesClient
      solicitudes={solicitudes}
      viewer={{
        id: profile.id,
        nombre: profile.nombre,
        apellido: profile.apellido,
        rol: profile.rol,
        sucursal_id: profile.sucursal_id ?? null,
      }}
    />
  );
}