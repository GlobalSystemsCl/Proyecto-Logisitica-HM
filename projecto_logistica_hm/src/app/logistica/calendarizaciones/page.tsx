import { AuthService } from '@/services/auth.service';
import { SolicitudesService } from '@/services/solicitudes.service';
import { OrganizacionService } from '@/services/organizacion.service';
import { SucursalesService } from '@/services/sucursales.service';
import { redirect } from 'next/navigation';
import CalendarizacionesClient from './CalendarizacionesClient';
import PageHeader from '@/components/PageHeader';
import { hoyISO } from '@/lib/fechas';
import {
  VISTAS_CALENDARIO,
  esFechaValida,
  filtrosDesdeParams,
  rangoVista,
  type VistaCalendario,
} from '@/lib/calendario';

export const dynamic = 'force-dynamic';

/** Estados que se muestran en el calendario (tienen fecha de despacho programada). */
const ESTADOS_PROGRAMADOS = ['calendarizada', 'en_transito', 'entregada'];
/** Estados que esperan ser programados (columna "Por programar"). */
const ESTADOS_POR_PROGRAMAR = ['priorizada', 'asignada'];

/**
 * R16 — Calendario de logística. La vista (`mes`, `semana`, `dia`) y la fecha
 * vienen en la URL: el servidor consulta solo las solicitudes programadas
 * dentro del rango visible (ver `lib/calendario`).
 */
export default async function LogisticaCalendarizacionesPage({
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

  if (profile.rol !== 'jefe_local' && profile.rol !== 'administrador' && profile.rol !== 'logistica') {
    redirect('/dashboard');
  }

  const params = await searchParams;
  const vistaParam = Array.isArray(params.vista) ? params.vista[0] : params.vista;
  const fechaParam = Array.isArray(params.fecha) ? params.fecha[0] : params.fecha;
  const vista: VistaCalendario = VISTAS_CALENDARIO.includes(vistaParam as VistaCalendario)
    ? (vistaParam as VistaCalendario)
    : 'mes';
  const fecha = esFechaValida(fechaParam) ? fechaParam : hoyISO();
  const rango = rangoVista(vista, fecha);

  const sucursalesAsignadas = await OrganizacionService.getUserAssignedBranches(profile.id);
  const [programadas, porProgramar, slotsSucursales, todasLasSucursales, zonas] = await Promise.all([
    SolicitudesService.getSolicitudesFiltradas(profile.id, profile.rol, {
      estados: ESTADOS_PROGRAMADOS,
      programadasDesde: rango.desde,
      programadasHasta: rango.hasta,
    }),
    SolicitudesService.getSolicitudesFiltradas(profile.id, profile.rol, { estados: ESTADOS_POR_PROGRAMAR }),
    SucursalesService.getSlotsPorSucursales(sucursalesAsignadas.map((s) => s.id)),
    SucursalesService.getSucursales(),
    OrganizacionService.getZonas(),
  ]);

  const reprogramaciones = await SolicitudesService.getConteoReprogramaciones(programadas.map((s) => s.id));

  const encargados = new Map<string, string>();
  [...programadas, ...porProgramar].forEach((s) => {
    if (s.logistica_id) encargados.set(s.logistica_id, s.logistica_nombre ?? 'Sin nombre');
  });

  return (
    <div className="min-h-screen bg-neutral-100 text-neutral-900 flex flex-col">
      <PageHeader
        nombre={profile.nombre}
        apellido={profile.apellido}
        rol={profile.rol}
        sucursalNombre={profile.sucursal_nombre}
        backHref="/dashboard"
        slots={
          profile.rol === 'jefe_local' || profile.rol === 'administrador'
            ? slotsSucursales
            : null
        }
      />

      <main className="flex-1 w-full px-4 sm:px-8 lg:px-12 py-8">
        <CalendarizacionesClient
          key={`${vista}-${fecha}`}
          vista={vista}
          fecha={fecha}
          dias={rango.dias}
          filtrosIniciales={filtrosDesdeParams(params)}
          programadas={programadas}
          porProgramar={porProgramar}
          reprogramaciones={reprogramaciones}
          sucursales={todasLasSucursales.map((s) => ({ id: s.id, nombre: s.nombre ?? null }))}
          zonas={zonas.map((z) => ({ id: z.id, nombre: z.nombre }))}
          encargados={[...encargados.entries()].map(([id, nombre]) => ({ id, nombre }))}
          viewer={{ id: profile.id, rol: profile.rol, sucursal_id: profile.sucursal_id ?? null }}
          sucursales_asignadas={sucursalesAsignadas}
        />
      </main>
    </div>
  );
}
