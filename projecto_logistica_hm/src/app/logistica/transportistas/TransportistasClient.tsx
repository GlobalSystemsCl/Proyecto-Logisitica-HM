'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, Loader2, Plus, Search, Truck } from 'lucide-react';
import {
  actualizarCamionAction,
  actualizarEmpresaTransporteAction,
  crearCamionAction,
  crearTransportistaAction,
} from '@/app/actions/transportistas.actions';
import { formatearRut, validarRut } from '@/lib/rut';
import { formatearPatente, validarPatente } from '@/lib/patente';
import { filtrarEmpresas } from '@/lib/transporte';
import type { Camion, EmpresaTransporte } from '@/types/transportista.types';

interface Props {
  empresas: EmpresaTransporte[];
}

type Resultado = { success: boolean; error?: string };

const INPUT = 'w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900';
const BTN = 'inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors disabled:opacity-50 cursor-pointer';

/**
 * R10: empresas de transporte (nombre y RUT) y sus camiones (patente y
 * transportista habitual). Una empresa o camión inactivo no se ofrece al
 * programar, pero conserva su historial.
 */
export default function TransportistasClient({ empresas }: Props) {
  const router = useRouter();
  const [busqueda, setBusqueda] = useState('');
  const [verInactivas, setVerInactivas] = useState(false);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ tipo: 'success' | 'error'; mensaje: string } | null>(null);

  const visibles = useMemo(() => filtrarEmpresas(empresas, busqueda, !verInactivas), [empresas, busqueda, verInactivas]);

  /** Ejecuta una acción, muestra el resultado y recarga los datos del servidor. */
  async function ejecutar(clave: string, fn: () => Promise<Resultado>, exito: string): Promise<boolean> {
    setOcupado(clave);
    setFeedback(null);
    try {
      const res = await fn();
      if (!res.success) {
        setFeedback({ tipo: 'error', mensaje: res.error ?? 'No se pudo completar la operación.' });
        return false;
      }
      setFeedback({ tipo: 'success', mensaje: exito });
      router.refresh();
      return true;
    } finally {
      setOcupado(null);
    }
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold text-neutral-900">Empresas de transporte</h1>
        <p className="text-sm text-neutral-500">
          Registra cada empresa con su RUT y sus camiones con la patente y el transportista habitual. Al programar un
          traslado se elige la patente del camión.
        </p>
      </header>

      {feedback && (
        <p
          role="status"
          className={`p-3 rounded-xl border text-sm ${
            feedback.tipo === 'error' ? 'bg-red-50 border-red-200 text-red-700' : 'bg-green-50 border-green-200 text-green-700'
          }`}
        >
          {feedback.mensaje}
        </p>
      )}

      <NuevaEmpresa ocupado={ocupado === 'nueva'} onCrear={(nombre, rut) => ejecutar('nueva', () => crearTransportistaAction(nombre, rut), 'Empresa registrada.')} />

      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por empresa, RUT, patente o transportista"
            className={`${INPUT} pl-10`}
          />
        </div>
        <label className="inline-flex items-center gap-2 text-sm text-neutral-700 cursor-pointer">
          <input type="checkbox" checked={verInactivas} onChange={(e) => setVerInactivas(e.target.checked)} className="w-4 h-4" />
          Mostrar inactivas
        </label>
      </div>

      {visibles.length === 0 ? (
        <p className="py-8 text-center text-sm text-neutral-400">
          {empresas.length === 0 ? 'Aún no hay empresas de transporte registradas.' : 'Ninguna empresa coincide con la búsqueda.'}
        </p>
      ) : (
        <ul className="space-y-4">
          {visibles.map((e) => (
            <TarjetaEmpresa key={e.id} empresa={e} ocupado={ocupado} ejecutar={ejecutar} />
          ))}
        </ul>
      )}
    </div>
  );
}

