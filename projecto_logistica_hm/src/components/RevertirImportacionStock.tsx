'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Loader2, RotateCcw, X } from 'lucide-react';
import { getImportacionesStockAction, revertirImportacionStockAction } from '@/app/actions/vehiculo.actions';
import { useConfirmacion } from '@/components/Confirmacion';
import { formatFechaHora } from '@/lib/fechas';
import {
  confirmacionReversionValida,
  LIMITE_IMPORTACIONES_LISTADAS,
  motivoNoRevertible,
  TEXTO_CONFIRMAR_REVERSION,
} from '@/lib/reversionImportacion';
import type { UserRole } from '@/types/auth.types';
import type { ImportacionStock } from '@/types/vehiculo.types';

interface Props {
  viewer: { id: string; rol: UserRole };
}

/**
 * Botón y modal para revertir una importación de stock subida por error:
 * lista las últimas importaciones y, al elegir una, pide escribir CONFIRMAR.
 * Se borran solo los vehículos de esa importación que no se usan en
 * solicitudes ni traslados.
 */
export default function RevertirImportacionStock({ viewer }: Props) {
  const router = useRouter();
  const { avisar, dialogoConfirmacion } = useConfirmacion();
  const [abierto, setAbierto] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [importaciones, setImportaciones] = useState<ImportacionStock[]>([]);
  const [elegida, setElegida] = useState<ImportacionStock | null>(null);
  const [confirmacion, setConfirmacion] = useState('');
  const [revirtiendo, setRevirtiendo] = useState(false);
  const [resultado, setResultado] = useState<string | null>(null);

  async function cargar() {
    setCargando(true);
    try {
      const res = await getImportacionesStockAction();
      if (res.success) setImportaciones(res.importaciones);
      else void avisar(res.error, 'No se pudieron cargar las importaciones');
    } finally {
      setCargando(false);
    }
  }

  function abrir() {
    setAbierto(true);
    setElegida(null);
    setConfirmacion('');
    setResultado(null);
    void cargar();
  }

  function cerrar() {
    if (revirtiendo) return;
    setAbierto(false);
    setElegida(null);
    setConfirmacion('');
  }

  async function revertir() {
    if (!elegida || !confirmacionReversionValida(confirmacion)) return;
    setRevirtiendo(true);
    try {
      const res = await revertirImportacionStockAction(elegida.id, confirmacion);
      if (!res.success) {
        void avisar(res.error, 'No se pudo revertir');
        return;
      }
      setResultado(res.mensaje);
      setElegida(null);
      setConfirmacion('');
      router.refresh();
      void cargar();
    } finally {
      setRevirtiendo(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={abrir}
        className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-white border border-neutral-300 text-neutral-900 text-sm font-semibold rounded-xl transition-all hover:border-red-300 hover:text-red-700 hover:bg-red-50 cursor-pointer"
      >
        <RotateCcw className="w-4 h-4" />
        <span>Revertir importación</span>
      </button>

      {abierto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={cerrar}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="titulo-revertir-importacion"
            onClick={(e) => e.stopPropagation()}
            className="bg-white border border-neutral-200 rounded-2xl w-full max-w-2xl shadow-2xl max-h-[92vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between p-6 border-b border-neutral-200">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-red-600 flex items-center justify-center text-white">
                  <RotateCcw className="w-5 h-5" />
                </div>
                <div>
                  <h2 id="titulo-revertir-importacion" className="text-lg font-bold text-neutral-900">
                    Revertir importación de stock
                  </h2>
                  <p className="text-xs text-neutral-500">
                    Elimina los vehículos que cargó un Excel subido por error. Últimas {LIMITE_IMPORTACIONES_LISTADAS} importaciones.
                  </p>
                </div>
              </div>
              <button onClick={cerrar} aria-label="Cerrar" className="text-neutral-400 hover:text-neutral-900 p-1 rounded-lg hover:bg-neutral-100 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {resultado && (
                <div className="flex items-start gap-2.5 p-3 rounded-xl border border-green-200 bg-green-50 text-sm text-green-800">
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{resultado}</span>
                </div>
              )}

              {elegida ? (
                <div className="space-y-4">
                  <div className="p-4 rounded-xl border border-red-200 bg-red-50 text-sm text-red-800 space-y-2">
                    <p className="flex items-center gap-2 font-semibold">
                      <AlertTriangle className="w-4 h-4 shrink-0" /> Esta acción no se puede deshacer
                    </p>
                    <p>
                      Se eliminarán del inventario hasta <strong>{elegida.vehiculos_actuales}</strong> vehículo(s) cargados desde{' '}
                      <strong>{elegida.archivo || 'el archivo'}</strong> el {formatFechaHora(elegida.created_at)}.
                    </p>
                    <p className="text-xs">
                      Los que ya se usan en una solicitud o un traslado se conservan. Los vehículos que existían antes de la importación (duplicados) no se tocan.
                    </p>
                  </div>
                  <label className="block space-y-1.5">
                    <span className="text-xs font-semibold text-neutral-600 uppercase tracking-wider">
                      Escribe {TEXTO_CONFIRMAR_REVERSION} para confirmar
                    </span>
                    <input
                      value={confirmacion}
                      onChange={(e) => setConfirmacion(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && void revertir()}
                      placeholder={TEXTO_CONFIRMAR_REVERSION}
                      autoComplete="off"
                      autoFocus
                      className="w-full rounded-xl border border-neutral-300 p-2.5 text-sm font-mono uppercase focus:outline-none focus:ring-2 focus:ring-red-600"
                    />
                  </label>
                  <div className="flex justify-end gap-2 pt-2 border-t border-neutral-200">
                    <button
                      type="button"
                      onClick={() => {
                        setElegida(null);
                        setConfirmacion('');
                      }}
                      disabled={revirtiendo}
                      className="px-4 py-2 text-sm font-semibold text-neutral-600 hover:text-neutral-900 rounded-xl hover:bg-neutral-100 cursor-pointer disabled:opacity-50"
                    >
                      Volver
                    </button>
                    <button
                      type="button"
                      onClick={() => void revertir()}
                      disabled={!confirmacionReversionValida(confirmacion) || revirtiendo}
                      className="inline-flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 rounded-xl disabled:opacity-50 cursor-pointer"
                    >
                      {revirtiendo ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
                      {revirtiendo ? 'Revirtiendo…' : 'Revertir importación'}
                    </button>
                  </div>
                </div>
              ) : cargando && importaciones.length === 0 ? (
                <p className="py-8 text-center text-sm text-neutral-500 flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" /> Cargando importaciones…
                </p>
              ) : importaciones.length === 0 ? (
                <p className="py-8 text-center text-sm text-neutral-400">Aún no hay importaciones registradas.</p>
              ) : (
                <ul className="divide-y divide-neutral-100 border border-neutral-200 rounded-xl">
                  {importaciones.map((imp) => {
                    const motivo = motivoNoRevertible(imp, viewer);
                    return (
                      <li key={imp.id} className="p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                        <div className="flex-1 min-w-0 space-y-0.5">
                          <p className="text-sm font-semibold text-neutral-900 flex items-center gap-1.5 min-w-0">
                            <FileSpreadsheet className="w-4 h-4 text-neutral-400 shrink-0" />
                            <span className="truncate">{imp.archivo || 'Archivo sin nombre'}</span>
                          </p>
                          <p className="text-xs text-neutral-500">
                            {formatFechaHora(imp.created_at)} · {imp.usuario_nombre ?? 'Usuario eliminado'}
                          </p>
                          <p className="text-xs text-neutral-500">
                            {imp.importados} importado(s) · {imp.duplicados} duplicado(s) · {imp.vehiculos_actuales} sigue(n) en el inventario
                          </p>
                          {imp.revertida_at && (
                            <p className="text-xs font-semibold text-red-700">
                              Revertida el {formatFechaHora(imp.revertida_at)}
                              {imp.revertida_por_nombre ? ` por ${imp.revertida_por_nombre}` : ''} · {imp.vehiculos_eliminados ?? 0} eliminado(s)
                            </p>
                          )}
                          {motivo && !imp.revertida_at && <p className="text-xs text-neutral-400">{motivo}</p>}
                        </div>
                        {!motivo && (
                          <button
                            type="button"
                            onClick={() => {
                              setResultado(null);
                              setConfirmacion('');
                              setElegida(imp);
                            }}
                            className="self-start sm:self-center inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-red-300 text-red-700 text-xs font-semibold hover:bg-red-50 cursor-pointer"
                          >
                            <RotateCcw className="w-3.5 h-3.5" /> Revertir
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
      {dialogoConfirmacion}
    </>
  );
}
