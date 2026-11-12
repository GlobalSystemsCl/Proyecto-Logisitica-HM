'use client';

import { useId, useState } from 'react';
import { Building2, Loader2, Plus } from 'lucide-react';
import { crearCamionAction, crearTransportistaAction } from '@/app/actions/transportistas.actions';
import { formatearPatente, normalizarPatente, validarPatente } from '@/lib/patente';
import { formatearRut, validarRut } from '@/lib/rut';
import { buscarCamion } from '@/lib/transporte';
import type { AsignacionTransporte, EmpresaTransporte } from '@/types/transportista.types';

interface Props {
  /** Empresas activas con sus camiones activos (`empresasParaProgramar`). */
  empresas: EmpresaTransporte[];
  valor: AsignacionTransporte | null;
  onCambiar: (valor: AsignacionTransporte | null) => void;
  /** Se llama con la lista actualizada al registrar un camión o una empresa aquí mismo. */
  onEmpresasCambiadas: (empresas: EmpresaTransporte[]) => void;
  obligatorio?: boolean;
}

const INPUT = 'w-full rounded-xl border border-neutral-300 p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900';
const NUEVA = '__nueva__';

/**
 * R10: al programar, Logística escribe la patente del camión; se completan la
 * empresa (con su RUT) y el transportista habitual, que se puede cambiar para
 * este viaje. Si la patente no está registrada, se registra aquí mismo con su
 * empresa (existente o nueva).
 */
export default function SelectorCamion({ empresas, valor, onCambiar, onEmpresasCambiadas, obligatorio }: Props) {
  const idLista = useId();
  const patente = valor?.patente ?? '';
  const conductor = valor?.conductorNombre ?? '';
  const encontrado = buscarCamion(empresas, patente);
  const errorPatente = patente.trim() ? validarPatente(patente) : null;

  const [empresaNueva, setEmpresaNueva] = useState({ id: '', nombre: '', rut: '' });
  const [conductorNuevo, setConductorNuevo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  function cambiarPatente(texto: string) {
    const camion = buscarCamion(empresas, texto)?.camion;
    // Al reconocer la patente se propone su transportista habitual.
    onCambiar({ patente: texto, conductorNombre: camion ? camion.conductor_nombre : conductor || null });
  }

  async function registrar() {
    setError(null);
    setGuardando(true);
    try {
      let empresaId = empresaNueva.id;
      let lista = empresas;
      if (!empresaId) {
        setError('Elige la empresa del camión.');
        return;
      }
      if (empresaId === NUEVA) {
        if (!validarRut(empresaNueva.rut)) {
          setError('El RUT de la empresa no es válido. Revisa el dígito verificador.');
          return;
        }
        const res = await crearTransportistaAction(empresaNueva.nombre, empresaNueva.rut);
        if (!res.success || !('transportista' in res) || !res.transportista) {
          setError(res.error ?? 'No se pudo registrar la empresa.');
          return;
        }
        empresaId = res.transportista.id;
        lista = [...lista, { ...res.transportista, camiones: [] }];
      }
      const res = await crearCamionAction(empresaId, patente, conductorNuevo || null);
      if (!res.success || !('camion' in res) || !res.camion) {
        setError(res.error ?? 'No se pudo registrar el camión.');
        if (lista !== empresas) onEmpresasCambiadas(lista);
        return;
      }
      const camion = res.camion;
      onEmpresasCambiadas(lista.map((e) => (e.id === empresaId ? { ...e, camiones: [...e.camiones, camion] } : e)));
      onCambiar({ patente: camion.patente, conductorNombre: camion.conductor_nombre });
      setEmpresaNueva({ id: '', nombre: '', rut: '' });
      setConductorNuevo('');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="space-y-2">
      <label htmlFor={`${idLista}-patente`} className="block text-xs font-semibold text-neutral-600 uppercase tracking-wider">
        Patente del camión{obligatorio ? ' *' : ''}
      </label>
      <input
        id={`${idLista}-patente`}
        list={idLista}
        value={patente}
        onChange={(e) => cambiarPatente(e.target.value)}
        onBlur={() => encontrado && onCambiar({ patente: formatearPatente(patente), conductorNombre: valor?.conductorNombre ?? null })}
        placeholder="ABCD-12"
        maxLength={10}
        autoComplete="off"
        className={`${INPUT} font-mono uppercase ${errorPatente ? 'border-red-400' : ''}`}
      />
      <datalist id={idLista}>
        {empresas.flatMap((e) =>
          e.camiones.map((c) => (
            <option key={c.id} value={formatearPatente(c.patente)}>
              {e.nombre}
              {c.conductor_nombre ? ` · ${c.conductor_nombre}` : ''}
            </option>
          ))
        )}
      </datalist>
      {errorPatente && <p className="text-xs text-red-700">{errorPatente}</p>}

      {encontrado && (
        <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3 space-y-2">
          <p className="flex items-center gap-2 text-xs text-neutral-700">
            <Building2 className="w-3.5 h-3.5 text-neutral-400" />
            <span className="font-semibold">{encontrado.empresa.nombre}</span> · RUT {formatearRut(encontrado.empresa.rut)}
          </p>
          <label className="block space-y-1">
            <span className="text-xs font-semibold text-neutral-600 uppercase tracking-wider">Transportista{obligatorio ? ' *' : ''}</span>
            <input
              value={conductor}
              onChange={(e) => onCambiar({ patente, conductorNombre: e.target.value })}
              placeholder="Nombre de quien maneja el camión"
              maxLength={120}
              className={INPUT}
            />
          </label>
        </div>
      )}

      {!encontrado && normalizarPatente(patente) && !errorPatente && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 space-y-2">
          <p className="text-xs font-semibold text-amber-800">
            La patente {formatearPatente(patente)} no está registrada. Regístrala con su empresa:
          </p>
          <select value={empresaNueva.id} onChange={(e) => setEmpresaNueva((p) => ({ ...p, id: e.target.value }))} className={INPUT} aria-label="Empresa del camión">
            <option value="">Selecciona la empresa…</option>
            {empresas.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nombre} · {formatearRut(e.rut)}
              </option>
            ))}
            <option value={NUEVA}>Otra empresa (registrar)…</option>
          </select>
          {empresaNueva.id === NUEVA && (
            <div className="grid gap-2 sm:grid-cols-2">
              <input
                value={empresaNueva.nombre}
                onChange={(e) => setEmpresaNueva((p) => ({ ...p, nombre: e.target.value }))}
                placeholder="Nombre o razón social"
                maxLength={120}
                className={INPUT}
              />
              <input
                value={empresaNueva.rut}
                onChange={(e) => setEmpresaNueva((p) => ({ ...p, rut: e.target.value }))}
                onBlur={() => validarRut(empresaNueva.rut) && setEmpresaNueva((p) => ({ ...p, rut: formatearRut(p.rut) }))}
                placeholder="RUT (76.543.210-3)"
                maxLength={12}
                className={INPUT}
              />
            </div>
          )}
          <input
            value={conductorNuevo}
            onChange={(e) => setConductorNuevo(e.target.value)}
            placeholder="Transportista que lo maneja"
            maxLength={120}
            className={INPUT}
            aria-label="Transportista del camión nuevo"
          />
          {error && <p className="text-xs text-red-700">{error}</p>}
          <div className="flex justify-end">
            <button
              type="button"
              onClick={registrar}
              disabled={guardando}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-neutral-900 rounded-lg hover:bg-neutral-800 disabled:opacity-50 cursor-pointer"
            >
              {guardando ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />} Registrar camión
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
