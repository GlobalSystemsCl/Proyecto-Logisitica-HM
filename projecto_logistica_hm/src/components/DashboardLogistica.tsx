import Link from 'next/link';
import { CalendarClock, Clock, PackageSearch, Warehouse } from 'lucide-react';
import type { SolicitudLista } from '@/types/solicitud.types';
import type { TrasladoInterno } from '@/types/traslado.types';
import PanelAcciones from '@/components/PanelAcciones';
import BadgeEvento from '@/components/BadgeEvento';
import { recortar, LIMITE_PANEL_JEFE_LOCAL } from '@/lib/panel';
import { formatFecha } from '@/lib/fechas';
import { etiquetaVehiculo } from '@/lib/vehiculo';
import { ETIQUETA_FECHA_LIMITE } from '@/lib/textos';

interface Props {
  /** Solicitudes de la zona del usuario de Logística. */
  solicitudes: SolicitudLista[];
  /** Traslados internos de los que es encargado. */
  traslados: TrasladoInterno[];
}

const CALENDARIO = '/logistica/calendarizaciones';
const BOTON_VER =
  'px-3 py-1.5 text-xs font-semibold text-white bg-neutral-900 hover:bg-neutral-700 rounded-lg shrink-0';

function ruta(s: SolicitudLista): string {
  return `${s.sucursal_nombre ?? `Sucursal ${s.sucursal}`} → ${s.sucursal_destino_nombre ?? s.titulo_evento ?? 'Evento'}`;
}

function vehiculos(s: SolicitudLista): string {
  return s.vehiculos.map((v) => etiquetaVehiculo(v)).filter(Boolean).join(' · ') || 'Sin vehículos';
}

function numero(id: string): string {
  return `#${id.slice(0, 8).toUpperCase()}`;
}

/** Abre el calendario con la solicitud ya buscada (y en su día, si tiene fecha). */
function hrefCalendario(s: SolicitudLista): string {
  const p = new URLSearchParams({ q: s.id.slice(0, 8) });
  const dia = s.fecha_tentativa_despacho?.slice(0, 10);
  if (dia) {
    p.set('vista', 'dia');
    p.set('fecha', dia);
  }
  return `${CALENDARIO}?${p.toString()}`;
}

function tiempo(fecha: string | null | undefined): number {
  return fecha ? new Date(fecha).getTime() : Number.POSITIVE_INFINITY;
}

function FilaSolicitud({ s, detalle }: { s: SolicitudLista; detalle: string }) {
  return (
    <li className="px-5 py-3 flex items-center gap-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="font-mono text-[11px] font-bold text-neutral-900">{numero(s.id)}</span>
          {s.tipo_solicitud === 'evento' && <BadgeEvento tamano="sm" />}
        </div>
        <p className="text-sm font-semibold text-neutral-900 truncate">{ruta(s)}</p>
        <p className="text-xs text-neutral-500 truncate">{vehiculos(s)}</p>
        <p className="text-[11px] text-neutral-400 flex items-center gap-1">
          <Clock className="w-3 h-3" /> {detalle}
        </p>
      </div>
      <Link href={hrefCalendario(s)} className={BOTON_VER}>
        Ver
      </Link>
    </li>
  );
}

/**
 * Pendientes de Logística en el dashboard: solo visualización. Cada fila
 * lleva a la vista donde se hace la acción.
 */
export default function DashboardLogistica({ solicitudes, traslados }: Props) {
  const porProgramar = recortar(
    solicitudes
      .filter((s) => s.estado === 'priorizada' || s.estado === 'asignada')
      .sort((a, b) => (a.posicion_prioridad ?? Infinity) - (b.posicion_prioridad ?? Infinity) || tiempo(a.fecha_limite) - tiempo(b.fecha_limite)),
    LIMITE_PANEL_JEFE_LOCAL
  );
  const porDespachar = recortar(
    solicitudes
      .filter((s) => s.estado === 'calendarizada')
      .sort((a, b) => tiempo(a.fecha_tentativa_despacho) - tiempo(b.fecha_tentativa_despacho)),
    LIMITE_PANEL_JEFE_LOCAL
  );
  const trasladosPendientes = recortar(
    traslados.filter((t) => t.estado === 'pendiente'),
    LIMITE_PANEL_JEFE_LOCAL
  );

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-[#1a2b4b] tracking-tight">Tus pendientes</h2>
        <p className="text-sm text-neutral-500">Lo que tienes por gestionar. Usa “Ver” para ir a la vista de cada acción.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        <PanelAcciones
          titulo="Por programar"
          descripcion="Priorizadas o asignadas sin fecha de despacho"
          icono={<CalendarClock className="w-5 h-5 text-amber-600" />}
          total={porProgramar.total}
          restantes={porProgramar.restantes}
          verTodasHref={CALENDARIO}
          textoVacio="No hay solicitudes por programar."
          tono="ambar"
        >
          {porProgramar.items.map((s) => (
            <FilaSolicitud
              key={s.id}
              s={s}
              detalle={`${ETIQUETA_FECHA_LIMITE}: ${formatFecha(s.fecha_limite) || '—'}`}
            />
          ))}
        </PanelAcciones>

        <PanelAcciones
          titulo="Por despachar"
          descripcion="Programadas que aún no salen de origen"
          icono={<PackageSearch className="w-5 h-5 text-sky-600" />}
          total={porDespachar.total}
          restantes={porDespachar.restantes}
          verTodasHref={CALENDARIO}
          textoVacio="No hay despachos programados."
          tono="azul"
        >
          {porDespachar.items.map((s) => (
            <FilaSolicitud
              key={s.id}
              s={s}
              detalle={`Despacho programado: ${formatFecha(s.fecha_tentativa_despacho) || '—'}`}
            />
          ))}
        </PanelAcciones>

        <PanelAcciones
          titulo="Traslados internos"
          descripcion="Traslados a tu cargo pendientes de despacho"
          icono={<Warehouse className="w-5 h-5 text-neutral-600" />}
          total={trasladosPendientes.total}
          restantes={trasladosPendientes.restantes}
          verTodasHref="/solicitudes/traslados"
          textoVacio="No hay traslados pendientes."
          tono="neutro"
        >
          {trasladosPendientes.items.map((t) => (
            <li key={t.id} className="px-5 py-3 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <span className="font-mono text-[11px] font-bold text-neutral-900">{numero(t.id)}</span>
                <p className="text-sm font-semibold text-neutral-900 truncate">
                  {t.origen_nombre ?? `Sucursal ${t.origen_id}`} → {t.destino_nombre ?? `Sucursal ${t.destino_id}`}
                </p>
                <p className="text-xs text-neutral-500 truncate">
                  {t.vehiculos.map((v) => `${v.patente ?? v.chasis} · ${v.marca} ${v.modelo}`).join(' · ') || 'Sin vehículo'}
                </p>
                <p className="text-[11px] text-neutral-400 flex items-center gap-1">
                  <Clock className="w-3 h-3" /> Creado {formatFecha(t.created_at)}
                </p>
              </div>
              <Link href="/solicitudes/traslados" className={BOTON_VER}>
                Ver
              </Link>
            </li>
          ))}
        </PanelAcciones>
      </div>
    </div>
  );
}
