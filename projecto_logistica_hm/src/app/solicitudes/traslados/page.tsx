import { AuthService } from '@/services/auth.service';
import { OrganizacionService } from '@/services/organizacion.service';
import { redirect } from 'next/navigation';
import { getTrasladosAction, getVehiculosParaTrasladoAction, getSucursalesTrasladoAction } from '@/app/actions/traslados.actions';
import SolicitudesHeader from '@/components/SolicitudesHeader';
import TrasladosClient from './TrasladosClient';

export const dynamic = 'force-dynamic';

export default async function TrasladosPage() {
  const profile = await AuthService.getCurrentUserProfile();

  if (!profile) {
    redirect('/login');
  }

  if (!profile.activo) {
    redirect('/dashboard?error=unauthorized');
  }

  const rolesValidos = ['administrador', 'logistica', 'jefe_local'];
  if (!rolesValidos.includes(profile.rol)) {
    redirect('/solicitudes');
  }

  const esOperador = profile.rol === 'administrador' || profile.rol === 'logistica';

  const viewerSucursales =
    profile.rol === 'jefe_local'
      ? (await OrganizacionService.getUserAssignedBranches(profile.id)).map((s) => s.id)
      : [];

  const [traslados, sucursales, vehiculosIniciales, marcas] = await Promise.all([
    getTrasladosAction(),
    getSucursalesTrasladoAction(),
    esOperador
      ? getVehiculosParaTrasladoAction('', 1, 12)
      : Promise.resolve({ vehiculos: [], total: 0, page: 1, pageSize: 12, totalPages: 0 }),
    esOperador ? OrganizacionService.getMarcasCatalogo() : Promise.resolve([]),
  ]);

  return (
    <div className="min-h-screen bg-neutral-100 text-neutral-900 flex flex-col">
      <SolicitudesHeader
        title="Traslados Internos"
        nombre={profile.nombre}
        apellido={profile.apellido}
        rol={profile.rol}
        sucursalNombre={profile.sucursal_nombre}
        tabs={[
          { href: '/solicitudes', label: 'General', active: false },
          { href: '/solicitudes/traslados', label: 'Traslados', active: true },
          ...(profile.rol === 'administrador' || profile.rol === 'jefe_local'
            ? [{ href: '/solicitudes/aprobaciones', label: 'Aprobaciones', active: false }]
            : []),
        ]}
      />

      <main className="flex-1 w-full px-4 sm:px-8 lg:px-12 py-8">
        <TrasladosClient
          traslados={traslados}
          sucursales={sucursales}
          marcas={marcas}
          vehiculosIniciales={vehiculosIniciales}
          esOperador={esOperador}
          viewerRol={profile.rol}
          viewerSucursales={viewerSucursales}
        />
      </main>
    </div>
  );
}