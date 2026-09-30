import { AuthService } from '@/services/auth.service';
import { SucursalesService } from '@/services/sucursales.service';
import { SolicitudesService } from '@/services/solicitudes.service';
import { OrganizacionService } from '@/services/organizacion.service';
import { redirect } from 'next/navigation';
import SolicitudesClient from './SolicitudesClient';
import SolicitudesHeader from '@/components/SolicitudesHeader';

export const dynamic = 'force-dynamic';

export default async function SolicitudesPage() {
  const profile = await AuthService.getCurrentUserProfile();

  if (!profile) {
    redirect('/login');
  }

  if (!profile.activo) {
    redirect('/dashboard?error=unauthorized');
  }

  const esGestor = profile.rol === 'jefe_local' || profile.rol === 'administrador';
  const esEjecutivo = profile.rol === 'ejecutivo';

  const rolesSolicitudes = ['administrador', 'jefe_local', 'ejecutivo', 'logistica'];
  if (!rolesSolicitudes.includes(profile.rol)) {
    redirect('/dashboard?error=unauthorized');
  }

  const sucursalesAsignadas = await OrganizacionService.getUserAssignedBranches(profile.id);
  const [solicitudes, sucursales, vehiculos, slotsSucursales] = await Promise.all([
    SolicitudesService.getSolicitudesFiltradas(profile.id, profile.rol),
    SucursalesService.getSucursales(),
    SolicitudesService.getVehiculosInventario(),
    SucursalesService.getSlotsPorSucursales(sucursalesAsignadas.map((s) => s.id)),
  ]);

  return (
    <div className="min-h-screen bg-neutral-100 text-neutral-900 flex flex-col">
      <SolicitudesHeader
        title="Módulo de Solicitudes"
        nombre={profile.nombre}
        apellido={profile.apellido}
        rol={profile.rol}
        sucursalNombre={profile.sucursal_nombre}
        slots={
          profile.rol === 'jefe_local' || profile.rol === 'administrador'
            ? slotsSucursales.map((s) => ({
                nombre: s.nombre,
                slots: s.slots,
                slots_ocupados: s.slots_ocupados,
              }))
            : null
        }
        tabs={[
          { href: '/solicitudes', label: 'General', active: true },
          ...(profile.rol === 'administrador' ||
          profile.rol === 'logistica' ||
          profile.rol === 'jefe_local'
            ? [{ href: '/solicitudes/traslados', label: 'Traslados', active: false }]
            : []),
          ...(esGestor || esEjecutivo
            ? [{ href: '/solicitudes/aprobaciones', label: 'Aprobaciones', active: false }]
            : []),
          ...(esGestor
            ? [{ href: '/solicitudes/prioridades', label: 'Prioridades', active: false }]
            : []),
        ]}
      />

      <main className="flex-1 w-full px-4 sm:px-8 lg:px-12 py-8">
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
      </main>
    </div>
  );
}
