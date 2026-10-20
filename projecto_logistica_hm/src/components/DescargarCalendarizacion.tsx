'use client';

import { useState } from 'react';
import { Download, Loader2, X } from 'lucide-react';
import { exportarCalendarizacionAction } from '@/app/actions/exportes.actions';
import { descargarExcel } from '@/lib/excel';
import { hoyISO } from '@/lib/fechas';
import { rangoPorDefectoCalendarizacion, validarRangoExporte } from '@/lib/reporteTraslados';

const COLUMNAS = [
  'Solicitud', 'Fecha programada', 'Origen', 'Destino', 'Chasis', 'Patente', 'Marca', 'Modelo', 'Color',
  'Tipo', 'Transportista', 'RUT transportista', 'Logística asignada', 'Estado',
];

/**
 * Descarga en Excel los traslados programados (y en tránsito) del rango que
 * elija el usuario. Por defecto, los de mañana ("de un día para otro").
 */
export default function DescargarCalendarizacion() {
  const [abierto, setAbierto] = useState(false);
  const [rango, setRango] = useState(() => rangoPorDefectoCalendarizacion(hoyISO()));
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  async function descargar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setAviso(null);
    const errorRango = validarRangoExporte(rango.desde, rango.hasta);
    if (errorRango) {
      setError(errorRango);
      return;
    }
    setCargando(true);
    try {
      const res = await exportarCalendarizacionAction(rango.desde, rango.hasta);
      if (!res.success) {
        setError(res.error);
        return;
      }
      descargarExcel(`calendarizacion_${rango.desde}_${rango.hasta}.xlsx`, [
        { nombre: 'Calendarización', filas: res.filas, encabezados: COLUMNAS },
      ]);
      if (res.filas.length === 0) setAviso('No hay traslados programados en ese rango: el archivo salió solo con los títulos.');
      else setAbierto(false);
    } finally {
      setCargando(false);
    }
  }

  const inputCls = 'w-full rounded-xl border border-neutral-300 p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900';

  return (
    <>
      <button
        onClick={() => setAbierto(true)}
        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-neutral-300 bg-white text-sm font-semibold text-neutral-700 hover:bg-neutral-50 cursor-pointer"
      >
        <Download className="w-4 h-4" /> Descargar Excel
      </button>

      {abierto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setAbierto(false)}>
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3 p-5 border-b border-neutral-200">
              <div>
                <h3 className="font-bold text-neutral-900">Descargar calendarización</h3>
                <p className="text-xs text-neutral-500 mt-0.5">Traslados programados o en tránsito, por fecha de despacho programada.</p>
              </div>
              <button onClick={() => setAbierto(false)} className="p-1.5 rounded-lg text-neutral-500 hover:bg-neutral-100 cursor-pointer" aria-label="Cerrar">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={descargar} className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-neutral-600 uppercase tracking-wider mb-1">Desde</label>
                  <input type="date" value={rango.desde} onChange={(e) => setRango({ ...rango, desde: e.target.value })} className={inputCls} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-neutral-600 uppercase tracking-wider mb-1">Hasta</label>
                  <input type="date" value={rango.hasta} onChange={(e) => setRango({ ...rango, hasta: e.target.value })} className={inputCls} />
                </div>
              </div>
              {error && <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
              {aviso && <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">{aviso}</p>}
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setAbierto(false)} className="px-4 py-2 text-sm font-semibold text-neutral-600 rounded-xl hover:bg-neutral-100 cursor-pointer">
                  Volver
                </button>
                <button
                  type="submit"
                  disabled={cargando}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-neutral-900 hover:bg-neutral-700 rounded-xl cursor-pointer disabled:opacity-50"
                >
                  {cargando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />} Descargar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
