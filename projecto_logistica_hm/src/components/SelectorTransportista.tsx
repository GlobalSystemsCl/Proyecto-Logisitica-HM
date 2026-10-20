'use client';

import { useState } from 'react';
import { Loader2, Plus } from 'lucide-react';
import { crearTransportistaAction } from '@/app/actions/transportistas.actions';
import { formatearRut, validarRut } from '@/lib/rut';
import type { Transportista } from '@/types/transportista.types';

interface Props {
  transportistas: Transportista[];
  valor: string | null;
  onCambiar: (id: string | null) => void;
  /** Se llama con el transportista recién registrado para agregarlo a la lista. */
  onCreado: (t: Transportista) => void;
  obligatorio?: boolean;
}

const INPUT = 'w-full rounded-xl border border-neutral-300 p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900';

/**
 * Transportista del traslado: elegir uno registrado o registrar uno nuevo
 * (nombre y RUT con dígito verificador).
 */
export default function SelectorTransportista({ transportistas, valor, onCambiar, onCreado, obligatorio }: Props) {
  const [creando, setCreando] = useState(transportistas.length === 0);
  const [nombre, setNombre] = useState('');
  const [rut, setRut] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const rutInvalido = rut.trim().length > 0 && !validarRut(rut);

  async function guardar() {
    setError(null);
    if (nombre.trim().length < 3) {
      setError('Indica el nombre del transportista.');
      return;
    }
    if (!validarRut(rut)) {
      setError('El RUT no es válido. Revisa el dígito verificador.');
      return;
    }
    setGuardando(true);
    try {
      const res = await crearTransportistaAction(nombre, rut);
      if (!res.success || !('transportista' in res) || !res.transportista) {
        setError(res.error ?? 'No se pudo registrar el transportista.');
        return;
      }
      onCreado(res.transportista);
      onCambiar(res.transportista.id);
      setNombre('');
      setRut('');
      setCreando(false);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="space-y-2">
      <label className="block text-xs font-semibold text-neutral-600 uppercase tracking-wider">
        Transportista{obligatorio ? ' *' : ''}
      </label>

      {transportistas.length > 0 && (
        <select
          value={valor ?? ''}
          onChange={(e) => onCambiar(e.target.value || null)}
          className={INPUT}
        >
          <option value="">Selecciona un transportista…</option>
          {transportistas.map((t) => (
            <option key={t.id} value={t.id}>
              {t.nombre} · {formatearRut(t.rut)}
            </option>
          ))}
        </select>
      )}

      {creando ? (
        <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3 space-y-2">
          <p className="text-xs font-semibold text-neutral-700">Nuevo transportista</p>
          <input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Nombre o razón social"
            maxLength={120}
            className={INPUT}
          />
          <input
            value={rut}
            onChange={(e) => setRut(e.target.value)}
            onBlur={() => validarRut(rut) && setRut(formatearRut(rut))}
            placeholder="RUT (ej. 76.543.210-3)"
            maxLength={12}
            className={`${INPUT} ${rutInvalido ? 'border-red-400' : ''}`}
          />
          {rutInvalido && <p className="text-xs text-red-700">RUT inválido.</p>}
          {error && <p className="text-xs text-red-700">{error}</p>}
          <div className="flex justify-end gap-2">
            {transportistas.length > 0 && (
              <button
                type="button"
                onClick={() => { setCreando(false); setError(null); }}
                className="px-3 py-1.5 text-xs font-semibold text-neutral-600 rounded-lg hover:bg-neutral-100 cursor-pointer"
              >
                Cancelar
              </button>
            )}
            <button
              type="button"
              onClick={guardar}
              disabled={guardando}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-neutral-900 rounded-lg hover:bg-neutral-800 disabled:opacity-50 cursor-pointer"
            >
              {guardando && <Loader2 className="w-3 h-3 animate-spin" />} Guardar transportista
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setCreando(true)}
          className="inline-flex items-center gap-1 text-xs font-semibold text-neutral-700 hover:underline cursor-pointer"
        >
          <Plus className="w-3 h-3" /> Registrar otro transportista
        </button>
      )}
    </div>
  );
}