function NuevaEmpresa({ ocupado, onCrear }: { ocupado: boolean; onCrear: (nombre: string, rut: string) => Promise<boolean> }) {
  const [abierta, setAbierta] = useState(false);
  const [nombre, setNombre] = useState('');
  const [rut, setRut] = useState('');
  const rutInvalido = rut.trim().length > 0 && !validarRut(rut);

  if (!abierta) {
    return (
      <button type="button" onClick={() => setAbierta(true)} className={`${BTN} text-white bg-neutral-900 hover:bg-neutral-700 px-4 py-2 text-sm`}>
        <Plus className="w-4 h-4" /> Nueva empresa
      </button>
    );
  }
  return (
    <form
      onSubmit={async (ev) => {
        ev.preventDefault();
        if (await onCrear(nombre, rut)) {
          setNombre('');
          setRut('');
          setAbierta(false);
        }
      }}
      className="bg-white border border-neutral-200 rounded-2xl p-4 grid gap-3 sm:grid-cols-[1fr_200px_auto] sm:items-end"
    >
      <label className="space-y-1">
        <span className="text-xs font-semibold text-neutral-600 uppercase tracking-wider">Nombre o razón social</span>
        <input value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={120} required className={INPUT} />
      </label>
      <label className="space-y-1">
        <span className="text-xs font-semibold text-neutral-600 uppercase tracking-wider">RUT de la empresa</span>
        <input
          value={rut}
          onChange={(e) => setRut(e.target.value)}
          onBlur={() => validarRut(rut) && setRut(formatearRut(rut))}
          placeholder="76.543.210-3"
          maxLength={12}
          required
          className={`${INPUT} ${rutInvalido ? 'border-red-400' : ''}`}
        />
      </label>
      <div className="flex gap-2">
        <button type="button" onClick={() => setAbierta(false)} className={`${BTN} text-neutral-600 hover:bg-neutral-100`}>
          Cancelar
        </button>
        <button type="submit" disabled={ocupado || rutInvalido} className={`${BTN} text-white bg-neutral-900 hover:bg-neutral-700`}>
          {ocupado && <Loader2 className="w-3 h-3 animate-spin" />} Guardar
        </button>
      </div>
    </form>
  );
}

