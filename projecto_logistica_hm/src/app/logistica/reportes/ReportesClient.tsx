'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, BarChart3, Clock, Download, Hourglass, Timer, Truck } from 'lucide-react';
import { utils, writeFile } from 'xlsx';
import {
  formatoHoras,
  porcentaje,
  type FilaEncargado,
  type ReporteLogistica,
  type Semaforo,
} from '@/lib/reporteLogistica';
import { formatFecha } from '@/lib/fechas';
import { ETIQUETA_FECHA_LIMITE } from '@/lib/textos';

interface Props {
  desde: string;
  hasta: string;
  reporte: ReporteLogistica;
  zonas: Array<{ id: number; nombre: string }>;
}

const SEMAFORO: Record<Semaforo, { punto: string; texto: string; etiqueta: string }> = {
  verde: { punto: 'bg-emerald-500', texto: 'text-emerald-700', etiqueta: 'Dentro del plazo' },
  amarillo: { punto: 'bg-amber-500', texto: 'text-amber-700', etiqueta: 'Sobre el plazo' },
  rojo: { punto: 'bg-red-500', texto: 'text-red-700', etiqueta: 'Muy atrasado' },
  sin_datos: { punto: 'bg-neutral-300', texto: 'text-neutral-500', etiqueta: 'Sin datos' },
};

