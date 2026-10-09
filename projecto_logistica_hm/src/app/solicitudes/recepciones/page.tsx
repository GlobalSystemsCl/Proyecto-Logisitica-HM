import { redirect } from 'next/navigation';
import { AuthService } from '@/services/auth.service';
import { SolicitudesService } from '@/services/solicitudes.service';
import { TrasladoService } from '@/services/traslado.service';
import { OrganizacionService } from '@/services/organizacion.service';
import RecepcionesClient from './RecepcionesClient';

export const dynamic = 'force-dynamic';

/**
 * R13 — Bandeja de recepciones: todo lo que viene en camino a las sucursales
 * del Jefe de Local (solicitudes y traslados internos) para marcarlo como
 * recibido y registrar las novedades.
 */
export default async function RecepcionesPage() {
  const profile = await AuthService.getCurrentUserProfile();

  if (!profile) {
    redirect('/login');
  }

  if (profile.rol !== 'jefe_local' && profile.rol !== 'administrador') {
    redirect('/solicitudes');
  }

  const sucursalIds =
    profile.rol === 'administrador'
      ? null
      : (await OrganizacionService.getUserAssignedBranches(profile.id)).map((s) => s.id);

  const [solicitudes, traslados] = await Promise.all([
    SolicitudesService.getRecepcionesPendientes(sucursalIds),
    TrasladoService.getTrasladosEnTransitoHacia(sucursalIds),
  ]);

  return <RecepcionesClient solicitudes={solicitudes} traslados={traslados} />;
}
