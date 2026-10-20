import { redirect } from 'next/navigation';
import { AuthService } from '@/services/auth.service';
import { SolicitudesService } from '@/services/solicitudes.service';
import { TrasladoService } from '@/services/traslado.service';
import { OrganizacionService } from '@/services/organizacion.service';
import PageHeader from '@/components/PageHeader';
import MovimientosClient from './MovimientosClient';
import { hoyISO } from '@/lib/fechas';
import { esFechaValida } from '@/lib/calendario';
import { unirMovimientos, validarRangoExporte } from '@/lib/reporteTraslados';

export const dynamic = 'force-dynamic';

/**
 * Reporte de movimientos (pedido del cliente, 2026-10-19): todo lo despachado
 * en un rango, solicitudes y traslados internos, una fila por vehículo. Con él
 * Logística revisa la factura del transportista y la exporta a Excel.
 * Alcance: Logística, las sucursales de origen de sus zonas; administrador, todas.
 */
export default async function MovimientosPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
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

  const params = await searchParams;
  const uno = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const hoy = hoyISO();
  // Por defecto, el mes en curso hasta hoy (las facturas suelen ser quincenales o mensuales).
  const porDefecto = { desde: `${hoy.slice(0, 8)}01`, hasta: hoy };
  const pedido = {
    desde: esFechaValida(uno(params.desde)) ? (uno(params.desde) as string) : porDefecto.desde,
    hasta: esFechaValida(uno(params.hasta)) ? (uno(params.hasta) as string) : porDefecto.hasta,
  };
  const errorRango = validarRangoExporte(pedido.desde, pedido.hasta);
  const { desde, hasta } = errorRango ? porDefecto : pedido;

  const origenIds = profile.rol === 'administrador' ? null : await OrganizacionService.getSucursalIdsDeZonasUsuario(profile.id);

  const [solicitudes, traslados] = await Promise.all([
    SolicitudesService.getSolicitudesFiltradas(profile.id, profile.rol, {
      despachadasDesde: desde,
      despachadasHasta: hasta,
    }),
    TrasladoService.getTrasladosDespachados(desde, hasta, origenIds),
  ]);

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
      <main className="flex-1 w-full px-4 sm:px-8 lg:px-12 py-8">
        <MovimientosClient
          key={`${desde}-${hasta}`}
          desde={desde}
          hasta={hasta}
          errorRango={errorRango}
          movimientos={unirMovimientos(solicitudes, traslados, desde, hasta)}
          sinZonas={origenIds !== null && origenIds.length === 0}
        />
      </main>
    </div>
  );
}
