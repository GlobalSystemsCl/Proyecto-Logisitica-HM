import { AuthService } from '@/services/auth.service';
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

  const [traslados, sucursales, vehiculos] = await Promise.all([
    getTrasladosAction(),
    getSucursalesTrasladoAction(),
    esOperador ? getVehiculosParaTrasladoAction() : Promise.resolve([]),
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
          vehiculos={vehiculos}
          esOperador={esOperador}
          viewerId={profile.id}
        />
      </main>
    </div>
  );
}