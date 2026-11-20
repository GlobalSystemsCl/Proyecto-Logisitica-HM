'use client';

import { useId, useState } from 'react';
import { Building2, Loader2, Plus, Search, Truck } from 'lucide-react';
import { crearCamionAction, crearTransportistaAction } from '@/app/actions/transportistas.actions';
import { formatearPatente, normalizarPatente, validarPatente } from '@/lib/patente';
import { formatearRut, validarRut } from '@/lib/rut';
import { buscarCamion, coincideEmpresa, filtrarCamiones } from '@/lib/transporte';
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
 * R10: al programar, Logística busca el camión por patente, nombre de la
 * empresa o RUT (o transportista) y elige uno de la lista; se completan la
 * empresa (con su RUT) y el transportista habitual, que se puede cambiar para
 * este viaje. Si la patente no está registrada, se registra aquí mismo con su
 * empresa (existente o nueva), que también se busca por nombre o RUT.
 */
export default function SelectorCamion({ empresas, valor, onCambiar, onEmpresasCambiadas, obligatorio }: Props) {
  const idLista = useId();
  const patente = valor?.patente ?? '';
  const conductor = valor?.conductorNombre ?? '';
  const encontrado = buscarCamion(empresas, patente);
  const [listaAbierta, setListaAbierta] = useState(false);
  const sugerencias = encontrado ? [] : filtrarCamiones(empresas, patente);
  // Si lo escrito es un nombre o RUT con resultados, no es un error de patente.
  const errorPatente = patente.trim() && sugerencias.length === 0 ? validarPatente(patente) : null;

  const [empresaNueva, setEmpresaNueva] = useState({ id: '', nombre: '', rut: '' });
  const [busquedaEmpresa, setBusquedaEmpresa] = useState('');
  const empresasFiltradas = empresas.filter((e) => e.id === empresaNueva.id || coincideEmpresa(e, busquedaEmpresa));
  const [conductorNuevo, setConductorNuevo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  function cambiarPatente(texto: string) {
    const camion = buscarCamion(empresas, texto)?.camion;
    // Al reconocer la patente se propone su transportista habitual.
    onCambiar({ patente: texto, conductorNombre: camion ? camion.conductor_nombre : conductor || null });
    setListaAbierta(true);
  }

  function elegirCamion(patenteCamion: string, conductorHabitual: string | null) {
    onCambiar({ patente: formatearPatente(patenteCamion), conductorNombre: conductorHabitual });
    setListaAbierta(false);
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
      setBusquedaEmpresa('');
      setConductorNuevo('');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="space-y-2">
      <label htmlFor={`${idLista}-patente`} className="block text-xs font-semibold text-neutral-600 uppercase tracking-wider">
        Camión{obligatorio ? ' *' : ''}
      </label>
      <div className="relative">
        <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          id={`${idLista}-patente`}
          role="combobox"
          aria-expanded={listaAbierta && sugerencias.length > 0}
          aria-controls={`${idLista}-lista`}
          aria-autocomplete="list"
          value={patente}
          onChange={(e) => cambiarPatente(e.target.value)}
          onFocus={() => setListaAbierta(true)}
          onBlur={() => {
            setListaAbierta(false);
            if (encontrado) onCambiar({ patente: formatearPatente(patente), conductorNombre: valor?.conductorNombre ?? null });
          }}
          onKeyDown={(e) => e.key === 'Escape' && setListaAbierta(false)}
          placeholder="Patente, empresa o RUT"
          maxLength={60}
          autoComplete="off"
          className={`${INPUT} pl-9 ${errorPatente ? 'border-red-400' : ''}`}
        />
        {listaAbierta && sugerencias.length > 0 && (
          <ul
            id={`${idLista}-lista`}
            role="listbox"
            className="absolute z-20 mt-1 w-full max-h-64 overflow-y-auto rounded-xl border border-neutral-200 bg-white shadow-lg py-1"
          >
            {sugerencias.map(({ empresa, camion }) => (
              <li key={camion.id} role="option" aria-selected={false}>
                <button
                  type="button"
                  // mousedown evita que el blur del input cierre la lista antes del clic.
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => elegirCamion(camion.patente, camion.conductor_nombre)}
                  className="w-full text-left px-3 py-2 hover:bg-neutral-50 cursor-pointer flex items-start gap-2"
                >
                  <Truck className="w-4 h-4 text-neutral-400 shrink-0 mt-0.5" />
                  <span className="min-w-0">
                    <span className="block text-sm font-mono font-semibold text-neutral-900">{formatearPatente(camion.patente)}</span>
                    <span className="block text-xs text-neutral-500 truncate">
                      {empresa.nombre} · RUT {formatearRut(empresa.rut)}
                      {camion.conductor_nombre ? ` · ${camion.conductor_nombre}` : ''}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {!encontrado && patente.trim() && sugerencias.length > 0 && (
        <p className="text-xs text-neutral-500">Elige el camión de la lista.</p>
      )}
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

      {!encontrado && normalizarPatente(patente) && sugerencias.length === 0 && !validarPatente(patente) && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 space-y-2">
          <p className="text-xs font-semibold text-amber-800">
            La patente {formatearPatente(patente)} no está registrada. Regístrala con su empresa:
          </p>
          {empresas.length > 0 && (
            <input
              value={busquedaEmpresa}
              onChange={(e) => setBusquedaEmpresa(e.target.value)}
              placeholder="Buscar empresa por nombre o RUT"
              maxLength={60}
              className={INPUT}
              aria-label="Buscar empresa por nombre o RUT"
            />
          )}
          <select value={empresaNueva.id} onChange={(e) => setEmpresaNueva((p) => ({ ...p, id: e.target.value }))} className={INPUT} aria-label="Empresa del camión">
            <option value="">
              {busquedaEmpresa.trim() && empresasFiltradas.length === 0 ? 'Ninguna empresa coincide…' : 'Selecciona la empresa…'}
            </option>
            {empresasFiltradas.map((e) => (
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
