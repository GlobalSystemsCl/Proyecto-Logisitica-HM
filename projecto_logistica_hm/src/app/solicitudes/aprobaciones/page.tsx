import { AuthService } from '@/services/auth.service';
import { SolicitudesService } from '@/services/solicitudes.service';
import { OrganizacionService } from '@/services/organizacion.service';
import { redirect } from 'next/navigation';
import AprobacionesClient from './AprobacionesClient';

export const dynamic = 'force-dynamic';

export default async function AprobacionesPage() {
  const profile = await AuthService.getCurrentUserProfile();

  if (!profile) {
    redirect('/login');
  }

  /**
   * Aprobaciones es la cola del jefe de local y del administrador. Para el
   * Ejecutivo no aplica: todo lo suyo (crear, editar, seguir y entregar) vive
   * unificado en `/solicitudes`, y esta vista nunca debe mostrarle solicitudes
   * de otras sucursales.
   */
  if (profile.rol !== 'jefe_local' && profile.rol !== 'administrador') {
    redirect('/solicitudes');
  }

  const sucursalesAsignadas = await OrganizacionService.getUserAssignedBranches(profile.id);
  const [solicitudes, vehiculos] = await Promise.all([
    SolicitudesService.getSolicitudes(),
    SolicitudesService.getVehiculosInventario(),
  ]);

  return (
    <AprobacionesClient
      solicitudes={solicitudes}
      vehiculos={vehiculos}
      sucursalesAsignadas={sucursalesAsignadas}
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