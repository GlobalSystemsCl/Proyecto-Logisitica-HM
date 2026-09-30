import { AuthService } from '@/services/auth.service';
import { SucursalesService } from '@/services/sucursales.service';
import { SolicitudesService } from '@/services/solicitudes.service';
import { OrganizacionService } from '@/services/organizacion.service';
import { redirect } from 'next/navigation';
import SolicitudesClient from './SolicitudesClient';

export const dynamic = 'force-dynamic';

export default async function SolicitudesPage() {
  const profile = await AuthService.getCurrentUserProfile();

  if (!profile) {
    redirect('/login');
  }

  const sucursalesAsignadas = await OrganizacionService.getUserAssignedBranches(profile.id);
  const [solicitudes, sucursales, vehiculos] = await Promise.all([
    SolicitudesService.getSolicitudesFiltradas(profile.id, profile.rol),
    SucursalesService.getSucursales(),
    SolicitudesService.getVehiculosInventario(),
  ]);

  return (
    <SolicitudesClient
      solicitudes={solicitudes}
      sucursales={sucursales}
      sucursales_asignadas={sucursalesAsignadas}
      vehiculos={vehiculos}
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