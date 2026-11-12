import { AuthService } from '@/services/auth.service';
import { OrganizacionService } from '@/services/organizacion.service';
import { redirect } from 'next/navigation';
import { getTrasladosAction, getVehiculosParaTrasladoAction, getSucursalesTrasladoAction } from '@/app/actions/traslados.actions';
import TrasladosClient from './TrasladosClient';
import { TransportistaService } from '@/services/transportista.service';
import { empresasParaProgramar } from '@/lib/transporte';
import { idDesdeParam } from '@/lib/enlaceNotificacion';

export const dynamic = 'force-dynamic';

export default async function TrasladosPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const profile = await AuthService.getCurrentUserProfile();

  if (!profile) {
    redirect('/login');
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

  const [traslados, sucursales, vehiculosIniciales, marcas, empresas] = await Promise.all([
    getTrasladosAction(),
    getSucursalesTrasladoAction(),
    esOperador
      ? getVehiculosParaTrasladoAction('', 1, 12)
      : Promise.resolve({ vehiculos: [], total: 0, page: 1, pageSize: 12, totalPages: 0 }),
    esOperador ? OrganizacionService.getMarcasCatalogo() : Promise.resolve([]),
    esOperador ? TransportistaService.listarEmpresas().then(empresasParaProgramar) : Promise.resolve([]),
  ]);

  return (
    <TrasladosClient
      traslados={traslados}
      sucursales={sucursales}
      marcas={marcas}
      vehiculosIniciales={vehiculosIniciales}
      esOperador={esOperador}
      viewerRol={profile.rol}
      viewerSucursales={viewerSucursales}
      empresas={empresas}
      trasladoInicialId={idDesdeParam((await searchParams).traslado)}
    />
  );
}