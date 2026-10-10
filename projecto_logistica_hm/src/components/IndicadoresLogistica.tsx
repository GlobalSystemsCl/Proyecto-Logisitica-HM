import Link from 'next/link';
import { AlertTriangle, ArrowRight, Gauge, Hourglass, Inbox, Timer } from 'lucide-react';
import { formatoHoras, porcentaje, type FilaEncargado, type Semaforo } from '@/lib/reporteLogistica';

interface Props {
  propia: FilaEncargado;
  sinAsignar: FilaEncargado | null;
  slaHoras: number;
}

const SEMAFORO: Record<Semaforo, { caja: string; punto: string; texto: string }> = {
  verde: { caja: 'bg-emerald-50 border-emerald-200', punto: 'bg-emerald-500', texto: 'Vas dentro del plazo' },
  amarillo: { caja: 'bg-amber-50 border-amber-200', punto: 'bg-amber-500', texto: 'Tienes trabajo sobre el plazo' },
  rojo: { caja: 'bg-red-50 border-red-200', punto: 'bg-red-500', texto: 'Tienes trabajo muy atrasado' },
  sin_datos: { caja: 'bg-white border-neutral-200', punto: 'bg-neutral-300', texto: 'Sin actividad reciente' },
};

/**
 * R17 — Indicadores propios del encargado de Logística (últimos 30 días): lo
 * mismo con que lo mide el administrador, para que vea su situación.
 */
export default function IndicadoresLogistica({ propia, sinAsignar, slaHoras }: Props) {
  const s = SEMAFORO[propia.semaforo];
  const tarjetas = [
    { titulo: 'Por calendarizar', valor: String(propia.pendientes), detalle: `${propia.pendientesFueraDeSla} con más de ${slaHoras} h esperando`, icono: Hourglass, alerta: propia.pendientesFueraDeSla > 0 },
    { titulo: 'Atrasadas', valor: String(propia.atrasadas), detalle: 'Pasada la fecha límite de entrega propuesta', icono: AlertTriangle, alerta: propia.atrasadas > 0 },
    { titulo: 'Tu tiempo de respuesta', valor: formatoHoras(propia.respuestaPromedioHoras), detalle: `${porcentaje(propia.respuestasDentroDeSla, propia.respondidas)} dentro de ${slaHoras} h`, icono: Timer, alerta: propia.semaforo === 'rojo' },
    { titulo: 'Sin encargado en tus zonas', valor: String(sinAsignar?.pendientes ?? 0), detalle: 'Esperando que alguien las tome', icono: Inbox, alerta: (sinAsignar?.pendientesFueraDeSla ?? 0) > 0 },
  ];

  return (
    <section className={`rounded-2xl border p-5 space-y-4 ${s.caja}`}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <h2 className="text-lg font-bold text-[#1a2b4b] flex items-center gap-2">
          <Gauge className="w-5 h-5 text-blue-600" /> Tus indicadores
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-neutral-600 ml-2">
            <span className={`w-2.5 h-2.5 rounded-full ${s.punto}`} /> {s.texto}
          </span>
        </h2>
        <Link href="/logistica/calendarizaciones" className="inline-flex items-center gap-1 text-sm font-semibold text-blue-700 hover:underline">
          Ir a calendarizar <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        {tarjetas.map((c) => (
          <div key={c.titulo} className={`rounded-xl border p-4 bg-white ${c.alerta ? 'border-red-300' : 'border-neutral-200'}`}>
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium uppercase tracking-wider text-neutral-500">{c.titulo}</p>
              <c.icono className={`w-4 h-4 ${c.alerta ? 'text-red-600' : 'text-neutral-400'}`} />
            </div>
            <p className={`text-2xl font-bold mt-1 ${c.alerta ? 'text-red-700' : 'text-neutral-900'}`}>{c.valor}</p>
            <p className="text-xs text-neutral-500 mt-0.5">{c.detalle}</p>
          </div>
        ))}
      </div>
      <p className="text-xs text-neutral-500">
        Plazo objetivo: calendarizar dentro de {slaHoras} h desde la aprobación. Estos mismos indicadores los revisa el administrador.
      </p>
    </section>
  );
}
