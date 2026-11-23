'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, CheckCircle2, Download, FileSpreadsheet, Loader2, Upload, X } from 'lucide-react';
import { cambiarUbicacionPorPlantillaAction, type ResultadoCargaUbicaciones } from '@/app/actions/vehiculo.actions';
import { descargarLibro } from '@/lib/excel';
import { hoyISO } from '@/lib/fechas';
import {
  crearPlantillaUbicaciones,
  leerPlantillaUbicacion,
  vehiculosParaPlantillaUbicacion,
  type FilaPlantillaUbicacion,
  type SucursalPlantilla,
} from '@/lib/plantillaUbicacion';

interface Props {
  vehiculos: Array<{ chasis: string; ubicacion: number | null; estado_disponibilidad: string; en_transito_hacia?: string | null }>;
  sucursales: SucursalPlantilla[];
}

/** Detalle de filas no actualizadas que se muestra (el resto se resume). */
const MAX_DETALLE = 15;

/**
 * Cambio de ubicación masivo con Excel: 1) descargar la plantilla con los
 * vehículos sin ubicación (VIN + Ubicación); 2) completar la ubicación; 3)
 * subirla: solo se actualizan los vehículos de las filas con ubicación.
 */
export default function UbicacionMasivaExcel({ vehiculos, sucursales }: Props) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [abierto, setAbierto] = useState(false);
  const [descargando, setDescargando] = useState(false);
  const [leyendo, setLeyendo] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [archivo, setArchivo] = useState('');
  const [filas, setFilas] = useState<FilaPlantillaUbicacion[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ResultadoCargaUbicaciones | null>(null);

  const sinUbicacion = vehiculosParaPlantillaUbicacion(vehiculos);
  const conUbicacion = filas?.filter((f) => f.ubicacion).length ?? 0;

  function cerrar() {
    if (enviando) return;
    setAbierto(false);
    setArchivo('');
    setFilas(null);
    setError(null);
    setResultado(null);
  }

  async function descargar() {
    setDescargando(true);
    setError(null);
    try {
      const libro = await crearPlantillaUbicaciones(sinUbicacion, sucursales);
      await descargarLibro(`plantilla_ubicaciones_${hoyISO()}.xlsx`, libro);
    } catch {
      setError('No se pudo generar la plantilla.');
    } finally {
      setDescargando(false);
    }
  }

  async function leerArchivo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setArchivo(file.name);
    setFilas(null);
    setResultado(null);
    setError(null);
    setLeyendo(true);
    try {
      const XLSX = await import('xlsx');
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const hoja = wb.Sheets[wb.SheetNames[0] || ''];
      if (!hoja) {
        setError('El archivo no tiene hojas.');
        return;
      }
      const matriz: unknown[][] = XLSX.utils.sheet_to_json(hoja, { header: 1, raw: false, defval: '' });
      const leido = leerPlantillaUbicacion(matriz);
      if (leido.error) setError(leido.error);
      else setFilas(leido.filas ?? null);
    } catch {
      setError('No se pudo leer el archivo. Verifica que sea un .xlsx o .xls válido.');
    } finally {
      setLeyendo(false);
    }
  }

  async function aplicar() {
    if (!filas) return;
    setEnviando(true);
    setError(null);
    try {
      const res = await cambiarUbicacionPorPlantillaAction(filas);
      if (!res.success) {
        setError(res.error ?? 'No se pudo cambiar la ubicación.');
        return;
      }
      setResultado(res);
      setFilas(null);
      if (res.movidos > 0) router.refresh();
    } finally {
      setEnviando(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-white border border-neutral-300 text-neutral-900 text-sm font-semibold rounded-xl transition-all hover:bg-neutral-50 cursor-pointer"
      >
        <FileSpreadsheet className="w-4 h-4" />
        <span>Ubicación por Excel</span>
      </button>

      {abierto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" aria-modal="true" role="dialog">
          <div className="bg-white border border-neutral-200 rounded-2xl w-full max-w-lg shadow-2xl max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-200">
              <h2 className="text-lg font-bold text-neutral-900 flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5" /> Cambiar ubicación con Excel
              </h2>
              <button type="button" onClick={cerrar} aria-label="Cerrar" className="p-1.5 rounded-lg text-neutral-500 hover:bg-neutral-100 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-5 text-sm">
              <section className="space-y-2">
                <p className="font-semibold text-neutral-900">1. Descarga la plantilla</p>
                <p className="text-neutral-600">
                  Trae los <strong>{sinUbicacion.length}</strong> vehículo(s) sin ubicación, con su VIN. En la columna Ubicación
                  elige la sucursal de la lista; deja vacía la fila de los que no quieras cambiar.
                </p>
                <button
                  type="button"
                  onClick={() => void descargar()}
                  disabled={descargando || sinUbicacion.length === 0}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-white border border-neutral-300 rounded-xl hover:bg-neutral-50 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {descargando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                  {sinUbicacion.length === 0 ? 'No hay vehículos sin ubicación' : 'Descargar plantilla'}
                </button>
              </section>

              <section className="space-y-2">
                <p className="font-semibold text-neutral-900">2. Sube la plantilla completada</p>
                <p className="text-neutral-600">
                  Solo se actualizan los vehículos del archivo que tengan ubicación, buscados por su VIN. Los reservados, entregados o
                  en traslado no se mueven.
                </p>
                <input ref={inputRef} type="file" accept=".xlsx,.xls" onChange={(e) => void leerArchivo(e)} className="hidden" />
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  disabled={leyendo || enviando}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-white border border-neutral-300 rounded-xl hover:bg-neutral-50 cursor-pointer disabled:opacity-50"
                >
                  {leyendo ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  Elegir archivo
                </button>
                {archivo && <p className="text-xs text-neutral-500 font-mono break-all">{archivo}</p>}
                {filas && (
                  <p className="text-neutral-700">
                    {conUbicacion} vehículo(s) con ubicación para cambiar
                    {filas.length - conUbicacion > 0 ? ` · ${filas.length - conUbicacion} fila(s) sin ubicación (quedan igual)` : ''}.
                  </p>
                )}
              </section>

              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              {resultado && (
                <div className="space-y-2">
                  <div className="p-3 bg-green-50 border border-green-200 rounded-xl text-xs text-green-800 flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{resultado.mensaje}</span>
                  </div>
                  {resultado.errores.length > 0 && (
                    <ul className="max-h-48 overflow-y-auto border border-neutral-200 rounded-xl divide-y divide-neutral-100 text-xs">
                      {resultado.errores.slice(0, MAX_DETALLE).map((e, i) => (
                        <li key={`${e.fila}-${e.vin}-${i}`} className="px-3 py-1.5">
                          <span className="text-neutral-500">Fila {e.fila || '—'}</span>{' '}
                          <span className="font-mono text-neutral-900">{e.vin || '—'}</span>: {e.motivo}
                        </li>
                      ))}
                      {resultado.errores.length > MAX_DETALLE && (
                        <li className="px-3 py-1.5 text-neutral-500">y {resultado.errores.length - MAX_DETALLE} más.</li>
                      )}
                    </ul>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-neutral-200">
              <button
                type="button"
                onClick={cerrar}
                disabled={enviando}
                className="px-4 py-2 text-sm font-semibold text-neutral-600 hover:text-neutral-900 rounded-xl hover:bg-neutral-100 cursor-pointer disabled:opacity-50"
              >
                {resultado ? 'Cerrar' : 'Cancelar'}
              </button>
              {!resultado && (
                <button
                  type="button"
                  onClick={() => void aplicar()}
                  disabled={enviando || !filas || conUbicacion === 0}
                  className="inline-flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-neutral-900 hover:bg-neutral-700 rounded-xl cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {enviando && <Loader2 className="w-4 h-4 animate-spin" />}
                  {enviando ? 'Cambiando...' : `Cambiar ubicación de ${conUbicacion}`}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