function TarjetaEmpresa({
  empresa,
  ocupado,
  ejecutar,
}: {
  empresa: EmpresaTransporte;
  ocupado: string | null;
  ejecutar: (clave: string, fn: () => Promise<Resultado>, exito: string) => Promise<boolean>;
}) {
  const [editando, setEditando] = useState(false);
  const [nombre, setNombre] = useState(empresa.nombre);
  const [patente, setPatente] = useState('');
  const [conductor, setConductor] = useState('');
  const errorPatente = patente.trim() ? validarPatente(patente) : null;

  return (
    <li className={`bg-white border rounded-2xl p-4 space-y-3 ${empresa.activo ? 'border-neutral-200' : 'border-neutral-200 opacity-70'}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-neutral-900 flex items-center justify-center text-white shrink-0">
            <Building2 className="w-4 h-4" />
          </div>
          {editando ? (
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={120} className={INPUT} aria-label="Nombre de la empresa" />
          ) : (
            <div className="min-w-0">
              <p className="font-semibold text-neutral-900 break-words">{empresa.nombre}</p>
              <p className="text-xs text-neutral-500">
                RUT {formatearRut(empresa.rut)} · {empresa.camiones.length} camión(es){empresa.activo ? '' : ' · Inactiva'}
              </p>
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {editando ? (
            <>
              <button type="button" onClick={() => { setEditando(false); setNombre(empresa.nombre); }} className={`${BTN} text-neutral-600 hover:bg-neutral-100`}>
                Cancelar
              </button>
              <button
                type="button"
                disabled={ocupado === `e-${empresa.id}`}
                onClick={async () => {
                  if (await ejecutar(`e-${empresa.id}`, () => actualizarEmpresaTransporteAction(empresa.id, { nombre }), 'Empresa actualizada.')) setEditando(false);
                }}
                className={`${BTN} text-white bg-neutral-900 hover:bg-neutral-700`}
              >
                Guardar
              </button>
            </>
          ) : (
            <button type="button" onClick={() => setEditando(true)} className={`${BTN} text-neutral-700 border border-neutral-300 hover:bg-neutral-100`}>
              Editar nombre
            </button>
          )}
          <button
            type="button"
            disabled={ocupado === `e-${empresa.id}`}
            onClick={() =>
              ejecutar(
                `e-${empresa.id}`,
                () => actualizarEmpresaTransporteAction(empresa.id, { activo: !empresa.activo }),
                empresa.activo ? 'Empresa desactivada.' : 'Empresa activada.'
              )
            }
            className={`${BTN} border ${empresa.activo ? 'text-red-700 border-red-200 hover:bg-red-50' : 'text-green-700 border-green-200 hover:bg-green-50'}`}
          >
            {empresa.activo ? 'Desactivar' : 'Activar'}
          </button>
        </div>
      </div>

      {empresa.camiones.length > 0 && (
        <ul className="divide-y divide-neutral-100 border border-neutral-200 rounded-xl">
          {empresa.camiones.map((c) => (
            <FilaCamion key={c.id} camion={c} ocupado={ocupado} ejecutar={ejecutar} />
          ))}
        </ul>
      )}

      <form
        onSubmit={async (ev) => {
          ev.preventDefault();
          if (await ejecutar(`c-nuevo-${empresa.id}`, () => crearCamionAction(empresa.id, patente, conductor || null), 'Camión registrado.')) {
            setPatente('');
            setConductor('');
          }
        }}
        className="grid gap-2 sm:grid-cols-[160px_1fr_auto] sm:items-start"
      >
        <div>
          <input
            value={patente}
            onChange={(e) => setPatente(e.target.value)}
            placeholder="Patente (ABCD-12)"
            maxLength={10}
            aria-label={`Patente de un camión nuevo de ${empresa.nombre}`}
            className={`${INPUT} ${errorPatente ? 'border-red-400' : ''}`}
          />
          {errorPatente && <p className="mt-1 text-[11px] text-red-700">{errorPatente}</p>}
        </div>
        <input
          value={conductor}
          onChange={(e) => setConductor(e.target.value)}
          placeholder="Transportista habitual (opcional)"
          maxLength={120}
          aria-label="Transportista habitual"
          className={INPUT}
        />
        <button
          type="submit"
          disabled={!patente.trim() || Boolean(errorPatente) || ocupado === `c-nuevo-${empresa.id}`}
          className={`${BTN} text-neutral-900 border border-neutral-300 hover:bg-neutral-100 py-2`}
        >
          <Truck className="w-3 h-3" /> Agregar camión
        </button>
      </form>
    </li>
  );
}

function FilaCamion({
  camion,
  ocupado,
  ejecutar,
}: {
  camion: Camion;
  ocupado: string | null;
  ejecutar: (clave: string, fn: () => Promise<Resultado>, exito: string) => Promise<boolean>;
}) {
  const [editando, setEditando] = useState(false);
  const [conductor, setConductor] = useState(camion.conductor_nombre ?? '');
  const clave = `c-${camion.id}`;

  return (
    <li className={`flex flex-wrap items-center gap-3 px-3 py-2.5 ${camion.activo ? '' : 'opacity-60'}`}>
      <span className="font-mono text-sm font-semibold text-neutral-900 w-24">{formatearPatente(camion.patente)}</span>
      {editando ? (
        <input
          value={conductor}
          onChange={(e) => setConductor(e.target.value)}
          maxLength={120}
          aria-label="Transportista habitual"
          className={`${INPUT} flex-1 min-w-40`}
        />
      ) : (
        <span className="flex-1 min-w-40 text-sm text-neutral-600">
          {camion.conductor_nombre || <span className="italic text-neutral-400">Sin transportista habitual</span>}
          {!camion.activo && ' · Inactivo'}
        </span>
      )}
      <div className="flex gap-2">
        {editando ? (
          <button
            type="button"
            disabled={ocupado === clave}
            onClick={async () => {
              if (await ejecutar(clave, () => actualizarCamionAction(camion.id, { conductorNombre: conductor || null }), 'Camión actualizado.')) setEditando(false);
            }}
            className={`${BTN} text-white bg-neutral-900 hover:bg-neutral-700`}
          >
            Guardar
          </button>
        ) : (
          <button type="button" onClick={() => setEditando(true)} className={`${BTN} text-neutral-700 border border-neutral-300 hover:bg-neutral-100`}>
            Editar
          </button>
        )}
        <button
          type="button"
          disabled={ocupado === clave}
          onClick={() =>
            ejecutar(clave, () => actualizarCamionAction(camion.id, { activo: !camion.activo }), camion.activo ? 'Camión desactivado.' : 'Camión activado.')
          }
          className={`${BTN} border ${camion.activo ? 'text-red-700 border-red-200 hover:bg-red-50' : 'text-green-700 border-green-200 hover:bg-green-50'}`}
        >
          {camion.activo ? 'Desactivar' : 'Activar'}
        </button>
      </div>
    </li>
  );
}
