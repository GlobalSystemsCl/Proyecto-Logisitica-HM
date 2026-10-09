import { redirect } from 'next/navigation';
import { AuthService } from '@/services/auth.service';
import { SolicitudesService } from '@/services/solicitudes.service';
import { ReporteService } from '@/services/reporte.service';
import { OrganizacionService } from '@/services/organizacion.service';
import PageHeader from '@/components/PageHeader';
import ReportesClient from './ReportesClient';
import { hoyISO } from '@/lib/fechas';
import { esFechaValida, sumarDias } from '@/lib/calendario';
import { calcularReporte } from '@/lib/reporteLogistica';

export const dynamic = 'force-dynamic';

/** R17 — Reportería de Logística. Solo el administrador. */
export default async function ReportesLogisticaPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const profile = await AuthService.getCurrentUserProfile();

  if (!profile) {
    redirect('/login');
  }

  if (profile.rol !== 'administrador') {
    redirect('/dashboard?error=unauthorized');
  }

  const params = await searchParams;
  const uno = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const hoy = hoyISO();
  let hasta = esFechaValida(uno(params.hasta)) ? (uno(params.hasta) as string) : hoy;
  let desde = esFechaValida(uno(params.desde)) ? (uno(params.desde) as string) : sumarDias(hasta, -29);
  if (desde > hasta) [desde, hasta] = [hasta, desde];

  const [solicitudes, eventos, usuarios, zonas] = await Promise.all([
    SolicitudesService.getSolicitudes(),
    ReporteService.getEventosLogistica(),
    ReporteService.getUsuariosLogistica(),
    OrganizacionService.getZonas(),
  ]);

  const reporte = calcularReporte(solicitudes, eventos, usuarios, {
    desde,
    hasta,
    ahora: new Date().toISOString(),
  });

  return (
    <div className="min-h-screen bg-neutral-100 text-neutral-900 flex flex-col">
      <PageHeader
        nombre={profile.nombre}
        apellido={profile.apellido}
        rol={profile.rol}
        sucursalNombre={profile.sucursal_nombre}
        backHref="/dashboard"
      />
      <main className="flex-1 w-full px-4 sm:px-8 lg:px-12 py-8">
        <ReportesClient
          desde={desde}
          hasta={hasta}
          reporte={reporte}
          zonas={zonas.map((z) => ({ id: z.id, nombre: z.nombre }))}
        />
      </main>
    </div>
  );
}
