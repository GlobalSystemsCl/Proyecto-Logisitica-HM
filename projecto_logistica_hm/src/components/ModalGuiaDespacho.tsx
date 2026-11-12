'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, Truck, X } from 'lucide-react';
import { MAX_LARGO_GUIA, validarGuias } from '@/lib/guiaDespacho';

export interface VehiculoGuia {
  /** Id del vínculo (solicitud_vehiculo o traslado_interno_vehiculo). */
  id: string;
  /** Texto del vehículo: chasis y marca/modelo. */
  etiqueta: string;
}

interface Props {
  titulo: string;
  vehiculos: VehiculoGuia[];
  ocupado: boolean;
  onCancelar: () => void;
  onConfirmar: (guias: Record<string, string>) => void;
}

/**
 * R15: antes de despachar, Logística ingresa el número de guía de cada
 * vehículo. Sin todas las guías no se puede confirmar (el servidor también lo
 * valida). "Usar para todos" copia una guía en todos los vehículos.
 */
export default function ModalGuiaDespacho({ titulo, vehiculos, ocupado, onCancelar, onConfirmar }: Props) {
  const [guias, setGuias] = useState<Record<string, string>>({});
  const [comun, setComun] = useState('');
  const [intentado, setIntentado] = useState(false);

  const validacion = validarGuias(vehiculos.map((v) => v.id), guias);

  function confirmar() {
    setIntentado(true);
    if (validacion.ok) onConfirmar(validacion.guias);
  }

  function usarParaTodos() {
    setGuias(Object.fromEntries(vehiculos.map((v) => [v.id, comun])));
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div role="dialog" aria-modal="true" aria-labelledby="titulo-guia" className="bg-white border border-neutral-200 rounded-2xl w-full max-w-lg shadow-2xl max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-neutral-200">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-sky-600 flex items-center justify-center text-white">
              <Truck className="w-4 h-4" />
            </div>
            <div>
              <h2 id="titulo-guia" className="text-base font-bold text-neutral-900">{titulo}</h2>
              <p className="text-xs text-neutral-500">Ingresa el número de guía de despacho de cada vehículo. Es obligatorio.</p>
            </div>
          </div>
          <button type="button" onClick={onCancelar} aria-label="Cerrar" className="text-neutral-400 hover:text-neutral-900 p-1 rounded-lg hover:bg-neutral-100">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {vehiculos.length > 1 && (
            <div className="flex items-end gap-2">
              <label className="flex-1 space-y-1.5">
                <span className="text-xs font-semibold text-neutral-600 uppercase tracking-wider">Misma guía para todos</span>
                <input
                  type="text"
                  value={comun}
                  maxLength={MAX_LARGO_GUIA}
                  onChange={(e) => setComun(e.target.value)}
                  placeholder="N° de guía"
                  className="w-full px-3 py-2 bg-white border border-neutral-300 rounded-xl text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-900"
                />
              </label>
              <button
                type="button"
                onClick={usarParaTodos}
                disabled={!comun.trim()}
                className="px-3 py-2 text-sm font-semibold text-neutral-700 border border-neutral-300 rounded-xl hover:bg-neutral-100 disabled:opacity-40 cursor-pointer"
              >
                Usar para todos
              </button>
            </div>
          )}

          <ul className="space-y-3">
            {vehiculos.map((v) => {
              const falta = intentado && !(guias[v.id] ?? '').trim();
              return (
                <li key={v.id} className="space-y-1.5">
                  <label htmlFor={`guia-${v.id}`} className="block text-xs text-neutral-700 font-medium break-words">
                    {v.etiqueta}
                  </label>
                  <input
                    id={`guia-${v.id}`}
                    type="text"
                    value={guias[v.id] ?? ''}
                    maxLength={MAX_LARGO_GUIA}
                    onChange={(e) => setGuias((p) => ({ ...p, [v.id]: e.target.value }))}
                    placeholder="N° de guía"
                    aria-invalid={falta}
                    className={`w-full px-3 py-2 bg-white border rounded-xl text-sm text-neutral-900 focus:outline-none focus:ring-2 ${
                      falta ? 'border-red-400 focus:ring-red-400' : 'border-neutral-300 focus:ring-neutral-900'
                    }`}
                  />
                </li>
              );
            })}
          </ul>

          {intentado && !validacion.ok && <p className="text-xs text-red-600">{validacion.error}</p>}

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-neutral-200">
            <button type="button" onClick={onCancelar} className="px-4 py-2 text-sm font-semibold text-neutral-600 hover:text-neutral-900 rounded-xl hover:bg-neutral-100 cursor-pointer">
              Cancelar
            </button>
            <button
              type="button"
              onClick={confirmar}
              disabled={ocupado}
              className="px-5 py-2 text-sm font-semibold text-white bg-sky-600 hover:bg-sky-700 rounded-xl disabled:opacity-50 cursor-pointer inline-flex items-center gap-2"
            >
              {ocupado ? <Loader2 className="w-4 h-4 animate-spin" /> : <Truck className="w-4 h-4" />}
              Despachar
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
