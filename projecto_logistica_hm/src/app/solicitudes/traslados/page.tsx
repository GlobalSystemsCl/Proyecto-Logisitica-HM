import { AuthService } from '@/services/auth.service';
import { OrganizacionService } from '@/services/organizacion.service';
import { redirect } from 'next/navigation';
import { getTrasladosAction, getSucursalesTrasladoAction } from '@/app/actions/traslados.actions';
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

  const [traslados, sucursales, marcas, empresas] = await Promise.all([
    getTrasladosAction(),
    getSucursalesTrasladoAction(),
    esOperador ? OrganizacionService.getMarcasCatalogo() : Promise.resolve([]),
    esOperador ? TransportistaService.listarEmpresas().then(empresasParaProgramar) : Promise.resolve([]),
  ]);

  return (
    <TrasladosClient
      traslados={traslados}
      sucursales={sucursales}
      marcas={marcas}
      esOperador={esOperador}
      viewerRol={profile.rol}
      viewerSucursales={viewerSucursales}
      empresas={empresas}
      trasladoInicialId={idDesdeParam((await searchParams).traslado)}
    />
  );
}