import { redirect } from 'next/navigation';
import { AuthService } from '@/services/auth.service';
import { SolicitudesService } from '@/services/solicitudes.service';
import { TrasladoService } from '@/services/traslado.service';
import { OrganizacionService } from '@/services/organizacion.service';
import PageHeader from '@/components/PageHeader';
import TransitoClient from './TransitoClient';
import { hoyISO } from '@/lib/fechas';
import { filasEnTransito } from '@/lib/transito';

export const dynamic = 'force-dynamic';

/**
 * R5 (2026-11-11): todo lo que va en camino (solicitudes y traslados internos
 * despachados y aún no recepcionados), con guía, camión y días en camino.
 * Alcance: Logística, sus zonas (origen o destino); administrador, todo.
 */
export default async function TransitoPage() {
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

  const zonaIds = profile.rol === 'administrador' ? null : await OrganizacionService.getSucursalIdsDeZonasUsuario(profile.id);
  const [solicitudes, traslados] = await Promise.all([
    SolicitudesService.getSolicitudesFiltradas(profile.id, profile.rol, { estados: ['en_transito'] }),
    TrasladoService.getTrasladosEnTransitoHacia(null),
  ]);
  const trasladosEnAlcance =
    zonaIds === null ? traslados : traslados.filter((t) => zonaIds.includes(t.origen_id) || zonaIds.includes(t.destino_id));

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
        <TransitoClient
          filas={filasEnTransito(solicitudes, trasladosEnAlcance, hoyISO())}
          sinZonas={zonaIds !== null && zonaIds.length === 0}
        />
      </main>
    </div>
  );
}
