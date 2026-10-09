import { AuthService } from '@/services/auth.service';
import { SucursalesService } from '@/services/sucursales.service';
import { SolicitudesService } from '@/services/solicitudes.service';
import { OrganizacionService } from '@/services/organizacion.service';
import { redirect } from 'next/navigation';
import SolicitudesClient from './SolicitudesClient';
import { GRUPOS_FILTRO_SOLICITUDES, type GrupoFiltroSolicitud } from '@/lib/filtroSolicitudes';

export const dynamic = 'force-dynamic';

export default async function SolicitudesPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { grupo } = await searchParams;
  const grupoInicial = GRUPOS_FILTRO_SOLICITUDES.some((g) => g.id === grupo)
    ? (grupo as GrupoFiltroSolicitud)
    : 'todas';

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
      key={grupoInicial}
      solicitudes={solicitudes}
      sucursales={sucursales}
      sucursales_asignadas={sucursalesAsignadas}
      grupoInicial={grupoInicial}
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