function Semaforito({ valor }: { valor: Semaforo }) {
  const s = SEMAFORO[valor];
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${s.texto}`}>
      <span className={`w-2.5 h-2.5 rounded-full ${s.punto}`} />
      {s.etiqueta}
    </span>
  );
}

/**
 * R17 — Reportería de Logística. Mide a cada encargado por su tiempo de
 * respuesta y por lo que tiene pendiente o atrasado, con semáforo contra el
 * plazo objetivo.
 */
export default function ReportesClient({ desde, hasta, reporte, zonas }: Props) {
  const router = useRouter();
  const [rango, setRango] = useState({ desde, hasta });
  const t = reporte.totales;
  const sla = reporte.slaHoras;
  const nombreZona = (id: number | null) => zonas.find((z) => z.id === id)?.nombre ?? '—';

  function aplicarPeriodo(e: React.FormEvent) {
    e.preventDefault();
    router.push(`?desde=${rango.desde}&hasta=${rango.hasta}`);
  }

  function exportar() {
    const filas = reporte.porEncargado.map((f: FilaEncargado) => ({
      Encargado: f.nombre,
      Estado: SEMAFORO[f.semaforo].etiqueta,
      'Pendientes de gestionar': f.pendientes,
      [`Pendientes con más de ${sla} h`]: f.pendientesFueraDeSla,
      'Pendiente más antiguo (h)': f.antiguedadMaximaHoras ?? '',
      'En curso': f.enCurso,
      Atrasadas: f.atrasadas,
      'Respondidas en el período': f.respondidas,
      'Respuesta promedio (h)': f.respuestaPromedioHoras ?? '',
      'Respuesta mediana (h)': f.respuestaMedianaHoras ?? '',
      [`Respondidas dentro de ${sla} h`]: f.respuestasDentroDeSla,
      'Recibidas en el período': f.recibidas,
      'Recibidas a tiempo': f.recibidasATiempo,
      Reprogramaciones: f.reprogramaciones,
      'Cancelaciones en tránsito': f.cancelaciones,
    }));
    const pendientes = reporte.pendientesMasAntiguos.map((p) => ({
      Solicitud: p.id,
      Traslado: p.ruta,
      Encargado: p.encargado,
      Zona: nombreZona(p.zonaId),
      'Esperando (h)': Math.round(p.antiguedadHoras),
      [ETIQUETA_FECHA_LIMITE]: p.fechaLimite ? formatFecha(p.fechaLimite) : '',
      Atrasada: p.atrasada ? 'Sí' : 'No',
    }));
    const libro = utils.book_new();
    utils.book_append_sheet(libro, utils.json_to_sheet(filas), 'Por encargado');
    utils.book_append_sheet(libro, utils.json_to_sheet(pendientes), 'Pendientes');
    writeFile(libro, `reporte_logistica_${desde}_${hasta}.xlsx`);
  }

  const tarjetas = [
    { titulo: 'Pendientes de gestionar', valor: String(t.pendientes), detalle: `${t.pendientesFueraDeSla} con más de ${sla} h esperando`, icono: Hourglass, alerta: t.pendientesFueraDeSla > 0 },
    { titulo: 'Tiempo de respuesta promedio', valor: formatoHoras(t.respuestaPromedioHoras), detalle: `Mediana ${formatoHoras(t.respuestaMedianaHoras)} · objetivo ${sla} h`, icono: Timer, alerta: t.semaforo === 'rojo' },
    { titulo: 'Respondidas dentro del plazo', valor: porcentaje(t.respuestasDentroDeSla, t.respondidas), detalle: `${t.respuestasDentroDeSla} de ${t.respondidas} en el período`, icono: Clock, alerta: false },
    { titulo: 'Atrasadas', valor: String(t.atrasadas), detalle: `Pasada la ${ETIQUETA_FECHA_LIMITE.toLowerCase()}`, icono: AlertTriangle, alerta: t.atrasadas > 0 },
    { titulo: 'Recibidas a tiempo', valor: porcentaje(t.recibidasATiempo, t.recibidas), detalle: `${t.recibidasATiempo} de ${t.recibidas} en el período`, icono: Truck, alerta: false },
    { titulo: 'Reprogramaciones', valor: String(t.reprogramaciones), detalle: `${t.cancelaciones} cancelaciones en tránsito`, icono: BarChart3, alerta: false },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 flex items-center gap-2">
            <BarChart3 className="w-6 h-6" /> Reportería de Logística
          </h1>
          <p className="text-sm text-neutral-500 mt-1">
            Tiempo de respuesta, pendientes y atrasos de cada encargado. Plazo objetivo: calendarizar dentro de {sla} h desde la aprobación.
          </p>
        </div>
        <div className="flex items-end gap-2 flex-wrap">
          <form onSubmit={aplicarPeriodo} className="flex items-end gap-2">
            <label className="text-xs font-semibold text-neutral-600">
              Desde
              <input type="date" value={rango.desde} onChange={(e) => setRango((r) => ({ ...r, desde: e.target.value }))} className="block mt-1 rounded-xl border border-neutral-300 px-3 py-2 text-sm bg-white" />
            </label>
            <label className="text-xs font-semibold text-neutral-600">
              Hasta
              <input type="date" value={rango.hasta} onChange={(e) => setRango((r) => ({ ...r, hasta: e.target.value }))} className="block mt-1 rounded-xl border border-neutral-300 px-3 py-2 text-sm bg-white" />
            </label>
            <button type="submit" className="px-4 py-2 rounded-xl bg-neutral-900 text-white text-sm font-semibold cursor-pointer hover:bg-neutral-700">
              Aplicar
            </button>
          </form>
          <button onClick={exportar} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-neutral-300 bg-white text-sm font-semibold text-neutral-700 hover:bg-neutral-50 cursor-pointer">
            <Download className="w-4 h-4" /> Exportar Excel
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {tarjetas.map((c) => (
          <div key={c.titulo} className={`rounded-2xl border p-5 ${c.alerta ? 'bg-red-50 border-red-200' : 'bg-white border-neutral-200'}`}>
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium uppercase tracking-wider text-neutral-500">{c.titulo}</p>
              <c.icono className={`w-5 h-5 ${c.alerta ? 'text-red-600' : 'text-neutral-400'}`} />
            </div>
            <p className={`text-3xl font-bold mt-1 ${c.alerta ? 'text-red-800' : 'text-neutral-900'}`}>{c.valor}</p>
            <p className="text-xs text-neutral-500 mt-1">{c.detalle}</p>
          </div>
        ))}
      </div>

      <section className="bg-white border border-neutral-200 rounded-2xl overflow-hidden">
        <h2 className="px-5 py-3 border-b border-neutral-200 font-semibold text-sm">Por encargado ({formatFecha(desde)} – {formatFecha(hasta)})</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-neutral-50 text-left text-xs uppercase tracking-wider text-neutral-500">
                <th className="px-4 py-3">Encargado</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3">Pendientes</th>
                <th className="px-4 py-3">Más de {sla} h</th>
                <th className="px-4 py-3">Esperando más</th>
                <th className="px-4 py-3">Respuesta prom.</th>
                <th className="px-4 py-3">Dentro del plazo</th>
                <th className="px-4 py-3">En curso</th>
                <th className="px-4 py-3">Atrasadas</th>
                <th className="px-4 py-3">Recibidas a tiempo</th>
                <th className="px-4 py-3">Reprog.</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {reporte.porEncargado.length === 0 ? (
                <tr><td colSpan={11} className="px-4 py-8 text-center text-neutral-400">No hay usuarios de Logística activos.</td></tr>
              ) : (
                reporte.porEncargado.map((f) => (
                  <tr key={f.id} className="hover:bg-neutral-50">
                    <td className="px-4 py-3 font-semibold text-neutral-900">{f.nombre}</td>
                    <td className="px-4 py-3"><Semaforito valor={f.semaforo} /></td>
                    <td className="px-4 py-3 tabular-nums">{f.pendientes}</td>
                    <td className={`px-4 py-3 tabular-nums ${f.pendientesFueraDeSla > 0 ? 'font-bold text-red-700' : ''}`}>{f.pendientesFueraDeSla}</td>
                    <td className="px-4 py-3">{formatoHoras(f.antiguedadMaximaHoras)}</td>
                    <td className="px-4 py-3">{formatoHoras(f.respuestaPromedioHoras)}</td>
                    <td className="px-4 py-3">{porcentaje(f.respuestasDentroDeSla, f.respondidas)} <span className="text-xs text-neutral-400">({f.respondidas})</span></td>
                    <td className="px-4 py-3 tabular-nums">{f.enCurso}</td>
                    <td className={`px-4 py-3 tabular-nums ${f.atrasadas > 0 ? 'font-bold text-red-700' : ''}`}>{f.atrasadas}</td>
                    <td className="px-4 py-3">{porcentaje(f.recibidasATiempo, f.recibidas)} <span className="text-xs text-neutral-400">({f.recibidas})</span></td>
                    <td className="px-4 py-3 tabular-nums">{f.reprogramaciones}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="bg-white border border-neutral-200 rounded-2xl overflow-hidden">
        <h2 className="px-5 py-3 border-b border-neutral-200 font-semibold text-sm">Pendientes que más esperan</h2>
        {reporte.pendientesMasAntiguos.length === 0 ? (
          <p className="px-5 py-6 text-sm text-neutral-400">No hay solicitudes pendientes de gestionar.</p>
        ) : (
          <ul className="divide-y divide-neutral-100">
            {reporte.pendientesMasAntiguos.slice(0, 10).map((p) => (
              <li key={p.id} className="px-5 py-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                <span className="font-mono text-xs text-neutral-500">#{p.id.slice(0, 8)}</span>
                <span className="font-semibold text-neutral-900">{p.ruta}</span>
                <span className="text-xs text-neutral-500">Encargado: {p.encargado} · Zona: {nombreZona(p.zonaId)}</span>
                <span className={`text-xs font-bold ${p.antiguedadHoras > sla ? 'text-red-700' : 'text-neutral-700'}`}>
                  Esperando {formatoHoras(p.antiguedadHoras)}
                </span>
                {p.atrasada && <span className="px-1.5 py-0.5 rounded border text-[10px] font-semibold bg-red-50 text-red-700 border-red-200">Atrasada</span>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
